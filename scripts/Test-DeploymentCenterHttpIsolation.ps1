#requires -Version 5.1
# Read-only live HTTP isolation check. No Gateway, IIS or service mutations.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string[]]$BaseUrls,
  [string]$DeploymentPath = '/Deployment_Center/',
  [int]$TimeoutSeconds = 8
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'FILESERVER') { throw 'FILESERVER_ONLY' }
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 30) { throw 'INVALID_TIMEOUT' }
if ($DeploymentPath -ne '/Deployment_Center/') { throw 'UNAPPROVED_DEPLOYMENT_PATH' }
if ($BaseUrls.Count -eq 0) { throw 'BASE_URL_REQUIRED' }
$paths = @(
  '/Deployment_Center/',
  '/Deployment_Center/web.config',
  '/Deployment_Center/Sam_Att/',
  '/Deployment_Center/Sam_Att/Secrets/',
  '/Deployment_Center/Sam_Att/ServiceHost/',
  '/Deployment_Center/Sam_Att/current.json'
)
$results = [System.Collections.Generic.List[object]]::new()
foreach ($base in $BaseUrls) {
  $uri = $null
  if (-not [Uri]::TryCreate($base,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or
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
    $denied = $code -in @(401,403,404)
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
Write-Output 'IIS_BINDING_COVERAGE=OPERATOR_SUPPLIED_UNVERIFIED'
Write-Output 'NTFS_ACL_PROVEN=NO'
Write-Output 'PRODUCTION_UNCHANGED=YES'
if ($blocked -gt 0) { throw 'HTTP_ISOLATION_PROBE_FAILED' }
Write-Output 'HTTP_DENY_PROBE=PASS_FOR_SUPPLIED_URLS_ONLY'
