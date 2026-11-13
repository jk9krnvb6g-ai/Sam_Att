#requires -Version 5.1
# Fail-closed IIS isolation bootstrap. Never writes Gateway, Procurement or live Sam_Att.
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'FILESERVER'){throw 'FILESERVER_ONLY'}
$parent='C:\inetpub\wwwroot\Deployment_Center'
$root=Join-Path $parent 'Sam_Att'
$www='C:\inetpub\wwwroot'
$webConfig=Join-Path $parent 'web.config'
function Assert-NotReparse([string]$path) {
  if(Test-Path -LiteralPath $path){
    if((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){
      throw "REPARSE_POINT_REJECTED: $path"
    }
  }
}
if(-not (Test-Path -LiteralPath $www -PathType Container)){throw 'WWWROOT_MISSING'}
foreach($path in @($www,$parent,$root,$webConfig)){Assert-NotReparse $path}
if(Test-Path -LiteralPath $webConfig){throw 'EXISTING_WEB_CONFIG: manual review required; will not overwrite'}
if(Test-Path -LiteralPath $root){throw 'EXISTING_DEPLOYMENT_ROOT: manual review required; will not overwrite'}
# Validate IIS site mapping and URL authorization support before any filesystem write.
Import-Module WebAdministration -ErrorAction Stop
$feature=Get-WindowsFeature Web-Url-Auth -ErrorAction Stop
if(-not $feature.Installed){throw 'IIS_URL_AUTHORIZATION_NOT_INSTALLED'}
$sites=@(Get-Website | Where-Object {
  $_.PhysicalPath -and
  [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($_.PhysicalPath)).TrimEnd([char]'\\') -ieq
  [IO.Path]::GetFullPath($www).TrimEnd([char]'\\')
})
if($sites.Count -ne 1){throw 'IIS_SITE_MAPPING_AMBIGUOUS'}
# Prevent accidentally replacing another application's Deployment_Center parent.
if(Test-Path -LiteralPath $parent){
  $other=@(Get-ChildItem -LiteralPath $parent -Force)
  if($other.Count -gt 0){throw 'EXISTING_PARENT_CONTENT: manual review required'}
}
$xml=@'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <security>
      <authorization>
        <clear />
        <add accessType="Deny" users="*" />
      </authorization>
      <requestFiltering>
        <hiddenSegments>
          <add segment="Deployment_Center" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
'@
# Validate well-formed XML before touching the disk.
[xml]$parsed=$xml
if(-not $PSCmdlet.ShouldProcess($parent,'Create IIS-denied Deployment Center root')){return}
$createdParent=$false
try {
  if(-not (Test-Path -LiteralPath $parent)){
    New-Item -ItemType Directory -Path $parent -ErrorAction Stop | Out-Null
    $createdParent=$true
  }
  # CreateNew is atomic and refuses to replace a concurrent web.config.
  $stream=[IO.File]::Open($webConfig,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes($xml)
    $stream.Write($bytes,0,$bytes.Length)
  } finally { $stream.Dispose() }
  New-Item -ItemType Directory -Path $root -ErrorAction Stop | Out-Null
} catch {
  # Fail closed: do not remove the deny rule on partial failure.
  throw
}
Write-Output 'IIS_DENY_CONFIGURATION_WRITTEN=YES'
Write-Output 'HTTP_DENY_PROVEN=NO'
Write-Output 'NTFS_ACL_PROVEN=NO'
Write-Output 'AGENT_INSTALLED=NO'
Write-Output 'GATEWAY_UNCHANGED=YES'
Write-Output 'NEXT=Test effective HTTP denial on every binding before storing artifacts.'
