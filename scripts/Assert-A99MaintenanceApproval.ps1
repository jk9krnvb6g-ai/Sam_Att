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
$hashes = @(Get-Content -LiteralPath $ReleaseSha256File | Where-Object { $_ -match '^[a-f0-9]{64}  .+' })
if ($hashes.Count -lt 5) { throw 'RELEASE_HASH_LIST_INCOMPLETE' }
Write-Host 'A99 DOCUMENTARY PRECHECK PASSED; THIS IS NOT CRYPTOGRAPHIC SIGNATURE VERIFICATION OR PRODUCTION ACCEPTANCE.'
Write-Host 'Operator must independently verify approval authenticity, artifact hashes, baseline provenance, active Gateway host, and live Procurement before any installation.'
Write-Host 'READ_ONLY: no service, Gateway, deployment, or production file modified.'
