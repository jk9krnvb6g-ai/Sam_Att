# A99 — Production Adoption & Rollback Acceptance (operator runbook)

**Status: NOT APPROVED / NOT DEPLOYED.** Procurement is currently the only live hospital application and must remain functional. This runbook is not permission to change FILESERVER.

## A99.1 Release candidate
Use GitHub Actions A96 Windows validation from PR #1. Verify that the final branch HEAD has a completed successful Windows job, actual test counts and an uploaded A98 release candidate with SHA256SUMS. Download artifacts only from that exact successful run. Independently recompute every SHA256 before use. Artifact ZIP digest is not a signature of source provenance.

## A99.2 Actual production baseline (mandatory)
The A97 inventory found Gateway task running and TCP 3002 listening; Gateway adapter exists; protected backend baseline, Releases, Backups and current.json are **missing**; agent not installed; stable host not found. Do not infer the live Sam_Att backend from `C:\inetpub\wwwroot\Sam_Att` or the adapter path. A named operator must map the real Gateway task's launch arguments, process identity, `MODULE_SAM_ATT_PATH`, module resolution, and actual backend artifacts to a trusted source build/release. A98 evidence exporter hashes real files but does not prove which commit built them. Until provenance and a verified signed manifest exist, fail closed; do not invent an initial manifest.

## A99.3 Approval and pre-change safeguards
Obtain change ticket, named authorizer, scheduled window, explicit acceptance of Gateway interruption risk, Procurement functional probe specification with authenticated non-mutating endpoint, known-good rollback package, complete VM backup/snapshot and verified restore drill. Preserve the existing Gateway task definition, launch environment, registry, adapter and working directory; capture ACLs and identity without logging secrets. Stage all artifacts outside shared Gateway and Procurement directories. Confirm host CAPABILITIES/HEALTH signature protocol in isolation.

The optional `scripts/Assert-A99MaintenanceApproval.ps1` performs **read-only documentary prechecks** only. Its JSON inputs are operator supplied and are **not authenticated**; a PASS cannot authorize production or replace independent review. Do not execute it as a deployment command.

## A99.4 Controlled maintenance sequence (only after written approval)
1. Record authenticated Procurement functional probe and existing Sam_Att login/read-only smoke checks. If either fails, stop before changing anything.
2. Verify release hashes and actual baseline provenance; verify complete backup and restore drill against isolated copy. If missing, stop.
3. Record actual Gateway process identity and validate permissions for protected Backend/Releases/Backups, current.json and replay store. Do not overwrite Gateway adapter.
4. During approved window only, arrange the minimum Gateway integration change needed to mount the verified Stable Host in the **existing process** on port 3002. If integration requires a restart, treat it as an explicitly approved interruption; no extra HTTP listeners.
5. Before enabling deployment, use signed CAPABILITIES, VALIDATE and HEALTH to prove stable host, active verified baseline, and correct commit. Verify Procurement functional endpoint again.
6. Install native Deployment Agent only with signed release evidence, least-privilege service account, verified ACLs and disabled/manual start initially. Never point its backend directory at Gateway modules.
7. Execute a controlled Sam_Att-only canary and restore/rollback exercise only if approved and rollback is immediately available; confirm signed activation and seven health checks, including Procurement, before accepting.
8. If any gate fails, stop deployment, restore verified prior Sam_Att state and Gateway configuration within the approved window. If Procurement fails, invoke the authorized Gateway rollback procedure and escalate; do not continue experimenting.

## A99.5 Acceptance record
Require: exact source SHA and artifact hashes; verified baseline and manifest; signed Gateway host response; agent identity and ACL review; authenticated Procurement before/after checks; backup integrity and restore drill; isolated and approved live rollback results; operator and approver signoff; zero additional TCP ports. Keep separate evidence of source CI PASS and **live** acceptance PASS. No CI run can substitute for the latter.

**Current A99 production acceptance: BLOCKED** because baseline provenance, stable host installation, agent installation and live Procurement/rollback evidence are absent.
