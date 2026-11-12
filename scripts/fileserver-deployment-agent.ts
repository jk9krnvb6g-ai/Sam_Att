/**
 * Sam_Att V2 — Windows Named Pipe Deployment Agent Service (`FILESERVER`)
 *
 * Runs as a dedicated least-privilege Windows Service (`SamchukSamAttDeployAgent`)
 * listening exclusively on the local Windows Named Pipe:
 *   `\\.\pipe\SamchukSamAttDeploymentAgent_v2`
 *
 * SECURITY GUARANTEES (§3.4):
 * - Opens ZERO TCP/HTTP ports.
 * - Verifies HMAC-SHA256 signature (`SAM_ATT_AGENT_IPC_SECRET`) and 60s replay window on every IPC frame.
 * - Rejects any arbitrary shell command, script, or non-allowlisted file path.
 * - Executes only the predefined `LocalStagingDeploymentEngine` operations (`PING`, `PREFLIGHT`, `LIST_BACKUPS`, `DEPLOY`, `ROLLBACK`).
 */

import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {
  AUTHORITATIVE_WINDOWS_PATHS,
  ExecuteDeployParams,
  ExecuteRollbackParams,
  LocalStagingDeploymentEngine,
  NamedPipeIpcMessage,
  sanitizeDeploymentErrorText,
  signIpcPayload,
} from '../backend/services/deploymentAgentService';

const namedPipePath =
  process.env.SAM_ATT_AGENT_NAMED_PIPE?.trim() ||
  AUTHORITATIVE_WINDOWS_PATHS.NAMED_PIPE_PATH;
const ipcSecret = (process.env.SAM_ATT_AGENT_IPC_SECRET || '').trim();

if (!ipcSecret || ipcSecret.length < 32) {
  console.error(
    '[Sam_Att Deployment Agent] FATAL: SAM_ATT_AGENT_IPC_SECRET must be configured with at least 32 characters.'
  );
  process.exit(1);
}

const samAttBackendAdapterDir =
  process.env.SAM_ATT_BACKEND_ADAPTER_DIR?.trim() ||
  path.join(AUTHORITATIVE_WINDOWS_PATHS.GATEWAY_PRODUCTION, 'modules', 'Sam_Att');

const engine = new LocalStagingDeploymentEngine({
  workspaceRoot: AUTHORITATIVE_WINDOWS_PATHS.DEPLOYMENT_ROOT,
  frontendProdDir: AUTHORITATIVE_WINDOWS_PATHS.FRONTEND_PRODUCTION,
  backendProdDir: samAttBackendAdapterDir,
  adapterConfigPath: path.join(samAttBackendAdapterDir, 'samAttAdapter.json'),
  manifestPath: AUTHORITATIVE_WINDOWS_PATHS.MANIFEST_FILE,
  backupsDir: AUTHORITATIVE_WINDOWS_PATHS.BACKUPS_DIR,
  stagingDir: AUTHORITATIVE_WINDOWS_PATHS.STAGING_DIR,
  namedPipePath,
});

const usedNonces = new Map<string, number>();

function cleanupExpiredNonces(): void {
  const cutoff = Date.now() - 120_000;
  usedNonces.forEach((ts, nonce) => {
    if (ts < cutoff) usedNonces.delete(nonce);
  });
}

const server = net.createServer((socket) => {
  let buffer = '';
  socket.on('data', async (chunk) => {
    buffer += chunk.toString('utf8');
    if (!buffer.includes('\n')) return;

    const line = buffer.split('\n')[0];
    buffer = '';

    try {
      cleanupExpiredNonces();
      const msg = JSON.parse(line) as NamedPipeIpcMessage;

      if (
        !msg ||
        typeof msg.action !== 'string' ||
        typeof msg.timestamp !== 'number' ||
        typeof msg.nonce !== 'string' ||
        typeof msg.signature !== 'string'
      ) {
        socket.write(JSON.stringify({ ok: false, error: 'Malformed IPC message' }) + '\n');
        socket.end();
        return;
      }

      if (Math.abs(Date.now() - msg.timestamp) > 60_000) {
        socket.write(JSON.stringify({ ok: false, error: 'IPC timestamp expired' }) + '\n');
        socket.end();
        return;
      }

      if (usedNonces.has(msg.nonce)) {
        socket.write(JSON.stringify({ ok: false, error: 'IPC nonce replay rejected' }) + '\n');
        socket.end();
        return;
      }

      const expectedSig = signIpcPayload(
        ipcSecret,
        msg.action,
        msg.timestamp,
        msg.nonce,
        msg.payload
      );
      const sigBuf = Buffer.from(msg.signature, 'utf8');
      const expBuf = Buffer.from(expectedSig, 'utf8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        socket.write(JSON.stringify({ ok: false, error: 'Invalid IPC HMAC signature' }) + '\n');
        socket.end();
        return;
      }

      usedNonces.set(msg.nonce, Date.now());

      if (msg.action === 'PING') {
        socket.write(
          JSON.stringify({
            ok: true,
            data: {
              status: engine.agentStatus,
              locked: engine.isLocked(),
            },
          }) + '\n'
        );
      } else if (msg.action === 'PREFLIGHT') {
        const { targetCommitSha } = (msg.payload || {}) as { targetCommitSha: string };
        const data = await engine.getPreDeploymentEvidence(targetCommitSha);
        socket.write(JSON.stringify({ ok: true, data }) + '\n');
      } else if (msg.action === 'LIST_BACKUPS') {
        const data = await engine.listVerifiedBackups();
        socket.write(JSON.stringify({ ok: true, data }) + '\n');
      } else if (msg.action === 'DEPLOY') {
        const data = await engine.executeApprovedDeployment(
          msg.payload as ExecuteDeployParams
        );
        socket.write(JSON.stringify({ ok: true, data }) + '\n');
      } else if (msg.action === 'ROLLBACK') {
        const data = await engine.executeVerifiedRollback(
          msg.payload as ExecuteRollbackParams
        );
        socket.write(JSON.stringify({ ok: true, data }) + '\n');
      } else {
        socket.write(JSON.stringify({ ok: false, error: 'Unsupported IPC action' }) + '\n');
      }
    } catch (err) {
      socket.write(
        JSON.stringify({
          ok: false,
          error: sanitizeDeploymentErrorText(err),
        }) + '\n'
      );
    } finally {
      socket.end();
    }
  });
});

if (process.platform !== 'win32' && fs.existsSync(namedPipePath)) {
  fs.unlinkSync(namedPipePath);
}

server.listen(namedPipePath, () => {
  console.log(
    `[Sam_Att Deployment Agent] Listening on Named Pipe IPC: ${namedPipePath} (Zero TCP Ports Opened)`
  );
});
