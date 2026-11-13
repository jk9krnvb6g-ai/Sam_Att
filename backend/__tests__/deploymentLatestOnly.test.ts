import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const service = fs.readFileSync(path.join(process.cwd(), 'backend/services/deploymentCenterService.ts'), 'utf8');
const approval = service.slice(service.indexOf('public static async approveAndExecuteDeployment('));

test('Deployment Center approval revalidates latest GitHub main before executing', () => {
  assert.match(approval, /fetchLatestGitHubVersion\(true\)/);
  assert.match(approval, /SAM_ATT_LATEST_GITHUB_UNVERIFIED/);
  assert.match(approval, /SAM_ATT_LATEST_COMMIT_CHANGED/);
  assert.ok(approval.indexOf('fetchLatestGitHubVersion(true)') < approval.indexOf('agent.executeApprovedDeployment('));
});

test('Deployment Center still requires preflight and agent before deploy', () => {
  assert.match(approval, /SAM_ATT_PREFLIGHT_NOT_PASSED/);
  assert.match(approval, /SAM_ATT_COMMIT_MISMATCH/);
  assert.match(approval, /agent\.isLocked\(\)/);
});
