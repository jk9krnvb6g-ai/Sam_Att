import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NamedPipeIpcMessage, signIpcPayload } from './deploymentAgentService';

/** Authentication boundary shared by the pipe host and isolated security tests. */
export class DeploymentIpcVerifier {
  private readonly nonces = new Map<string, number>();
  constructor(private readonly secret: string, private readonly operatorIds: ReadonlySet<string>, private readonly replayDirectory?: string) {
    if (secret.trim().length < 32) throw new Error('IPC_SECRET_TOO_SHORT');
    if (replayDirectory) fs.mkdirSync(replayDirectory, { recursive: true });
  }
  verify(input: unknown, now = Date.now()): NamedPipeIpcMessage {
    const msg = input as NamedPipeIpcMessage;
    if (!msg || !['PING', 'PREFLIGHT', 'LIST_BACKUPS', 'DEPLOY', 'ROLLBACK'].includes(msg.action) ||
        !Number.isSafeInteger(msg.timestamp) || Math.abs(now - msg.timestamp) > 60_000 ||
        typeof msg.nonce !== 'string' || !/^[0-9a-f]{24,64}$/.test(msg.nonce) ||
        typeof msg.signature !== 'string' || !/^[0-9a-f]{64}$/.test(msg.signature)) {
      throw new Error('IPC_INVALID_FRAME');
    }
    const expected = signIpcPayload(this.secret, msg.action, msg.timestamp, msg.nonce, msg.payload);
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(msg.signature, 'hex'))) {
      throw new Error('IPC_INVALID_SIGNATURE');
    }
    for (const [nonce, expires] of this.nonces) if (expires < now) this.nonces.delete(nonce);
    if (this.nonces.has(msg.nonce)) throw new Error('IPC_REPLAY_REJECTED');
    if (this.nonces.size >= 10_000) throw new Error('IPC_REPLAY_CAPACITY');
    const payload = msg.payload as Record<string, any> | null;
    if (msg.action === 'DEPLOY' || msg.action === 'ROLLBACK') {
      const actor = msg.action === 'DEPLOY' ? payload?.approvedBy : payload?.requestedBy;
      if (!actor || !this.operatorIds.has(actor.userId) || typeof actor.username !== 'string') {
        throw new Error('IPC_OPERATOR_FORBIDDEN');
      }
    }
    if ((msg.action === 'DEPLOY' || msg.action === 'PREFLIGHT') &&
        !/^[0-9a-f]{40}$/i.test(payload?.targetCommitSha ?? '')) throw new Error('IPC_INVALID_SHA');
    if (msg.action === 'DEPLOY' && !/^[A-Za-z0-9_-]{1,100}$/.test(payload?.deploymentId ?? '')) {
      throw new Error('IPC_INVALID_DEPLOYMENT_ID');
    }
    if (msg.action === 'ROLLBACK' && !/^BKP_[0-9A-Za-z_-]{6,64}$/.test(payload?.backupId ?? '')) {
      throw new Error('IPC_INVALID_BACKUP_ID');
    }
    // Retain until the last possible acceptance time, including future-dated frames.
    if (this.replayDirectory) {
      const recorded = fs.readdirSync(this.replayDirectory);
      for (const name of recorded) {
        if (!/^[0-9a-f]{24,64}$/.test(name)) throw new Error('IPC_REPLAY_STORE_INVALID');
        const file = path.join(this.replayDirectory, name);
        if (Number(fs.readFileSync(file, 'utf8')) < now) fs.unlinkSync(file);
      }
      if (fs.readdirSync(this.replayDirectory).length >= 10000) throw new Error('IPC_REPLAY_CAPACITY');
      const file = path.join(this.replayDirectory, msg.nonce);
      let fd;
      try { fd = fs.openSync(file, 'wx', 0o600); }
      catch (err: any) { if (err.code === 'EEXIST') throw new Error('IPC_REPLAY_REJECTED'); throw err; }
      try { fs.writeFileSync(fd, String(msg.timestamp + 60000)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    this.nonces.set(msg.nonce, msg.timestamp + 60_000);
    return msg;
  }
}
