#requires -Version 5.1
# Sam_Att V2: automated one-time installer preflight (fail-closed).
# This stage performs no service, IIS, Gateway or production changes.
[CmdletBinding()]
param(
  [string]$ConfigurationFile,
  [string]$NativeExecutable,
  [string]$WorkerBundle,
  [switch]$MaintenanceWindowApproved
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$root = 'C:\inetpub\wwwroot\Deployment_Center\Sam_Att'
$expected = 'C:\inetpub\wwwroot\Deployment_Center'
$checks = New-Object 'System.Collections.Generic.List[object]'
function Add-Result([string]$Name,[bool]$Ok,[string]$Detail) {
  $checks.Add([pscustomobject]@{Check=$Name;Status=$(if($Ok){'PASS'}else{'BLOCK'});Detail=$Detail})
}
function Assert-File([string]$Name,[string]$Path) {
  $ok = -not [string]::IsNullOrWhiteSpace($Path) -and (Test-Path -LiteralPath $Path -PathType Leaf)
  Add-Result $Name $ok $(if($ok){$Path}else{'Missing or unspecified'})
}
try {
  Add-Result 'Authorized host' ($env:COMPUTERNAME -eq 'FILESERVER') $env:COMPUTERNAME
  Add-Result 'Maintenance authorization' ([bool]$MaintenanceWindowApproved) 'Explicit switch required for subsequent installation'
  Assert-File 'Gateway adapter' 'C:\inetpub\wwwroot\Central-API-Gateway\modules\sam-att\index.js'
  Assert-File 'Procurement adapter' 'C:\inetpub\wwwroot\Central-API-Gateway\modules\procurement\index.js'
  Assert-File 'Sam_Att frontend' 'C:\inetpub\wwwroot\Sam_Att\index.html'
  Assert-File 'Built gateway artifact' (Join-Path $repo 'dist-backend\sam-att-gateway.cjs')
  Assert-File 'Built signed host artifact' (Join-Path $repo 'dist-backend\sam-att-host.cjs')
  Assert-File 'Native service executable' $NativeExecutable
  Assert-File 'Bundled worker' $WorkerBundle
  Assert-File 'Agent configuration' $ConfigurationFile
  if ($ConfigurationFile -and (Test-Path -LiteralPath $ConfigurationFile -PathType Leaf)) {
    $c = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
    Add-Result 'Production config paths' ($c.Mode -eq 'PRODUCTION' -and $c.DeploymentRoot -eq $root -and $c.FrontendDirectory -eq 'C:\inetpub\wwwroot\Sam_Att' -and $c.BackendDirectory -eq (Join-Path $root 'Backend')) 'Expected protected Deployment_Center layout'
    foreach ($field in @('IpcSecretFile','ControlSecretFile','SessionTokenFile','ProcurementTokenFile')) {
      $prop = $c.PSObject.Properties[$field]
      Assert-File "Secret: $field" $(if($prop){[string]$prop.Value}else{''})
    }
  } else { Add-Result 'Production config paths' $false 'Configuration unavailable' }
  $port = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
  Add-Result 'Shared Gateway listening' ($port.Count -gt 0) 'TCP 3002; functional Procurement probe still required'
  Add-Result 'Deployment root provisioned' (Test-Path -LiteralPath $root -PathType Container) $root
  foreach ($dir in @($expected,$root)) {
    if (Test-Path -LiteralPath $dir) {
      $item = Get-Item -LiteralPath $dir -Force
      Add-Result "No reparse point: $dir" (-not [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'No junction/symlink permitted'
    } else { Add-Result "No reparse point: $dir" $false 'Directory absent' }
  }
  # IIS static-file exposure cannot be proven by the mere presence of an IIS module.
  # Do not create an attestation or bypass this gate automatically.
  Add-Result 'Effective IIS URL deny proven' $false 'Requires actual HTTP deny tests and IIS mapping/ACL validation'
  Add-Result 'Signed host integrated with live Gateway' $false 'Requires authenticated CAPABILITIES and HEALTH probes'
  Add-Result 'Verified baseline and restore drill' $false 'Requires signed manifest, immutable backup and successful restore test'
  Add-Result 'Procurement functional regression' $false 'Requires authenticated live functional test before and after cutover'
} catch {
  Add-Result 'Preflight exception' $false $_.Exception.Message
} finally {
  Write-Host "`n===== ONE-TIME INSTALLER PREFLIGHT =====" -ForegroundColor Cyan
  $checks | Format-Table -AutoSize -Wrap
  $blocked = @($checks | Where-Object { $_.Status -eq 'BLOCK' }).Count
  Write-Host "TOTAL=$($checks.Count)"
  Write-Host "BLOCK=$blocked"
  Write-Host 'INSTALL_EXECUTED=NO'
  Write-Host 'GATEWAY_RESTARTED=NO'
  Write-Host 'PRODUCTION_DEPLOYED=NO'
}
if ($blocked -gt 0) { throw 'INSTALLATION_BLOCKED: resolve the reported prerequisites; no production changes made.' }
throw 'INSTALLATION_NOT_IMPLEMENTED: do not claim readiness until end-to-end install and rollback are implemented and proven.'
