<#
Read-only maintenance-window gate. Does not pull, copy, deploy, restart, install
services, modify ACLs, change firewall rules or write to production directories.
A native secure service host is still required; this revision deliberately ends BLOCKED.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RepositoryPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$ExpectedSourceSha,
  [Parameter(Mandatory)][string]$ArtifactZip,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedArtifactSha256,
  [Parameter(Mandatory)][uri]$ProcurementHealthUri,
  [Parameter(Mandatory)][string]$BackupDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedBackupManifestSha256
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'BLOCKED: run locally on authorized FILESERVER during maintenance only.' }
$branch = 'fix/a96-deployment-fail-closed'
$resolvedRepo = (Resolve-Path -LiteralPath $RepositoryPath).Path
$sourceSha = & git -c "safe.directory=$resolvedRepo" -C $resolvedRepo rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $sourceSha.Trim() -ne $ExpectedSourceSha) { throw 'Source SHA mismatch.' }
$sourceBranch = & git -c "safe.directory=$resolvedRepo" -C $resolvedRepo branch --show-current
if ($LASTEXITCODE -ne 0 -or $sourceBranch.Trim() -ne $branch) { throw 'Source branch mismatch.' }
$dirty = & git -c "safe.directory=$resolvedRepo" -C $resolvedRepo status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Source checkout is not clean.' }
& git -c "safe.directory=$resolvedRepo" -C $resolvedRepo fsck --no-reflogs HEAD
if ($LASTEXITCODE -ne 0) { throw 'Git object verification failed.' }
if ((Get-FileHash -LiteralPath $ArtifactZip -Algorithm SHA256).Hash -ne $ExpectedArtifactSha256) { throw 'Artifact SHA256 mismatch.' }
$backupManifest = Join-Path $BackupDirectory 'backup-manifest.json'
if ((Get-FileHash -LiteralPath $backupManifest -Algorithm SHA256).Hash -ne $ExpectedBackupManifestSha256) { throw 'Backup manifest SHA256 mismatch.' }
$backup = Get-Content -LiteralPath $backupManifest -Raw | ConvertFrom-Json
if ($backup.verified -ne $true) { throw 'Backup has not been verified.' }
# The digest checks above do not prove a recovery drill. Do not infer rollback readiness.
$service = Get-CimInstance Win32_Service -Filter "Name='SamchukSamAttDeployAgent'" |
  Select-Object Name, State, StartName
if (-not $service -or $service.State -ne 'Running') { throw 'Deployment Agent service is absent or not running.' }
$service | Format-List | Out-Host
if ($ProcurementHealthUri.Port -ne 3002 -or $ProcurementHealthUri.Scheme -notin @('http','https') -or
    $ProcurementHealthUri.Host -notin @('localhost','127.0.0.1','fileserver')) { throw 'Procurement probe must use existing local Gateway port 3002.' }
$frontend = Invoke-WebRequest -Uri 'https://FILESERVER:3001/Sam_Att/' -TimeoutSec 15 -MaximumRedirection 0
if ($frontend.StatusCode -ne 200) { throw 'Frontend HTTPS 3001 probe failed.' }
$procurement = Invoke-RestMethod -Uri $ProcurementHealthUri -TimeoutSec 15 -MaximumRedirection 0
if ($procurement.healthy -ne $true) { throw 'Procurement functional health not proven.' }
throw 'BLOCKED: native Windows Service host, pipe DACL/remote-client rejection, authenticated live MySQL/auth/router probes, cross-process lock and backup restore drill are not yet verified. No deployment or restart was performed.'
