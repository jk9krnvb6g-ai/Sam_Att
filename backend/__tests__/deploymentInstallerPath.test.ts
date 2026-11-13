import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const installer = readFileSync(join(process.cwd(), 'scripts', 'install-deployment-agent-service.ps1'), 'utf8');
const worker = readFileSync(join(process.cwd(), 'scripts', 'deployment-agent-worker.ts'), 'utf8');
const guide = readFileSync(join(process.cwd(), 'native', 'DeploymentAgent', 'README.md'), 'utf8');

test('A96 production backend destination is isolated from the shared Gateway adapter', () => {
  assert.match(installer, /\$config\.BackendDirectory -ne \(Join-Path \$root 'Backend'\)/);
  assert.doesNotMatch(installer, /Central-API-Gateway\\modules\\Sam_Att/);
  assert.match(installer, /'Releases','Backend','IPCReplay'/);
  assert.match(worker, /inetpub\\\\wwwroot\\\\deployment_center\\\\sam_att\\\\backend/);
  assert.doesNotMatch(worker, /central-api-gateway\\\\modules\\\\sam_att/);
  assert.match(installer, /\(\$name -in @\('Releases','Backend'\)\)/);
});

test('A96 fail-closed production installation gates remain in place', () => {
  assert.match(installer, /if \(-not \$MaintenanceWindowApproved\)/);
  assert.match(installer, /if \(\$env:COMPUTERNAME -ne 'FILESERVER'\)/);
  assert.match(installer, /Get-FileHash -LiteralPath/);
  assert.doesNotMatch(installer, /Start-Service\s/);
});

test('A96 deployment guide forbids Gateway adapter overwrite', () => {
  assert.match(guide, /Deployment_Center\\Sam_Att\\Backend/);
  assert.match(guide, /must never be a deployment destination/);
});
