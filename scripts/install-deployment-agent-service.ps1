<#
This revision deliberately refuses installation before changing the machine.
A Node script cannot be registered directly as an SCM-compatible Windows Service.
The production host must supply and verify all of:
- SCM-compatible executable running under a dedicated least-privilege account;
- explicit named-pipe DACL for the Gateway and Agent service identities;
- rejection of remote pipe clients, request/response authentication;
- protected secret storage and deployment directory ACLs;
- real staging executors, health probes, cross-process lock and recovery drill.
#>
$ErrorActionPreference = 'Stop'
throw 'BLOCKED: secure native service host is not implemented. No directories, ACLs or services were changed.'
