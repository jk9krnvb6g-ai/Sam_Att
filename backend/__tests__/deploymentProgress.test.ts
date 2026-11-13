import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAgentSnapshot, writeAgentSnapshot } from '../deployment/agentSnapshot';
import { WindowsNamedPipeDeploymentAgentClient } from '../services/deploymentAgentService';
import { signedFrame } from '../deployment/controlSecurity';
const secret='isolated-progress-snapshot-secret-'.repeat(3);
test('progress uses fresh signed snapshots and rejects tampering, expiry and cross-action data without pipe access',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-progress-')),file=path.join(root,'status.json');
  try{
    const client=new WindowsNamedPipeDeploymentAgentClient({ipcSecret:secret,progressPath:file});
    assert.equal(client.agentStatus,'OFFLINE');assert.equal(client.getActiveProgress(),null);
    const progress:any={deploymentId:'ISOLATED_PROGRESS',status:'BUILDING',currentStepNumber:9,steps:[]};
    writeAgentSnapshot(file,secret,{locked:true,progress});
    assert.equal(client.agentStatus,'BUSY');assert.equal(client.isLocked(),true);assert.equal(client.getActiveProgress()?.currentStepNumber,9);
    const tampered=JSON.parse(fs.readFileSync(file,'utf8'));tampered.payload.locked=false;fs.writeFileSync(file,JSON.stringify(tampered));
    assert.equal(readAgentSnapshot(file,secret),null);assert.equal(client.agentStatus,'OFFLINE');
    const stale=signedFrame(secret,'AGENT_STATUS',{locked:false,progress});stale.timestamp-=61000;fs.writeFileSync(file,JSON.stringify(stale));assert.equal(readAgentSnapshot(file,secret),null);
    fs.writeFileSync(file,JSON.stringify(signedFrame(secret,'RESPONSE:PING',{locked:false,progress})));assert.equal(readAgentSnapshot(file,secret),null);
    writeAgentSnapshot(file,secret,{locked:false,progress});assert.equal(client.agentStatus,'READY');assert.equal(client.isLocked(),false);
    assert.equal(readAgentSnapshot(file,'wrong-snapshot-secret-'.repeat(3)),null);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
