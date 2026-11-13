#requires -Version 5.1
# Deterministic IIS inventory/deny-policy fixtures. No IIS mutation or HTTP request.
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$probe=Join-Path $repo 'scripts/Test-DeploymentCenterHttpIsolation.ps1'
$originalComputerName=$env:COMPUTERNAME
$env:COMPUTERNAME='FILESERVER'
$global:IisFixtureSites=@([pscustomobject]@{Name='fixture-site';PhysicalPath='C:\inetpub\wwwroot'})
$global:IisFixtureApps=@();$global:IisFixtureAliases=@()
$global:IisFixtureRules=@([pscustomobject]@{accessType='Deny';users='*'})
$global:IisFixtureBindings=@([pscustomobject]@{protocol='http';bindingInformation='*:80:'},[pscustomobject]@{protocol='https';bindingInformation='*:3001:fixture.example'})
function Import-Module { [CmdletBinding()]param([string]$Name) if($Name -ne 'WebAdministration'){throw 'UNEXPECTED_IMPORT'} }
function Get-Website {$global:IisFixtureSites}
function Get-WebApplication {param($Site) $global:IisFixtureApps}
function Get-WebVirtualDirectory {param($Site) $global:IisFixtureAliases}
function Get-WebConfiguration {param($PSPath,$Location,$Filter) [pscustomobject]@{Collection=$global:IisFixtureRules}}
function Get-WebBinding {param($Name) $global:IisFixtureBindings}
# No test may depend on or inspect an installed production canary.
function Test-Path {param($LiteralPath,$PathType) return $false}
function Expect-Block([string[]]$Urls,[string]$Message){
  $blocked=$false
  try{ & $probe -BaseUrls $Urls -CanaryRelativePath ('Sam_Att/'+('a'*32)+'.txt') }
  catch{ $blocked=$true;if($_.Exception.Message -notmatch $Message){throw} }
  if(-not $blocked){throw ('EXPECTED_BLOCK: '+$Message)}
}
try{
  $all=@('http://localhost/','https://fixture.example:3001/')
  Expect-Block @('https://fixture.example:3001/') 'IIS_BINDING_COVERAGE_INCOMPLETE'
  Expect-Block $all 'CANARY_FILE_MISSING'
  $global:IisFixtureRules=@([pscustomobject]@{accessType='Allow';users='*'})
  Expect-Block $all 'IIS_EFFECTIVE_DENY_NOT_PROVEN'
  $global:IisFixtureRules=@([pscustomobject]@{accessType='Deny';users='*'})
  $global:IisFixtureAliases=@([pscustomobject]@{PhysicalPath='C:\inetpub\wwwroot\Deployment_Center\Sam_Att\Secrets'})
  Expect-Block $all 'IIS_DEPLOYMENT_ALIAS_REJECTED'
  $global:IisFixtureAliases=@();$global:IisFixtureApps=@([pscustomobject]@{PhysicalPath='C:\inetpub\wwwroot\Deployment_Center\Sam_Att'})
  Expect-Block $all 'IIS_DEPLOYMENT_APPLICATION_ALIAS_REJECTED'
  $global:IisFixtureApps=@();$global:IisFixtureSites+=,[pscustomobject]@{Name='alias-site';PhysicalPath='C:\inetpub\wwwroot\Deployment_Center\Sam_Att'}
  Expect-Block $all 'IIS_DEPLOYMENT_SITE_ALIAS_REJECTED'
  $global:IisFixtureSites=@([pscustomobject]@{Name='fixture-site';PhysicalPath='C:\inetpub\wwwroot'},[pscustomobject]@{Name='duplicate';PhysicalPath='C:\inetpub\wwwroot'})
  Expect-Block $all 'IIS_SITE_MAPPING_AMBIGUOUS'
  Write-Output 'IIS_POLICY_FIXTURES=PASS (inventory and effective-rule validation only; no live IIS/HTTP claim)'
}finally{$env:COMPUTERNAME=$originalComputerName}
