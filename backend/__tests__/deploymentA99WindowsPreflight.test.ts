import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const script = fs.readFileSync(path.join(process.cwd(), 'scripts/Invoke-A99WindowsPreflight.ps1'), 'utf8');
test('A99 Windows preflight is read-only and has no execute mode', () => {
  assert.match(script, /ValidateSet\('Preflight'\)/);
  assert.doesNotMatch(script, /\b(?:Restart-Service|Stop-Service|Start-Service|Set-Service|New-Service|Set-Content|Copy-Item|Remove-Item|Move-Item|Set-ScheduledTask|Start-ScheduledTask|Invoke-RestMethod|Invoke-WebRequest)\b/);
  assert.match(script, /exit 2/);
});
test('A99 Windows preflight checks Gateway, backend isolation and Procurement evidence', () => {
  for (const check of ['Gateway TCP 3002','Gateway scheduled task','Backend isolation','Current manifest','Maintenance approval','Baseline provenance','Procurement functional probe','Restore drill','Signed Stable Host live validation']) {
    assert.ok(script.includes(check), check);
  }
});
