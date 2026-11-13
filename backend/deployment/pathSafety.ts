import fs from 'node:fs';
import path from 'node:path';
/** Reject links at every existing ancestor, including a junction used as an artifact root. */
export function assertDeploymentPathHasNoLinks(input: string): void {
  if (!path.isAbsolute(input)) throw new Error('ABSOLUTE_DEPLOYMENT_PATH_REQUIRED');
  let cursor = path.resolve(input);
  for (;;) {
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('DEPLOYMENT_LINK_REJECTED'); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
}

