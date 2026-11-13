// Test-only worker. Bundled into a temporary directory by deploymentWebIpc.test.ts.
// Build/typecheck/MySQL/Procurement hooks are explicit deterministic fixtures.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { LocalStagingDeploymentEngine } from '../../services/deploymentAgentService';
import { DeploymentIpcVerifier } from '../../services/deploymentIpcSecurity';
import { signedFrame } from '../../deployment/controlSecurity';
const c=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--config')+1],'utf8'));
if(c.Mode!=='ISOLATED' || !path.basename(c.DeploymentRoot).startsWith('web-ipc-fixture-'))throw new Error('TEST_ONLY');
const root=c.DeploymentRoot, secret=fs.readFileSync(c.IpcSecretFile,'utf8').trim();
const verifier=new DeploymentIpcVerifier(secret,new Set(c.OperatorIds),path.join(root,'replay'));
const ok=async()=>({ok:true,detail:'explicit isolated executor fixture'});
const engine=new LocalStagingDeploymentEngine({ workspaceRoot:root,frontendProdDir:c.FrontendDirectory,backendProdDir:c.BackendDirectory,
  manifestPath:path.join(root,'current.json'),adapterConfigPath:path.join(c.BackendDirectory,'adapter.json'),backupsDir:path.join(root,'Backups'),stagingDir:path.join(root,'Staging'),
  isolatedBackendActivationSupported:true,backendRequiresGatewayRestart:false,
  hooks:{ fetchGitHubSource:async(sha,dir)=>{fs.writeFileSync(path.join(dir,'sha'),sha);return {ok:true};},
    verifyGitHubSource:async(sha,dir)=>({ok:fs.readFileSync(path.join(dir,'sha'),'utf8')===sha}),
    runDependenciesCheck:ok,runTypecheck:ok,runUnitTests:ok,runIntegrationTests:ok,
    runBuild:async(dir)=>{const fe=path.join(dir,'frontend_dist'),be=path.join(dir,'backend_dist');fs.mkdirSync(fe,{recursive:true});fs.mkdirSync(be,{recursive:true});
      fs.writeFileSync(path.join(fe,'index.html'),'<html>new web IPC fixture</html>');fs.writeFileSync(path.join(be,'sam-att-gateway.cjs'),'module.exports={fixture:true};');
      return {ok:true,detail:'explicit isolated build fixture',frontendBuildDir:fe,backendBuildDir:be};},
    runPostDeployHealthProbe:async()=>({frontendHealthy:true,backendHealthy:true,authHealthy:true,mysqlHealthy:true,routerHealthy:true,procurementHealthy:true,procurementStatusCode:200}),
    activateBackend:async({commitSha})=>{fs.writeFileSync(path.join(root,'fixture-active-sha'),commitSha);},
  }
});
process.stdout.write('WORKER_READY\n');
async function main(){
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  let req:any,payload:any;
  try{ req=verifier.verify(JSON.parse(line));let data:any;
    switch(req.action){case 'PING':data={status:engine.agentStatus,locked:engine.isLocked(),isolatedActivation:true};break;
      case 'PREFLIGHT':data=await engine.getPreDeploymentEvidence(req.payload.targetCommitSha);break;
      case 'DEPLOY':data=await engine.executeApprovedDeployment(req.payload);break;
      case 'ROLLBACK':data=await engine.executeVerifiedRollback(req.payload);break;
      case 'LIST_BACKUPS':data=await engine.listVerifiedBackups();break;}
    payload={ok:true,data};
  }catch(e){payload={ok:false,error:String(e)};}
  process.stdout.write(JSON.stringify(signedFrame(secret,'RESPONSE:'+(req?.action||'REJECTED'),payload,req?.nonce))+'\n');
}

}
main().catch(()=>process.exitCode=1);
