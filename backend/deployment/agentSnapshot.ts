import fs from 'node:fs';
import path from 'node:path';
import { signedFrame, verifyFrame } from './controlSecurity';
import { assertDeploymentPathHasNoLinks } from './pathSafety';
import type { DeploymentProgressState } from '../../src/types/deploymentCenter';
export interface AgentSnapshot { locked: boolean; progress: DeploymentProgressState | null }
/** Protected local snapshot avoids queuing UI status calls behind a long-running pipe command. */
export function writeAgentSnapshot(file: string, secret: string, snapshot: AgentSnapshot) {
  assertDeploymentPathHasNoLinks(file);
  const temp=path.join(path.dirname(file),`.agent-status-${process.pid}.tmp`);
  assertDeploymentPathHasNoLinks(temp);
  const fd=fs.openSync(temp,'w',0o600);
  try {fs.writeFileSync(fd,JSON.stringify(signedFrame(secret,'AGENT_STATUS',snapshot)));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
export function readAgentSnapshot(file: string | undefined, secret: string): AgentSnapshot | null {
  if(!file)return null;
  try {
    assertDeploymentPathHasNoLinks(file);
    if(fs.statSync(file).size>1024*1024)return null;
    const payload=verifyFrame(secret,JSON.parse(fs.readFileSync(file,'utf8')),'AGENT_STATUS').payload;
    if(typeof payload.locked!=='boolean' || (payload.progress!==null && (typeof payload.progress?.deploymentId!=='string' || !Array.isArray(payload.progress?.steps))))return null;
    return payload;
  }catch{return null;}
}
