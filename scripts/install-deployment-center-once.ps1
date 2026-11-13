#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='Medium')]
param(
  [Parameter(Mandatory)][string]$ConfigurationFile,
  [Parameter(Mandatory)][string]$NativeExecutable,
  [Parameter(Mandatory)][string]$WorkerBundle,
  [Parameter(Mandatory)][string]$SignedHostBundle,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$NativeSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$WorkerSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$SignedHostSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
  [ValidateSet('PRODUCTION','ISOLATED')][string]$Mode='PRODUCTION',
  [string]$IsolatedRoot,
  [string[]]$BaseUrls,
  [switch]$MaintenanceWindowApproved,
  [string]$OperatorName,
  [string]$ChangeTicket
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'DeploymentInstallSafety.ps1')
if ($Mode -eq 'PRODUCTION') {
  if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'FILESERVER_ONLY' }
  $root='C:\inetpub\wwwroot\Deployment_Center\Sam_Att'
} else {
  if (-not $IsolatedRoot) { throw 'ISOLATED_ROOT_REQUIRED' }
  $root=[IO.Path]::GetFullPath($IsolatedRoot)
  if ($root -match '(?i)\\inetpub(\\|$)|\\Central-API-Gateway(\\|$)' -or $env:COMPUTERNAME -eq 'FILESERVER') { throw 'ISOLATED_PRODUCTION_PATH_FORBIDDEN' }
}
Assert-SafeInstallPath $root
Assert-SafeInstallPath $ConfigurationFile
$config=Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
if ($config.Mode -ne $Mode -or $config.DeploymentRoot -ne $root -or $config.BackendDirectory -ne (Join-Path $root 'Backend') -or $config.ReleaseRoot -ne (Join-Path $root 'Releases')) { throw 'INSTALL_CONFIG_PATH_POLICY_FAILED' }
foreach ($field in @('FrontendDirectory','BackendDirectory','ReleaseRoot','NodePath','NpmCliPath','IpcSecretFile','ControlSecretFile','SessionTokenFile','ProcurementTokenFile')) { Assert-SafeInstallPath ([string]$config.$field) }
Assert-InstallHash $NativeExecutable $NativeSha256
Assert-InstallHash $WorkerBundle $WorkerSha256
Assert-InstallHash $SignedHostBundle $SignedHostSha256
Assert-InstallHash $config.NodePath $config.NodeSha256
if (-not (Test-Path -LiteralPath $config.NpmCliPath -PathType Leaf)) { throw 'NPM_CLI_REQUIRED' }
if ($Mode -eq 'PRODUCTION') {
  if ($config.FrontendDirectory -ne 'C:\inetpub\wwwroot\Sam_Att' -or $config.PSObject.Properties.Name -contains 'IsolatedPackageSid') { throw 'PRODUCTION_CONFIG_POLICY_FAILED' }
  if (-not $BaseUrls -or $BaseUrls.Count -eq 0) { throw 'IIS_BINDING_URLS_REQUIRED' }
}
$secretValues=@()
foreach ($field in @('IpcSecretFile','ControlSecretFile','SessionTokenFile','ProcurementTokenFile')) {
  $value=[IO.File]::ReadAllText($config.$field).Trim()
  if ($value.Length -lt 32) { throw 'INSTALL_SECRET_TOO_SHORT' }; $secretValues+=,$value
}
if ($secretValues[0] -eq $secretValues[1]) { throw 'IPC_AND_CONTROL_SECRETS_MUST_DIFFER' }
$configHash=(Get-FileHash -LiteralPath $ConfigurationFile -Algorithm SHA256).Hash
$identity="$SourceCommit|$NativeSha256|$WorkerSha256|$SignedHostSha256|$configHash"
$receiptPath=Join-Path $root 'installation-receipt.json'
Assert-SafeInstallPath $receiptPath
if (Test-Path -LiteralPath $receiptPath) {
  $old=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  if ($old.identity -cne $identity -or $old.mode -ne $Mode) { throw 'INSTALL_RECEIPT_CONFLICT' }
}
# WhatIf validates inputs; no canary, IIS, ACL, receipt or service write.
if (-not $PSCmdlet.ShouldProcess($root,'Verify isolation, stage verified host, install stopped agent and save receipt')) { return }
if (-not $MaintenanceWindowApproved -or [string]::IsNullOrWhiteSpace($OperatorName) -or [string]::IsNullOrWhiteSpace($ChangeTicket)) { throw 'INSTALL_OPERATOR_AUTHORIZATION_REQUIRED' }
if ($Mode -eq 'PRODUCTION') {
  $admin=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'INSTALL_ADMIN_REQUIRED' }
  & (Join-Path $PSScriptRoot 'provision-deployment-center-iis.ps1') -Confirm:$false
  if (-not $?) { throw 'IIS_PROVISION_FAILED' }
} else {
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  Set-InstallAdminAcl $root
}
$lockPath=Join-Path $root 'installation.lock'
Assert-SafeInstallPath $lockPath
$lock=$null
try {
  $lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $receipt=[ordered]@{ schemaVersion=1; mode=$Mode; identity=$identity; sourceCommit=$SourceCommit; operator=$OperatorName; changeTicket=$ChangeTicket; phase='VERIFYING_ISOLATION'; gatewayChanged=$false; productionDeployed=$false; liveAcceptance='BLOCKED'; updatedAt=[DateTime]::UtcNow.ToString('o') }
  Write-InstallJson $receiptPath $receipt
  if ($Mode -eq 'PRODUCTION') {
    $canaryName=[guid]::NewGuid().ToString('N')+'.txt'
    $canary=Join-Path $root $canaryName
    try {
      [IO.File]::WriteAllText($canary,[guid]::NewGuid().ToString('N'))
      & (Join-Path $PSScriptRoot 'Test-DeploymentCenterHttpIsolation.ps1') -BaseUrls $BaseUrls -CanaryRelativePath ('Sam_Att/'+$canaryName)
      if (-not $?) { throw 'IIS_HTTP_ISOLATION_FAILED' }
    } finally { if (Test-Path -LiteralPath $canary) { Remove-Item -LiteralPath $canary -Force } }
  }
  $receipt.phase='STAGING'; Write-InstallJson $receiptPath $receipt
  $bundle=Join-Path $root 'CutoverBundle'; Assert-SafeInstallPath $bundle
  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  Set-InstallAdminAcl $bundle
  $hostTarget=Join-Path $bundle 'sam-att-host.cjs'; Assert-SafeInstallPath $hostTarget
  Copy-Item -LiteralPath $SignedHostBundle -Destination $hostTarget -Force
  Assert-InstallHash $hostTarget $SignedHostSha256; Set-InstallAdminAcl $hostTarget
  Write-InstallJson (Join-Path $bundle 'cutover-contract.json') ([ordered]@{ sourceCommit=$SourceCommit; hostSha256=$SignedHostSha256; mount='/api/Sam_Att'; manifestPath=(Join-Path $root 'current.json'); releaseRoot=$config.ReleaseRoot; replayDirectory=(Join-Path $root 'GatewayReplay'); restartAuthorized=$false; activationAuthorized=$false; rollback='Restore operator-captured Gateway entry/config and verified previous module manifest in the approved window. Never replace the active legacy adapter.' })
  if ($Mode -eq 'PRODUCTION') {
    $receipt.phase='INSTALLING_STOPPED_SERVICE'; Write-InstallJson $receiptPath $receipt
    & (Join-Path $PSScriptRoot 'install-deployment-agent-service.ps1') -ConfigurationFile $ConfigurationFile -NativeExecutable $NativeExecutable -WorkerBundle $WorkerBundle -NativeSha256 $NativeSha256 -WorkerSha256 $WorkerSha256 -MaintenanceWindowApproved -Confirm:$false
    if (-not $?) { throw 'STOPPED_SERVICE_INSTALL_FAILED' }
    $service=Get-Service -Name SamchukSamAttDeployAgent
    if ($service.Status -ne 'Stopped') { throw 'INSTALLED_SERVICE_NOT_STOPPED' }
    $receipt.phase='SAFE_INSTALL_COMPLETE'
  } else {
    # Actual artifact staging/ACL/receipt recovery only; no claim of SCM or live IIS acceptance.
    foreach ($entry in @(@($NativeExecutable,'SamAttDeploymentAgent.exe',$NativeSha256),@($WorkerBundle,'deployment-agent-worker.cjs',$WorkerSha256))) {
      $target=Join-Path $bundle $entry[1]; Assert-SafeInstallPath $target
      Copy-Item -LiteralPath $entry[0] -Destination $target -Force
      Assert-InstallHash $target $entry[2]; Set-InstallAdminAcl $target
    }
    $receipt.phase='ISOLATED_STAGING_COMPLETE'
  }
  Write-InstallJson $receiptPath $receipt
  Write-Output ('INSTALLATION_PHASE='+$receipt.phase)
  Write-Output 'GATEWAY_RESTARTED=NO'
  Write-Output 'PRODUCTION_DEPLOYED=NO'
  Write-Output 'LIVE_ACCEPTANCE=BLOCKED'
} finally { if ($lock) { $lock.Dispose() } }
