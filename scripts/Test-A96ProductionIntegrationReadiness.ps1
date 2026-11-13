[CmdletBinding()]
param(
  [string]$GatewayRoot = 'C:\inetpub\wwwroot\Central-API-Gateway',
  [string]$DeploymentRoot = 'C:\ProgramData\SamchukHospital\Deployments\Sam_Att'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$results = [System.Collections.Generic.List[object]]::new()
function Add-Result([string]$Name,[string]$Status,[string]$Detail) {
  $results.Add([pscustomobject]@{ Check=$Name; Status=$Status; Detail=$Detail })
}
$adapter = Join-Path $GatewayRoot 'modules\sam-att\index.js'
$registry = Join-Path $GatewayRoot 'modules\registry.js'
$config = Join-Path $GatewayRoot 'config\index.js'
$backend = Join-Path $DeploymentRoot 'Backend'
$manifest = Join-Path $DeploymentRoot 'current.json'
$release = Join-Path $DeploymentRoot 'Releases'
if (Test-Path -LiteralPath $adapter -PathType Leaf) {
  Add-Result 'Gateway adapter' 'FOUND' ((Get-FileHash -LiteralPath $adapter -Algorithm SHA256).Hash)
} else { Add-Result 'Gateway adapter' 'BLOCKED' 'Adapter missing' }
if (Test-Path -LiteralPath $registry -PathType Leaf) {
  Add-Result 'Gateway registry' 'FOUND' ((Get-FileHash -LiteralPath $registry -Algorithm SHA256).Hash)
} else { Add-Result 'Gateway registry' 'BLOCKED' 'Registry missing' }
if (Test-Path -LiteralPath $config -PathType Leaf) {
  $source = Get-Content -LiteralPath $config -Raw
  Add-Result 'Sam_Att externalPath configuration' $(if ($source.Contains('MODULE_SAM_ATT_PATH')) {'SOURCE_CONFIRMED'} else {'BLOCKED'}) 'Runtime environment not verified'
} else { Add-Result 'Sam_Att externalPath configuration' 'BLOCKED' 'Gateway config missing' }
if ([IO.Path]::GetFullPath($backend).TrimEnd('\') -eq [IO.Path]::GetFullPath((Join-Path $GatewayRoot 'modules\sam-att')).TrimEnd('\')) {
  Add-Result 'Backend isolation' 'BLOCKED' 'Backend equals Gateway adapter'
} else {
  Add-Result 'Backend isolation' 'PATH_SEPARATE' $backend
}
foreach ($item in @(@('Backend baseline',$backend),@('Immutable releases',$release),@('Current manifest',$manifest))) {
  Add-Result $item[0] $(if (Test-Path -LiteralPath $item[1]) {'PRESENT_UNVERIFIED'} else {'BLOCKED'}) $item[1]
}
$service = Get-Service -Name 'SamchukSamAttDeployAgent' -ErrorAction SilentlyContinue
Add-Result 'Agent service' $(if ($service) {'PRESENT_UNVERIFIED'} else {'NOT_INSTALLED'}) $(if ($service) {$service.Status.ToString()} else {'No service found'})
$gateway = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
Add-Result 'Gateway listener' $(if ($gateway) {'LISTENING_UNVERIFIED'} else {'BLOCKED'}) 'No service restart or HTTP request performed'
Add-Result 'Procurement functional probe' 'PENDING' 'Requires authorized authenticated functional endpoint'
Add-Result 'Live Gateway activation' 'PENDING' 'Requires signed CAPABILITIES and live host validation'
Add-Result 'Restore and rollback drill' 'PENDING' 'Requires approved maintenance window and verified baseline'
$results | Format-Table -AutoSize
Write-Host 'READ-ONLY: no secrets read, no service changes, no deployment, no restore.'
if ($results.Status -contains 'BLOCKED' -or $results.Status -contains 'PENDING' -or $results.Status -contains 'NOT_INSTALLED') {
  Write-Host 'PRODUCTION ACCEPTANCE: BLOCKED (fail closed)' -ForegroundColor Yellow
  exit 2
}
Write-Host 'PRODUCTION ACCEPTANCE: STILL REQUIRES authenticated functional evidence.'
exit 2
