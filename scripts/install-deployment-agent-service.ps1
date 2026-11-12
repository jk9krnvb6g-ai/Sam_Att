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
if (-not $MaintenanceWindowApproved) { throw 'Maintenance window authorization required. Nothing changed.' }
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'Production installer must be executed by the authorized operator on FILESERVER only.' }
if (Get-Service -Name SamchukSamAttDeployAgent -ErrorAction SilentlyContinue) { throw 'Service already exists; refuse to modify or restart it.' }
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
$root = 'C:\ProgramData\SamchukHospital\Deployments\Sam_Att'
if ($config.Mode -ne 'PRODUCTION' -or [IO.Path]::GetFullPath($config.DeploymentRoot) -ne $root -or
    $config.FrontendDirectory -ne 'C:\inetpub\wwwroot\Sam_Att' -or
    $config.BackendDirectory -ne 'C:\inetpub\wwwroot\Central-API-Gateway\modules\Sam_Att' -or
    $config.ReleaseRoot -ne (Join-Path $root 'Releases')) { throw 'Configuration path/mode policy failed.' }
if ($config.PSObject.Properties.Name -contains 'IsolatedPackageSid') { throw 'Isolated package identities are forbidden in production.' }
if ($config.GatewaySid -notmatch '^S-1-5-(21|80)-' -or $config.GatewaySid -eq $config.AgentSid) { throw 'Dedicated distinct Gateway and Agent identities required.' }
$expectedSid = (& sc.exe showsid SamchukSamAttDeployAgent | Select-String 'S-1-5-80-[0-9-]+').Matches.Value
if ($LASTEXITCODE -ne 0 -or $config.AgentSid -ne $expectedSid) { throw 'Agent SID must match the dedicated virtual service account.' }
foreach ($check in @(@($NativeExecutable,$NativeSha256),@($WorkerBundle,$WorkerSha256),@($config.NodePath,$config.NodeSha256))) {
  if ((Get-FileHash -LiteralPath $check[0] -Algorithm SHA256).Hash -ne $check[1]) { throw 'Executable hash verification failed.' }
}
$secrets = @{}
foreach ($field in @('IpcSecretFile','ControlSecretFile','SessionTokenFile','ProcurementTokenFile')) {
  $source = [IO.Path]::GetFullPath($config.$field)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing $field" }
  $content = [IO.File]::ReadAllText($source).Trim()
  if ($content.Length -lt 32) { throw "Invalid $field" }
  $secrets[$field] = $content
}
if($secrets['IpcSecretFile'] -eq $secrets['ControlSecretFile']){throw 'IPC and Gateway control secrets must differ.'}
if (-not $PSCmdlet.ShouldProcess('Sam_Att Agent directories and dedicated stopped service', 'Install verified native host; do not start or restart any service')) { return }
function Set-ProtectedAcl([string]$Path, [bool]$GatewayRead = $false, [bool]$AgentWrite = $true) {
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
New-Item -ItemType Directory -Force -Path $root | Out-Null
Set-ProtectedAcl $root $true
foreach($name in @('ServiceHost','Secrets','Backups','Staging','Releases','IPCReplay','GatewayReplay')) {
  $dir=Join-Path $root $name; New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-ProtectedAcl $dir ($name -eq 'Releases') ($name -notin @('ServiceHost','Secrets'))
}
$gatewayReplay=Join-Path $root 'GatewayReplay'
Set-ProtectedAcl $gatewayReplay $true $false
$replayAcl=Get-Acl -LiteralPath $gatewayReplay
$replayAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($config.GatewaySid),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
Set-Acl -LiteralPath $gatewayReplay -AclObject $replayAcl
$exe=Join-Path $root 'ServiceHost\SamAttDeploymentAgent.exe'
$worker=Join-Path $root 'ServiceHost\deployment-agent-worker.cjs'
Copy-Item -LiteralPath $NativeExecutable -Destination $exe
Copy-Item -LiteralPath $WorkerBundle -Destination $worker
Set-ProtectedAcl $exe $false $false; Set-ProtectedAcl $worker $false $false
$config.WorkerPath=$worker; $config.WorkerSha256=$WorkerSha256.ToLowerInvariant()
foreach($field in $secrets.Keys) {
  $target=Join-Path $root "Secrets\$field.txt"; [IO.File]::WriteAllText($target,$secrets[$field])
  Set-ProtectedAcl $target ($field -in @('IpcSecretFile','ControlSecretFile')) $false
  $config.$field=$target
}
$targetConfig=Join-Path $root 'ServiceHost\agent-config.json'
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $targetConfig
Set-ProtectedAcl $targetConfig $false $false
New-Service -Name SamchukSamAttDeployAgent -BinaryPathName "`"$exe`" --service `"$targetConfig`"" -StartupType Manual -DisplayName 'Sam_Att Secure Deployment Agent' | Out-Null
& sc.exe config SamchukSamAttDeployAgent obj= 'NT SERVICE\SamchukSamAttDeployAgent'
if($LASTEXITCODE -ne 0){throw 'Service identity configuration failed; service remains stopped.'}
& sc.exe sidtype SamchukSamAttDeployAgent unrestricted
if($LASTEXITCODE -ne 0){throw 'Service SID configuration failed; service remains stopped.'}
Write-Output 'Installed verified native host as a stopped dedicated service. Gateway, Procurement, firewall and production content were not changed. Gateway host mount and recovery acceptance are still required before starting deployment.'
