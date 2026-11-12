import fs from 'node:fs';
import path from 'node:path';
import { WindowsNamedPipeDeploymentAgentClient, computeSha256Hex, readAndVerifyDeploymentManifest } from '../backend/services/deploymentAgentService';
import { createLiveDeploymentProbes } from '../backend/deployment/liveProbes';

// Operator-invoked readiness check only. No engine, deploy, rollback or listener.
async function main() {
  const [configPath, backupId] = process.argv.slice(2);
  const c = JSON.parse(fs.readFileSync(configPath,'utf8'));
  const manifest=readAndVerifyDeploymentManifest(path.join(c.DeploymentRoot,'current.json'));
  if(manifest.status!=='VALID'||!manifest.manifest)throw new Error('CURRENT_MANIFEST_NOT_VERIFIED');
  const secret=(file:string)=>fs.readFileSync(file,'utf8').trim();
  const client=new WindowsNamedPipeDeploymentAgentClient({namedPipePath:'\\\\.\\pipe\\'+c.PipeName,ipcSecret:secret(c.IpcSecretFile),timeoutMs:15000});
  const status=await client.probeStatus();
  if(status.locked||status.status!=='READY'||status.isolatedActivation!==true)throw new Error('AGENT_NOT_READY');
  const backups=await client.listVerifiedBackups();
  if(!backups.some(b=>b.backupId===backupId))throw new Error('VERIFIED_BACKUP_NOT_AVAILABLE');
  const live=createLiveDeploymentProbes({...c.Probes,controlSecret:secret(c.ControlSecretFile),sessionToken:secret(c.SessionTokenFile),procurementToken:secret(c.ProcurementTokenFile)});
  const capabilities=await live.control('CAPABILITIES',{});
  const health=await live.probe(computeSha256Hex(fs.readFileSync(path.join(c.FrontendDirectory,'index.html'))));
  if(capabilities.isolatedActivation!==true||health.activeCommitSha!==manifest.manifest.commitSha||
      !health.frontendHealthy||!health.backendHealthy||!health.authHealthy||!health.mysqlHealthy||!health.routerHealthy||!health.procurementHealthy)throw new Error('LIVE_READINESS_NOT_PROVEN');
  if(fs.existsSync(path.join(c.DeploymentRoot,'deployment.lock'))||fs.existsSync(path.join(c.DeploymentRoot,'recovery-required.json')))throw new Error('RECOVERY_OR_OPERATION_IN_PROGRESS');
  console.log(JSON.stringify({ready:true,backupId,activeCommitSha:health.activeCommitSha,procurementHttpStatus:health.procurementStatusCode,deploymentExecuted:false}));
}
main().catch(()=>{console.error('BLOCKED: authenticated readiness checks failed; no deployment or restart was executed');process.exitCode=1;});
