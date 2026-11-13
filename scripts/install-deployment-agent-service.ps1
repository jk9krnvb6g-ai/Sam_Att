[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param(
  [Parameter(Mandatory)][string]$ConfigurationFile,
  [Parameter(Mandatory)][string]$NativeExecutable,
  [Parameter(Mandatory)][string]$WorkerBundle,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$NativeSha256,
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$WorkerSha256,
  [switch]$MaintenanceWindowApproved
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'DeploymentInstallSafety.ps1')
foreach($inputPath in @($ConfigurationFile,$NativeExecutable,$WorkerBundle)){Assert-SafeInstallPath $inputPath}
if (-not $MaintenanceWindowApproved) { throw 'Maintenance window authorization required. Nothing changed.' }
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'Production installer must be executed by the authorized operator on FILESERVER only.' }
$existingService=Get-Service -Name SamchukSamAttDeployAgent -ErrorAction SilentlyContinue
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$root = 'C:\inetpub\wwwroot\Deployment_Center\Sam_Att'
if ($config.Mode -ne 'PRODUCTION' -or [IO.Path]::GetFullPath($config.DeploymentRoot) -ne $root -or
    $config.FrontendDirectory -ne 'C:\inetpub\wwwroot\Sam_Att' -or
    $config.BackendDirectory -ne (Join-Path $root 'Backend') -or
    $config.ReleaseRoot -ne (Join-Path $root 'Releases')) { throw 'Configuration path/mode policy failed.' }
