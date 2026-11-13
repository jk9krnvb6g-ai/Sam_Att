import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'scripts/Assert-A99MaintenanceApproval.ps1'), 'utf8');
test('A99 requires explicit production approval and a bounded live maintenance window', () => {
  assert.match(source, /EXPLICIT_PRODUCTION_APPROVAL_REQUIRED/);
  assert.match(source, /APPROVER_AND_CHANGE_TICKET_REQUIRED/);
  assert.match(source, /APPROVED_COMMIT_MISMATCH/);
  assert.match(source, /OUTSIDE_APPROVED_MAINTENANCE_WINDOW/);
});
test('A99 refuses missing procurement and rollback evidence', () => {
  assert.match(source, /PROCUREMENT_FUNCTIONAL_PROBE_REQUIRED/);
  assert.match(source, /VERIFIED_ROLLBACK_DRILL_REQUIRED/);
  assert.match(source, /RELEASE_SHA256SUMS_MISSING/);
  assert.match(source, /RELEASE_HASH_LIST_INCOMPLETE/);
});
test('A99 precheck is non-mutating and does not claim production acceptance', () => {
  assert.doesNotMatch(source, /\b(?:Start-Service|Stop-Service|Restart-Service|New-Service|Copy-Item|Remove-Item|Move-Item|Invoke-RestMethod|Invoke-WebRequest)\b/);
  assert.match(source, /NOT CRYPTOGRAPHIC SIGNATURE VERIFICATION OR PRODUCTION ACCEPTANCE/);
});
