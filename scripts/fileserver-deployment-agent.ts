import { DeploymentIpcVerifier } from '../backend/services/deploymentIpcSecurity';
/**
 * Sam_Att V2 — Windows Named Pipe Deployment Agent Service (`FILESERVER`)
 *
 * Development host only; Windows startup is blocked pending a native secure service host.
 * Intended service name: `SamchukSamAttDeployAgent`
 * listening exclusively on the local Windows Named Pipe:
 *   `\\.\pipe\SamchukSamAttDeploymentAgent_v2`
 *
 * SECURITY GUARANTEES (§3.4):
 * - Opens ZERO TCP/HTTP ports.
 * - Verifies HMAC-SHA256 signature (`SAM_ATT_AGENT_IPC_SECRET`) and 60s replay window on every IPC frame.
 * - Rejects any arbitrary shell command, script, or non-allowlisted file path.
 * - Executes only the predefined `LocalStagingDeploymentEngine` operations (`PING`, `PREFLIGHT`, `LIST_BACKUPS`, `DEPLOY`, `ROLLBACK`).
 */

import fs from 'fs';
import net from 'net';
import path from 'path';
import {
  AUTHORITATIVE_WINDOWS_PATHS,
  ExecuteDeployParams,
  ExecuteRollbackParams,
  LocalStagingDeploymentEngine,
  sanitizeDeploymentErrorText,
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

// Node's net server cannot provision an explicit Windows pipe DACL or reject remote
// SMB pipe clients. NTFS ACLs on DeploymentRoot do not protect this IPC endpoint.
// Keep this development host disabled on Windows until a native ACL-enforcing host
// and an SCM-compatible service executable have been supplied and verified.
if (process.platform === 'win32') {
  throw new Error('WINDOWS_SECURE_PIPE_HOST_REQUIRED: native pipe DACL and remote-client rejection are not implemented');
}
if (process.env.SAM_ATT_AGENT_LOCAL_TEST_HOST !== '1') {
  throw new Error('LOCAL_TEST_HOST_ONLY');
}
const verifier = new DeploymentIpcVerifier(ipcSecret, new Set(
  (process.env.SAM_ATT_AGENT_OPERATOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
));

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

const server = net.createServer((socket) => {
  let buffer = '';
  let handled = false;
  socket.setTimeout(10_000, () => socket.destroy());
  socket.on('error', () => socket.destroy());
  socket.on('data', async (chunk) => {
    if (handled) return;
    buffer += chunk.toString('utf8');
    if (Buffer.byteLength(buffer) > 64 * 1024) { socket.destroy(); return; }
    if (!buffer.includes('\n')) return;

    handled = true;
    socket.setTimeout(0);
    const line = buffer.split('\n')[0];
    buffer = '';

    try {
      const msg = verifier.verify(JSON.parse(line));

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

if (fs.existsSync(namedPipePath)) {
  fs.unlinkSync(namedPipePath);
}

server.listen(namedPipePath, () => {
  console.log(
    `[Sam_Att Deployment Agent] Listening on Named Pipe IPC: ${namedPipePath} (Zero TCP Ports Opened)`
  );
});
