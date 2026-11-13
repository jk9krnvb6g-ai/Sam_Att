import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import express from 'express';
import { createDefaultSeededRepository } from '../repositories/defaultRepositorySeed';
import { createSamAttRouter } from '../router';
import { DeploymentCenterService } from '../services/deploymentCenterService';
import { WindowsNamedPipeDeploymentAgentClient, computeDirectorySha256Hex, readAndVerifyDeploymentManifest, writeVerifiedDeploymentManifest } from '../services/deploymentAgentService';
import { apiAttendanceAdapter } from '../../src/services/apiAttendanceAdapter';
const hash=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
// Exercise the exact frontend adapter calls without adding any TCP listener.
function invoke(app:express.Express,method:string,url:string,headers:any,body:any){return new Promise<{status:number;body:any}>((resolve,reject)=>{
  const req:any={method,url,originalUrl:url,query:{},headers:Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v])),body,ip:'127.0.0.1',get(k:string){return this.headers[k.toLowerCase()];}};
  const res:any={statusCode:200,headers:{},setHeader(k:string,v:any){this.headers[k]=v;},getHeader(k:string){return this.headers[k];},status(n:number){this.statusCode=n;return this;},json(body:any){resolve({status:this.statusCode,body});return this;},end(){resolve({status:this.statusCode,body:null});}};
  (app as any).handle(req,res,(e:any)=>e?reject(e):resolve({status:404,body:null}));
});}
test('frontend API -> ADMIN router -> real native pipe -> worker engine deploy and verified rollback (isolated executor/health fixtures)',{skip:process.platform!=='win32',timeout:60000},async()=>{
  if(!fs.existsSync('build/agent/SamAttDeploymentAgent.exe'))execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/build-native-agent.ps1'],{windowsHide:true});
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'web-ipc-fixture-'));
  const frontend=path.join(root,'frontend'),backend=path.join(root,'backend');
  fs.mkdirSync(frontend);fs.mkdirSync(backend);
  fs.writeFileSync(path.join(frontend,'index.html'),'<html>old web IPC fixture</html>');
  fs.writeFileSync(path.join(backend,'sam-att-gateway.cjs'),'module.exports={old:true};');
  const before='b'.repeat(40),target='a'.repeat(40),manifestPath=path.join(root,'current.json');
  const savedEnv={...process.env};
  Object.assign(process.env,{SAM_ATT_DB_HOST:'isolated-no-network-fixture',SAM_ATT_DB_USER:'fixture',SAM_ATT_DB_PASSWORD:'fixture',SAM_ATT_JWT_SECRET:'isolated-web-ipc-jwt-fixture-'.repeat(3)});
  const base=createDefaultSeededRepository();
  // Explicit repository fixture for the web readiness contract; no real MySQL claim.
  const repo=new Proxy(base,{get(object,key){
    if(key==='mode')return 'REAL';
    if(key==='getDatabaseName')return ()=>'samchuk_attendance_v2';
    if(key==='checkHealth')return async()=>({healthy:true,mode:'REAL',database:'samchuk_attendance_v2',message:'isolated MySQL contract fixture'});
    const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;
  }});
  const admin=(await repo.getUsers()).find(u=>u.role==='ADMIN')!;
  writeVerifiedDeploymentManifest(manifestPath,{schemaVersion:'2.0',deploymentId:'FIXTURE_BASELINE',version:'fixture-old',commitSha:before,branch:'fixture',deployedAt:new Date().toISOString(),approvedBy:{userId:admin.id,username:admin.username,fullName:admin.fullName},frontendArtifactSha256:computeDirectorySha256Hex(frontend),backendArtifactSha256:computeDirectorySha256Hex(backend),backupId:null,healthCheckVerified:true});
  const worker=path.join(root,'worker.cjs');
  buildSync({entryPoints:['backend/__tests__/fixtures/webIpcWorker.ts'],outfile:worker,bundle:true,platform:'node',format:'cjs'});
  const sid=execFileSync('powershell.exe',['-NoProfile','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();
  const packageSid=execFileSync('powershell.exe',['-NoProfile','-Command',"$p=[IO.Pipes.NamedPipeServerStream]::new('WebIpcInspect_'+[guid]::NewGuid().ToString('N'));try{[regex]::Match($p.GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access),'S-1-15-2-[0-9-]+').Value}finally{$p.Dispose()}"],{encoding:'utf8',windowsHide:true}).trim();
  const pipeName='WebIpc_'+crypto.randomBytes(12).toString('hex'),secret='web-ipc-isolated-test-secret-'.repeat(3),secretFile=path.join(root,'secret');fs.writeFileSync(secretFile,secret);
  const configPath=path.join(root,'config.json');fs.writeFileSync(configPath,JSON.stringify({Mode:'ISOLATED',NodePath:process.execPath,NodeSha256:hash(process.execPath),WorkerPath:worker,WorkerSha256:hash(worker),GatewaySid:sid,AgentSid:sid,IsolatedPackageSid:packageSid||undefined,PipeName:pipeName,DeploymentRoot:root,FrontendDirectory:frontend,BackendDirectory:backend,IpcSecretFile:secretFile,OperatorIds:[admin.id]}));
  const host=spawn(path.resolve('build/agent/SamAttDeploymentAgent.exe'),['--console',configPath],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const originalFetch=globalThis.fetch;let output='',errors='';host.stdout!.on('data',b=>output+=b);host.stderr!.on('data',b=>errors+=b);
  try{
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{clearInterval(check);reject(new Error(errors||'HOST timeout'));},15000);const check=setInterval(()=>{if(output.includes('HOST_READY')){clearInterval(check);clearTimeout(timer);resolve();}else if(host.exitCode!==null){clearInterval(check);clearTimeout(timer);reject(new Error(errors));}},20);});
    const agent=new WindowsNamedPipeDeploymentAgentClient({namedPipePath:'\\\\.\\pipe\\'+pipeName,ipcSecret:secret,timeoutMs:15000});
    assert.ok(await agent.getPreDeploymentEvidence(target));
    DeploymentCenterService.resetStateForTests();
    DeploymentCenterService.configurePhase2Environment({agent,manifestPath,historyFilePath:path.join(root,'history.json'),gitHubFetcher:async()=>({ok:true,status:200,data:{sha:target,commit:{message:'isolated branch fixture',committer:{date:new Date().toISOString()}}}})});
    const app=express();app.use('/api/Sam_Att',createSamAttRouter(repo));
    globalThis.fetch=(async(url:any,init:any={})=>{assert.ok(String(url).startsWith('/api/Sam_Att/'),'No external request is permitted in this test');const r=await invoke(app,init.method||'GET',String(url),init.headers||{},init.body?JSON.parse(init.body):undefined);return new Response(JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});}) as typeof fetch;
    for(const username of ['staff_patcharee','dr_sudarat']){
      const login=await invoke(app,'POST','/api/Sam_Att/auth/login',{}, {username,password:username+'_pass'});
      const denied=await invoke(app,'POST','/api/Sam_Att/deployment/approve',{authorization:'Bearer '+login.body.token},{targetCommitSha:target,adminPassword:username+'_pass'});
      assert.equal(denied.status,403);
    }
    const login=await invoke(app,'POST','/api/Sam_Att/auth/login',{}, {username:admin.username,password:admin.username+'_pass'});assert.equal(login.status,200);apiAttendanceAdapter.setAuthToken(login.body.token);
    await apiAttendanceAdapter.checkDeploymentUpdates();
    const preflight=await apiAttendanceAdapter.runDeploymentPreflight();assert.equal(preflight.deploymentReadiness?.readyToDeploy,true,JSON.stringify(preflight.checklist));
    await assert.rejects(apiAttendanceAdapter.approveDeployment({targetCommitSha:target,adminPassword:'incorrect'}));
    apiAttendanceAdapter.setAuthToken(login.body.token);
    const pendingDeploy=apiAttendanceAdapter.approveDeployment({targetCommitSha:target,adminPassword:admin.username+'_pass'});
    // The real progress endpoint stays responsive while a native operation owns the pipe.
    await apiAttendanceAdapter.fetchDeploymentProgress();
    const result=await pendingDeploy;
    assert.equal(result.status,'SUCCESS',JSON.stringify(result));
    assert.equal(readAndVerifyDeploymentManifest(manifestPath).manifest?.commitSha,target);
    assert.match(fs.readFileSync(path.join(frontend,'index.html'),'utf8'),/new web IPC fixture/);
    assert.equal(fs.readFileSync(path.join(root,'fixture-active-sha'),'utf8'),target);
    const backups=await apiAttendanceAdapter.fetchDeploymentBackups();assert.ok(backups.length>0);
    const rollback=await apiAttendanceAdapter.rollbackDeployment({backupId:backups[0].backupId,adminPassword:admin.username+'_pass',confirmRollback:true,reason:'isolated IPC acceptance'});
    assert.equal(rollback.status,'ROLLED_BACK',JSON.stringify(rollback));
    assert.equal(readAndVerifyDeploymentManifest(manifestPath).manifest?.commitSha,before);
    assert.match(fs.readFileSync(path.join(frontend,'index.html'),'utf8'),/old web IPC fixture/);
    assert.equal(fs.readFileSync(path.join(root,'fixture-active-sha'),'utf8'),before);
  }finally{
    for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);
    globalThis.fetch=originalFetch;apiAttendanceAdapter.setAuthToken(null);DeploymentCenterService.resetStateForTests();
    if(host.exitCode===null){host.stdin!.end('\n');await new Promise<void>(resolve=>{const timer=setTimeout(()=>{host.kill();resolve();},5000);host.once('exit',()=>{clearTimeout(timer);resolve();});});}
    fs.rmSync(root,{recursive:true,force:true});
  }
});
