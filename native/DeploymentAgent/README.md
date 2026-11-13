# A96 Phase 2 — native service and Gateway host

This extends the existing Deployment Center. It introduces no TCP listener, changes no production port and never restarts the shared Gateway. The previous Node pipe-listener entrypoint is retired.

## Build and test

Windows prerequisites: Node 22+, npm, Git, Windows PowerShell and .NET Framework 4.8 compiler/runtime. `npm ci --ignore-scripts`, then `npm test` performs typecheck, frontend/backend builds, native service compilation and all test files. `npm run test:native` runs the native host test independently.

Outputs:
- `build/agent/SamAttDeploymentAgent.exe`: SCM-compatible ServiceBase executable (`--service protected-config.json`).
- `build/agent/deployment-agent-worker.cjs`: persistent Node worker over inherited anonymous standard streams. It never owns the public pipe.
- `dist-backend/sam-att-gateway.cjs`: mountable release router.
- `dist-backend/sam-att-host.cjs`: stable Gateway wrapper; requires the locked runtime dependencies beside it.
- `build/agent/check-deployment-readiness.cjs`: operator-invoked readiness checker, no deploy/rollback.

The real staging executors install locked production dependencies inside each backend artifact before hashing. A source-only local build is not a complete runtime artifact until that step has completed.

## Native transport

CreateNamedPipeW uses FILE_FLAG_FIRST_PIPE_INSTANCE, an explicit protected DACL and PIPE_REJECT_REMOTE_CLIENTS. The host preserves its first handle for its entire lifetime. Only SYSTEM, the configured dedicated Agent SID and the configured Gateway SID are present in the production DACL. Gateway client identity is checked again by impersonating the connected pipe token before forwarding any frame. No Everyone/Authenticated Users ACL grant is used.

The worker independently enforces HMAC, an operator user-ID allowlist, payload validation and durable nonce replay records. Responses are HMAC-signed and bound to action, request nonce and current timestamp. Clients reject unsigned, tampered, expired or truncated responses. A single persistent worker retains operation lifetime even if its client disconnects.

`--console` with Mode=ISOLATED is only for local tests. This mode cannot run live probes or activate a Gateway. An explicit single AppContainer package SID may be granted in this mode to let the constrained test runner use the pipe; this field and the isolated integrity label are forbidden for SCM/production mode. Production uses a medium pipe integrity label and dedicated Windows service identities.

Native SCM registration/start/stop under the real virtual account is an operational acceptance step. Console-host tests do not claim that acceptance has happened.

## Protected production configuration

The JSON supplied to the installer has these fields (no secrets are committed):

- Mode: PRODUCTION
- NodePath: absolute reviewed Node executable; NodeSha256: its independently recorded SHA256
- WorkerPath / WorkerSha256: supplied worker bundle (installer replaces the path with its protected installed location)
- PipeName: SamchukSamAttDeploymentAgent_v2
- AgentSid: SID from `sc.exe showsid SamchukSamAttDeployAgent`
- GatewaySid: actual dedicated Gateway service identity; distinct from Agent/SYSTEM/Administrators
- DeploymentRoot: C:\ProgramData\SamchukHospital\Deployments\Sam_Att
- FrontendDirectory: C:\inetpub\wwwroot\Sam_Att
- BackendDirectory: C:\ProgramData\SamchukHospital\Deployments\Sam_Att\Backend (Agent-managed backend snapshot; never the Gateway adapter)
- ReleaseRoot: DeploymentRoot\Releases
- NpmCliPath: reviewed absolute npm-cli.js path
- OperatorIds: explicit ADMIN repository user IDs permitted to request deploy/rollback
- IpcSecretFile / ControlSecretFile: separate high-entropy secrets, at least 32 characters
- SessionTokenFile: valid dedicated ADMIN session for `/api/Sam_Att/auth/me`
- ProcurementTokenFile: valid token for the actual functional Procurement probe
- Probes.gatewayUrl: actual local Gateway origin on port 3002 (http or https)
- Probes.frontendUrl: actual HTTPS Sam_Att URL on port 3001
- Probes.procurementUrl: actual functional endpoint on the same Gateway origin/port 3002

