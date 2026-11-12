param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\build\agent'))
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$target = Join-Path $OutputDirectory 'SamAttDeploymentAgent.exe'
& $compiler /nologo /target:exe /optimize+ /r:System.ServiceProcess.dll /r:System.Web.Extensions.dll "/out:$target" (Join-Path $PSScriptRoot '..\native\DeploymentAgent\DeploymentAgentService.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native service compilation failed' }
$sha=[Security.Cryptography.SHA256]::Create()
$stream=[IO.File]::OpenRead($target)
try { [pscustomobject]@{Path=$target;Algorithm='SHA256';Hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')} }
finally {$stream.Dispose();$sha.Dispose()}
