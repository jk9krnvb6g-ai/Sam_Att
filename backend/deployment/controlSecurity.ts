import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export interface ControlFrame { action: string; timestamp: number; nonce: string; payload: any; signature: string }
export function controlSignature(secret: string, action: string, timestamp: number, nonce: string, payload: unknown) {
  return crypto.createHmac('sha256', secret).update(`${action}:${timestamp}:${nonce}:${JSON.stringify(payload ?? {})}`).digest('hex');
}
export function signedFrame(secret: string, action: string, payload: unknown, nonce = crypto.randomBytes(16).toString('hex')): ControlFrame {
  const timestamp = Date.now(); return { action, timestamp, nonce, payload, signature: controlSignature(secret, action, timestamp, nonce, payload) };
}
export function verifyFrame(secret: string, value: any, action: string, nonce?: string): ControlFrame {
  if (secret.length < 32 || !value || value.action !== action || !Number.isSafeInteger(value.timestamp) ||
      Math.abs(Date.now() - value.timestamp) > 60_000 || !/^[a-f0-9]{24,64}$/.test(value.nonce) ||
      (nonce && value.nonce !== nonce) || !/^[a-f0-9]{64}$/.test(value.signature)) throw new Error('CONTROL_AUTHENTICATION_FAILED');
  const expected = controlSignature(secret, value.action, value.timestamp, value.nonce, value.payload);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value.signature, 'hex'))) throw new Error('CONTROL_AUTHENTICATION_FAILED');
  return value;
}
export class ReplayWindow {
  private used = new Map<string, number>();
  constructor(private readonly directory?: string) { if (directory) fs.mkdirSync(directory, { recursive: true }); }
  accept(frame: ControlFrame) {
    const now = Date.now(); for (const [key, time] of this.used) if (time < now) this.used.delete(key);
    if (this.used.has(frame.nonce) || this.used.size >= 10000) throw new Error('CONTROL_REPLAY_REJECTED');
    if (this.directory) {
      for (const name of fs.readdirSync(this.directory)) {
        if (!/^[0-9a-f]{24,64}$/.test(name)) throw new Error('CONTROL_REPLAY_STORE_INVALID');
        const file = path.join(this.directory, name);
        if (Number(fs.readFileSync(file, 'utf8')) < now) fs.unlinkSync(file);
      }
      if (fs.readdirSync(this.directory).length >= 10000) throw new Error('CONTROL_REPLAY_CAPACITY');
      const fd = fs.openSync(path.join(this.directory, frame.nonce), 'wx', 0o600);
      try { fs.writeFileSync(fd, String(frame.timestamp + 60000)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    this.used.set(frame.nonce, frame.timestamp + 60000);
  }
}
