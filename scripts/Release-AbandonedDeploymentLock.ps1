[CmdletBinding(SupportsShouldProcess,ConfirmImpact='High')]
param([Parameter(Mandatory)][string]$DeploymentRoot,[Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedLockToken,[switch]$MaintenanceWindowApproved)
$ErrorActionPreference='Stop'
if(-not $MaintenanceWindowApproved){throw 'Explicit maintenance authorization required.'}
$service=Get-Service SamchukSamAttDeployAgent -ErrorAction Stop
if($service.Status -ne 'Stopped'){throw 'Stop the dedicated Agent through the approved operational procedure first. This script never stops a service.'}
$file=Join-Path $DeploymentRoot 'deployment.lock'
$lock=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
if($lock.token -ne $ExpectedLockToken){throw 'Lock token mismatch.'}
if(Get-Process -Id $lock.pid -ErrorAction SilentlyContinue){throw 'Recorded owner PID is still running; refuse recovery.'}
if(-not(Test-Path -LiteralPath (Join-Path $DeploymentRoot 'recovery-required.json'))){throw 'Recovery journal missing; investigate rather than guessing.'}
if($PSCmdlet.ShouldProcess($file,'Release abandoned lock while preserving recovery-required journal')){Remove-Item -LiteralPath $file}
