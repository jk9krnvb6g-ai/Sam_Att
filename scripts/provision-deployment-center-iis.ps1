#requires -Version 5.1
# Prepare an IIS-denied deployment root without modifying the live Gateway.
# Stop if existing content or IIS configuration makes isolation uncertain.
[CmdletBinding(SupportsShouldProcess=$true)]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:COMPUTERNAME -ne 'FILESERVER'){throw 'FILESERVER_ONLY'}
$parent='C:\inetpub\wwwroot\Deployment_Center'
$root=Join-Path $parent 'Sam_Att'
$www='C:\inetpub\wwwroot'
if(-not (Test-Path -LiteralPath $www -PathType Container)){throw 'WWWROOT_MISSING'}
if(Test-Path -LiteralPath $parent){
  $item=Get-Item -LiteralPath $parent -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'PARENT_REPARSE_POINT'}
  $children=@(Get-ChildItem -LiteralPath $parent -Force)
  if($children.Count -gt 0){throw 'DEPLOYMENT_CENTER_ALREADY_EXISTS: refusing to overwrite existing content'}
}
# Explicit deny through IIS URL authorization; requires the feature to be installed
# and effective config validation. Never allow fallback to an exposed directory.
Import-Module WebAdministration -ErrorAction Stop
$feature=Get-WindowsFeature Web-Url-Auth -ErrorAction Stop
if(-not $feature.Installed){throw 'IIS_URL_AUTHORIZATION_NOT_INSTALLED'}
$site=Get-Website | Where-Object { [IO.Path]::GetFullPath($_.PhysicalPath.TrimEnd('\\')) -eq [IO.Path]::GetFullPath($www) }
if(@($site).Count -ne 1){throw 'IIS_SITE_MAPPING_AMBIGUOUS'}
if(-not $PSCmdlet.ShouldProcess($parent,'Create denied Deployment Center root')){return}
New-Item -ItemType Directory -Path $root -Force | Out-Null
$webConfig=Join-Path $parent 'web.config'
$xml=@'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <security>
      <authorization>
        <clear />
        <add accessType="Deny" users="*" />
      </authorization>
    </security>
  </system.webServer>
</configuration>
'@
[IO.File]::WriteAllText($webConfig,$xml,[Text.UTF8Encoding]::new($false))
# No success claim without an actual URL denial probe against every relevant binding.
Write-Output 'IIS_DENY_CONFIGURATION_WRITTEN=YES'
Write-Output 'HTTP_DENY_PROVEN=NO'
Write-Output 'AGENT_INSTALLED=NO'
Write-Output 'GATEWAY_UNCHANGED=YES'
Write-Output 'NEXT=Verify effective IIS authorization and HTTP 403/404 before storing any deployment artifacts.'
