import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStagingDeploymentEngine, computeDirectorySha256Hex, signIpcPayload } from '../services/deploymentAgentService';
import { DeploymentIpcVerifier } from '../services/deploymentIpcSecurity';

const secret = 'security-test-only-'.repeat(3);
function frame(action = 'PING', payload: unknown = {}, timestamp = Date.now(), nonce = 'a'.repeat(24)) {
  return { action, payload, timestamp, nonce, signature: signIpcPayload(secret, action, timestamp, nonce, payload) };
}
test('IPC authenticates, authorizes operators and rejects tampering, replay, expiry, malformed timestamps and unknown actions', () => {
  const v = new DeploymentIpcVerifier(secret, new Set(['admin-id']));
  const good = frame();
  assert.equal(v.verify(good).action, 'PING');
  assert.throws(() => v.verify(good), /REPLAY/);
  assert.throws(() => v.verify({ ...frame(), payload: { tampered: true } }), /SIGNATURE/);
  assert.throws(() => v.verify(frame('PING', {}, Date.now() - 61_000)), /INVALID_FRAME/);
  assert.throws(() => v.verify({ ...frame(), timestamp: NaN }), /INVALID_FRAME/);
  assert.throws(() => v.verify(frame('SHELL')), /INVALID_FRAME/);
  const deploy = { approvedBy: { userId: 'other', username: 'admin' }, targetCommitSha: 'a'.repeat(40), deploymentId: 'DEP_TEST' };
  assert.throws(() => v.verify(frame('DEPLOY', deploy, Date.now(), 'b'.repeat(24))), /FORBIDDEN/);
  deploy.approvedBy.userId = 'admin-id';
  assert.equal(v.verify(frame('DEPLOY', deploy, Date.now(), 'b'.repeat(24))).action, 'DEPLOY');
});
test('IPC future timestamps cannot be replayed at the edge of the acceptance window', () => {
  const now = Date.now(), v = new DeploymentIpcVerifier(secret, new Set());
  const msg = frame('PING', {}, now + 60_000);
  v.verify(msg, now);
  assert.throws(() => v.verify(msg, now + 120_000), /REPLAY/);
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a96-security-'));
  const cfg = {
    workspaceRoot: root, frontendProdDir: path.join(root, 'frontend'), backendProdDir: path.join(root, 'backend'),
    adapterConfigPath: path.join(root, 'backend', 'adapter.json'), manifestPath: path.join(root, 'current.json'),
    backupsDir: path.join(root, 'backups'), stagingDir: path.join(root, 'staging'),
    isolatedBackendActivationSupported: true, backendRequiresGatewayRestart: false,
  };
  const engine = new LocalStagingDeploymentEngine(cfg);
  fs.writeFileSync(path.join(cfg.frontendProdDir, 'index.html'), '<html>isolated old release fixture</html>');
  fs.writeFileSync(path.join(cfg.backendProdDir, 'sam-att-gateway.cjs'), 'module.exports = { version: "old-fixture" };');
  return { root, cfg, engine, clean: () => fs.rmSync(root, { recursive: true, force: true }) };
}
test('missing executors fail closed instead of manufacturing preflight evidence', async () => {
  const f = fixture();
  try { await assert.rejects(f.engine.getPreDeploymentEvidence('a'.repeat(40)), /SOURCE_EXECUTOR/); }
  finally { f.clean(); }
});
test('backup never synthesizes production baseline files', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.cfg.frontendProdDir, 'index.html'));
    const backup = (f.engine as any).createProductionBackup();
    assert.equal(backup.ok, false);
    assert.match(backup.error, /BASELINE_MISSING/);
    assert.deepEqual(fs.readdirSync(f.cfg.frontendProdDir), []);
  } finally { f.clean(); }
});
test('rollback reports critical failure if restored files do not pass health checks', async () => {
  const f = fixture();
  try {
    const backup = (f.engine as any).createProductionBackup();
    assert.equal(backup.ok, true);
    const result = await f.engine.executeVerifiedRollback({ backupId: backup.backupId, requestedBy: { userId: 'a', username: 'admin', fullName: 'Test' } });
    assert.equal(result.rolledBack, false);
    assert.equal(result.rollbackStatus, 'ROLLBACK_FAILED_CRITICAL');
    assert.match(result.errorSanitized!, /ROLLBACK_HEALTH_CHECK_FAILED/);
  } finally { f.clean(); }
});
test('backup integrity rejects unexpected manifest insertion and file corruption', () => {
  const f = fixture();
  try {
    const backup = (f.engine as any).createProductionBackup();
    const dir = path.join(f.cfg.backupsDir, backup.backupId);
    assert.equal(f.engine.verifyBackupDirectory(dir).valid, true);
    fs.writeFileSync(path.join(dir, 'current.json.bak'), '{}');
    assert.equal(f.engine.verifyBackupDirectory(dir).valid, false);
    fs.unlinkSync(path.join(dir, 'current.json.bak'));
    fs.appendFileSync(path.join(dir, 'frontend', 'index.html'), 'corruption');
    assert.equal(f.engine.verifyBackupDirectory(dir).valid, false);
  } finally { f.clean(); }
});
test('elapsed lock timeout never admits a second deployment', () => {
  const f = fixture();
  try {
    (f.engine as any).activeLock = { lockedAt: 0, deploymentId: 'still-running' };
    assert.equal(f.engine.isLocked(), true);
  } finally { f.clean(); }
});
test('missing artifact directory cannot produce a valid checksum', () => {
  const f = fixture();
  try { assert.throws(() => computeDirectorySha256Hex(path.join(f.root, 'missing')), /DIRECTORY_MISSING/); }
  finally { f.clean(); }
});