Use the operator's secret provisioning system for token rotation. All request redirects are refused and HTTPS certificate validation remains enabled. The functional Procurement response contract is HTTP 200 with `healthy: true`, `service: "Procurement"`, `functional: true`. If the installed Procurement endpoint has another contract, it must be reviewed and explicitly adapted; a generic HTTP 200 is never accepted as functional health.

The Gateway adapter at `C:\\inetpub\\wwwroot\\Central-API-Gateway\\modules\\sam-att\\index.js` is owned by the shared Gateway and must never be a deployment destination. The separate `Backend` directory is provisioned with Gateway read access; the Gateway's live `MODULE_SAM_ATT_PATH` and stable-host activation still require independent owner verification. This installer change alone does not mount or activate a release.\n\nThe installer requires an approved maintenance window, independently supplied executable hashes and FILESERVER identity. It creates a **stopped** virtual-account service, protects the host/config/secrets directories and provisions GatewayReplay separately. It does not start/stop/restart any service, modify firewall settings, change Gateway registration or deploy production content. Do not invoke it as part of unattended build/testing.

## Stable Gateway integration

The existing Gateway owner must mount `createInstalledSamAttRouter` from the stable host module once at `/api/Sam_Att`, with its REAL repository, separate control secret, immutable release root, protected current manifest and writable GatewayReplay directory. Keep this stable host and its locked dependencies outside the backend snapshot directory that the Agent replaces. Catch configuration failure for the Sam_Att mount and keep sibling Procurement routing running.

`createInstalledSamAttRouter` verifies current.json and loads its exact hashed immutable backend directory on startup. It must not be given guessed baseline source metadata. The initial legacy baseline must be independently established before enabling the Agent. A missing/invalid baseline remains BLOCKED.

This integration must use a single Gateway process. Node cluster workers are rejected. Multi-process/load-balanced Gateway activation requires a separate coordinated activation implementation and must not be enabled based on this module alone.

Machine control requests use the existing Gateway port 3002:
- CAPABILITIES proves this isolated activation protocol is actually mounted.
- HEALTH signs REAL database connectivity evidence and active source identity.
- VALIDATE loads a verified immutable candidate without changing routing.
- ACTIVATE verifies SHA256 and the router factory, then changes one Sam_Att router reference. In-flight requests retain their previous router; sibling mounts are untouched. A failed load never publishes a router.

The Agent sets its activation capability only from an authenticated live CAPABILITIES response. No HTTP/browser maintenance checkbox can override it. The frontend now explains that Gateway restarts are not permitted by this workflow.

Initial adoption of the stable mount on an already-running legacy Gateway may require that Gateway owner's approved maintenance procedure. This repository cannot make that integration happen on FILESERVER without touching production; no such change was performed in this task.

## Backup, recovery and deployment gates

Before mutation, the production worker requires a valid current manifest, matching frontend/backend directory hashes, a validated old immutable Gateway candidate and a real temporary restore/copy-and-hash drill. It refuses baseline placeholder creation. Backup archives include code, runtime dependencies, adapter config and previous current.json bytes with integrity checksums.

Actual frontend HTTPS bytes must match the local index.html hash. The ADMIN session endpoint, signed REAL MySQL/router probe and authenticated functional Procurement probe must all pass. Active source SHA is checked after activation and rollback.

A deployment holds an exclusive filesystem lock across processes through backup, activation, verification and automatic rollback. It is never stolen because of elapsed time. A crash leaves the lock. A fsynced recovery journal is written before activation/restore; critical recovery leaves it in place and redeployment is blocked. Successful verified manual rollback clears the journal. Automatic rollback never releases/reacquires the lock between mutation and recovery.

`Release-AbandonedDeploymentLock.ps1` is an explicit maintenance operation: it requires the dedicated Agent to be stopped, the recorded owner PID to be absent, exact lock token match and a recovery journal. It never stops a service and preserves the journal. Do not delete a lock just because its timestamp is old.

`Invoke-A96MaintenanceReadiness.ps1` verifies source branch/SHA/cleanliness, artifact and backup manifest hashes, executable identities, dedicated service identity, authenticated IPC/backup evidence and live probes. It performs no deploy, rollback or restart. Run it only through the authorized FILESERVER acceptance procedure. A production rollback/restore drill and actual SCM/service-account acceptance remain distinct from local tests.
