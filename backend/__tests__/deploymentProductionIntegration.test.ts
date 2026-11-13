import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('A98 pre-activation health checks use verified active commit, not the unactivated target', () => {
  const source = read('backend/services/deploymentAgentService.ts');
  assert.match(source, /const activeBeforeActivation = readAndVerifyDeploymentManifest\(this\.config\.manifestPath\)/);
  assert.match(source, /throw new Error\('VERIFIED_ACTIVE_BASELINE_REQUIRED'\)/);
  assert.match(source, /targetCommitSha: activeBeforeActivation\.manifest\.commitSha/);
  assert.match(source, /if \(this\.config\.hooks\?\.activateBackend\)/);
  assert.match(source, /this\.evaluateSevenPointHealthCheck\(\s*params\.targetCommitSha/);
});

test('A98 baseline evidence exporter never manufactures verified manifest or mutates production', () => {
  const source = read('scripts/Export-A98BaselineEvidence.ps1');
  assert.match(source, /SOURCE_COMMIT_NOT_VERIFIED/);
  assert.match(source, /SHARED_GATEWAY_BACKEND_FORBIDDEN/);
  assert.match(source, /NESTED_REPARSE_POINT_REJECTED/);
  assert.match(source, /BUILT_BACKEND_ARTIFACT_REQUIRED/);
  assert.match(source, /manifestCreated = \$false/);
  assert.match(source, /productionActivationApproved = \$false/);
  assert.doesNotMatch(source, /(?:Start-Service|Restart-Service|Stop-Service|New-Service|Set-ItemProperty|Copy-Item|Remove-Item|writeVerifiedDeploymentManifest)/);
});

test('A98 Gateway host has no independent listener and rejects unverified startup', () => {
  const source = read('backend/deployment/gatewayHost.ts');
  assert.match(source, /VERIFIED_CURRENT_MANIFEST_REQUIRED/);
  assert.match(source, /SINGLE_PROCESS_DURABLE_GATEWAY_HOST_REQUIRED/);
  assert.match(source, /RELEASE_HASH_MISMATCH/);
  assert.doesNotMatch(source, /\.listen\(/);
});

test('A98 rollback requires verified backup and reactivates previous commit', () => {
  const source = read('backend/services/deploymentAgentService.ts');
  assert.match(source, /this\.verifyBackupDirectory\(backupDir\)/);
  assert.match(source, /if \(!integrity\.valid \|\| !integrity\.manifest\)/);
  assert.match(source, /commitSha: restoredCommit, backendDir: this\.config\.backendProdDir/);
  assert.match(source, /ROLLBACK_HEALTH_CHECK_FAILED/);
});
