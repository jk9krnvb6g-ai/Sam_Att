#requires -Version 5.1
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script=Join-Path $repo 'scripts/install-deployment-center-once.ps1'
$fixture=Join-Path $env:TEMP ('sam-att-installer-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $fixture | Out-Null
function Assert([bool]$ok,[string]$detail){if(-not $ok){throw "ASSERT_FAILED: $detail"}}
function Reject($action,[string]$pattern){
  $failed=$false
  try { & $action } catch { $failed=$true; if($_.Exception.Message -notmatch $pattern){throw} }
  Assert $failed ('Expected rejection: '+$pattern)
}
try {
  $root=[IO.Path]::GetFullPath((Join-Path $fixture 'deployment'))
  $configPath=Join-Path $fixture 'config.json'
  $node=(Get-Command node.exe).Source
  foreach($name in @('ipc','control','session','procurement')){[IO.File]::WriteAllText((Join-Path $fixture $name),($name+'-isolated-fixture-secret-').PadRight(64,'x'))}
  $config=[ordered]@{
    Mode='ISOLATED'; DeploymentRoot=$root; BackendDirectory=(Join-Path $root 'Backend'); ReleaseRoot=(Join-Path $root 'Releases'); FrontendDirectory=(Join-Path $fixture 'frontend')
    NodePath=$node; NodeSha256=(Get-FileHash $node -Algorithm SHA256).Hash; NpmCliPath=(Join-Path $fixture 'npm.cjs')
    IpcSecretFile=(Join-Path $fixture 'ipc'); ControlSecretFile=(Join-Path $fixture 'control'); SessionTokenFile=(Join-Path $fixture 'session'); ProcurementTokenFile=(Join-Path $fixture 'procurement')
  }
  [IO.File]::WriteAllText($config.NpmCliPath,'throw new Error("installer must never execute npm");')
  $config | ConvertTo-Json | Set-Content $configPath
  $params=@{ ConfigurationFile=$configPath; NativeExecutable=(Join-Path $repo 'build/agent/SamAttDeploymentAgent.exe'); WorkerBundle=(Join-Path $repo 'build/agent/deployment-agent-worker.cjs'); SignedHostBundle=(Join-Path $repo 'dist-backend/sam-att-host.cjs'); SourceCommit=('a'*40); Mode='ISOLATED'; IsolatedRoot=$root; MaintenanceWindowApproved=$true; OperatorName='CI isolated operator'; ChangeTicket='CI-NOT-PRODUCTION' }
  $params.NativeSha256=(Get-FileHash $params.NativeExecutable -Algorithm SHA256).Hash
  $params.WorkerSha256=(Get-FileHash $params.WorkerBundle -Algorithm SHA256).Hash
  $params.SignedHostSha256=(Get-FileHash $params.SignedHostBundle -Algorithm SHA256).Hash
  & $script @params -WhatIf
  Assert (-not (Test-Path $root)) 'WhatIf created no directory'
  $bad=$params.Clone();$bad.NativeSha256='0'*64
  Reject { & $script @bad } 'HASH_MISMATCH'
  Assert (-not (Test-Path $root)) 'Bad hash created no directory'
  $bad=$params.Clone();$bad.MaintenanceWindowApproved=$false
  Reject { & $script @bad } 'OPERATOR_AUTHORIZATION'
  & $script @params
  $receiptPath=Join-Path $root 'installation-receipt.json'
  $receipt=Get-Content $receiptPath -Raw | ConvertFrom-Json
  Assert ($receipt.phase -eq 'ISOLATED_STAGING_COMPLETE') 'Staging completed'
  Assert ($receipt.liveAcceptance -eq 'BLOCKED' -and -not $receipt.gatewayChanged -and -not $receipt.productionDeployed) 'No production claim'
  $acl=Get-Acl $receiptPath
  Assert $acl.AreAccessRulesProtected 'Receipt has protected ACL'
  Assert (@($acl.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544') }).Count -eq 0) 'Receipt ACL least privilege'
  & $script @params
  # Simulated interruption: durable last phase remains and identical verified inputs resume.
  $receipt.phase='STAGING';$receipt | ConvertTo-Json | Set-Content $receiptPath
  Remove-Item -LiteralPath (Join-Path $root 'CutoverBundle/sam-att-host.cjs')
  & $script @params
  Assert ((Get-Content $receiptPath -Raw | ConvertFrom-Json).phase -eq 'ISOLATED_STAGING_COMPLETE') 'Partial install resumed'
  $bad=$params.Clone();$bad.SourceCommit='b'*40
  Reject { & $script @bad } 'RECEIPT_CONFLICT'
  # A real Windows junction, with target and link both inside the fixture.
  $target=Join-Path $fixture 'outside';New-Item -ItemType Directory $target | Out-Null
  $link=Join-Path $fixture 'link'
  $junctionCreated=$false
  try { New-Item -ItemType Junction -Path $link -Target $target | Out-Null; $junctionCreated=$true }
  catch { if($env:CI -eq 'true'){throw}; Write-Output 'LOCAL_JUNCTION_CHECK=BLOCKED_BY_DESKTOP_PERMISSIONS (required on CI)' }
  . (Join-Path $repo 'scripts/DeploymentInstallSafety.ps1')
  if($junctionCreated){Reject { Assert-SafeInstallPath (Join-Path $link 'nested/missing.txt') } 'REPARSE_POINT'}
  Reject { Assert-SafeInstallPath ($root+'\..\escape') } 'UNSAFE_INSTALL_PATH'
  # Remove the verified junction itself, never recurse through its target.
  if($junctionCreated){[IO.Directory]::Delete($link)}
  $lock=[IO.File]::Open((Join-Path $root 'installation.lock'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try { Reject { & $script @params } 'used by another process' } finally {$lock.Dispose()}
  Write-Output 'WINDOWS_INSTALLER_ACCEPTANCE=PASS (real files, SHA256, protected ACL, resume, lock; junction required on CI; no SCM/IIS/live acceptance)'
} finally {
  # Resolve and verify the complete cleanup target before recursive deletion.
  $resolved=[IO.Path]::GetFullPath($fixture)
  $temp=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\'
  if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'sam-att-installer-*'){throw 'UNSAFE_TEST_CLEANUP'}
  if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
