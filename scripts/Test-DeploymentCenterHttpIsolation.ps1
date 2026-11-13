#requires -Version 5.1
# Read-only live HTTP isolation check. No Gateway, IIS or service mutations.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string[]]$BaseUrls,
  [string]$DeploymentPath = '/Deployment_Center/',
  [int]$TimeoutSeconds = 8,
  [Parameter(Mandatory)][string]$CanaryRelativePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DeploymentInstallSafety.ps1')
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'FILESERVER_ONLY' }
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 30) { throw 'INVALID_TIMEOUT' }
if ($DeploymentPath -ne '/Deployment_Center/') { throw 'UNAPPROVED_DEPLOYMENT_PATH' }
if ($BaseUrls.Count -eq 0) { throw 'BASE_URL_REQUIRED' }
# A real existing canary must be deployed under the denied root by the operator.
# A 404 for an absent file proves nothing; only an explicit 401/403 on the canary is accepted.
if ($CanaryRelativePath -notmatch '^Sam_Att/[A-Za-z0-9_-]{16,80}\.txt$') { throw 'INVALID_CANARY_PATH' }
Import-Module WebAdministration -ErrorAction Stop
$sites=@(Get-Website)
$mapped=@($sites | Where-Object { [Environment]::ExpandEnvironmentVariables($_.PhysicalPath).TrimEnd('\') -ieq 'C:\inetpub\wwwroot' })
if($mapped.Count -ne 1){throw 'IIS_SITE_MAPPING_AMBIGUOUS'}
# Aliases can bypass the parent web.config; require explicit operator review.
foreach($site in $sites){
  $sitePhysical=[IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($site.PhysicalPath)).TrimEnd('\')
  if($sitePhysical -like 'C:\inetpub\wwwroot\Deployment_Center*'){throw 'IIS_DEPLOYMENT_SITE_ALIAS_REJECTED'}
  foreach($application in @(Get-WebApplication -Site $site.Name)){
    $appPhysical=[IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($application.PhysicalPath)).TrimEnd('\')
    if($appPhysical -like 'C:\inetpub\wwwroot\Deployment_Center*'){throw 'IIS_DEPLOYMENT_APPLICATION_ALIAS_REJECTED'}
  }
  foreach($vdir in @(Get-WebVirtualDirectory -Site $site.Name)){
    $physical=[IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($vdir.PhysicalPath)).TrimEnd('\')
    if($physical -like 'C:\inetpub\wwwroot\Deployment_Center*'){throw 'IIS_DEPLOYMENT_ALIAS_REJECTED'}
  }
}
$effective=Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Location ($mapped[0].Name+'/Deployment_Center') -Filter 'system.webServer/security/authorization'
$rules=@($effective.Collection)
if($rules.Count -ne 1 -or $rules[0].accessType -ne 'Deny' -or $rules[0].users -ne '*'){throw 'IIS_EFFECTIVE_DENY_NOT_PROVEN'}
$expectedUrls=@(foreach($binding in @(Get-WebBinding -Name $mapped[0].Name)){
  $parts=$binding.bindingInformation -split ':'
  if($parts.Count -ne 3 -or $binding.protocol -notin @('http','https')){throw 'IIS_BINDING_UNSUPPORTED'}
  $hostName=$parts[2]; if(-not $hostName){$hostName=$parts[0]; if($hostName -in @('*','0.0.0.0','')){$hostName='localhost'}}
  ([Uri]($binding.protocol+'://'+$hostName+':'+$parts[1]+'/')).AbsoluteUri
})
$provided=@($BaseUrls | ForEach-Object {([Uri]$_).AbsoluteUri} | Sort-Object -Unique)
if(@(Compare-Object @($expectedUrls | Sort-Object -Unique) $provided).Count -ne 0){throw 'IIS_BINDING_COVERAGE_INCOMPLETE'}
$canaryFile = Join-Path 'C:\inetpub\wwwroot\Deployment_Center' ($CanaryRelativePath.Replace('/','\'))
Assert-SafeInstallPath $canaryFile
if (-not (Test-Path -LiteralPath $canaryFile -PathType Leaf)) { throw 'CANARY_FILE_MISSING' }
if ((Get-Item -LiteralPath $canaryFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'CANARY_REPARSE_REJECTED' }
$paths = @(
  '/Deployment_Center/',
  '/Deployment_Center/web.config',
  '/Deployment_Center/Sam_Att/',
  '/Deployment_Center/Sam_Att/Secrets/',
  '/Deployment_Center/Sam_Att/ServiceHost/',
  '/Deployment_Center/Sam_Att/current.json',
  ('/Deployment_Center/' + $CanaryRelativePath)
)
$results = [System.Collections.Generic.List[object]]::new()
foreach ($base in $BaseUrls) {
  $uri = $null
  if (-not [Uri]::TryCreate($base,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or
      -not [string]::IsNullOrEmpty($uri.UserInfo) -or
      $uri.AbsolutePath -ne '/' -or
      -not [string]::IsNullOrEmpty($uri.Query) -or
      -not [string]::IsNullOrEmpty($uri.Fragment)) {
    throw "INVALID_BASE_URL: $base"
  }
  foreach ($path in $paths) {
    $target = [Uri]::new($uri,$path)
    $request = [Net.HttpWebRequest][Net.WebRequest]::Create($target)
    $request.Method = 'GET'
    $request.AllowAutoRedirect = $false
    $request.Timeout = $TimeoutSeconds * 1000
    $request.ReadWriteTimeout = $TimeoutSeconds * 1000
    $request.Proxy = $null
    $code = 0
    $detail = ''
    try {
      $response = [Net.HttpWebResponse]$request.GetResponse()
      try { $code = [int]$response.StatusCode } finally { $response.Close() }
    } catch [Net.WebException] {
      $exception = $_.Exception
      if ($exception.Response -is [Net.HttpWebResponse]) {
        $response = [Net.HttpWebResponse]$exception.Response
        try { $code = [int]$response.StatusCode } finally { $response.Close() }
      } else {
        $detail = $exception.Status.ToString()
      }
    }
    # 401/403/404 are acceptable only as a basic denial signal.
    # A 5xx response is not proof of isolation; a 2xx/3xx response is unsafe.
    $isCanary = $path -eq ('/Deployment_Center/' + $CanaryRelativePath)
    $denied = if ($isCanary) { $code -in @(401,403) } else { $code -in @(401,403,404) }
    $results.Add([pscustomobject]@{
      Url=$target.AbsoluteUri
      StatusCode=$code
      Result=$(if ($denied) {'DENIED'} else {'BLOCK'})
      Detail=$detail
    })
  }
}
$results | Format-Table -AutoSize -Wrap
$blocked = @($results | Where-Object Result -ne 'DENIED').Count
Write-Output "HTTP_DENY_PROBE_TOTAL=$($results.Count)"
Write-Output "HTTP_DENY_PROBE_BLOCKED=$blocked"
Write-Output 'CANARY_HTTP_DENIAL=CHECKED_FOR_SUPPLIED_URLS'
Write-Output 'IIS_BINDING_COVERAGE=VERIFIED_SITE_BINDINGS'
Write-Output 'NTFS_ACL_PROVEN=NO'
Write-Output 'PRODUCTION_UNCHANGED=YES'
if ($blocked -gt 0) { throw 'HTTP_ISOLATION_PROBE_FAILED' }
Write-Output 'HTTP_DENY_PROBE=PASS_FOR_SUPPLIED_URLS_ONLY'
