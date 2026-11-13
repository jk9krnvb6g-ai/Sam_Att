# A99 Windows production preflight: read-only, fail closed, no deploy mode.
[CmdletBinding()]
param(
  [string]$GatewayRoot = 'C:\inetpub\wwwroot\Central-API-Gateway',
  [string]$FrontendRoot = 'C:\inetpub\wwwroot\Sam_Att',
  [string]$DeploymentRoot = 'C:\ProgramData\SamchukHospital\Deployments\Sam_Att',
  [string]$GatewayTaskName = 'Hospital-Central-API-Gateway',
  [string]$AgentServiceName = 'SamchukSamAttDeployAgent',
  [string]$ApprovalFile,
  [string]$BaselineEvidenceFile,
  [string]$ProcurementProbeEvidenceFile,
  [string]$RollbackEvidenceFile,
  [ValidateSet('Preflight')][string]$Mode = 'Preflight'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Record([string]$name,[string]$status,[string]$detail) {
  $checks.Add([pscustomobject]@{Check=$name;Status=$status;Detail=$detail})
}
function FileCheck([string]$name,[string]$file) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Record $name 'BLOCKED' 'Missing'; return }
  $item = Get-Item -LiteralPath $file -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Record $name 'BLOCKED' 'Reparse point'; return }
  Record $name 'PRESENT_UNVERIFIED' ('SHA256=' + (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash)
}
function Evidence([string]$name,[string]$file,[string[]]$required) {
  if ([string]::IsNullOrWhiteSpace($file)) { Record $name 'BLOCKED' 'Evidence file not provided'; return }
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { Record $name 'BLOCKED' 'Evidence file missing'; return }
  try {
    $info = Get-Item -LiteralPath $file
    if ($info.Length -gt 1048576 -or $info.Length -eq 0 -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid evidence file' }
    $obj = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    foreach ($key in $required) {
      if (-not ($obj.PSObject.Properties.Name -contains $key)) { throw "Missing field $key" }
    }
    Record $name 'DOCUMENT_ONLY' 'JSON structure present; authenticity and live behavior NOT verified'
  } catch { Record $name 'BLOCKED' 'Evidence invalid or incomplete' }
}
try {
  FileCheck 'Gateway adapter' (Join-Path $GatewayRoot 'modules\sam-att\index.js')
  FileCheck 'Gateway registry' (Join-Path $GatewayRoot 'modules\registry.js')
  FileCheck 'Gateway config' (Join-Path $GatewayRoot 'config\index.js')
  FileCheck 'Frontend entry' (Join-Path $FrontendRoot 'index.html')
  $backend = Join-Path $DeploymentRoot 'Backend'
  $gatewayFull = [IO.Path]::GetFullPath($GatewayRoot).TrimEnd('\')
  $backendFull = [IO.Path]::GetFullPath($backend).TrimEnd('\')
  if ($backendFull.StartsWith($gatewayFull + '\',[StringComparison]::OrdinalIgnoreCase) -or $backendFull.Equals($gatewayFull,[StringComparison]::OrdinalIgnoreCase)) {
    Record 'Backend isolation' 'BLOCKED' 'Backend inside shared Gateway'
  } else { Record 'Backend isolation' 'PATH_SEPARATE' 'Backend outside Gateway root' }
  FileCheck 'Backend built entry' (Join-Path $backend 'sam-att-gateway.cjs')
  FileCheck 'Current manifest' (Join-Path $DeploymentRoot 'current.json')
  foreach ($folder in @('Releases','Backups')) {
    $dir = Join-Path $DeploymentRoot $folder
    Record $folder $(if (Test-Path -LiteralPath $dir -PathType Container) {'PRESENT_UNVERIFIED'} else {'BLOCKED'}) 'Folder presence only'
  }
  $task = Get-ScheduledTask -TaskName $GatewayTaskName -ErrorAction SilentlyContinue
  Record 'Gateway scheduled task' $(if ($task) {'PRESENT_UNVERIFIED'} else {'BLOCKED'}) $(if ($task) {$task.State.ToString()} else {'Task missing'})
  $listener = @(Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -gt 0) {
    $pids = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
    Record 'Gateway TCP 3002' 'LISTENING_UNVERIFIED' ('PID=' + ($pids -join ','))
  } else { Record 'Gateway TCP 3002' 'BLOCKED' 'No listener' }
  $agent = Get-Service -Name $AgentServiceName -ErrorAction SilentlyContinue
  Record 'Deployment agent' $(if ($agent) {'PRESENT_UNVERIFIED'} else {'BLOCKED'}) $(if ($agent) {$agent.Status.ToString()} else {'Service missing'})
  Evidence 'Maintenance approval' $ApprovalFile @('approved','productionActivationApproved','windowStart','windowEnd','approvedBy','changeTicket','releaseCommit')
  Evidence 'Baseline provenance' $BaselineEvidenceFile @('frontend','backend','sourceCommit','evidenceOnly')
  Evidence 'Procurement functional probe' $ProcurementProbeEvidenceFile @('authenticated','functional','statusCode','approvedEndpoint')
  Evidence 'Restore drill' $RollbackEvidenceFile @('verifiedBackup','restoreHashesMatch','rollbackHealthy')
  Record 'Signed Stable Host live validation' 'BLOCKED' 'Requires authenticated host challenge and active manifest verification'
  Record 'Procurement live regression' 'BLOCKED' 'No production endpoint or credentials assumed; operator must run approved non-mutating probe'
} catch {
  Record 'Preflight execution' 'BLOCKED' $_.Exception.GetType().Name
}
$checks | Format-Table -AutoSize -Wrap
Write-Host 'A99: READ ONLY. No deploy, no restart, no service changes, no production writes.'
Write-Host 'A99 GO/NO-GO: NO-GO. Presence or operator-supplied JSON is not production acceptance.' -ForegroundColor Yellow
exit 2
