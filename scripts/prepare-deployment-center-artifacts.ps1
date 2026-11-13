#requires -Version 5.1
# Build all Sam_Att deployment artifacts in the existing repository without touching production.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'REPOSITORY_NOT_FOUND' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'NPM_NOT_FOUND' }
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'GIT_NOT_FOUND' }
$dirty = @(& git.exe -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'SOURCE_NOT_CLEAN' }
$commit = (& git.exe -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'INVALID_COMMIT' }
Push-Location $repo
try {
  # Run CLI programs through cmd.exe to avoid Windows PowerShell 5.1 treating
  # harmless native stderr warnings as terminating ErrorRecords.
  function Invoke-Checked([string]$Command,[string]$Label) {
    & cmd.exe /d /s /c $Command
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "${Label}_FAILED: $exitCode" }
  }
  Invoke-Checked 'npm.cmd run typecheck' 'TYPECHECK'
  Invoke-Checked 'npm.cmd run build' 'BUILD'
  $nativeScript = Join-Path $repo 'scripts\\build-native-agent.ps1'
  & cmd.exe /d /s /c "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$nativeScript`""
  $nativeExit = $LASTEXITCODE
  if ($nativeExit -ne 0) { throw "NATIVE_BUILD_FAILED: $nativeExit" }
} finally { Pop-Location }
$paths = @(
  'dist-backend\sam-att-gateway.cjs',
  'dist-backend\sam-att-host.cjs',
  'build\agent\deployment-agent-worker.cjs',
  'build\agent\SamAttDeploymentAgent.exe',
  'build\agent\check-deployment-readiness.cjs',
  'dist\index.html'
)
$artifacts = foreach ($relative in $paths) {
  $file = Join-Path $repo $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "ARTIFACT_MISSING: $relative" }
  $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
  [pscustomobject]@{File=$relative;SHA256=$hash.Hash;Bytes=(Get-Item -LiteralPath $file).Length}
}
Write-Host '===== SAM_ATT DEPLOYMENT BUILD ====='
Write-Host "SOURCE_COMMIT=$commit"
$artifacts | Format-Table -AutoSize
Write-Host 'BUILD_ARTIFACTS=PASS'
Write-Host 'INSTALLATION_EXECUTED=NO'
Write-Host 'PRODUCTION_UNCHANGED=YES'