function pipelineFixture() {
  const f = fixture();
  let probes = 0;
  const hooks = {
    fetchGitHubSource: async (sha: string, dir: string) => { fs.writeFileSync(path.join(dir, 'source'), sha); return { ok: true }; },
    verifyGitHubSource: async (sha: string, dir: string) => ({ ok: fs.readFileSync(path.join(dir, 'source'), 'utf8') === sha }),
    runDependenciesCheck: async () => ({ ok: true, detail: 'isolated dependency fixture' }),
    runTypecheck: async () => ({ ok: true, detail: 'isolated typecheck fixture' }),
    runUnitTests: async () => ({ ok: true, detail: 'isolated unit fixture' }),
    runIntegrationTests: async () => ({ ok: true, detail: 'isolated integration fixture' }),
    runBuild: async (dir: string) => {
      const frontendBuildDir = path.join(dir, 'frontend_dist'), backendBuildDir = path.join(dir, 'backend_dist');
      fs.mkdirSync(frontendBuildDir, { recursive: true }); fs.mkdirSync(backendBuildDir, { recursive: true });
      fs.writeFileSync(path.join(frontendBuildDir, 'index.html'), '<html>new isolated release fixture</html>');
      fs.writeFileSync(path.join(backendBuildDir, 'sam-att-gateway.cjs'), 'module.exports = { version: "new-fixture" };');
      return { ok: true, detail: 'isolated artifact fixture', frontendBuildDir, backendBuildDir };
    },
    runPostDeployHealthProbe: async () => {
      probes++;
      return { frontendHealthy: true, backendHealthy: true, authHealthy: true, mysqlHealthy: true, routerHealthy: true, procurementHealthy: true, procurementStatusCode: 200 };
    },
  };
  Object.assign(f.cfg, { hooks });
  const params = { deploymentId: 'DEP_FIXTURE', targetCommitSha: 'a'.repeat(40), targetVersion: 'fixture', approvedBy: { userId: 'a', username: 'admin', fullName: 'Test' } };
  return { ...f, hooks, params, probes: () => probes };
}
test('preflight hashes actual isolated artifacts and rejects partial health evidence', async () => {
  const f = pipelineFixture();
  try {
    const evidence = await f.engine.getPreDeploymentEvidence(f.params.targetCommitSha);
    assert.equal(evidence?.buildPassed, true);
    const expected = crypto.createHash('sha256').update('F:index.html:<html>new isolated release fixture</html>\n').digest('hex');
    assert.equal(evidence?.frontendArtifactSha256, expected);
    Object.assign(f.hooks, { runPostDeployHealthProbe: async () => ({ procurementStatusCode: 200 }) });
    const partial = await f.engine.getPreDeploymentEvidence(f.params.targetCommitSha);
    assert.equal(partial?.gatewayHealthPassed, false);
    assert.equal(partial?.procurementHealthPassed, false);
  } finally { f.clean(); }
});
test('unhealthy Procurement stops activation before production files change', async () => {
  const f = pipelineFixture();
  try {
    Object.assign(f.hooks, { runPostDeployHealthProbe: async () => ({ backendHealthy: true, routerHealthy: true, procurementHealthy: false, procurementStatusCode: 503 }) });
    const result = await f.engine.executeApprovedDeployment(f.params);
    assert.equal(result.status, 'FAILED');
    assert.match(result.errorSanitized!, /PRE_ACTIVATION_HEALTH_FAILED/);
    assert.match(fs.readFileSync(path.join(f.cfg.frontendProdDir, 'index.html'), 'utf8'), /old release/);
  } finally { f.clean(); }
});
test('request flags cannot bypass a host maintenance guard', async () => {
  const f = pipelineFixture();
  try {
    Object.assign(f.cfg, { backendRequiresGatewayRestart: true, isolatedBackendActivationSupported: false });
    const result = await f.engine.executeApprovedDeployment({ ...f.params, backendRequiresGatewayRestart: false, isolatedBackendActivationSupported: true, maintenanceWindowApproved: true });
    assert.equal(result.status, 'MAINTENANCE_REQUIRED');
    assert.match(fs.readFileSync(path.join(f.cfg.frontendProdDir, 'index.html'), 'utf8'), /old release/);
  } finally { f.clean(); }
});
test('exception after manifest write triggers verified recovery to the previous files', async () => {
  const f = pipelineFixture();
  try {
    let calls = 0;
    const healthy = f.hooks.runPostDeployHealthProbe;
    f.hooks.runPostDeployHealthProbe = async () => {
      if (++calls === 3) throw new Error('final probe failure');
      return healthy();
    };
    const result = await f.engine.executeApprovedDeployment(f.params);
    assert.equal(result.status, 'ROLLED_BACK');
    assert.equal(result.rollbackStatus, 'ROLLED_BACK');
    assert.match(fs.readFileSync(path.join(f.cfg.frontendProdDir, 'index.html'), 'utf8'), /old release/);
    assert.equal(fs.existsSync(f.cfg.manifestPath), false);
  } finally { f.clean(); }
});
test('deployment ID traversal is rejected before source execution', async () => {
  const f = pipelineFixture();
  try {
    const result = await f.engine.executeApprovedDeployment({ ...f.params, deploymentId: '../escape' });
    assert.equal(result.status, 'FAILED');
    assert.match(result.errorSanitized!, /INVALID_DEPLOYMENT_ID/);
  } finally { f.clean(); }
});

