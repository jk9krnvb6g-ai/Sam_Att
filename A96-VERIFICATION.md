# A96 Phase 2 verification

Baseline for this continuation: `0c2f29801abdca4eb8a7d624325426abad3d616b`, branch `fix/a96-deployment-fail-closed`.

The previous code blockers have implementations in this branch:

- Native .NET Framework `ServiceBase` executable and guarded dedicated virtual-account installer. The installer registers a stopped service; it never starts or restarts Gateway/Procurement or opens ports.
- Native pipe with protected, verified kernel DACL, first-instance reservation, remote-client rejection and Windows client-token identity enforcement. A persistent Node worker verifies request HMAC/operator authorization/durable nonce replay records and signs nonce-bound responses.
- Authenticated existing-port health probes: exact frontend HTTPS bytes, real ADMIN session route, signed REAL MySQL/router/source identity evidence and strict functional Procurement contract. TLS validation is enabled; redirects are rejected.
- Exclusive cross-process file lock retained through automatic recovery; crash/recovery journal with fail-closed redeployment and guarded abandoned-lock maintenance operation.
- Stable Sam_Att Gateway host on the existing port: immutable SHA256-verified release loading, validate-without-activation, atomic router-reference activation, in-flight request retention, startup from verified current manifest and rollback activation. No sibling router or listener is modified. Node cluster workers are rejected; a single Gateway process is required.
- Backup source/config/manifest verification, production dependency packaging, real temporary restore/copy/hash drill, validation of the previous Gateway candidate, expected active-source verification after deploy/rollback, and critical recovery journaling.
- Frontend no longer offers approval to restart the shared Gateway; client readiness is based on authenticated responses rather than assuming READY at construction.
- Deployment Center source feed, source executors and recorded target branch now agree on the requested fix branch.

## Actual local verification

`npm ci --ignore-scripts`, `npm test` (typecheck, Vite build, esbuild backend/worker/host/checker builds, .NET native compilation, every test file) and `npm audit --json` were run.

The suite contains 55 tests: 21 attendance unit, 14 original integration scenarios including BUG-001/A95, 16 security/recovery tests, 3 host/lock/probe tests, and 1 multi-scenario native transport integration test. The native test uses the actual compiled executable and real Windows named pipes, checks the actual kernel DACL, first-instance refusal, authenticated client responses, persisted replay refusal across host restart, client-token rejection, and an actual ACL-denied client. It does not install an SCM service or contact production.

The runner's Windows AppContainer requires its exact package SID in isolated-console mode. Production mode explicitly forbids this field and uses distinct dedicated service identities. Tests never grant Everyone or Authenticated Users and never weaken the production DACL.

Gateway tests load real compiled isolated router fixtures, retain an in-flight request across activation, reject corrupted/tampered/replayed requests, restore old routing and exercise sibling Procurement routes throughout. Probe tests are explicit HTTP-contract fixtures; they are not live MySQL/Procurement evidence. Cross-process lock tests launch real child processes and verify that a lock survives owner exit.

## Remaining operational acceptance — BLOCKED by the no-production-access constraint

- No FILESERVER connection, changes, service install/start/stop, Gateway restart, live deploy, live backup or live rollback occurred.
- Actual SCM lifecycle, virtual-service account rights, production directory/secret ACL provisioning, live TLS/auth/MySQL/Procurement checks, and a production recovery drill have not been run.
- The first stable Gateway host mount must be adopted by the real Gateway owner through an approved procedure. An existing legacy Gateway without this host cannot be safely hot-activated by merely copying files. No source or configuration in the running production Gateway was changed.
- A real remote SMB client rejection attempt was not made; the native host sets the documented kernel PIPE_REJECT_REMOTE_CLIENTS flag. Local pipe allow/deny and token enforcement were actually tested.
- Multi-process/load-balanced Gateway topology is unsupported by this implementation and must remain disabled until a coordinated activation mechanism is verified. Token rotation and the actual Procurement functional contract must be supplied by the operator.
- Current manifest and immutable baseline must be independently verified before enabling deployment. No placeholder baseline or fabricated health evidence is created. Integrity SHA checksums do not prove authorship without the protected storage/ACL boundary.

See `native/DeploymentAgent/README.md` for configuration, source/runtime artifact layout, maintenance gates and integration procedure. Live deployment/rollback web acceptance remains **BLOCKED pending these real-host checks**, while local code and isolated acceptance can be reviewed/tested now.
