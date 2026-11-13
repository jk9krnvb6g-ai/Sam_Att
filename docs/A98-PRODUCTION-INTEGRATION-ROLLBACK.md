# A98 — Production Integration / Baseline / Rollback Acceptance

## Current evidence (FILESERVER A97, 2026-11-13)

- Existing Gateway scheduled task running, port 3002 listening (observed PID 9648; not a stable identity).
- Gateway adapter and registry exist; **presence of stage/activate/rollback strings is not proof of deployment host protocol**.
- Existing Sam_Att frontend exists at `C:\inetpub\wwwroot\Sam_Att`.
- `C:\ProgramData\SamchukHospital\Deployments\Sam_Att\Backend`, `Releases`, `Backups`, `current.json` are absent.
- Native deployment agent is not installed; stable host artifact not found.
- Procurement is live and must remain available. **No Gateway restart, mount modification, or agent start is authorized by this document.**

## 1. Integration contract (offline implementation vs live adoption)

The source module `backend/deployment/gatewayHost.ts` exports `createInstalledSamAttRouter`. A Gateway owner must explicitly mount its returned Express router **once** at `/api/Sam_Att` in the existing Gateway process, after inspecting the actual Gateway registry, runtime `MODULE_SAM_ATT_PATH`, repository and authentication wiring. It must not create another TCP listener or replace `modules/sam-att/index.js` with build artifacts.

The built `dist-backend/sam-att-host.cjs` existing on GitHub CI is **not evidence that the live Gateway has loaded it**. The host requires an existing verified `current.json`, immutable release directory keyed by commit SHA and backend directory hash, durable replay directory, dedicated control secret, and a real repository. It fails closed without these. **First-time adoption can require a planned Gateway restart**, and must have Procurement functional probes before/after plus approved rollback.

Production must not use the disabled `svc_sam_gateway` identity as if it were the actual Gateway principal. Validate actual process identity and ACLs before adoption. Do not expose secrets in audit logs.

## 2. Baseline provenance: no invented commit

`scripts/Export-A98BaselineEvidence.ps1` is an offline **evidence exporter only**. It requires a Git-verified commit and an existing built `sam-att-gateway.cjs` artifact in a backend directory outside the shared Gateway. It hashes every file into an evidence JSON outside production. A commit existing in Git is **not sufficient** to prove that the running frontend/backend were built from it: obtain a trusted release record or reproducible artifact-to-build comparison and independent operator approval.

Do not create `current.json` or an immutable release from guessed commit metadata. Never seed a new empty backend folder and label it the current production baseline. First reconcile the running backend's actual module path and build provenance. Until that is done, `VERIFIED_CURRENT_MANIFEST_REQUIRED` is expected.

## 3. Backup and rollback contract

The deployment engine in `backend/services/deploymentAgentService.ts` requires an authenticated, verified current baseline for production backup preflight. The backup contains frontend, isolated backend, adapter configuration if present, and a copy of the prior manifest, with integrity verification. The deployment agent must validate the previous immutable release via signed `VALIDATE` before any deployment.

Deployment must preserve the old active router until staged artifacts are verified; the signed `ACTIVATE` call swaps only Sam_Att. After activation, all seven health checks must pass, including an **authenticated functional Procurement endpoint**, real MySQL, real authentication, frontend bytes and active commit. If post-deploy health fails, rollback restores verified frontend/backend/manifest and reactivates the prior commit; if rollback fails, stop and escalate as critical. Do not touch Procurement files, MySQL data or Gateway process.

A GitHub test using mocked Procurement responses proves isolation logic only, **not live Procurement health**.

## 4. Acceptance gates

1. GitHub Actions Windows job on final commit: typecheck, frontend/backend builds, native agent build, all tests and artifact hashes **PASS with actual run evidence**.
2. Baseline provenance independently established; immutable backend release hash, `current.json` signature and deployed frontend/backend hashes match.
3. Live Gateway mount verified through signed `CAPABILITIES`, `VALIDATE` and `HEALTH`; actual Gateway process identity and replay ACL verified.
4. Procurement functional probe 200 with expected authenticated JSON before and after adoption, and after rollback.
5. Restore drill validates file hashes; isolated rollback test passes; approved maintenance-window live rollback exercise completes with verified previous commit.
6. No additional TCP ports; frontend 3001, shared Gateway 3002; Procurement remains functional throughout.

**Current acceptance: BLOCKED** until all gates are evidenced. A97 inventory is not a substitute for any gate.
