import { build } from 'esbuild';
import fs from 'node:fs';
await build({
  entryPoints: ['backend/router.ts'], bundle: true, platform: 'node', target: 'node22',
  format: 'cjs', packages: 'external', outfile: 'dist-backend/sam-att-gateway.cjs',
});
fs.copyFileSync('package.json', 'dist-backend/package.json');
fs.copyFileSync('package-lock.json', 'dist-backend/package-lock.json');
console.log('Built mountable Sam_Att router; shared Gateway activation requires separate host validation.');

await build({ entryPoints: ['scripts/deployment-agent-worker.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', packages: 'external', outfile: 'build/agent/deployment-agent-worker.cjs' });

await build({ entryPoints: ['backend/deployment/gatewayHost.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', packages: 'external', outfile: 'build/agent/sam-att-gateway-host.cjs' });

await build({ entryPoints: ['scripts/check-deployment-readiness.ts'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', packages: 'external', outfile: 'build/agent/check-deployment-readiness.cjs' });

fs.copyFileSync('build/agent/sam-att-gateway-host.cjs', 'dist-backend/sam-att-host.cjs');
