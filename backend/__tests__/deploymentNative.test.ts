import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { WindowsNamedPipeDeploymentAgentClient, signIpcPayload } from '../services/deploymentAgentService';
import { verifyFrame } from '../deployment/controlSecurity';

const secret = 'native-isolated-test-secret-'.repeat(3);
const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test('native Windows host: real kernel DACL, first-instance reservation, authenticated response and replay across restart', { skip: process.platform !== 'win32', timeout: 180000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a96-native-'));
  const binary = path.resolve('build/agent/SamAttDeploymentAgent.exe');
  const worker = path.resolve('build/agent/deployment-agent-worker.cjs');
  assert.ok(fs.existsSync(binary), 'Build native agent before running this test');
  const sid = execFileSync('powershell.exe', ['-NoProfile', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { encoding: 'utf8', windowsHide: true }).trim();
  const packageSid = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "$p=[IO.Pipes.NamedPipeServerStream]::new('A96TokenInspect_'+[guid]::NewGuid().ToString('N'));try {$s=$p.GetAccessControl().GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access);[regex]::Match($s,'S-1-15-2-[0-9-]+').Value} finally {$p.Dispose()}"], { encoding: 'utf8', windowsHide: true }).trim();
  const configPath = path.join(root, 'config.json');
  const pipeName = 'SamAttIsolated_' + crypto.randomBytes(12).toString('hex');
  for (const dir of ['frontend','backend','deploy','releases']) fs.mkdirSync(path.join(root, dir));
  const secretFile = path.join(root, 'secret'); fs.writeFileSync(secretFile, secret);
  const forbiddenNpm=path.join(root,'forbidden-npm-test.cjs');
  fs.writeFileSync(forbiddenNpm, 'throw new Error("IPC-only test must never execute a build or contact a registry");');
  fs.writeFileSync(configPath, JSON.stringify({
    Mode: 'ISOLATED', NodePath: process.execPath, NodeSha256: hash(process.execPath), WorkerPath: worker, WorkerSha256: hash(worker),
    GatewaySid: sid, AgentSid: sid, IsolatedPackageSid: packageSid || undefined, PipeName: pipeName, DeploymentRoot: path.join(root, 'deploy'),
    FrontendDirectory: path.join(root, 'frontend'), BackendDirectory: path.join(root, 'backend'), ReleaseRoot: path.join(root, 'releases'),
    NpmCliPath: forbiddenNpm, OperatorIds: ['test-admin'],
    IpcSecretFile: secretFile, ControlSecretFile: secretFile, SessionTokenFile: secretFile, ProcurementTokenFile: secretFile,
    Probes: { gatewayUrl: 'http://localhost:3002', frontendUrl: 'https://localhost:3001/Sam_Att/', procurementUrl: 'http://localhost:3002/api/Procurement/health' },
  }));
  let host: ReturnType<typeof spawn> | undefined;
  const pipe = '\\\\.\\pipe\\' + pipeName;
  async function start() {
    host = spawn(binary, ['--console', configPath], { stdio: ['pipe','pipe','pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    host.stdout!.on('data', b => stdout += b); host.stderr!.on('data', b => { stderr += b; console.error(String(b)); });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { clearInterval(check); reject(new Error('Native host did not finish its bounded 30-second startup: ' + stderr + ' exit=' + host?.exitCode)); }, 35000);
      const check = setInterval(() => {
        if (stdout.includes('HOST_READY')) { clearInterval(check); clearTimeout(timer); resolve(); }
        else if (host!.exitCode !== null) { clearInterval(check); clearTimeout(timer); reject(new Error(stderr)); }
      }, 25);
    });
    console.log(stdout.trim());
    assert.match(stdout, /explicit DACL; PIPE_REJECT_REMOTE_CLIENTS; FIRST_PIPE_INSTANCE/);
  }
  async function stop() {
    if (!host || host.exitCode !== null) return;
    const current = host; current.stdin!.end('\n');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { current.kill(); reject(new Error('Host failed to stop')); }, 10000);
      current.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  async function raw(frame: any) {
    return new Promise<any>((resolve, reject) => {
      const socket = net.createConnection(pipe); let data = '';
      socket.setTimeout(10000, () => socket.destroy(new Error('test pipe timeout')));
      socket.on('connect', () => socket.write(JSON.stringify(frame) + '\n'));
      socket.on('data', b => { data += b; if (data.includes('\n')) { resolve(JSON.parse(data.split('\n')[0])); socket.end(); } });
      socket.on('error', reject);
    });
  }
  try {
    await start();
    const client = new WindowsNamedPipeDeploymentAgentClient({ namedPipePath: pipe, ipcSecret: secret, timeoutMs: 10000 });
    assert.deepEqual(await client.listVerifiedBackups(), []);
    const timestamp = Date.now(), nonce = crypto.randomBytes(16).toString('hex'), payload = {};
    const frame = { action: 'PING', timestamp, nonce, payload, signature: signIpcPayload(secret, 'PING', timestamp, nonce, payload) };
    const response = await raw(frame);
    assert.equal(verifyFrame(secret, response, 'RESPONSE:PING', nonce).payload.ok, true);
    const duplicate = spawn(binary, ['--console', configPath], { stdio: ['pipe','pipe','pipe'], windowsHide: true });
    const duplicateCode = await new Promise<number|null>(r => duplicate.once('exit', r));
    assert.equal(duplicateCode, 1, 'second native host must not steal the existing pipe');
    await stop(); await start();
    const replay = await raw(frame);
    assert.equal(replay.payload.ok, false);
    assert.match(replay.payload.error, /REPLAY/);
    const tampered = { ...response, payload: { ok: true, data: [] } };
    assert.throws(() => verifyFrame(secret, tampered, 'RESPONSE:PING', nonce), /AUTHENTICATION/);
    await stop();
    const changedConfig=JSON.parse(fs.readFileSync(configPath,'utf8'));
    changedConfig.GatewaySid='S-1-5-19';
    fs.writeFileSync(configPath,JSON.stringify(changedConfig));
    await start();
    await assert.rejects(client.listVerifiedBackups(), /TRUNCATED|ECONNRESET|EPIPE/);
    if(packageSid) {
      await stop(); delete changedConfig.IsolatedPackageSid; changedConfig.GatewaySid=sid;
      fs.writeFileSync(configPath,JSON.stringify(changedConfig)); await start();
      await assert.rejects(client.listVerifiedBackups(), (error: any)=>error.code==='EPERM'||error.code==='EACCES');
    }

  } finally { await stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
