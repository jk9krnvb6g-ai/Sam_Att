import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import express from 'express';
import { DeploymentFileLock } from '../deployment/fileLock';
import { createDeploymentAwareSamAttRouter } from '../deployment/gatewayHost';
import { createLiveDeploymentProbes } from '../deployment/liveProbes';
import { signedFrame, verifyFrame } from '../deployment/controlSecurity';
import { createDefaultSeededRepository } from '../repositories/defaultRepositorySeed';
import { computeDirectorySha256Hex } from '../services/deploymentAgentService';

const secret = 'isolated-control-test-secret-'.repeat(2);
function invoke(app: any, method: string, url: string, body?: any) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req: any = { method, url, originalUrl: url, headers: {}, body, query: {}, ip: '127.0.0.1', get() { return undefined; } };
    const res: any = { statusCode: 200, headers: {}, setHeader(k: string,v: any){this.headers[k]=v;}, getHeader(k: string){return this.headers[k];},
      status(code: number){this.statusCode=code;return this;}, json(body: any){resolve({status:this.statusCode,body});return this;}, end(){resolve({status:this.statusCode,body:null});} };
    app.handle(req,res,(err: any) => err ? reject(err) : resolve({status:404,body:null}));
  });
}
test('cross-process lock denies a second owner and persists after the owner process exits', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a96-lock-'));
  try {
    const file=path.join(root,'deployment.lock');
    const module=pathToFileURL(path.resolve('backend/deployment/fileLock.ts')).href;
    const child=()=>spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import { DeploymentFileLock } from ${JSON.stringify(module)}; const lock=new DeploymentFileLock(${JSON.stringify(file)});process.exit(lock.acquire('CHILD')?0:2);`],{windowsHide:true,encoding:'utf8'});
    const lock=new DeploymentFileLock(file);assert.equal(lock.acquire('PARENT'),true);
    assert.equal(child().status,2);lock.release();assert.equal(child().status,0);
    assert.equal(new DeploymentFileLock(file).acquire('AFTER_CRASH'),false);
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).operation,'CHILD');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('real built router swaps atomically, validates artifacts and leaves Procurement and in-flight requests unchanged', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a96-gateway-'));
  try {
    function release(sha: string, label: string) {
      const temp=path.join(root,'compile-'+label);fs.mkdirSync(temp);
      buildSync({stdin:{contents:`exports.createSamAttRouter=()=> (req,res)=> { const reply=()=>res.json({release:${JSON.stringify(label)}}); if(req.url==='/hold')setTimeout(reply,50); else reply(); };`,resolveDir:temp},bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'sam-att-gateway.cjs')});
      const hash=computeDirectorySha256Hex(temp);const dir=path.join(root,sha,hash);fs.mkdirSync(path.dirname(dir),{recursive:true});fs.renameSync(temp,dir);return {commitSha:sha,backendSha256:hash};
    }
    const old=release('a'.repeat(40),'old'), next=release('b'.repeat(40),'new');
    const app=express();let procurementCalls=0;app.get('/api/Procurement/functional',(_req,res)=>res.json({healthy:true,count:++procurementCalls}));
    app.use('/api/Sam_Att',createDeploymentAwareSamAttRouter({repository:createDefaultSeededRepository(),controlSecret:secret,releaseRoot:root,initialCommitSha:old.commitSha}));
    const control=(action:string,payload:any)=>invoke(app,'POST','/api/Sam_Att/deployment/host-control',signedFrame(secret,action,payload));
    assert.equal((await control('ACTIVATE',old)).status,200);
    const pending=invoke(app,'GET','/api/Sam_Att/hold');
    assert.equal((await invoke(app,'GET','/api/Procurement/functional')).body.count,1);
    const activated=await control('ACTIVATE',next);assert.equal(activated.status,200);
    const restarted=express();restarted.use('/api/Sam_Att',createDeploymentAwareSamAttRouter({repository:createDefaultSeededRepository(),controlSecret:secret,releaseRoot:root,initialCommitSha:next.commitSha,initialBackendSha256:next.backendSha256}));
    assert.equal((await invoke(restarted,'GET','/api/Sam_Att/version')).body.release,'new');
    assert.equal((await pending).body.release,'old');
    assert.equal((await invoke(app,'GET','/api/Sam_Att/version')).body.release,'new');
    assert.equal((await invoke(app,'GET','/api/Procurement/functional')).body.count,2);
    assert.equal((await control('ACTIVATE',{...next,backendSha256:'0'.repeat(64)})).status,503);
    assert.equal((await invoke(app,'GET','/api/Sam_Att/version')).body.release,'new');
    const frame=signedFrame(secret,'CAPABILITIES',{});assert.equal((await invoke(app,'POST','/api/Sam_Att/deployment/host-control',frame)).status,200);
    assert.equal((await invoke(app,'POST','/api/Sam_Att/deployment/host-control',frame)).status,401);
    assert.equal((await invoke(app,'POST','/api/Sam_Att/deployment/host-control',{...signedFrame(secret,'ACTIVATE',old),signature:'0'.repeat(64)})).status,401);
    const health=await control('HEALTH',{});assert.equal(health.body.payload.mysqlHealthy,false,'MOCK health must never become REAL health evidence');
    assert.equal((await control('ACTIVATE',old)).status,200);
    assert.equal((await invoke(app,'GET','/api/Sam_Att/version')).body.release,'old');
    assert.equal((await invoke(app,'GET','/api/Procurement/functional')).body.count,3);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('authenticated live-probe contracts bind signatures/nonces and require functional Procurement plus actual frontend bytes', async () => {
  const html='<html><body>probe fixture</body></html>';
  const digest=crypto.createHash('sha256').update(html).digest('hex');
  let badProcurement=false,badSignature=false,badAuth=false;
  const request: typeof fetch = async (input:any,init:any)=>{
    const url=new URL(input);
    assert.equal(init.redirect,'error');
    if(url.port==='3001')return new Response(html,{headers:{'content-type':'text/html'}});
    if(url.pathname.endsWith('/auth/me')){assert.equal(init.headers.authorization,'Bearer session-test');return Response.json({success:!badAuth,user:{role:'ADMIN'}},{status:badAuth?401:200});}
    if(url.pathname.includes('Procurement')){assert.equal(init.headers.authorization,'Bearer procurement-test');return Response.json({healthy:true,service:'Procurement',functional:!badProcurement});}
    const frame=JSON.parse(init.body);verifyFrame(secret,frame,'HEALTH');
    const response=signedFrame(secret,'RESPONSE:HEALTH',{protocol:1,routerHealthy:true,mysqlHealthy:true,repositoryMode:'REAL',activeCommitSha:'a'.repeat(40)},frame.nonce);
    if(badSignature)response.signature='0'.repeat(64);return Response.json(response);
  };
  const probes=createLiveDeploymentProbes({gatewayUrl:'http://localhost:3002',frontendUrl:'https://localhost:3001/Sam_Att/',procurementUrl:'http://localhost:3002/api/Procurement/functional',controlSecret:secret,sessionToken:'session-test',procurementToken:'procurement-test'},request);
  const good=await probes.probe(digest);assert.equal(good.frontendHealthy,true);assert.equal(good.mysqlHealthy,true);assert.equal(good.procurementHealthy,true);
  badProcurement=true;badSignature=true;badAuth=true;
  const fail=await probes.probe('0'.repeat(64));assert.equal(fail.frontendHealthy,false);assert.equal(fail.mysqlHealthy,false);assert.equal(fail.procurementHealthy,false);assert.equal(fail.authHealthy,false);
});


test('staged stable host loads without checkout or Gateway dependencies', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'a96-standalone-host-'));
  try {
    const installed=path.join(root,'sam-att-host.cjs');
    fs.copyFileSync(path.resolve('dist-backend/sam-att-host.cjs'),installed);
    const result=spawnSync(process.execPath,['-e',`const host=require(${JSON.stringify(installed)});if(typeof host.createInstalledSamAttRouter!=='function')process.exit(2);`],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,NODE_PATH:''}});
    assert.equal(result.status,0,result.stderr);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
