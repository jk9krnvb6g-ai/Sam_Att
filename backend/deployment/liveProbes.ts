import crypto from 'node:crypto';
import { signedFrame, verifyFrame } from './controlSecurity';
export type Fetch = typeof fetch;
export function createLiveDeploymentProbes(config: {
  gatewayUrl: string; frontendUrl: string; procurementUrl: string;
  controlSecret: string; sessionToken: string; procurementToken: string;
}, request: Fetch = fetch) {
  const gateway = new URL(config.gatewayUrl), frontend = new URL(config.frontendUrl), procurement = new URL(config.procurementUrl);
  if (!['http:','https:'].includes(gateway.protocol) || gateway.port !== '3002' || frontend.port !== '3001' || frontend.protocol !== 'https:' || procurement.port !== '3002' ||
      gateway.origin !== procurement.origin || !['localhost','127.0.0.1','fileserver'].includes(gateway.hostname.toLowerCase()) ||
      !['localhost','127.0.0.1','fileserver'].includes(frontend.hostname.toLowerCase()) ||
      !config.sessionToken || !config.procurementToken || config.controlSecret.length < 32) throw new Error('LIVE_PROBE_CONFIGURATION_INVALID');
  async function control(action: string, payload: unknown) {
    const frame = signedFrame(config.controlSecret, action, payload);
    const response = await request(new URL('/api/Sam_Att/deployment/host-control', gateway), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(frame), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    const verified = verifyFrame(config.controlSecret, await response.json(), `RESPONSE:${action}`, frame.nonce);
    if (!response.ok || verified.payload.error) throw new Error('LIVE_CONTROL_FAILED');
    return verified.payload;
  }
  return {
    control,
    async probe(expectedFrontendSha256?: string) {
      const result = { frontendHealthy: false, backendHealthy: false, authHealthy: false, mysqlHealthy: false, routerHealthy: false,
        procurementHealthy: false, procurementStatusCode: 0, activeCommitSha: '', errorDetail: '' };
      await Promise.allSettled([
        (async () => { const r = await request(frontend, { redirect: 'error', signal: AbortSignal.timeout(15000) });
          const bytes = Buffer.from(await r.arrayBuffer());
          result.frontendHealthy = r.status === 200 && (r.headers.get('content-type') || '').includes('text/html') && bytes.toString('utf8').includes('<html') &&
            !!expectedFrontendSha256 && crypto.createHash('sha256').update(bytes).digest('hex') === expectedFrontendSha256; })(),
        (async () => { const r = await request(new URL('/api/Sam_Att/auth/me', gateway), { headers: { authorization: `Bearer ${config.sessionToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
          const data = await r.json(); result.authHealthy = r.status === 200 && data.success === true && data.user?.role === 'ADMIN'; })(),
        (async () => { const health = await control('HEALTH', {}); result.backendHealthy = health.protocol === 1;
          result.mysqlHealthy = health.mysqlHealthy === true && health.repositoryMode === 'REAL'; result.routerHealthy = health.routerHealthy === true;
          result.activeCommitSha = health.activeCommitSha; })(),
        (async () => { const r = await request(procurement, { headers: { authorization: `Bearer ${config.procurementToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
          result.procurementStatusCode = r.status; const data = await r.json();
          result.procurementHealthy = r.status === 200 && data.healthy === true && data.service === 'Procurement' && data.functional === true; })(),
      ]);
      return result;
    },
  };
}
