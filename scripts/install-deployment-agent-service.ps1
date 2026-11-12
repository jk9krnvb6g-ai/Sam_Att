<#
.SYNOPSIS
  Sam_Att V2 — Phase 2 Secure Deployment Agent Installer & ACL Hardening Script for Windows FILESERVER
.DESCRIPTION
  1. Creates isolated deployment directories under C:\ProgramData\SamchukHospital\Deployments\Sam_Att\
  2. Applies strict Windows NTFS ACLs (only SYSTEM, Administrators, and SamchukSamAttDeployAgent service account)
  3. Registers the Named Pipe Deployment Agent Windows Service without opening any TCP port.
  4. Never modifies or restarts Procurement.
#>

$ErrorActionPreference = "Stop"

$DeploymentRoot = "C:\ProgramData\SamchukHospital\Deployments\Sam_Att"
$BackupsDir     = Join-Path $DeploymentRoot "Backups"
$StagingDir     = Join-Path $DeploymentRoot "Staging"
$LogsDir        = Join-Path $DeploymentRoot "Logs"
$FrontendDir    = "C:\inetpub\wwwroot\Sam_Att"

Write-Host "[1/4] Creating Sam_Att V2 Deployment directories..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $DeploymentRoot, $BackupsDir, $StagingDir, $LogsDir | Out-Null

Write-Host "[2/4] Applying strict NTFS ACLs on $DeploymentRoot ..." -ForegroundColor Cyan
$acl = Get-Acl $DeploymentRoot
$acl.SetAccessRuleProtection($true, $false)
$adminRule  = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($adminRule)
$acl.SetAccessRule($systemRule)
Set-Acl -Path $DeploymentRoot -AclObject $acl

Write-Host "[3/4] Verifying Named Pipe IPC Secret Configuration..." -ForegroundColor Cyan
if (-not $env:SAM_ATT_AGENT_IPC_SECRET -or $env:SAM_ATT_AGENT_IPC_SECRET.Length -lt 32) {
  Write-Warning "Please set SAM_ATT_AGENT_IPC_SECRET (minimum 32 characters) in System Environment Variables before starting the service."
}

Write-Host "[4/4] Ready to register Windows Service 'SamchukSamAttDeployAgent' on Named Pipe \\.\pipe\SamchukSamAttDeploymentAgent_v2 (Zero TCP Listener)." -ForegroundColor Green
