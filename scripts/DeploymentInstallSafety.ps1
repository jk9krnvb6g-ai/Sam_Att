#requires -Version 5.1
Set-StrictMode -Version Latest
function Assert-SafeInstallPath([string]$Path) {
  if ($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.StartsWith('\\') -or $Path -match '(^|[\\/])\.\.([\\/]|$)' -or $Path.Substring(2).Contains(':')) { throw 'UNSAFE_INSTALL_PATH' }
  if(@(($Path.Substring(3) -split '[\\/]') | Where-Object { $_ -match '[. ]$' }).Count -gt 0){throw 'UNSAFE_INSTALL_PATH'}
  $cursor = [IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'INSTALL_REPARSE_POINT_REJECTED' }
    }
    $next = Split-Path -Parent $cursor
    if ($next -eq $cursor) { break }; $cursor = $next
  }
}
function Assert-InstallHash([string]$Path,[string]$Hash) {
  Assert-SafeInstallPath $Path
  if ($Hash -notmatch '^[a-fA-F0-9]{64}$' -or -not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Hash) { throw 'INSTALL_ARTIFACT_HASH_MISMATCH' }
}
function Set-InstallAdminAcl([string]$Path) {
  Assert-SafeInstallPath $Path
  $existing=Get-Acl -LiteralPath $Path
  if($existing.AreAccessRulesProtected -and @($existing.Access).Count -eq 2){
    $unexpected=@($existing.Access | Where-Object {
      $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544') -or $_.AccessControlType -ne 'Allow' -or $_.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl
    })
    if($unexpected.Count -eq 0){return}
  }
  $item=Get-Item -LiteralPath $Path -Force
  if ($item.PSIsContainer) { $acl=New-Object Security.AccessControl.DirectorySecurity; $inherit='ContainerInherit,ObjectInherit' }
  else { $acl=New-Object Security.AccessControl.FileSecurity; $inherit='None' }
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($sid in @('S-1-5-18','S-1-5-32-544')) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl',$inherit,'None','Allow'))
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
  $actual=Get-Acl -LiteralPath $Path
  if (-not $actual.AreAccessRulesProtected) { throw 'INSTALL_ACL_NOT_PROTECTED' }
  foreach ($rule in $actual.Access) {
    $sid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -ne 'Allow' -or $sid -notin @('S-1-5-18','S-1-5-32-544')) { throw 'INSTALL_ACL_UNEXPECTED_RULE' }
  }
}
function Write-InstallJson([string]$Path,$Value) {
  Assert-SafeInstallPath $Path
  $tmp=$Path+'.tmp'; Assert-SafeInstallPath $tmp
  $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 12))
  $stream=[IO.File]::Open($tmp,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  Set-InstallAdminAcl $tmp
  if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($tmp,$Path,[NullString]::Value) }
  else { [IO.File]::Move($tmp,$Path) }
}
