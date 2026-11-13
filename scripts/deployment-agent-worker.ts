import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { LocalStagingDeploymentEngine, computeDirectorySha256Hex, computeSha256Hex, readAndVerifyDeploymentManifest, sanitizeDeploymentErrorText } from '../backend/services/deploymentAgentService';
import { DeploymentIpcVerifier } from '../backend/services/deploymentIpcSecurity';
import { createVerifiedStagingHooks } from '../backend/services/deploymentStagingExecutors';
import { createLiveDeploymentProbes } from '../backend/deployment/liveProbes';
import { signedFrame } from '../backend/deployment/controlSecurity';

// This worker owns no listener. The native SCM host owns/authorizes the pipe and
// supplies exactly one frame at a time over inherited anonymous standard streams.
const configIndex = process.argv.indexOf('--config');
if (configIndex < 0 || !process.argv[configIndex + 1]) throw new Error('AGENT_CONFIG_REQUIRED');
const config = JSON.parse(fs.readFileSync(process.argv[configIndex + 1], 'utf8'));
for (const key of ['DeploymentRoot','FrontendDirectory','BackendDirectory','ReleaseRoot','NpmCliPath']) {
  if (typeof config[key] !== 'string' || !path.isAbsolute(config[key])) throw new Error(`INVALID_${key}`);
}
if (config.Mode !== 'ISOLATED' && config.Mode !== 'PRODUCTION') throw new Error('INVALID_HOST_MODE');
if (config.Mode === 'PRODUCTION') {
  if (path.resolve(config.DeploymentRoot).toLowerCase() !== 'c:\\inetpub\\wwwroot\\deployment_center\\sam_att' ||
      path.resolve(config.FrontendDirectory).toLowerCase() !== 'c:\\inetpub\\wwwroot\\sam_att' ||
      path.resolve(config.BackendDirectory).toLowerCase() !== 'c:\\inetpub\\wwwroot\\deployment_center\\sam_att\\backend' ||
      path.resolve(config.ReleaseRoot) !== path.join(path.resolve(config.DeploymentRoot), 'Releases')) throw new Error('PRODUCTION_PATH_POLICY_FAILED');
}
if (!fs.existsSync(config.FrontendDirectory) || !fs.existsSync(config.BackendDirectory)) throw new Error('PRODUCTION_BASELINE_MISSING');
for (const dir of [config.FrontendDirectory, config.BackendDirectory, config.DeploymentRoot]) {
  if (fs.existsSync(dir) && fs.realpathSync(dir).toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('REPARSE_ROOT_REJECTED');
}
const secret = fs.readFileSync(config.IpcSecretFile, 'utf8').trim();
if(config.Mode==='PRODUCTION' && secret===fs.readFileSync(config.ControlSecretFile,'utf8').trim())throw new Error('IPC_AND_CONTROL_SECRETS_MUST_DIFFER');
const verifier = new DeploymentIpcVerifier(secret, new Set(config.OperatorIds), path.join(config.DeploymentRoot, 'IPCReplay'));
const live = createLiveDeploymentProbes({ ...config.Probes,
  controlSecret: fs.readFileSync(config.ControlSecretFile, 'utf8').trim(),
  sessionToken: fs.readFileSync(config.SessionTokenFile, 'utf8').trim(),
  procurementToken: fs.readFileSync(config.ProcurementTokenFile, 'utf8').trim(),
});
process.env.PATH = path.dirname(config.NodePath) + path.delimiter + process.env.PATH;
process.env.npm_config_cache = path.join(config.DeploymentRoot, 'NpmCache');
function prepareImmutable(sha: string, backendDir: string) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('VERIFIED_ROLLBACK_SOURCE_REQUIRED');
  const hash = computeDirectorySha256Hex(backendDir), target = path.join(config.ReleaseRoot, sha, hash);
  if (!fs.existsSync(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(backendDir, target, { recursive: true, errorOnExist: true, force: false }); }
  if (computeDirectorySha256Hex(target) !== hash) throw new Error('IMMUTABLE_RELEASE_CHANGED');
  return { hash, target };
}
async function main() {
  // Isolated console tests never contact installed Gateway/Procurement endpoints.
  const capability = config.Mode === 'PRODUCTION'
    ? await live.control('CAPABILITIES', {}).catch(() => ({ isolatedActivation: false })) : { isolatedActivation: false };
  const sourceHooks = createVerifiedStagingHooks(config.NpmCliPath);
  const engine = new LocalStagingDeploymentEngine({
    workspaceRoot: config.DeploymentRoot, frontendProdDir: config.FrontendDirectory,
    backendProdDir: config.BackendDirectory, adapterConfigPath: path.join(config.BackendDirectory, 'samAttAdapter.json'),
    manifestPath: path.join(config.DeploymentRoot, 'current.json'), backupsDir: path.join(config.DeploymentRoot, 'Backups'),
    stagingDir: path.join(config.DeploymentRoot, 'Staging'), isolatedBackendActivationSupported: capability.isolatedActivation === true,
    backendRequiresGatewayRestart: capability.isolatedActivation !== true,
    hooks: { ...sourceHooks,
      runPostDeployHealthProbe: async (context) => {
        if (config.Mode !== 'PRODUCTION') throw new Error('ISOLATED_HOST_HAS_NO_LIVE_PROBES');
        const entryHash = computeSha256Hex(fs.readFileSync(path.join(config.FrontendDirectory, 'index.html')));
        const result = await live.probe(entryHash);
        if (context.expectedActiveCommitSha && result.activeCommitSha !== context.expectedActiveCommitSha) { result.backendHealthy = false; result.routerHealthy = false; }
        return result;
      },
      runBackupHook: async () => {
        let drill: string | undefined;
        try {
          const current = readAndVerifyDeploymentManifest(path.join(config.DeploymentRoot, 'current.json'));
          if (!current.manifest || current.status !== 'VALID') throw new Error('VERIFIED_CURRENT_MANIFEST_REQUIRED');
          const feHash = computeDirectorySha256Hex(config.FrontendDirectory), beHash = computeDirectorySha256Hex(config.BackendDirectory);
          if (feHash !== current.manifest.frontendArtifactSha256 || beHash !== current.manifest.backendArtifactSha256) throw new Error('CURRENT_ARTIFACTS_DO_NOT_MATCH_MANIFEST');
          const baseline = prepareImmutable(current.manifest.commitSha, config.BackendDirectory);
          const validation = await live.control('VALIDATE', { commitSha: current.manifest.commitSha, backendSha256: baseline.hash });
          if (validation.validated !== true || validation.activeCommitSha !== current.manifest.commitSha) throw new Error('ROLLBACK_CANDIDATE_NOT_READY');
          const drillRoot = path.join(config.DeploymentRoot, 'Staging'); fs.mkdirSync(drillRoot, { recursive: true });
          drill = fs.mkdtempSync(path.join(drillRoot, 'restore-drill_'));
          fs.cpSync(config.FrontendDirectory, path.join(drill, 'frontend'), { recursive: true });
          fs.cpSync(config.BackendDirectory, path.join(drill, 'backend'), { recursive: true });
          if (computeDirectorySha256Hex(path.join(drill, 'frontend')) !== feHash || computeDirectorySha256Hex(path.join(drill, 'backend')) !== beHash) throw new Error('RESTORE_DRILL_HASH_MISMATCH');
          return { ok: true };
        } catch (err) { return { ok: false, error: sanitizeDeploymentErrorText(err) }; }
        finally { if (drill) fs.rmSync(drill, { recursive: true, force: true }); }
      },
      activateBackend: async ({ commitSha, backendDir }) => {
        const { hash } = prepareImmutable(commitSha, backendDir);
        const activated = await live.control('ACTIVATE', { commitSha, backendSha256: hash });
        if (activated.activated !== true || activated.activeCommitSha !== commitSha) throw new Error('GATEWAY_ACTIVATION_NOT_ACKNOWLEDGED');
      },
    },
  });
  process.stdout.write('WORKER_READY\n');
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    let request: any;
    let payload: any;
    try {
      if (Buffer.byteLength(line) > 65536) throw new Error('IPC_FRAME_TOO_LARGE');
      request = verifier.verify(JSON.parse(line));
      switch (request.action) {
        case 'PING': payload = { ok: true, data: { status: engine.agentStatus, locked: engine.isLocked(), isolatedActivation: capability.isolatedActivation === true } }; break;
        case 'PREFLIGHT': payload = { ok: true, data: await engine.getPreDeploymentEvidence(request.payload.targetCommitSha) }; break;
        case 'LIST_BACKUPS': payload = { ok: true, data: await engine.listVerifiedBackups() }; break;
        case 'DEPLOY': payload = { ok: true, data: await engine.executeApprovedDeployment(request.payload) }; break;
        case 'ROLLBACK': payload = { ok: true, data: await engine.executeVerifiedRollback(request.payload) }; break;
      }
    } catch (error) {
      payload = { ok: false, error: sanitizeDeploymentErrorText(error) };
    }
    const nonce = /^[0-9a-f]{24,64}$/.test(request?.nonce) ? request.nonce : undefined;
    process.stdout.write(JSON.stringify(signedFrame(secret, `RESPONSE:${request?.action || 'REJECTED'}`, payload, nonce)) + '\n');
  }
}
main().catch(() => { console.error('AGENT_WORKER_START_FAILED'); process.exitCode = 1; });
