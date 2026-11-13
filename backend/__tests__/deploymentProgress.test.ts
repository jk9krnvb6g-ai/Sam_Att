import { DeploymentCenterService } from '../services/deploymentCenterService';
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


test('readiness rejects offline agents and incomplete/duplicated checklists even with a verified commit',()=>{
  const sha='a'.repeat(40);
  const ids=['github_source','dependencies','build','automated_tests','backup','database_config','central_gateway','procurement_health'];
  const checks:any[]=ids.map(id=>({id,status:'PASS',evidence:{commitSha:sha}}));
  const agent:any={isAvailable:true,agentStatus:'READY',isLocked:()=>false};
  const options:any={agent,latestGitHub:{available:true,commitSha:sha}};
  assert.equal(DeploymentCenterService.computeReadinessSummary(checks,options).readyToDeploy,true);
  agent.agentStatus='OFFLINE';assert.equal(DeploymentCenterService.computeReadinessSummary(checks,options).readyToDeploy,false);
  agent.agentStatus='READY';assert.equal(DeploymentCenterService.computeReadinessSummary([],options).readyToDeploy,false);
  assert.equal(DeploymentCenterService.computeReadinessSummary(checks.map(()=>checks[0]),options).readyToDeploy,false);
});

test('a transient Windows snapshot replacement failure preserves the last signed state and never aborts deployment', (context)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-progress-lock-')),file=path.join(root,'status.json');
  try{
    writeAgentSnapshot(file,secret,{locked:true,progress:null});
    const rename=context.mock.method(fs,'renameSync',()=>{throw Object.assign(new Error('Windows reader holds file'),{code:'EBUSY'});});
    assert.equal(writeAgentSnapshot(file,secret,{locked:false,progress:null}),false);
    assert.equal(readAgentSnapshot(file,secret)?.locked,true);
    assert.deepEqual(fs.readdirSync(root),['status.json']);
    rename.mock.restore();
    assert.equal(writeAgentSnapshot(file,secret,{locked:false,progress:null}),true);
    assert.equal(readAgentSnapshot(file,secret)?.locked,false);
  }finally{context.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true});}
});
