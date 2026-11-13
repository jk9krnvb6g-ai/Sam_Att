[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RepositoryPath,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$ExpectedSourceSha,
  [Parameter(Mandatory)][string]$ArtifactZip,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedArtifactSha256,
  [Parameter(Mandatory)][string]$BackupDirectory,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedBackupManifestSha256,
  [Parameter(Mandatory)][string]$AgentConfigurationFile
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'FILESERVER'){throw 'Run on authorized FILESERVER only. Nothing was deployed.'}
$repo=(Resolve-Path -LiteralPath $RepositoryPath).Path
$sha=& git -c "safe.directory=$repo" -C $repo rev-parse HEAD
if($LASTEXITCODE -ne 0 -or $sha.Trim() -ne $ExpectedSourceSha){throw 'Source SHA mismatch.'}
$branch=& git -c "safe.directory=$repo" -C $repo branch --show-current
if($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'fix/a96-deployment-fail-closed'){throw 'Source branch mismatch.'}
$dirty=& git -c "safe.directory=$repo" -C $repo status --porcelain
if($LASTEXITCODE -ne 0 -or $dirty){throw 'Source checkout must be clean.'}
& git -c "safe.directory=$repo" -C $repo fsck --no-reflogs HEAD
if($LASTEXITCODE -ne 0){throw 'Git object verification failed.'}
if((Get-FileHash -LiteralPath $ArtifactZip -Algorithm SHA256).Hash -ne $ExpectedArtifactSha256){throw 'Artifact SHA256 mismatch.'}
if((Get-FileHash -LiteralPath (Join-Path $BackupDirectory 'backup-manifest.json') -Algorithm SHA256).Hash -ne $ExpectedBackupManifestSha256){throw 'Backup manifest SHA256 mismatch.'}
$c=Get-Content -LiteralPath $AgentConfigurationFile -Raw|ConvertFrom-Json
if($c.Mode -ne 'PRODUCTION'){throw 'Production configuration required.'}
foreach($pair in @(@($c.NodePath,$c.NodeSha256),@($c.WorkerPath,$c.WorkerSha256))){if((Get-FileHash -LiteralPath $pair[0] -Algorithm SHA256).Hash -ne $pair[1]){throw 'Executable hash mismatch.'}}
$service=Get-CimInstance Win32_Service -Filter "Name='SamchukSamAttDeployAgent'"
if(-not $service -or $service.State -ne 'Running' -or $service.StartName -ne 'NT SERVICE\SamchukSamAttDeployAgent'){throw 'Dedicated Agent service is not running under the required identity.'}
$checker=Join-Path $repo 'build\agent\check-deployment-readiness.cjs'
if(-not(Test-Path -LiteralPath $checker -PathType Leaf)){throw 'Build the reviewed readiness checker first.'}
& $c.NodePath $checker $AgentConfigurationFile (Split-Path -Leaf $BackupDirectory)
if($LASTEXITCODE -ne 0){throw 'BLOCKED: live readiness failed. No deployment or restart performed.'}
Write-Output 'Readiness checks passed. No deployment, rollback, service start/stop or Gateway restart was performed. A live recovery drill is a separate maintenance acceptance requirement.'
