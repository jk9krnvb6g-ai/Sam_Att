# Issue #2 implementation and isolated acceptance

The installer stages the verified native host, worker and stable Gateway host under the required Deployment Center layout. It never starts the agent, mounts the host, rewrites the legacy adapter, restarts Gateway, or deploys production content. `SAFE_INSTALL_COMPLETE` means a verified **stopped** service and staged cutover package; live acceptance remains `BLOCKED`. `ISOLATED_STAGING_COMPLETE` makes no SCM/IIS claim.

## Operator prerequisites and one-time command

Run only after separate approval on FILESERVER. Supply an elevated Windows PowerShell 5.1 session, Node/npm/Git, IIS URL Authorization, trusted TLS for every HTTPS binding, a dedicated Gateway identity and the dedicated agent virtual account, and a reviewed configuration matching `native/DeploymentAgent/README.md`. BackendDirectory must be `C:\inetpub\wwwroot\Deployment_Center\Sam_Att\Backend`, and ReleaseRoot its `Releases` sibling. Never use the live-loaded legacy adapter directory as an output destination. SourceCommit and SHA256 values must come from an independently reviewed CI artifact; a checksum does not establish authorship.

Provide four operator-owned secret files, at least 32 characters each; IPC and host-control secrets must differ. The source configuration and secret files must already have restricted ACLs. Do not put secrets in command arguments or PR evidence. NodeSha256 pins the operator's Node executable. OperatorIds allowlists deployment administrators. GatewaySid and AgentSid must be distinct dedicated Windows identities.

```powershell
# First use exactly the same parameters with -WhatIf; no writes occur.
.\scripts\install-deployment-center-once.ps1 `
  -ConfigurationFile $reviewedConfig -NativeExecutable $native -WorkerBundle $worker `
  -SignedHostBundle $hostBundle -NativeSha256 $nativeHash -WorkerSha256 $workerHash `
  -SignedHostSha256 $hostHash -SourceCommit $reviewedCommit `
  -BaseUrls $allIisBindingOrigins -OperatorName $operator -ChangeTicket $ticket `
  -MaintenanceWindowApproved
```

The command validates input SHA256, fixed production paths, ancestor reparse points, config and secrets before writing. It provisions an IIS deny-all parent with noninheriting IIS read access only to the parent and web.config; the module root is restricted. It rejects conflicting parent content/configuration, aliases into the deployment tree, incomplete binding coverage and non-401/403 responses for a real random canary. HTTPS certificate validation and redirect rejection remain enabled. The canary is removed in a finally block. No hidden-segment 404 is mistaken for effective denial.

The process lock serializes artifact staging and installation receipts. Receipts contain operator, ticket, source/config identity, phase and explicit live-blocked status, without secrets. Identical inputs rerun and rehash files; a mismatched identity fails closed. A previous stopped service is accepted only with exact native/worker hashes, service identity, command, manual start mode, config and secrets. Running/conflicting services are never modified. Failure leaves the deny rule, staged files and last durable phase for investigation. An SCM registration failure after service creation may require an operator to repair/remove that stopped partial service after review; the installer does not guess ownership.

## Separate Gateway cutover and exact rollback preparation

`CutoverBundle/sam-att-host.cjs` and `cutover-contract.json` are staged, never executed. The stable host exports `createInstalledSamAttRouter`. The Gateway owner must supply its existing repository, protected control secret, verified current manifest, immutable release root and protected replay directory; mount the returned router at `/api/Sam_Att` in the **existing** Gateway. Preserve the existing Procurement mount and middleware. The host opens no port and supports only a single Gateway process. Do not mount the control route without the signed-frame authentication intact.

Before approving that edit, capture the exact Gateway entrypoint/config bytes and SHA256, active legacy adapter/registry binding, service/task command, current verified module manifest and immutable release hashes. Record the actual backup filenames in the maintenance ticket. The active legacy adapter is not overwritten. The repository cannot truthfully prescribe a replacement Gateway entrypoint or automatic restart without those real-host files.

In the approved window, validate the candidate via signed VALIDATE, probe signed CAPABILITIES/HEALTH and active source identity, authenticated ADMIN/MySQL/frontend bytes and the operator-supplied authenticated Procurement functional contract. Only then approve Sam_Att activation. On a failed cutover, restore the captured Gateway entry/config and original registry binding byte-for-byte, verify their recorded hashes, and have the Gateway owner perform any explicitly approved lifecycle action. For a module deployment failure after mounting, the agent restores the verified backup, activates the previous immutable backend and reruns health; failure retains the recovery journal and blocks another deployment.

After a process/power interruption, stop the dedicated agent through the approved operational procedure, preserve the lock/journal and inspect partial files. `Release-AbandonedDeploymentLock.ps1` requires the owner PID absent, stopped agent, exact lock token and journal. It does not stop services or clear the journal. Then start the dedicated agent only after approval and request rollback to the journal's verified backup. Only verified rollback clears the recovery gate. Never clear a journal to make readiness green.

## Actual isolated checks versus live gates

`npm test` runs typecheck, frontend/backend/worker builds, native .NET build and all tests. The new web/IPC test uses the actual frontend API adapter, ADMIN routes and reauthentication, compiled native host, real kernel named pipe, HMAC verifier, worker process, deployment engine, filesystem backup, manifest changes and rollback. It rejects staff/general users and wrong passwords. Its source/build and MySQL/Procurement health executors are **explicit fixtures**, not live evidence. The signed Gateway host tests independently load actual built router fixtures, test replay/tampering and preserve Procurement and in-flight routes. Native UTF-8 handling preserves Thai status messages and operator names across the signature boundary.

`tests/windows/Installer.Acceptance.ps1` executes PowerShell 5.1 with real artifact SHA256 checks, no-write WhatIf, missing approval rejection, restricted NTFS ACLs, idempotent reruns, interruption/resume, conflicting receipt rejection, exclusive lock and ancestor junction/traversal rejection. The separate IIS policy fixtures execute binding coverage, effective deny-rule and site/application/virtual-directory alias rejection without network traffic. Junction creation is required on CI; a local restricted desktop may explicitly report it blocked. The UI polls the ADMIN-only progress route during deploy/rollback. The worker publishes fresh HMAC-authenticated local snapshots, so progress reads do not queue behind the deployment pipe; missing, expired, tampered or cross-action snapshots never imply readiness. Windows workflows upload installer/test artifacts. No test contacts production or installs an SCM service.

Remaining live acceptance, all BLOCKED until an approved maintenance window:

- Real FILESERVER IIS effective configuration and every HTTP/HTTPS binding, alias inventory, canary denial and authenticated denial; exact production NTFS owners/inheritance and dedicated service identities.
- Actual stopped SCM install/recovery, service logon rights, approved dedicated-agent lifecycle and remote SMB pipe rejection. Console native tests are not SCM acceptance.
- Gateway-owner review of real entry/config/registry backup and exact rollback commands, stable host adoption and the single-process topology.
- Independently verified baseline/current manifest, immutable backend, a real backup/restore drill and interrupted-deployment recovery on the target host.
- Confirm the approved database name: existing repository runtime contracts use `samchuk_attendance_v2`, while Issue #2 says `samchuk_attendance`. This change preserves the existing contract and does not migrate or touch either database. Resolve this discrepancy explicitly before activation.
- Trusted live TLS, valid ADMIN session and MySQL checks, authenticated Procurement functional regression before/after module activation/rollback, and an actual browser Deploy Production/rollback acceptance.
- Explicit approval of any production install, cutover, deployment or lifecycle action. CI green alone never grants it.
