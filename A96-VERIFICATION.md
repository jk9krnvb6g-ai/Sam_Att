# A96 verification and remaining production blockers

This branch is a tested hardening revision, **not a completed or deployable Phase 2 service**.
No FILESERVER, Gateway, Procurement service, production database, firewall or service configuration was changed.

## Verified locally

- Baseline: d09d9f280b9f0f86f5c0d567011da3df271e8b76.
- Original baseline had 34/35 passing tests; Phase 2 orchestration failed because its isolated source/build fixtures did not implement the required source verification and artifact contracts.
- Real TypeScript check, real Vite frontend build, real esbuild mountable backend build and router-export smoke check run locally.
- Unit/integration/security suites exercise isolated filesystem and API fixtures; they are not production deployment, live MySQL, scanner hardware, or FILESERVER acceptance evidence.
- BUG-001/A95 regression scenario remains in the integration suite.
- New IPC tests cover HMAC, operator allowlist, replay including future timestamps, expiry and malformed frames. These are verifier tests, not Windows pipe ACL tests.
- New deployment tests cover real filesystem artifact hashing, missing executors, backup corruption, missing production baseline, rollback health failure, persistent lock ownership, Procurement activation refusal, request flag bypass, final-probe exception recovery and path traversal.
- Lockfile added so npm ci can run; npm audit performed against installed dependencies.

## Changes

Preflight fetches and verifies source in a unique staging directory, runs actual configured executors and hashes their artifact directories. Missing evidence cannot become PASS. Backup does not synthesize production files and verifies saved current.json bytes. Deployment activation policy comes from the host, not request flags. Procurement is probed again before activation. Artifact hashes are checked again before and after copying. Exceptions after activation trigger recovery. Recovery health failure is critical, never success. Active operations do not lose their lock simply because time elapsed.

Real staging executor functions use a fixed repository and branch, detached exact commit, Git object verification, npm ci, typecheck, test suites and both builds. They are supplied for host integration; **they are not wired to a production service or live health probe**. The backend build exports the mountable router and uses external dependencies; runtime dependency provisioning and Gateway adapter compatibility still need host validation.

## BLOCKED before deployment

1. The repository contains no SCM-compatible native Windows Service executable. The previous installer only created folders/ACLs and printed a readiness message. It now refuses installation before modifying the machine.
2. Node's pipe listener does not configure the required explicit pipe DACL or remote-client rejection. The development entrypoint now refuses Windows startup before creating the deployment engine or listener. A secure native host must be implemented and tested with the real Gateway/Agent service SIDs. Response authentication also remains a native-host requirement.
3. There are no verifiable authorized FILESERVER access details in this session. Service account/ACL, real IPC, live MySQL/auth/router/frontend/Procurement probes and a backup restore drill were not tested.
4. Host integration still needs protected credential storage, real health probe contracts, a cross-process durable lock, verified backend dependency provisioning and demonstrably safe isolated activation. Backend changes cannot be approved for live activation based only on file copies.
5. Existing current.json integrity hashes are checksums, not proof of authorship; protected storage/ACL is essential. Old backups without a saved-manifest checksum are rejected when they contain current.json.
6. The existing Deployment Center update feed still targets main. The new staging executor is pinned to the requested fix branch for review. A production host must align its approved source policy before enabling deployment; no merge into main was performed.

Run `scripts/Invoke-A96MaintenanceReadiness.ps1` locally on authorized FILESERVER with independently recorded source/artifact/backup hashes and the actual functional Procurement health URI. It is a single **read-only readiness gate**, intentionally ends BLOCKED in this revision, and contains no deployment or restart operation. It is not a completed deployment script or evidence of rollback readiness.

Live Deployment Center deploy/rollback acceptance testing is **not ready**. Local isolated tests and frontend build review are available. Complete the native host and host integration, rerun all checks, then perform FILESERVER acceptance in an authorized maintenance window before declaring Phase 2 complete.