test('Windows development agent refuses startup before creating an insecure pipe host', { skip: process.platform !== 'win32' }, async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/fileserver-deployment-agent.ts'], {
    env: { ...process.env, SAM_ATT_AGENT_IPC_SECRET: secret }, encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /USE_NATIVE_SERVICE_HOST/);
});

test('external adapter config is checksummed, rejects corruption and restores verified bytes', async () => {
  const f = pipelineFixture();
  try {
    f.cfg.adapterConfigPath = path.join(f.root, 'external-config.json');
    fs.writeFileSync(f.cfg.adapterConfigPath, '{"release":"old"}');
    const backup = (f.engine as any).createProductionBackup();
    assert.equal(backup.ok, true);
    const dir = path.join(f.cfg.backupsDir, backup.backupId);
    const saved = path.join(dir, 'config', 'external-config.json');
    fs.writeFileSync(saved, 'corrupt');
    assert.equal(f.engine.verifyBackupDirectory(dir).valid, false);
    fs.writeFileSync(saved, '{"release":"old"}');
    fs.writeFileSync(f.cfg.adapterConfigPath, '{"release":"new"}');
    const recovery = await f.engine.executeVerifiedRollback({ backupId: backup.backupId, requestedBy: f.params.approvedBy });
    assert.equal(recovery.rolledBack, true);
    assert.equal(fs.readFileSync(f.cfg.adapterConfigPath, 'utf8'), '{"release":"old"}');
  } finally { f.clean(); }
});

test('critical recovery keeps a durable journal and blocks redeploy until healthy manual rollback', async () => {
  const f=pipelineFixture();
  try {
    let probes=0;
    const healthy=f.hooks.runPostDeployHealthProbe;
    f.hooks.runPostDeployHealthProbe=async()=>({ ...(await healthy()), backendHealthy: ++probes === 1 });
    const failed=await f.engine.executeApprovedDeployment(f.params);
    assert.equal(failed.status,'FAILED');
    assert.equal(failed.rollbackStatus,'ROLLBACK_FAILED_CRITICAL');
    assert.equal(fs.existsSync(path.join(f.cfg.workspaceRoot,'recovery-required.json')),true);
    assert.equal((await f.engine.executeApprovedDeployment({...f.params,deploymentId:'DEP_NEXT'})).accepted,false);
    f.hooks.runPostDeployHealthProbe=healthy;
    const recovered=await f.engine.executeVerifiedRollback({backupId:failed.backupId!,requestedBy:f.params.approvedBy});
    assert.equal(recovered.rolledBack,true);
    assert.equal(fs.existsSync(path.join(f.cfg.workspaceRoot,'recovery-required.json')),false);
  } finally {f.clean();}
});