if($config.PipeName -ne 'SamchukSamAttDeploymentAgent_v2' -or @($config.OperatorIds).Count -eq 0){throw 'PIPE_AND_OPERATOR_ALLOWLIST_REQUIRED'}
if ($config.PSObject.Properties.Name -contains 'IsolatedPackageSid') { throw 'Isolated package identities are forbidden in production.' }
if ($config.GatewaySid -notmatch '^S-1-5-(21|80)-' -or $config.GatewaySid -eq $config.AgentSid) { throw 'Dedicated distinct Gateway and Agent identities required.' }
$expectedSid = (& sc.exe showsid SamchukSamAttDeployAgent | Select-String 'S-1-5-80-[0-9-]+').Matches.Value
if ($LASTEXITCODE -ne 0 -or $config.AgentSid -ne $expectedSid) { throw 'Agent SID must match the dedicated virtual service account.' }
foreach($checkedPath in @($root,$config.NodePath,$config.NpmCliPath,$config.FrontendDirectory,$config.BackendDirectory,$config.ReleaseRoot)){Assert-SafeInstallPath $checkedPath}
if(Test-Path -LiteralPath $root){Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {Assert-SafeInstallPath $_.FullName}}
foreach ($check in @(@($NativeExecutable,$NativeSha256),@($WorkerBundle,$WorkerSha256),@($config.NodePath,$config.NodeSha256))) {
  if ((Get-FileHash -LiteralPath $check[0] -Algorithm SHA256).Hash -ne $check[1]) { throw 'Executable hash verification failed.' }
}
$secrets = @{}
foreach ($field in @('IpcSecretFile','ControlSecretFile','SessionTokenFile','ProcurementTokenFile')) {
  Assert-SafeInstallPath $config.$field
  $source = [IO.Path]::GetFullPath($config.$field)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing $field" }
  $content = [IO.File]::ReadAllText($source).Trim()
  if ($content.Length -lt 32) { throw "Invalid $field" }
  $secrets[$field] = $content
}
if($secrets['IpcSecretFile'] -eq $secrets['ControlSecretFile']){throw 'IPC and Gateway control secrets must differ.'}
if ($existingService) {
  # Never reconfigure an existing service; only recognize a matching stopped installation.
  $installed=Get-CimInstance Win32_Service -Filter "Name='SamchukSamAttDeployAgent'"
  $exe=Join-Path $root 'ServiceHost\SamAttDeploymentAgent.exe'
  $targetConfig=Join-Path $root 'ServiceHost\agent-config.json'
  if ($existingService.Status -ne 'Stopped' -or $installed.StartMode -ne 'Manual' -or
      $installed.StartName -ne 'NT SERVICE\SamchukSamAttDeployAgent' -or
      $installed.PathName -cne "`"$exe`" --service `"$targetConfig`"") { throw 'EXISTING_SERVICE_CONFLICT' }
  Assert-InstallHash $exe $NativeSha256
  Assert-InstallHash (Join-Path $root 'ServiceHost\deployment-agent-worker.cjs') $WorkerSha256
  $config.WorkerPath=Join-Path $root 'ServiceHost\deployment-agent-worker.cjs'
  $config.WorkerSha256=$WorkerSha256.ToLowerInvariant()
  foreach($field in $secrets.Keys){
    $target=Join-Path $root "Secrets\$field.txt"
    Assert-SafeInstallPath $target
    if([IO.File]::ReadAllText($target) -cne $secrets[$field]){throw 'EXISTING_SERVICE_SECRET_CONFLICT'}
    $config.$field=$target
  }
  $saved=Get-Content -LiteralPath $targetConfig -Raw | ConvertFrom-Json
  if(($saved | ConvertTo-Json -Depth 12 -Compress) -cne ($config | ConvertTo-Json -Depth 12 -Compress)){throw 'EXISTING_SERVICE_CONFIG_CONFLICT'}
  Write-Output 'EXISTING_STOPPED_SERVICE_VERIFIED=YES'
  return
}
if (-not $PSCmdlet.ShouldProcess('Sam_Att Agent directories and dedicated stopped service', 'Install verified native host; do not start or restart any service')) { return }
function Set-ProtectedAcl([string]$Path, [bool]$GatewayRead = $false, [bool]$AgentWrite = $true) {
  Assert-SafeInstallPath $Path
  $item = Get-Item -LiteralPath $Path
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point rejected.' }
  if ($item.PSIsContainer) { $acl=[Security.AccessControl.DirectorySecurity]::new(); $inherit='ContainerInherit,ObjectInherit' }
  else { $acl=[Security.AccessControl.FileSecurity]::new(); $inherit='None' }
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($sid in @('S-1-5-18','S-1-5-32-544')) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl',$inherit,'None','Allow')) }
  $rights=if($AgentWrite){'Modify'}else{'ReadAndExecute'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($config.AgentSid),$rights,$inherit,'None','Allow'))
  if($GatewayRead){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($config.GatewaySid),'ReadAndExecute',$inherit,'None','Allow'))}
  Set-Acl -LiteralPath $Path -AclObject $acl
}
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'DEPLOYMENT_ROOT_MISSING: provision the approved IIS-denied directory before installation.' }
Set-ProtectedAcl $root $true
foreach($name in @('ServiceHost','Secrets','Backups','Staging','Releases','Backend','IPCReplay','GatewayReplay')) {
  $dir=Join-Path $root $name; New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-ProtectedAcl $dir ($name -in @('Releases','Backend')) ($name -notin @('ServiceHost','Secrets'))
}
$gatewayReplay=Join-Path $root 'GatewayReplay'
Set-ProtectedAcl $gatewayReplay $true $false
$replayAcl=Get-Acl -LiteralPath $gatewayReplay
$replayAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($config.GatewaySid),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
Set-Acl -LiteralPath $gatewayReplay -AclObject $replayAcl
$exe=Join-Path $root 'ServiceHost\SamAttDeploymentAgent.exe'
Assert-SafeInstallPath $exe
$worker=Join-Path $root 'ServiceHost\deployment-agent-worker.cjs'
Assert-SafeInstallPath $worker
Copy-Item -LiteralPath $NativeExecutable -Destination $exe
Copy-Item -LiteralPath $WorkerBundle -Destination $worker
Assert-InstallHash $exe $NativeSha256; Assert-InstallHash $worker $WorkerSha256
Set-ProtectedAcl $exe $false $false; Set-ProtectedAcl $worker $false $false
$config.WorkerPath=$worker; $config.WorkerSha256=$WorkerSha256.ToLowerInvariant()
foreach($field in $secrets.Keys) {
  $target=Join-Path $root "Secrets\$field.txt"; Assert-SafeInstallPath $target; [IO.File]::WriteAllText($target,$secrets[$field])
  Set-ProtectedAcl $target ($field -in @('IpcSecretFile','ControlSecretFile')) $false
  $config.$field=$target
}
$targetConfig=Join-Path $root 'ServiceHost\agent-config.json'
Assert-SafeInstallPath $targetConfig
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $targetConfig
Set-ProtectedAcl $targetConfig $false $false
New-Service -Name SamchukSamAttDeployAgent -BinaryPathName "`"$exe`" --service `"$targetConfig`"" -StartupType Manual -DisplayName 'Sam_Att Secure Deployment Agent' | Out-Null
& sc.exe config SamchukSamAttDeployAgent obj= 'NT SERVICE\SamchukSamAttDeployAgent'
if($LASTEXITCODE -ne 0){throw 'Service identity configuration failed; service remains stopped.'}
& sc.exe sidtype SamchukSamAttDeployAgent unrestricted
if($LASTEXITCODE -ne 0){throw 'Service SID configuration failed; service remains stopped.'}
Write-Output 'Installed verified native host as a stopped dedicated service. Gateway, Procurement, firewall and production content were not changed. Gateway host mount and recovery acceptance are still required before starting deployment.'
