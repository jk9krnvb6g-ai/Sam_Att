# Sam_Att V2 one-time production installer coordinator.
# This script intentionally fails closed until signed-host integration and verified rollback exist.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ConfigurationFile,
  [Parameter(Mandatory)][string]$NativeExecutable,
  [Parameter(Mandatory)][string]$WorkerBundle,
  [switch]$InstallStoppedAgent,
  [switch]$MaintenanceWindowApproved
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'C:\inetpub\wwwroot\Deployment_Center\Sam_Att'
$repo = Split-Path -Parent $PSScriptRoot
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'FILESERVER_ONLY' }
if (-not $MaintenanceWindowApproved) { throw 'EXPLICIT_MAINTENANCE_APPROVAL_REQUIRED' }
if (-not (Test-Path -LiteralPath $ConfigurationFile -PathType Leaf)) { throw 'CONFIG_MISSING' }
$config = Get-Content -LiteralPath $ConfigurationFile -Raw | ConvertFrom-Json
if ($config.Mode -ne 'PRODUCTION' -or $config.DeploymentRoot -ne $root) { throw 'PRODUCTION_ROOT_MISMATCH' }
if (-not (Test-Path -LiteralPath $NativeExecutable -PathType Leaf)) { throw 'NATIVE_AGENT_MISSING' }
if (-not (Test-Path -LiteralPath $WorkerBundle -PathType Leaf)) { throw 'WORKER_BUNDLE_MISSING' }
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'PROTECTED_DEPLOYMENT_ROOT_NOT_PROVISIONED' }
$ancestors = @('C:\inetpub\wwwroot\Deployment_Center',$root)
foreach ($p in $ancestors) {
  $item = Get-Item -LiteralPath $p
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "REPARSE_POINT_DENIED: $p" }
}
# A path under wwwroot is potentially web-accessible. Do not infer safety from Intranet or ACL alone.
# Require an independently reviewed IIS isolation attestation, not a self-created marker.
throw 'IIS_ISOLATION_AND_SIGNED_HOST_ROLLBACK_PROOF_REQUIRED: Installation blocked until IIS effective configuration, verified baseline, signed host and restore drill are proven. Procurement must remain online.'
# After prerequisites are implemented and independently verified, integrate the existing
# scripts/install-deployment-agent-service.ps1 with SHA256-pinned artifacts.
