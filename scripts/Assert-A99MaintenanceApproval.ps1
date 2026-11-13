[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ApprovalFile,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$ReleaseCommit,
  [Parameter(Mandatory)][string]$ReleaseSha256File,
  [Parameter(Mandatory)][string]$BaselineEvidenceFile,
  [Parameter(Mandatory)][string]$ProcurementProbeEvidenceFile,
  [Parameter(Mandatory)][string]$RollbackDrillEvidenceFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Read-JsonFile([string]$file) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "EVIDENCE_MISSING: $file" }
  $item = Get-Item -LiteralPath $file
  if ($item.Length -eq 0 -or $item.Length -gt 1MB) { throw "EVIDENCE_INVALID_SIZE: $file" }
  return (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json)
}
$approval = Read-JsonFile $ApprovalFile
if ($approval.approved -cne $true -or $approval.productionActivationApproved -cne $true) { throw 'EXPLICIT_PRODUCTION_APPROVAL_REQUIRED' }
if ([string]::IsNullOrWhiteSpace([string]$approval.approvedBy) -or [string]::IsNullOrWhiteSpace([string]$approval.changeTicket)) { throw 'APPROVER_AND_CHANGE_TICKET_REQUIRED' }
if ($approval.releaseCommit -cne $ReleaseCommit.ToLowerInvariant()) { throw 'APPROVED_COMMIT_MISMATCH' }
$start = [DateTimeOffset]::Parse([string]$approval.windowStart)
$end = [DateTimeOffset]::Parse([string]$approval.windowEnd)
$now = [DateTimeOffset]::Now
if ($end -le $start -or $now -lt $start -or $now -ge $end) { throw 'OUTSIDE_APPROVED_MAINTENANCE_WINDOW' }
$baseline = Read-JsonFile $BaselineEvidenceFile
if ($baseline.evidenceOnly -cne $true -or $baseline.manifestCreated -cne $false -or @($baseline.frontend).Count -eq 0 -or @($baseline.backend).Count -eq 0) { throw 'VERIFIED_BASELINE_EVIDENCE_REQUIRED' }
$procurement = Read-JsonFile $ProcurementProbeEvidenceFile
if ($procurement.authenticated -cne $true -or $procurement.functional -cne $true -or $procurement.statusCode -ne 200 -or $procurement.approvedEndpoint -cne $true) { throw 'PROCUREMENT_FUNCTIONAL_PROBE_REQUIRED' }
$rollback = Read-JsonFile $RollbackDrillEvidenceFile
if ($rollback.verifiedBackup -cne $true -or $rollback.restoreHashesMatch -cne $true -or $rollback.rollbackHealthy -cne $true) { throw 'VERIFIED_ROLLBACK_DRILL_REQUIRED' }
if (-not (Test-Path -LiteralPath $ReleaseSha256File -PathType Leaf)) { throw 'RELEASE_SHA256SUMS_MISSING' }
$releaseRoot = Split-Path -Parent ([IO.Path]::GetFullPath($ReleaseSha256File))
$hashLines = @(Get-Content -LiteralPath $ReleaseSha256File)
$expectedFiles = @('sam-att-gateway.cjs','sam-att-host.cjs','deployment-agent-worker.cjs','SamAttDeploymentAgent.exe','install-deployment-agent-service.ps1','Export-A98BaselineEvidence.ps1')
if ($hashLines.Count -ne $expectedFiles.Count) { throw 'RELEASE_HASH_LIST_INCOMPLETE' }
$seen = @{}
foreach ($line in $hashLines) {
  if ($line -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9._-]+)
Write-Host 'A99 DOCUMENTARY PRECHECK PASSED; THIS IS NOT CRYPTOGRAPHIC SIGNATURE VERIFICATION OR PRODUCTION ACCEPTANCE.'
Write-Host 'Operator must independently verify approval authenticity, artifact hashes, baseline provenance, active Gateway host, and live Procurement before any installation.'
Write-Host 'READ_ONLY: no service, Gateway, deployment, or production file modified.'
) { throw 'RELEASE_HASH_LIST_INVALID' }
  $expectedHash = $Matches[1]
  $name = $Matches[2]
  if ($name -notin $expectedFiles -or $seen.ContainsKey($name)) { throw 'RELEASE_HASH_LIST_INVALID' }
  $seen[$name] = $true
  $file = Join-Path $releaseRoot $name
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "RELEASE_ARTIFACT_MISSING: $name" }
  $actualHash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne $expectedHash) { throw "RELEASE_ARTIFACT_HASH_MISMATCH: $name" }
}
if ($seen.Count -ne $expectedFiles.Count) { throw 'RELEASE_HASH_LIST_INCOMPLETE' }
Write-Host 'A99 DOCUMENTARY PRECHECK PASSED; THIS IS NOT CRYPTOGRAPHIC SIGNATURE VERIFICATION OR PRODUCTION ACCEPTANCE.'
Write-Host 'Operator must independently verify approval authenticity, artifact hashes, baseline provenance, active Gateway host, and live Procurement before any installation.'
Write-Host 'READ_ONLY: no service, Gateway, deployment, or production file modified.'
