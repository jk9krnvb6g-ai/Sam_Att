import cluster from 'node:cluster';
import { Router, RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ISamAttRepository } from '../repositories/interfaces';
import { createSamAttRouter } from '../router';
import { AuthService } from '../services/authService';
import { computeDirectorySha256Hex, readAndVerifyDeploymentManifest } from '../services/deploymentAgentService';
import { ReplayWindow, signedFrame, verifyFrame } from './controlSecurity';

/** Mount once at /api/Sam_Att in the existing Gateway. No listen/restart calls. */
export function createDeploymentAwareSamAttRouter(options: {
  repository: ISamAttRepository; controlSecret: string; releaseRoot: string;
  replayDirectory?: string;
  initialCommitSha: string; initialBackendSha256?: string; loadRouter?: (entry: string) => RequestHandler;
}) {
  if (options.controlSecret.length < 32 || !/^[0-9a-f]{40}$/.test(options.initialCommitSha)) throw new Error('GATEWAY_HOST_CONFIGURATION_INVALID');
  if (process.env.NODE_ENV === 'production' && !options.initialBackendSha256) throw new Error('VERIFIED_INITIAL_ARTIFACT_REQUIRED');
  const root = path.resolve(options.releaseRoot);
  if (cluster.isWorker || (process.env.NODE_ENV === 'production' && !options.replayDirectory)) throw new Error('SINGLE_PROCESS_DURABLE_GATEWAY_HOST_REQUIRED');
  const replay = new ReplayWindow(options.replayDirectory || path.join(root, '.control-replay'));
  let current: RequestHandler = createSamAttRouter(options.repository);
  let sha = options.initialCommitSha;
  function loadRelease(commitSha: string, backendSha256: string) {
    if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{64}$/.test(backendSha256)) throw new Error('RELEASE_ID_INVALID');
    const dir = path.join(root, commitSha, backendSha256);
    if (computeDirectorySha256Hex(dir) !== backendSha256) throw new Error('RELEASE_HASH_MISMATCH');
    const entry = path.join(dir, 'sam-att-gateway.cjs');
    const candidate = options.loadRouter ? options.loadRouter(entry) : createRequire(path.join(root, 'gateway-loader.cjs'))(entry).createSamAttRouter(options.repository);
    if (typeof candidate !== 'function') throw new Error('RELEASE_ROUTER_INVALID');
    return candidate;
  }
  if (options.initialBackendSha256) current = loadRelease(sha, options.initialBackendSha256);
  const router = Router();
  router.post('/deployment/host-control', async (req, res) => {
    let frame;
    try {
      frame = verifyFrame(options.controlSecret, req.body, req.body?.action);
      if (!['HEALTH', 'CAPABILITIES', 'ACTIVATE', 'VALIDATE'].includes(frame.action)) throw new Error('CONTROL_ACTION_FORBIDDEN');
      replay.accept(frame);
    } catch { res.status(401).json({ error: 'CONTROL_AUTHENTICATION_FAILED' }); return; }
    try {
      let payload: Record<string, unknown>;
      if (frame.action === 'CAPABILITIES') {
        payload = { isolatedActivation: true, protocol: 1, activeCommitSha: sha };
      } else if (frame.action === 'HEALTH') {
        const health = await options.repository.checkHealth();
        AuthService.assertRealModeSecretConfigured(options.repository.mode);
        payload = { protocol: 1, activeCommitSha: sha, routerHealthy: true,
          mysqlHealthy: options.repository.mode === 'REAL' && health.mode === 'REAL' && health.healthy === true && health.database === 'samchuk_attendance_v2',
          repositoryMode: options.repository.mode };
      } else {
        const { commitSha, backendSha256 } = frame.payload || {};
        const next = loadRelease(commitSha, backendSha256);
        // Publish one reference only after complete load/verification. In-flight
        // requests keep their previous router; sibling Procurement mounts are untouched.
        if (frame.action === 'ACTIVATE') { current = next; sha = commitSha; }
        payload = { activated: frame.action === 'ACTIVATE', validated: true, activeCommitSha: sha };
      }
      res.json(signedFrame(options.controlSecret, `RESPONSE:${frame.action}`, payload, frame.nonce));
    } catch { res.status(503).json(signedFrame(options.controlSecret, `RESPONSE:${frame.action}`, { error: 'GATEWAY_CONTROL_FAILED' }, frame.nonce)); }
  });
  router.use((req, res, next) => current(req, res, next));
  return router;
}

/** Startup from the protected, verified current manifest; never label new code with an old SHA. */
export function createInstalledSamAttRouter(options: {
  repository: ISamAttRepository; controlSecret: string; releaseRoot: string; manifestPath: string; replayDirectory: string;
}) {
  const current = readAndVerifyDeploymentManifest(options.manifestPath);
  if (current.status !== 'VALID' || !current.manifest) throw new Error('VERIFIED_CURRENT_MANIFEST_REQUIRED');
  return createDeploymentAwareSamAttRouter({ ...options, initialCommitSha: current.manifest.commitSha, initialBackendSha256: current.manifest.backendArtifactSha256 });
}
