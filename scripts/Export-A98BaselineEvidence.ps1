[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory)][string]$SourceRepository,
  [Parameter(Mandatory)][string]$BackendArtifactDirectory,
  [string]$FrontendDirectory = 'C:\inetpub\wwwroot\Sam_Att',
  [string]$EvidenceRoot = 'C:\Users\Public\A98-Baseline-Evidence'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Assert-PlainDirectory([string]$Value) {
  $item = Get-Item -LiteralPath $Value -ErrorAction Stop
  if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'DIRECTORY_REPARSE_OR_INVALID' }
  foreach ($entry in (Get-ChildItem -LiteralPath $Value -Recurse -Force -ErrorAction Stop)) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'NESTED_REPARSE_POINT_REJECTED' }
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $SourceRepository '.git'))) { throw 'VERIFIABLE_SOURCE_REPOSITORY_REQUIRED' }
$git = (Get-Command git.exe -ErrorAction Stop).Source
$resolved = (& $git -C $SourceRepository rev-parse --verify "$SourceCommit^{commit}" 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $resolved -or $resolved.Trim() -ne $SourceCommit.ToLowerInvariant()) { throw 'SOURCE_COMMIT_NOT_VERIFIED' }
$forbidden = 'C:\inetpub\wwwroot\Central-API-Gateway'
$backend = [IO.Path]::GetFullPath($BackendArtifactDirectory).TrimEnd('\')
if ($backend.StartsWith($forbidden + '\', [StringComparison]::OrdinalIgnoreCase) -or $backend.Equals($forbidden,[StringComparison]::OrdinalIgnoreCase)) { throw 'SHARED_GATEWAY_BACKEND_FORBIDDEN' }
Assert-PlainDirectory $FrontendDirectory
Assert-PlainDirectory $BackendArtifactDirectory
if (-not (Test-Path -LiteralPath (Join-Path $FrontendDirectory 'index.html') -PathType Leaf)) { throw 'FRONTEND_ENTRY_REQUIRED' }
if (-not (Test-Path -LiteralPath (Join-Path $BackendArtifactDirectory 'sam-att-gateway.cjs') -PathType Leaf)) { throw 'BUILT_BACKEND_ARTIFACT_REQUIRED' }
if ($EvidenceRoot.StartsWith('C:\inetpub\wwwroot\',[StringComparison]::OrdinalIgnoreCase) -or $EvidenceRoot.StartsWith('C:\ProgramData\SamchukHospital\Deployments\',[StringComparison]::OrdinalIgnoreCase)) { throw 'EVIDENCE_DESTINATION_MUST_BE_OFF_PRODUCTION' }
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $EvidenceRoot $stamp
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
function Get-Evidence([string]$Directory) {
  $root = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Sort-Object FullName)
  if ($files.Count -eq 0) { throw 'EMPTY_ARTIFACT_DIRECTORY' }
  return @($files | ForEach-Object {
    [pscustomobject]@{ path = $_.FullName.Substring($root.Length + 1).Replace('\','/'); length = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  })
}
$evidence = [ordered]@{
  evidenceOnly = $true
  productionActivationApproved = $false
  manifestCreated = $false
  sourceCommit = $SourceCommit.ToLowerInvariant()
  sourceRepository = [IO.Path]::GetFullPath($SourceRepository)
  frontendPath = [IO.Path]::GetFullPath($FrontendDirectory)
  backendPath = [IO.Path]::GetFullPath($BackendArtifactDirectory)
  collectedAt = (Get-Date).ToString('o')
  frontend = @(Get-Evidence $FrontendDirectory)
  backend = @(Get-Evidence $BackendArtifactDirectory)
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $destination 'evidence.json') -Encoding UTF8
Write-Host "EVIDENCE_ONLY: $destination"
Write-Host 'No current.json, backup, release, service, or Gateway change was performed.'
Write-Host 'Commit existence and artifact hashes do NOT prove this commit produced the installed files.'
