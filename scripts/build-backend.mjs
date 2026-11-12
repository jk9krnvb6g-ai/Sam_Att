import { build } from 'esbuild';
import fs from 'node:fs';
await build({
  entryPoints: ['backend/router.ts'], bundle: true, platform: 'node', target: 'node22',
  format: 'cjs', packages: 'external', outfile: 'dist-backend/sam-att-gateway.cjs',
});
fs.copyFileSync('package.json', 'dist-backend/package.json');
fs.copyFileSync('package-lock.json', 'dist-backend/package-lock.json');
console.log('Built mountable Sam_Att router; shared Gateway activation requires separate host validation.');
