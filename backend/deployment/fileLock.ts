import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Durable fail-closed lock. A crash leaves evidence and requires explicit recovery. */
export class DeploymentFileLock {
  private token: string | null = null;
  constructor(readonly file: string) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
  isLocked() { return fs.existsSync(this.file); }
  acquire(operation: string) {
    const token = crypto.randomBytes(32).toString('hex');
    let fd: number;
    try { fd = fs.openSync(this.file, 'wx', 0o600); }
    catch (err: any) { if (err.code === 'EEXIST') return false; throw err; }
    try { fs.writeFileSync(fd, JSON.stringify({ token, operation, pid: process.pid, startedAt: new Date().toISOString() })); fs.fsyncSync(fd); this.token = token; }
    finally { fs.closeSync(fd); }
    return true;
  }
  release() {
    if (!this.token) return;
    const recorded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (recorded.token !== this.token) throw new Error('DEPLOYMENT_LOCK_OWNERSHIP_LOST');
    fs.unlinkSync(this.file); this.token = null;
  }
}
