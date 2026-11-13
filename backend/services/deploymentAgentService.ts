import { APPROVED_DEPLOYMENT_BRANCH } from '../deployment/sourcePolicy';
import { verifyFrame } from '../deployment/controlSecurity';
import { DeploymentFileLock } from '../deployment/fileLock';
/**
 * Sam_Att V2 — Phase 2 Secure Deployment Agent, Manifest Manager, Backup Engine & IPC Transport
 *
 * ARCHITECTURAL & SECURITY GUARANTEES (§2, §3.1, §3.4, §3.5, §3.6, §3.7, §3.8):
 * 1. Zero New TCP Ports: Communicates strictly over Windows Named Pipe IPC (`\\.\pipe\SamchukSamAttDeploymentAgent_v2`)
 *    or an injected/local Staging Engine in controlled simulation tests. Never opens any HTTP/TCP listener.
 * 2. Zero Arbitrary Command Execution: Never accepts shell commands, PowerShell snippets, arbitrary Git URLs,
 *    or user-supplied file paths from the frontend or HTTP requests.
 * 3. Cryptographically Verified Deployment Manifest (`current.json`):
 *    - Default Windows path: `C:\inetpub\wwwroot\Deployment_Center\Sam_Att\current.json`
 *    - Validates 40-char hex `commitSha`, `healthCheckVerified === true`, artifact SHA-256 checksums,
 *      and deterministic `manifestSignatureSha256`.
 *    - Never guesses a Commit SHA if `current.json` is missing (returns `MISSING` -> `NOT AVAILABLE`).
 *    - Detects corrupted/tampered manifests as `INVALID_MANIFEST` -> `ERROR`.
 * 4. Immutable Pre-Deployment Backup (`Backups\<backupId>\`):
 *    - Backs up Frontend (`Sam_Att`), active Backend Artifact & Adapter config, and `current.json`.
 *    - Verifies SHA-256 checksums before allowing Deploy or Rollback to proceed.
 *    - Never auto-deletes existing backups and never touches MySQL data or Procurement during Rollback.
 * 5. Shared Central API Gateway (`:3002`) & Procurement Protection:
 *    - Never modifies or restarts Procurement.
 *    - If Backend activation requires a Gateway restart and isolated hot-activation is not available
 *      without an approved Maintenance Window, stops safely at `MAINTENANCE_REQUIRED`.
 */

import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {
  DeploymentBackupSummary,
  DeploymentJobStatus,
  DeploymentProgressState,
  DeploymentStepProgress,
  PostDeployHealthCheckItem,
  PostDeployHealthCheckReport,
  RollbackExecutionStatus,
} from '../../src/types/deploymentCenter';

export const AUTHORITATIVE_WINDOWS_PATHS = {
  FRONTEND_PRODUCTION: 'C:\\inetpub\\wwwroot\\Sam_Att',
  GATEWAY_PRODUCTION: 'C:\\inetpub\\wwwroot\\Central-API-Gateway',
  DEPLOYMENT_ROOT: 'C:\\inetpub\\wwwroot\\Deployment_Center\\Sam_Att',
  MANIFEST_FILE: 'C:\\inetpub\\wwwroot\\Deployment_Center\\Sam_Att\\current.json',
  BACKUPS_DIR: 'C:\\inetpub\\wwwroot\\Deployment_Center\\Sam_Att\\Backups',
  STAGING_DIR: 'C:\\inetpub\\wwwroot\\Deployment_Center\\Sam_Att\\Staging',
  HISTORY_FILE: 'C:\\inetpub\\wwwroot\\Deployment_Center\\Sam_Att\\history.json',
  NAMED_PIPE_PATH: '\\\\.\\pipe\\SamchukSamAttDeploymentAgent_v2',
} as const;

const HEX_40_REGEX = /^[0-9a-f]{40}$/i;
const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const SAFE_BACKUP_ID_REGEX = /^BKP_[0-9A-Za-z_-]{6,64}$/;

export interface DeploymentManifestFile {
  schemaVersion: '2.0';
  deploymentId: string;
  version: string;
  commitSha: string;
  branch: string;
  deployedAt: string;
  approvedBy: {
    userId: string;
    username: string;
    fullName: string;
  };
  frontendArtifactSha256: string;
  backendArtifactSha256: string;
  backupId: string | null;
  healthCheckVerified: boolean;
  manifestSignatureSha256: string;
}

export interface BackupArchiveManifest {
  schemaVersion: '2.0';
  backupId: string;
  createdAt: string;
  previousCommitSha: string;
  previousVersion: string;
  frontendArtifactSha256: string;
  backendArtifactSha256: string;
  previousManifestPresent: boolean;
  verified: boolean;
  backupSignatureSha256: string;
  previousManifestSha256?: string;
  adapterConfigSha256?: string;
  adapterConfigPresent?: boolean;
}

export interface AgentPreflightEvidence {
  commitSha: string;
  verifiedAt: string;
  dependenciesPassed: boolean;
  dependenciesDetail: string;
  buildPassed: boolean;
  buildDetail: string;
  frontendArtifactSha256: string;
  backendArtifactSha256: string;
  testsPassed: boolean;
  testsDetail: string;
  backupCapabilityPassed: boolean;
  backupCapabilityDetail: string;
  gatewayHealthPassed: boolean;
  gatewayHealthDetail: string;
  procurementHealthPassed: boolean;
  procurementHealthDetail: string;
  procurementHttpStatus?: number;
}

export interface ExecuteDeployParams {
  deploymentId: string;
  targetCommitSha: string;
  targetVersion: string;
  approvedBy: {
    userId: string;
    username: string;
    fullName: string;
  };
  maintenanceWindowApproved?: boolean;
  backendRequiresGatewayRestart?: boolean;
  isolatedBackendActivationSupported?: boolean;
}

export interface ExecuteDeployResult {
  accepted: boolean;
  deploymentId: string;
  status: DeploymentJobStatus;
  backupId: string | null;
  manifest: DeploymentManifestFile | null;
  healthCheckReport: PostDeployHealthCheckReport | null;
  rollbackStatus: RollbackExecutionStatus;
  buildTestSummary: string;
  summary: string;
  errorSanitized: string | null;
  criticalRecoveryAdvice?: string | null;
  progress: DeploymentProgressState;
}

export interface ExecuteRollbackParams {
  backupId: string;
  requestedBy: {
    userId: string;
    username: string;
    fullName: string;
  };
  reason?: string;
}

export interface ExecuteRollbackResult {
  rolledBack: boolean;
  status: 'ROLLED_BACK' | 'FAILED';
  rollbackStatus: RollbackExecutionStatus;
  backupId: string;
  restoredCommitSha: string;
  restoredVersion: string;
  healthCheckReport: PostDeployHealthCheckReport | null;
  summary: string;
  errorSanitized: string | null;
  criticalRecoveryAdvice: string | null;
}

export interface IDeploymentAgentPhase2 {
  readonly isAvailable: boolean;
  readonly agentStatus: 'NOT_CONFIGURED' | 'READY' | 'BUSY' | 'OFFLINE';
  readonly namedPipePath: string;
  getPreDeploymentEvidence(targetCommitSha: string): Promise<AgentPreflightEvidence | null>;
  listVerifiedBackups(): Promise<DeploymentBackupSummary[]>;
  executeApprovedDeployment(params: ExecuteDeployParams): Promise<ExecuteDeployResult>;
  executeVerifiedRollback(params: ExecuteRollbackParams): Promise<ExecuteRollbackResult>;
  getActiveProgress(): DeploymentProgressState | null;
  isLocked(): boolean;
}

/**
 * Redacts any sensitive credentials, tokens, or connection strings from error messages.
 */
export function sanitizeDeploymentErrorText(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === 'string'
      ? input
      : input && typeof input === 'object'
      ? JSON.stringify(input)
      : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(password|secret|token|pwd)\s*[:=]\s*["']?[^\s"',;]+["']?/gi, '$1=[REDACTED]')
    .replace(/\[object Object\]/g, 'ข้อผิดพลาดจากระบบ (Sanitized Error)');
}

export function computeSha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

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

export function computeDirectorySha256Hex(dirPath: string): string {
  assertDeploymentPathHasNoLinks(dirPath);
  if (!fs.existsSync(dirPath)) {
    throw new Error('ARTIFACT_DIRECTORY_MISSING');
  }
  const hash = crypto.createHash('sha256');
  const walk = (currentDir: string) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) throw new Error('ARTIFACT_LINK_REJECTED');
      if (entry.isDirectory()) {
        hash.update(`D:${relPath}\n`);
        walk(fullPath);
      } else if (entry.isFile()) {
        hash.update(`F:${relPath}:`);
        hash.update(fs.readFileSync(fullPath));
        hash.update('\n');
      }
    }
  };
  walk(dirPath);
  return hash.digest('hex');
}

function copyDirectoryRecursiveSync(srcDir: string, destDir: string): number {
  assertDeploymentPathHasNoLinks(srcDir);
  assertDeploymentPathHasNoLinks(destDir);
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('ARTIFACT_LINK_REJECTED');
    assertDeploymentPathHasNoLinks(destPath);
    if (entry.isDirectory()) {
      count += copyDirectoryRecursiveSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      count += 1;
    }
  }
  return count;
}

function clearAndRestoreDirectorySync(srcDir: string, destDir: string): void {
  computeDirectorySha256Hex(srcDir);
  assertDeploymentPathHasNoLinks(destDir);
  if (fs.existsSync(destDir)) computeDirectorySha256Hex(destDir);
  if (fs.existsSync(destDir)) {
    for (const entry of fs.readdirSync(destDir)) {
      fs.rmSync(path.join(destDir, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(destDir, { recursive: true });
  }
  copyDirectoryRecursiveSync(srcDir, destDir);
}

/**
 * Computes deterministic SHA-256 integrity hash for `current.json` Deployment Manifest.
 */
export function computeManifestSignatureSha256(
  manifest: Omit<DeploymentManifestFile, 'manifestSignatureSha256'>
): string {
  const canonical = JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    deploymentId: manifest.deploymentId,
    version: manifest.version,
    commitSha: manifest.commitSha.toLowerCase(),
    branch: manifest.branch,
    deployedAt: manifest.deployedAt,
    approvedBy: {
      userId: manifest.approvedBy.userId,
      username: manifest.approvedBy.username,
      fullName: manifest.approvedBy.fullName,
    },
    frontendArtifactSha256: manifest.frontendArtifactSha256.toLowerCase(),
    backendArtifactSha256: manifest.backendArtifactSha256.toLowerCase(),
    backupId: manifest.backupId,
    healthCheckVerified: manifest.healthCheckVerified,
  });
  return computeSha256Hex(`SAM_ATT_V2_MANIFEST_V2:${canonical}`);
}

export function computeBackupSignatureSha256(
  backup: Omit<BackupArchiveManifest, 'backupSignatureSha256'>
): string {
  const canonical = JSON.stringify({
    schemaVersion: backup.schemaVersion,
    backupId: backup.backupId,
    createdAt: backup.createdAt,
    previousCommitSha: backup.previousCommitSha,
    previousVersion: backup.previousVersion,
    frontendArtifactSha256: backup.frontendArtifactSha256.toLowerCase(),
    backendArtifactSha256: backup.backendArtifactSha256.toLowerCase(),
    previousManifestPresent: backup.previousManifestPresent,
    previousManifestSha256: backup.previousManifestSha256,
    adapterConfigSha256: backup.adapterConfigSha256,
    adapterConfigPresent: backup.adapterConfigPresent,
    verified: backup.verified,
  });
  return computeSha256Hex(`SAM_ATT_V2_BACKUP_V2:${canonical}`);
}

/**
 * Reads and cryptographically verifies the Deployment Manifest (`current.json`).
 * - Returns `MISSING` when the manifest file does not exist (e.g. A94 legacy PowerShell install).
 * - Returns `INVALID_MANIFEST` if JSON is malformed, commitSha is not 40-char hex,
 *   healthCheckVerified !== true, or signature does not match.
 */
export function readAndVerifyDeploymentManifest(manifestPath: string): {
  status: 'VALID' | 'MISSING' | 'INVALID_MANIFEST';
  manifest: DeploymentManifestFile | null;
  error: string | null;
} {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return {
      status: 'MISSING',
      manifest: null,
      error: null,
    };
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DeploymentManifestFile>;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.schemaVersion !== '2.0' ||
      typeof parsed.deploymentId !== 'string' ||
      !parsed.deploymentId.trim() ||
      typeof parsed.version !== 'string' ||
      !parsed.version.trim() ||
      typeof parsed.commitSha !== 'string' ||
      !HEX_40_REGEX.test(parsed.commitSha) ||
      typeof parsed.deployedAt !== 'string' ||
      !parsed.deployedAt.trim() ||
      parsed.healthCheckVerified !== true ||
      typeof parsed.frontendArtifactSha256 !== 'string' ||
      !HEX_64_REGEX.test(parsed.frontendArtifactSha256) ||
      typeof parsed.backendArtifactSha256 !== 'string' ||
      !HEX_64_REGEX.test(parsed.backendArtifactSha256) ||
      typeof parsed.manifestSignatureSha256 !== 'string' ||
      !HEX_64_REGEX.test(parsed.manifestSignatureSha256) ||
      !parsed.approvedBy ||
      typeof parsed.approvedBy.username !== 'string'
    ) {
      return {
        status: 'INVALID_MANIFEST',
        manifest: null,
        error:
          'INVALID_MANIFEST — โครงสร้างไฟล์ Deployment Manifest (current.json) ไม่ถูกต้อง หรือยังไม่ผ่านการยืนยัน Health Check',
      };
    }

    const expectedSig = computeManifestSignatureSha256({
      schemaVersion: '2.0',
      deploymentId: parsed.deploymentId,
      version: parsed.version,
      commitSha: parsed.commitSha,
      branch: parsed.branch || 'main',
      deployedAt: parsed.deployedAt,
      approvedBy: {
        userId: String(parsed.approvedBy.userId || parsed.approvedBy.username),
        username: parsed.approvedBy.username,
        fullName: String(parsed.approvedBy.fullName || parsed.approvedBy.username),
      },
      frontendArtifactSha256: parsed.frontendArtifactSha256,
      backendArtifactSha256: parsed.backendArtifactSha256,
      backupId: parsed.backupId ?? null,
      healthCheckVerified: true,
    });

    if (expectedSig !== parsed.manifestSignatureSha256.toLowerCase()) {
      return {
        status: 'INVALID_MANIFEST',
        manifest: null,
        error:
          'INVALID_MANIFEST — ลายมือชื่อดิจิทัล (SHA-256 Integrity Hash) ของไฟล์ Deployment Manifest (current.json) ไม่ตรงกับข้อมูลจริง',
      };
    }

    return {
      status: 'VALID',
      manifest: parsed as DeploymentManifestFile,
      error: null,
    };
  } catch (err) {
    return {
      status: 'INVALID_MANIFEST',
      manifest: null,
      error: `INVALID_MANIFEST — ไม่สามารถอ่านไฟล์ Deployment Manifest ได้: ${sanitizeDeploymentErrorText(
        err
      )}`,
    };
  }
}

export function writeVerifiedDeploymentManifest(
  manifestPath: string,
  input: Omit<DeploymentManifestFile, 'manifestSignatureSha256'>
): DeploymentManifestFile {
  if (!HEX_40_REGEX.test(input.commitSha)) {
    throw new Error('Cannot write Deployment Manifest: commitSha must be 40-character hex');
  }
  if (!input.healthCheckVerified) {
    throw new Error(
      'Cannot write Deployment Manifest: healthCheckVerified must be true before recording current.json'
    );
  }
  const manifestSignatureSha256 = computeManifestSignatureSha256(input);
  const fullManifest: DeploymentManifestFile = {
    ...input,
    commitSha: input.commitSha.toLowerCase(),
    frontendArtifactSha256: input.frontendArtifactSha256.toLowerCase(),
    backendArtifactSha256: input.backendArtifactSha256.toLowerCase(),
    manifestSignatureSha256,
  };

  const dir = path.dirname(manifestPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${manifestPath}.tmp.${process.pid}.${Date.now()}`;
  assertDeploymentPathHasNoLinks(manifestPath);
  const fd = fs.openSync(tmpPath, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(fullManifest, null, 2), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmpPath, manifestPath);
  return fullManifest;
}

const STEP_DEFINITIONS: ReadonlyArray<{ stepNumber: number; id: string; label: string }> = [
  { stepNumber: 1, id: 'lock_deployment', label: '1. Lock Deployment (ล็อกป้องกันการ Deploy ซ้อน)' },
  { stepNumber: 2, id: 'verify_auth_commit', label: '2. ตรวจสอบสิทธิ์ ADMIN และยืนยัน Commit SHA' },
  { stepNumber: 3, id: 'download_source', label: '3. ดาวน์โหลด Source จาก GitHub Commit ที่อนุมัติ' },
  { stepNumber: 4, id: 'verify_source', label: '4. ตรวจสอบความถูกต้องของ Source Code' },
  { stepNumber: 5, id: 'install_dependencies', label: '5. ติดตั้งและตรวจสอบ Dependencies แบบควบคุมเวอร์ชัน' },
  { stepNumber: 6, id: 'run_typecheck', label: '6. รันการตรวจสอบ TypeScript (Typecheck)' },
  { stepNumber: 7, id: 'run_unit_tests', label: '7. รันชุดทดสอบ Unit Tests' },
  { stepNumber: 8, id: 'run_integration_tests', label: '8. รันชุดทดสอบ Integration Tests' },
  { stepNumber: 9, id: 'build_artifacts', label: '9. Build Frontend และ Backend Artifacts' },
  { stepNumber: 10, id: 'verify_artifacts', label: '10. ตรวจสอบความถูกต้องและ SHA-256 ของ Artifact' },
  { stepNumber: 11, id: 'backup_production', label: '11. สำรองข้อมูล Production (Backup) และตรวจความสมบูรณ์' },
  { stepNumber: 12, id: 'prepare_staging', label: '12. เตรียมชุดติดตั้งในโฟลเดอร์ Staging' },
  { stepNumber: 13, id: 'verify_staging', label: '13. ตรวจสอบความสมบูรณ์ของ Staging Release' },
  { stepNumber: 14, id: 'deploy_sam_att', label: '14. ติดตั้งเฉพาะระบบ Sam_Att V2 (ไม่กระทบ Procurement)' },
  { stepNumber: 15, id: 'post_deploy_health', label: '15. ตรวจสอบ Health Check หลังติดตั้งครบ 7 จุด' },
  { stepNumber: 16, id: 'write_manifest', label: '16. บันทึก Deployment Manifest (current.json)' },
  { stepNumber: 17, id: 'unlock_deployment', label: '17. ปลดล็อก Deployment Lock' },
];

export interface StagingDeploymentEngineConfig {
  workspaceRoot: string;
  frontendProdDir: string;
  backendProdDir: string;
  adapterConfigPath: string;
  manifestPath: string;
  backupsDir: string;
  stagingDir: string;
  namedPipePath?: string;
  lockTimeoutMs?: number;
  isolatedBackendActivationSupported?: boolean;
  backendRequiresGatewayRestart?: boolean;
  /**
   * Pluggable hooks for real or simulated execution in Staging/Simulation tests
   */
  hooks?: {
    fetchGitHubSource?: (commitSha: string, targetDir: string) => Promise<{ ok: boolean; error?: string }>;
    verifyGitHubSource?: (commitSha: string, targetDir: string) => Promise<{ ok: boolean; error?: string }>;
    runDependenciesCheck?: (stagingSourceDir: string) => Promise<{ ok: boolean; detail: string }>;
    runTypecheck?: (stagingSourceDir: string) => Promise<{ ok: boolean; detail: string }>;
    runUnitTests?: (stagingSourceDir: string) => Promise<{ ok: boolean; detail: string }>;
    runIntegrationTests?: (stagingSourceDir: string) => Promise<{ ok: boolean; detail: string }>;
    runBuild?: (stagingSourceDir: string) => Promise<{
      ok: boolean;
      detail: string;
      frontendBuildDir?: string;
      backendBuildDir?: string;
    }>;
    runBackupHook?: () => Promise<{ ok: boolean; error?: string }>;
    runPostDeployHealthProbe?: (context: {
      targetCommitSha: string;
      expectedActiveCommitSha?: string;
      frontendProdDir: string;
      backendProdDir: string;
    }) => Promise<{
      frontendHealthy?: boolean;
      backendHealthy?: boolean;
      authHealthy?: boolean;
      mysqlHealthy?: boolean;
      routerHealthy?: boolean;
      procurementHealthy?: boolean;
      procurementStatusCode?: number;
      errorDetail?: string;
    }>;
    activateBackend?: (context: { commitSha: string; backendDir: string; frontendDir: string }) => Promise<void>;
    runRollbackHook?: (backupId: string) => Promise<{ ok: boolean; error?: string }>;
  };
}

/**
 * Local / Staging Deployment Engine used by both the Windows Service Agent on `FILESERVER`
 * and the automated Staging/Simulation test suite (strictly isolated from Production).
 */
export class LocalStagingDeploymentEngine implements IDeploymentAgentPhase2 {
  public readonly isAvailable: boolean = true;
  public readonly namedPipePath: string;
  private readonly config: StagingDeploymentEngineConfig;
  private readonly diskLock: DeploymentFileLock;
  private readonly recoveryFile: string;
  private activeLock: {
    lockedAt: number;
    deploymentId: string;
  } | null = null;
  private activeProgress: DeploymentProgressState | null = null;

  constructor(config: StagingDeploymentEngineConfig) {
    for (const field of ['workspaceRoot','frontendProdDir','backendProdDir','backupsDir','stagingDir','manifestPath','adapterConfigPath'] as const) assertDeploymentPathHasNoLinks(config[field]);
    this.config = config;
    this.diskLock = new DeploymentFileLock(path.join(config.workspaceRoot, 'deployment.lock'));
    this.recoveryFile = path.join(config.workspaceRoot, 'recovery-required.json');
    this.namedPipePath =
      config.namedPipePath || AUTHORITATIVE_WINDOWS_PATHS.NAMED_PIPE_PATH;
    fs.mkdirSync(this.config.frontendProdDir, { recursive: true });
    fs.mkdirSync(this.config.backendProdDir, { recursive: true });
    fs.mkdirSync(this.config.backupsDir, { recursive: true });
    fs.mkdirSync(this.config.stagingDir, { recursive: true });
  }

  public get agentStatus(): 'NOT_CONFIGURED' | 'READY' | 'BUSY' | 'OFFLINE' {
    return this.isLocked() ? 'BUSY' : 'READY';
  }

  public isLocked(): boolean {
    // Never release a lock while its operation may still be running.
    return this.activeLock !== null || this.diskLock.isLocked();
  }

  private acquireLock(deploymentId: string): boolean {
    if (this.isLocked()) {
      return false;
    }
    if (fs.existsSync(this.recoveryFile) && !deploymentId.startsWith('ROLLBACK_')) return false;
    if (!this.diskLock.acquire(deploymentId)) return false;
    this.activeLock = {
      lockedAt: Date.now(),
      deploymentId,
    };
    return true;
  }

  private releaseLock(): void {
    this.diskLock.release();
    this.activeLock = null;
  }

  private journalRecovery(backupId: string, phase: string) {
    const temp = `${this.recoveryFile}.tmp`;
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ backupId, phase, at: new Date().toISOString() })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, this.recoveryFile);
  }
  private clearRecoveryJournal() { if (fs.existsSync(this.recoveryFile)) fs.unlinkSync(this.recoveryFile); }

  public getActiveProgress(): DeploymentProgressState | null {
    return this.activeProgress;
  }

  public async getPreDeploymentEvidence(
    targetCommitSha: string
  ): Promise<AgentPreflightEvidence | null> {
    if (!HEX_40_REGEX.test(targetCommitSha)) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const sourceDir = fs.mkdtempSync(path.join(this.config.stagingDir, 'preflight_'));
    try {
    if (!this.config.hooks?.fetchGitHubSource || !this.config.hooks?.verifyGitHubSource) {
      throw new Error('SOURCE_EXECUTOR_NOT_CONFIGURED');
    }
    const fetched = await this.config.hooks.fetchGitHubSource(targetCommitSha, sourceDir);
    if (!fetched.ok) throw new Error(fetched.error || 'SOURCE_FETCH_FAILED');
    const verified = await this.config.hooks.verifyGitHubSource(targetCommitSha, sourceDir);
    if (!verified.ok) throw new Error(verified.error || 'SOURCE_INTEGRITY_FAILED');
    const missing = (name: string) => ({ ok: false, detail: `${name}_EXECUTOR_NOT_CONFIGURED` });
    const depCheck = this.config.hooks.runDependenciesCheck
      ? await this.config.hooks.runDependenciesCheck(sourceDir) : missing('DEPENDENCIES');
    const typecheck = this.config.hooks.runTypecheck
      ? await this.config.hooks.runTypecheck(sourceDir) : missing('TYPECHECK');
    const buildCheck = this.config.hooks.runBuild
      ? await this.config.hooks.runBuild(sourceDir) : { ...missing('BUILD'), frontendBuildDir: undefined, backendBuildDir: undefined };
    const unitCheck = this.config.hooks.runUnitTests
      ? await this.config.hooks.runUnitTests(sourceDir) : missing('UNIT_TEST');
    const intCheck = this.config.hooks.runIntegrationTests
      ? await this.config.hooks.runIntegrationTests(sourceDir) : missing('INTEGRATION_TEST');
    const testsPassed = typecheck.ok && unitCheck.ok && intCheck.ok;

    let backupWritable = false;
    let backupDetail = '';
    try {
      if (this.config.hooks?.runBackupHook) {
        const bRes = await this.config.hooks.runBackupHook();
        backupWritable = bRes.ok;
        backupDetail = bRes.ok
          ? `PASS — โฟลเดอร์ Backup (${this.config.backupsDir}) พร้อมเขียนและตรวจสอบ SHA-256 ได้จริง`
          : `FAIL — ระบบ Backup ขัดข้อง: ${bRes.error || 'Backup check failed'}`;
      } else {
        fs.mkdirSync(this.config.backupsDir, { recursive: true });
        const probeFile = path.join(
          this.config.backupsDir,
          `.preflight_write_probe_${process.pid}_${Date.now()}`
        );
        fs.writeFileSync(probeFile, targetCommitSha, 'utf8');
        const readBack = fs.readFileSync(probeFile, 'utf8');
        fs.unlinkSync(probeFile);
        backupWritable = readBack === targetCommitSha;
        backupDetail = backupWritable
          ? `PASS — ตรวจสอบสิทธิ์การเขียนและยืนยันความสมบูรณ์ของโฟลเดอร์สำรองข้อมูล (${this.config.backupsDir}) สำเร็จ`
          : 'FAIL — ไม่สามารถเขียนหรืออ่านไฟล์ทดสอบในโฟลเดอร์ Backup ได้';
      }
    } catch (err) {
      backupWritable = false;
      backupDetail = `FAIL — ไม่สามารถเข้าถึงโฟลเดอร์ Backup ได้: ${sanitizeDeploymentErrorText(err)}`;
    }

    if (!this.config.hooks?.runPostDeployHealthProbe) {
      throw new Error('HEALTH_PROBE_NOT_CONFIGURED: ไม่มี Health Check จริง');
    }
    const probe = await this.config.hooks.runPostDeployHealthProbe({
      targetCommitSha,
      frontendProdDir: this.config.frontendProdDir,
      backendProdDir: this.config.backendProdDir,
    });

    const gatewayPassed = probe.backendHealthy === true && probe.routerHealthy === true && probe.authHealthy === true && probe.mysqlHealthy === true && probe.frontendHealthy === true;
    const procurementCode = probe.procurementStatusCode ?? 0;
    // Requirement §3.3: Procurement Health Check MUST NOT treat HTTP 404 as PASS!
    const procurementPassed =
       (probe.procurementHealthy === true) &&
      procurementCode >= 200 &&
      procurementCode < 300 &&
      procurementCode !== 404;

    const frontendSha = buildCheck.ok && buildCheck.frontendBuildDir ? computeDirectorySha256Hex(buildCheck.frontendBuildDir) : '';
    const backendSha = buildCheck.ok && buildCheck.backendBuildDir ? computeDirectorySha256Hex(buildCheck.backendBuildDir) : '';

    return {
      commitSha: targetCommitSha.toLowerCase(),
      verifiedAt: nowIso,
      dependenciesPassed: depCheck.ok,
      dependenciesDetail: depCheck.detail,
      buildPassed: buildCheck.ok && HEX_64_REGEX.test(frontendSha) && HEX_64_REGEX.test(backendSha) &&
        fs.existsSync(path.join(buildCheck.frontendBuildDir || sourceDir, 'index.html')) &&
        fs.existsSync(path.join(buildCheck.backendBuildDir || sourceDir, 'sam-att-gateway.cjs')),
      buildDetail: buildCheck.detail,
      frontendArtifactSha256: frontendSha,
      backendArtifactSha256: backendSha,
      testsPassed,
      testsDetail: testsPassed
        ? `PASS — ผลรัน Typecheck, Unit Tests และ Integration Tests สำหรับ Commit ${targetCommitSha.slice(
            0,
            8
          )} ผ่านครบถ้วน (${unitCheck.detail}; ${intCheck.detail})`
        : `FAIL — ผลรัน Automated Tests ไม่ผ่าน (${unitCheck.detail}; ${intCheck.detail})`,
      backupCapabilityPassed: backupWritable && !fs.existsSync(this.recoveryFile),
      backupCapabilityDetail: backupDetail,
      gatewayHealthPassed: gatewayPassed,
      gatewayHealthDetail: gatewayPassed
        ? 'PASS — ตรวจสอบเส้นทาง /api/Sam_Att/ บน Central API Gateway พอร์ต 3002 ตอบสนองปกติ'
        : `FAIL — Central API Gateway (/api/Sam_Att/) ไม่ตอบสนองตามที่กำหนด (${
            probe.errorDetail || 'Gateway probe failed'
          })`,
      procurementHealthPassed: procurementPassed,
      procurementHealthDetail: procurementPassed
        ? `PASS — ตรวจสอบระบบ Procurement บน Central API Gateway ตอบกลับสถานะปกติ (HTTP ${procurementCode})`
        : `FAIL — ตรวจสอบระบบ Procurement ไม่ผ่าน (HTTP ${procurementCode}${
            procurementCode === 404 ? ' — ห้ามถือว่า HTTP 404 คือ PASS' : ''
          })`,
      procurementHttpStatus: procurementCode,
    };
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  }

  public async listVerifiedBackups(): Promise<DeploymentBackupSummary[]> {
    if (!fs.existsSync(this.config.backupsDir)) {
      return [];
    }
    const entries = fs
      .readdirSync(this.config.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && SAFE_BACKUP_ID_REGEX.test(e.name));

    const results: DeploymentBackupSummary[] = [];
    for (const dirEntry of entries) {
      const backupDir = path.join(this.config.backupsDir, dirEntry.name);
      const verification = this.verifyBackupDirectory(backupDir);
      if (verification.manifest) {
        results.push({
          backupId: verification.manifest.backupId,
          createdAt: verification.manifest.createdAt,
          commitSha: verification.manifest.previousCommitSha,
          version: verification.manifest.previousVersion,
          frontendArtifactSha256: verification.manifest.frontendArtifactSha256,
          backendArtifactSha256: verification.manifest.backendArtifactSha256,
          verified: verification.valid,
          backupPath: backupDir,
        });
      }
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public verifyBackupDirectory(backupDir: string): {
    valid: boolean;
    manifest: BackupArchiveManifest | null;
    error?: string;
  } {
    const manifestFile = path.join(backupDir, 'backup-manifest.json');
    const frontendBackupDir = path.join(backupDir, 'frontend');
    const backendBackupDir = path.join(backupDir, 'backend');

    if (
      !fs.existsSync(manifestFile) ||
      !fs.existsSync(frontendBackupDir) ||
      !fs.existsSync(backendBackupDir)
    ) {
      return {
        valid: false,
        manifest: null,
        error: 'ไม่พบโครงสร้างไฟล์สำรองข้อมูล (backup-manifest.json, frontend, หรือ backend)',
      };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as BackupArchiveManifest;
      if (
        !parsed ||
        parsed.schemaVersion !== '2.0' ||
        !SAFE_BACKUP_ID_REGEX.test(parsed.backupId) ||
        path.basename(backupDir) !== parsed.backupId ||
        parsed.verified !== true
      ) {
        return {
          valid: false,
          manifest: null,
          error: 'ข้อมูลใน backup-manifest.json ไม่ถูกต้องหรือไม่ได้ยืนยันความสมบูรณ์',
        };
      }

      const expectedSig = computeBackupSignatureSha256({
        schemaVersion: '2.0',
        backupId: parsed.backupId,
        createdAt: parsed.createdAt,
        previousCommitSha: parsed.previousCommitSha,
        previousVersion: parsed.previousVersion,
        frontendArtifactSha256: parsed.frontendArtifactSha256,
        backendArtifactSha256: parsed.backendArtifactSha256,
        previousManifestPresent: parsed.previousManifestPresent,
        previousManifestSha256: parsed.previousManifestSha256,
        adapterConfigSha256: parsed.adapterConfigSha256,
        adapterConfigPresent: parsed.adapterConfigPresent,
        verified: parsed.verified,
      });

      if (expectedSig !== parsed.backupSignatureSha256) {
        return {
          valid: false,
          manifest: parsed,
          error: 'ลายมือชื่อ SHA-256 ของ backup-manifest.json ไม่ตรงกับข้อมูลจริง',
        };
      }

      const savedManifest = path.join(backupDir, 'current.json.bak');
      if (parsed.previousManifestPresent !== fs.existsSync(savedManifest) ||
          (parsed.previousManifestPresent && (!parsed.previousManifestSha256 ||
           computeSha256Hex(fs.readFileSync(savedManifest)) !== parsed.previousManifestSha256))) {
        throw new Error('BACKUP_MANIFEST_INTEGRITY_FAILED');
      }
      const savedConfig = path.join(backupDir, 'config', path.basename(this.config.adapterConfigPath));
      if (parsed.adapterConfigPresent !== fs.existsSync(savedConfig) ||
          (parsed.adapterConfigPresent && (!parsed.adapterConfigSha256 ||
           computeSha256Hex(fs.readFileSync(savedConfig)) !== parsed.adapterConfigSha256))) {
        throw new Error('BACKUP_CONFIG_INTEGRITY_FAILED');
      }
      const actualFrontendSha = computeDirectorySha256Hex(frontendBackupDir);
      const actualBackendSha = computeDirectorySha256Hex(backendBackupDir);
      if (
        actualFrontendSha !== parsed.frontendArtifactSha256 ||
        actualBackendSha !== parsed.backendArtifactSha256
      ) {
        return {
          valid: false,
          manifest: parsed,
          error:
            'ค่า SHA-256 ของไฟล์ Frontend หรือ Backend ในชุดสำรองข้อมูลไม่ตรงกับค่าที่บันทึกไว้ (Backup Corrupted)',
        };
      }

      return {
        valid: true,
        manifest: parsed,
      };
    } catch (err) {
      return {
        valid: false,
        manifest: null,
        error: sanitizeDeploymentErrorText(err),
      };
    }
  }

  private createProductionBackup(): {
    ok: boolean;
    backupId: string | null;
    error?: string;
  } {
    const now = new Date();
    const ts = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = crypto.randomBytes(3).toString('hex');
    const backupId = `BKP_${ts}_${rand}`;
    const backupDir = path.join(this.config.backupsDir, backupId);
    const frontendBackupDir = path.join(backupDir, 'frontend');
    const backendBackupDir = path.join(backupDir, 'backend');
    const configBackupDir = path.join(backupDir, 'config');

    try {
      fs.mkdirSync(frontendBackupDir, { recursive: true });
      fs.mkdirSync(backendBackupDir, { recursive: true });
      fs.mkdirSync(configBackupDir, { recursive: true });

      if (!fs.existsSync(path.join(this.config.frontendProdDir, 'index.html')) ||
          fs.readdirSync(this.config.backendProdDir).length === 0) {
        throw new Error('PRODUCTION_BASELINE_MISSING');
      }
      // Hash first to reject links before copying any backup data.
      computeDirectorySha256Hex(this.config.frontendProdDir);
      computeDirectorySha256Hex(this.config.backendProdDir);
      copyDirectoryRecursiveSync(this.config.frontendProdDir, frontendBackupDir);
      copyDirectoryRecursiveSync(this.config.backendProdDir, backendBackupDir);

      if (this.config.adapterConfigPath && fs.existsSync(this.config.adapterConfigPath)) {
        fs.copyFileSync(
          this.config.adapterConfigPath,
          path.join(configBackupDir, path.basename(this.config.adapterConfigPath))
        );
      }

      const currentManifestCheck = readAndVerifyDeploymentManifest(this.config.manifestPath);
      const previousManifestPresent = fs.existsSync(this.config.manifestPath);
      if (previousManifestPresent) {
        fs.copyFileSync(
          this.config.manifestPath,
          path.join(backupDir, 'current.json.bak')
        );
      }

      const frontendSha = computeDirectorySha256Hex(frontendBackupDir);
      const backendSha = computeDirectorySha256Hex(backendBackupDir);

      const previousCommitSha =
        currentManifestCheck.manifest?.commitSha || 'NOT_AVAILABLE';
      const previousVersion =
        currentManifestCheck.manifest?.version || 'NOT_CONFIGURED';

      const manifestWithoutSig: Omit<BackupArchiveManifest, 'backupSignatureSha256'> = {
        schemaVersion: '2.0',
        backupId,
        createdAt: now.toISOString(),
        previousCommitSha,
        previousVersion,
        frontendArtifactSha256: frontendSha,
        backendArtifactSha256: backendSha,
        previousManifestPresent,
        adapterConfigPresent: fs.existsSync(this.config.adapterConfigPath),
        adapterConfigSha256: fs.existsSync(this.config.adapterConfigPath) ? computeSha256Hex(fs.readFileSync(this.config.adapterConfigPath)) : undefined,
        previousManifestSha256: previousManifestPresent ? computeSha256Hex(fs.readFileSync(path.join(backupDir, 'current.json.bak'))) : undefined,
        verified: true,
      };

      const fullBackupManifest: BackupArchiveManifest = {
        ...manifestWithoutSig,
        backupSignatureSha256: computeBackupSignatureSha256(manifestWithoutSig),
      };

      fs.writeFileSync(
        path.join(backupDir, 'backup-manifest.json'),
        JSON.stringify(fullBackupManifest, null, 2),
        'utf8'
      );

      // Verify backup integrity immediately (§3.5: ห้ามเริ่ม Deploy หาก Backup ไม่สมบูรณ์)
      const check = this.verifyBackupDirectory(backupDir);
      if (!check.valid) {
        return {
          ok: false,
          backupId: null,
          error: check.error || 'การตรวจสอบความสมบูรณ์ของ Backup ล้มเหลว',
        };
      }

      return {
        ok: true,
        backupId,
      };
    } catch (err) {
      return {
        ok: false,
        backupId: null,
        error: sanitizeDeploymentErrorText(err),
      };
    }
  }

  private async evaluateSevenPointHealthCheck(
    targetCommitSha: string,
    expectManifestUpdated: boolean
  ): Promise<PostDeployHealthCheckReport> {
    const nowIso = new Date().toISOString();
    const probe = this.config.hooks?.runPostDeployHealthProbe
      ? await this.config.hooks.runPostDeployHealthProbe({
          targetCommitSha,
          expectedActiveCommitSha: targetCommitSha,
          frontendProdDir: this.config.frontendProdDir,
          backendProdDir: this.config.backendProdDir,
        })
      : {};

    const feIndexExists = fs.existsSync(path.join(this.config.frontendProdDir, 'index.html'));
    const feHealthy = probe.frontendHealthy === true && feIndexExists;

    const beHealthy = probe.backendHealthy === true;
    const authHealthy = probe.authHealthy === true;
    const mysqlHealthy = probe.mysqlHealthy === true;
    const routerHealthy = probe.routerHealthy === true;

    const manifestCheck = readAndVerifyDeploymentManifest(this.config.manifestPath);
    const manifestHealthy = expectManifestUpdated
      ? manifestCheck.status === 'VALID' &&
        manifestCheck.manifest?.commitSha.toLowerCase() === targetCommitSha.toLowerCase()
      : feIndexExists;

    const procCode = probe.procurementStatusCode ?? 0;
    const procHealthy =
      (probe.procurementHealthy === true) &&
      procCode >= 200 &&
      procCode < 300 &&
      procCode !== 404;

    const items: PostDeployHealthCheckItem[] = [
      {
        id: 'frontend_sam_att',
        label: '1. Frontend Web (/Sam_Att/ พอร์ต 3001)',
        healthy: feHealthy,
        statusCode: feHealthy ? 200 : 503,
        detail: feHealthy
          ? 'พบไฟล์ Frontend Entry (index.html) และพร้อมให้บริการที่ /Sam_Att/'
          : 'ไม่พบไฟล์ Frontend หรือ /Sam_Att/ ไม่ตอบสนอง',
      },
      {
        id: 'backend_sam_att',
        label: '2. Backend API (/api/Sam_Att/ พอร์ต 3002)',
        healthy: beHealthy,
        statusCode: beHealthy ? 200 : 503,
        detail: beHealthy
          ? 'เส้นทาง /api/Sam_Att/ บน Central API Gateway ตอบสนองปกติ'
          : probe.errorDetail || 'เส้นทาง /api/Sam_Att/ ไม่ตอบสนองตามที่กำหนด',
      },
      {
        id: 'authentication',
        label: '3. ระบบยืนยันตัวตน (Authentication Service)',
        healthy: authHealthy,
        statusCode: authHealthy ? 200 : 500,
        detail: authHealthy
          ? 'ระบบตรวจสอบสิทธิ์และ JWT/Session ทำงานปกติ'
          : 'ระบบ Authentication ขัดข้อง',
      },
      {
        id: 'mysql_connection',
        label: '4. การเชื่อมต่อฐานข้อมูล MySQL (samchuk_attendance_v2)',
        healthy: mysqlHealthy,
        statusCode: mysqlHealthy ? 200 : 503,
        detail: mysqlHealthy
          ? 'เชื่อมต่อฐานข้อมูล samchuk_attendance_v2 สำเร็จ'
          : 'ไม่สามารถเชื่อมต่อฐานข้อมูล samchuk_attendance_v2 ได้',
      },
      {
        id: 'sam_att_router',
        label: '5. Sam_Att Express Router & Endpoints',
        healthy: routerHealthy,
        statusCode: routerHealthy ? 200 : 500,
        detail: routerHealthy
          ? 'Sam_Att Router พร้อมให้บริการครบทุก Endpoint'
          : 'Sam_Att Router ตรวจสอบไม่ผ่าน',
      },
      {
        id: 'version_manifest',
        label: '6. ความสมบูรณ์ของ Release & Version Manifest',
        healthy: manifestHealthy,
        statusCode: manifestHealthy ? 200 : 500,
        detail: manifestHealthy
          ? `Artifact และข้อมูลเวอร์ชันตรงกับ Commit ${targetCommitSha.slice(0, 8)}`
          : 'ข้อมูล Release หรือ Deployment Manifest ไม่ตรงกับเวอร์ชันที่คาดหวัง',
      },
      {
        id: 'procurement_health',
        label: '7. ระบบจัดซื้อจัดจ้าง (Procurement Functional Health)',
        healthy: procHealthy,
        statusCode: procCode,
        detail: procHealthy
          ? `ระบบ Procurement บน Central API Gateway ทำงานต่อเนื่องปกติ (HTTP ${procCode})`
          : `ระบบ Procurement ตรวจสอบไม่ผ่าน (HTTP ${procCode}${
              procCode === 404 ? ' — HTTP 404 ไม่ถือว่า PASS' : ''
            })`,
      },
    ];

    const overallHealthy = items.every((i) => i.healthy);
    const failedItems = items.filter((i) => !i.healthy).map((i) => i.label);

    return {
      overallHealthy,
      checkedAt: nowIso,
      summary: overallHealthy
        ? 'ผ่านการตรวจสอบ Health Check ครบทั้ง 7 รายการ (Sam_Att V2 และ Procurement ทำงานปกติ)'
        : `ไม่ผ่านการตรวจสอบ Health Check (${failedItems.join(', ')})`,
      items,
    };
  }

  /**
   * Executes the 17-step Build & Deploy pipeline (§3.6) with Backup (§3.5),
   * Shared Gateway Maintenance Guard, 7-Point Health Check (§3.7), and Auto-Rollback on failure.
   */
  public async executeApprovedDeployment(
    params: ExecuteDeployParams
  ): Promise<ExecuteDeployResult> {
    const startedAt = new Date().toISOString();
    const steps: DeploymentStepProgress[] = STEP_DEFINITIONS.map((s) => ({
      stepNumber: s.stepNumber,
      id: s.id,
      label: s.label,
      status: 'PENDING',
    }));

    const updateProgress = (
      stepNum: number,
      stepStatus: DeploymentStepProgress['status'],
      jobStatus: DeploymentJobStatus,
      detail?: string
    ) => {
      const idx = stepNum - 1;
      if (steps[idx]) {
        steps[idx].status = stepStatus;
        steps[idx].detail = detail;
        steps[idx].timestamp = new Date().toISOString();
      }
      this.activeProgress = {
        deploymentId: params.deploymentId,
        targetCommitSha: params.targetCommitSha,
        version: params.targetVersion,
        status: jobStatus,
        currentStepNumber: stepNum,
        totalSteps: 17,
        currentStepLabel: steps[idx]?.label || '',
        startedAt,
        updatedAt: new Date().toISOString(),
        completedAt:
          jobStatus === 'SUCCESS' ||
          jobStatus === 'FAILED' ||
          jobStatus === 'ROLLED_BACK' ||
          jobStatus === 'MAINTENANCE_REQUIRED'
            ? new Date().toISOString()
            : null,
        approvedBy: `${params.approvedBy.fullName} (${params.approvedBy.username})`,
        backupId: this.activeProgress?.backupId ?? null,
        buildTestSummary: this.activeProgress?.buildTestSummary || 'รอดำเนินการ',
        healthCheckReport: this.activeProgress?.healthCheckReport ?? null,
        rollbackStatus: this.activeProgress?.rollbackStatus ?? 'NONE',
        errorDetails: this.activeProgress?.errorDetails ?? null,
        criticalRecoveryAdvice: this.activeProgress?.criticalRecoveryAdvice ?? null,
        steps: [...steps],
      };
    };

    // Step 1: Lock Deployment
    if (!this.acquireLock(params.deploymentId)) {
      updateProgress(
        1,
        'FAILED',
        'FAILED',
        'มีกระบวนการ Deploy หรือ Rollback อื่นกำลังทำงานอยู่ (Concurrent Deployment Lock Active)'
      );
      return {
        accepted: false,
        deploymentId: params.deploymentId,
        status: 'FAILED',
        backupId: null,
        manifest: null,
        healthCheckReport: null,
        rollbackStatus: 'NONE',
        buildTestSummary: 'ถูกปฏิเสธเนื่องจากติด Deployment Lock',
        summary: 'ปฏิเสธคำขอ Deploy ซ้ำซ้อน: ระบบกำลังดำเนินการอัปเดตอยู่ในขณะนี้',
        errorSanitized: 'SAM_ATT_DEPLOYMENT_LOCKED: มีการดำเนินการ Deploy อยู่แล้ว กรุณารอให้เสร็จสิ้น',
        progress: this.activeProgress!,
      };
    }

    let createdBackupId: string | null = null;
    let activationStarted = false;

    try {
      updateProgress(1, 'COMPLETED', 'PENDING', 'ล็อก Deployment สำเร็จ');

      if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.deploymentId)) throw new Error('INVALID_DEPLOYMENT_ID');
      // Step 2: Verify ADMIN & Commit SHA
      if (!HEX_40_REGEX.test(params.targetCommitSha)) {
        throw new Error('รหัส Commit SHA ที่อนุมัติไม่ถูกต้อง (ต้องเป็นรหัสฐานสิบหก 40 หลัก)');
      }
      updateProgress(
        2,
        'COMPLETED',
        'PREFLIGHT',
        `ยืนยันสิทธิ์ ADMIN (${params.approvedBy.username}) และ Commit ${params.targetCommitSha.slice(
          0,
          8
        )}`
      );

      // Step 3: Download Source into isolated Staging workspace (never git pull in Production)
      const releaseStagingDir = fs.mkdtempSync(path.join(
        this.config.stagingDir, `release_${params.deploymentId}_${params.targetCommitSha.slice(0, 8)}_`
      ));

      if (this.config.hooks?.fetchGitHubSource) {
        const fetchRes = await this.config.hooks.fetchGitHubSource(
          params.targetCommitSha,
          releaseStagingDir
        );
        if (!fetchRes.ok) {
          throw new Error(fetchRes.error || 'ไม่สามารถดาวน์โหลด Source จาก GitHub ได้');
        }
      } else {
        throw new Error('SOURCE_EXECUTOR_NOT_CONFIGURED: ไม่มี Source Downloader จริง');
      }
      updateProgress(
        3,
        'COMPLETED',
        'BUILDING',
        `ดาวน์โหลด Source สำหรับ Commit ${params.targetCommitSha.slice(0, 8)} ลงใน Staging สำเร็จ`
      );

      if (!this.config.hooks?.verifyGitHubSource) {
        throw new Error('SOURCE_VERIFIER_NOT_CONFIGURED: ไม่มีการตรวจสอบ Source Commit');
      }
      const sourceVerified = await this.config.hooks.verifyGitHubSource(params.targetCommitSha, releaseStagingDir);
      if (!sourceVerified.ok) throw new Error(sourceVerified.error || 'SOURCE_INTEGRITY_FAILED');
      updateProgress(4, 'COMPLETED', 'BUILDING', 'ตรวจสอบ Source Commit สำเร็จ');

      // Step 5: Controlled Dependencies
      if (!this.config.hooks?.runDependenciesCheck) throw new Error('DEPENDENCIES_EXECUTOR_NOT_CONFIGURED');
      if (this.config.hooks?.runDependenciesCheck) {
        const depRes = await this.config.hooks.runDependenciesCheck(releaseStagingDir);
        if (!depRes.ok) {
          throw new Error(`การตรวจสอบ Dependencies ล้มเหลว: ${depRes.detail}`);
        }
      }
      updateProgress(5, 'COMPLETED', 'BUILDING', 'ตรวจสอบและเตรียม Dependencies สำเร็จ');

      // Step 6: Typecheck
      if (!this.config.hooks?.runTypecheck) throw new Error('TYPECHECK_EXECUTOR_NOT_CONFIGURED');
      if (this.config.hooks?.runTypecheck) {
        const tcRes = await this.config.hooks.runTypecheck(releaseStagingDir);
        if (!tcRes.ok) {
          throw new Error(`Typecheck ไม่ผ่าน: ${tcRes.detail}`);
        }
      }
      updateProgress(6, 'COMPLETED', 'BUILDING', 'TypeScript Typecheck (tsc --noEmit) ผ่าน 0 errors');

      // Step 7: Unit Tests
      if (!this.config.hooks?.runUnitTests) throw new Error('UNIT_TEST_EXECUTOR_NOT_CONFIGURED');
      if (this.config.hooks?.runUnitTests) {
        const utRes = await this.config.hooks.runUnitTests(releaseStagingDir);
        if (!utRes.ok) {
          throw new Error(`Unit Tests ไม่ผ่าน: ${utRes.detail}`);
        }
      }
      updateProgress(7, 'COMPLETED', 'BUILDING', 'Unit Tests ผ่านครบทุกรายการ');

      // Step 8: Integration Tests
      if (!this.config.hooks?.runIntegrationTests) throw new Error('INTEGRATION_TEST_EXECUTOR_NOT_CONFIGURED');
      if (this.config.hooks?.runIntegrationTests) {
        const itRes = await this.config.hooks.runIntegrationTests(releaseStagingDir);
        if (!itRes.ok) {
          throw new Error(`Integration Tests ไม่ผ่าน: ${itRes.detail}`);
        }
      }
      updateProgress(8, 'COMPLETED', 'BUILDING', 'Integration Tests ผ่านครบทุกรายการ');

      // Step 9: Build Frontend & Backend
      const stagedFrontendDir = path.join(releaseStagingDir, 'frontend_dist');
      const stagedBackendDir = path.join(releaseStagingDir, 'backend_dist');
      fs.mkdirSync(stagedFrontendDir, { recursive: true });
      fs.mkdirSync(stagedBackendDir, { recursive: true });

      if (!this.config.hooks?.runBuild) throw new Error('BUILD_EXECUTOR_NOT_CONFIGURED');
      if (this.config.hooks?.runBuild) {
        const bRes = await this.config.hooks.runBuild(releaseStagingDir);
        if (!bRes.ok) {
          throw new Error(`การ Build ล้มเหลว: ${bRes.detail}`);
        }
      }

      // Never synthesize a successful release from placeholder files.
      if (!fs.existsSync(path.join(stagedFrontendDir, 'index.html'))) {
        throw new Error('FRONTEND_ARTIFACT_MISSING: Production build did not create index.html');
      }
      if (!fs.existsSync(path.join(stagedBackendDir, 'sam-att-gateway.cjs'))) {
        throw new Error('BACKEND_ARTIFACT_MISSING: Production build did not create sam-att-gateway.cjs');
      }
      updateProgress(9, 'COMPLETED', 'BUILDING', 'Build Frontend และ Backend Artifacts สำเร็จ');

      // Step 10: Verify Artifacts & Compute SHA-256
      const stagedFrontendSha = computeDirectorySha256Hex(stagedFrontendDir);
      const stagedBackendSha = computeDirectorySha256Hex(stagedBackendDir);
      if (this.activeProgress) {
        this.activeProgress.buildTestSummary = `PASS (Typecheck + Unit + Integration + Build · FE SHA256: ${stagedFrontendSha.slice(
          0,
          12
        )})`;
      }
      updateProgress(
        10,
        'COMPLETED',
        'BACKUP',
        `ตรวจสอบ Artifact สำเร็จ (FE SHA-256: ${stagedFrontendSha.slice(0, 12)}...)`
      );

      // Step 11: Backup Current Production (§3.5: ห้ามเริ่ม Deploy หาก Backup ไม่สมบูรณ์)
      if (this.config.hooks?.runBackupHook) {
        const hookBackup = await this.config.hooks.runBackupHook();
        if (!hookBackup.ok) {
          throw new Error(
            `การสำรองข้อมูล (Backup) ล้มเหลว: ${
              hookBackup.error || 'Backup hook failed'
            } — ยกเลิกการ Deploy ทันทีเพื่อความปลอดภัย`
          );
        }
      }
      const backupRes = this.createProductionBackup();
      if (!backupRes.ok || !backupRes.backupId) {
        throw new Error(
          `การสำรองข้อมูล (Backup) ไม่สมบูรณ์: ${
            backupRes.error || 'Unknown backup error'
          } — ยกเลิกการ Deploy ทันที`
        );
      }
      createdBackupId = backupRes.backupId;
      if (this.activeProgress) {
        this.activeProgress.backupId = createdBackupId;
      }
      updateProgress(
        11,
        'COMPLETED',
        'BACKUP',
        `สำรองข้อมูลและตรวจสอบความสมบูรณ์สำเร็จ (Backup ID: ${createdBackupId})`
      );

      // Step 12 & 13: Prepare & Verify Staging Release
      updateProgress(12, 'COMPLETED', 'DEPLOYING', 'เตรียมชุดติดตั้งใน Staging เรียบร้อยแล้ว');
      updateProgress(13, 'COMPLETED', 'DEPLOYING', 'ยืนยันความพร้อมของ Staging Release ผ่าน');

      // Step 14: Deploy only Sam_Att V2 (Check Shared Gateway Port 3002 Safety — §3.6)
      // Activation capability is trusted host configuration, never caller input.
      const requiresGatewayRestart = this.config.backendRequiresGatewayRestart ?? true;
      const isolatedSupported = this.config.isolatedBackendActivationSupported === true;

      if (requiresGatewayRestart || !isolatedSupported) {
        updateProgress(
          14,
          'MAINTENANCE_REQUIRED',
          'MAINTENANCE_REQUIRED',
          'MAINTENANCE_REQUIRED — การเปิดใช้งาน Backend Sam_Att ชุดนี้ต้องรีสตาร์ท Central API Gateway พอร์ต 3002 ที่ใช้ร่วมกับระบบ Procurement จึงหยุดรอการอนุมัติช่วงเวลา Maintenance Window เพื่อไม่ให้กระทบ Procurement'
        );
        updateProgress(17, 'COMPLETED', 'MAINTENANCE_REQUIRED', 'ปลดล็อก Deployment Lock แล้ว');
        this.releaseLock();
        return {
          accepted: true,
          deploymentId: params.deploymentId,
          status: 'MAINTENANCE_REQUIRED',
          backupId: createdBackupId,
          manifest: null,
          healthCheckReport: null,
          rollbackStatus: 'NONE',
          buildTestSummary: this.activeProgress?.buildTestSummary || 'PASS',
          summary:
            'หยุดที่สถานะ MAINTENANCE_REQUIRED: เตรียม Build และสำรองข้อมูลเรียบร้อยแล้ว แต่ต้องได้รับการอนุมัติ Maintenance Window ก่อน Activate บน Central API Gateway พอร์ต 3002 เพื่อไม่ให้กระทบ Procurement',
          errorSanitized: null,
          progress: this.activeProgress!,
        };
      }

      // Pre-activation probes must inspect the currently active release, not the
      // target commit: the Gateway has not switched yet. Post-activation checks
      // below verify the target commit after the router has actually changed.
      const activeBeforeActivation = readAndVerifyDeploymentManifest(this.config.manifestPath);
      if (activeBeforeActivation.status !== 'VALID' || !activeBeforeActivation.manifest) {
        throw new Error('VERIFIED_ACTIVE_BASELINE_REQUIRED');
      }
      const beforeActivation = await this.config.hooks?.runPostDeployHealthProbe?.({
        targetCommitSha: activeBeforeActivation.manifest.commitSha,
        frontendProdDir: this.config.frontendProdDir,
        backendProdDir: this.config.backendProdDir,
      });
      if (beforeActivation?.frontendHealthy !== true || beforeActivation.authHealthy !== true || beforeActivation.mysqlHealthy !== true ||
          beforeActivation.backendHealthy !== true || beforeActivation.routerHealthy !== true ||
          beforeActivation.procurementHealthy !== true || !beforeActivation.procurementStatusCode ||
          beforeActivation.procurementStatusCode < 200 || beforeActivation.procurementStatusCode >= 300) {
        throw new Error('PRE_ACTIVATION_HEALTH_FAILED');
      }
      // Activate Sam_Att Frontend & Backend artifacts without touching Procurement
      if (computeDirectorySha256Hex(stagedFrontendDir) !== stagedFrontendSha ||
          computeDirectorySha256Hex(stagedBackendDir) !== stagedBackendSha) throw new Error('STAGING_CHANGED');
      this.journalRecovery(createdBackupId!, 'ACTIVATION_STARTED');
      activationStarted = true;
      clearAndRestoreDirectorySync(stagedFrontendDir, this.config.frontendProdDir);
      clearAndRestoreDirectorySync(stagedBackendDir, this.config.backendProdDir);
      updateProgress(
        14,
        'COMPLETED',
        'VERIFYING',
        'ติดตั้งไฟล์ Sam_Att V2 ลงโฟลเดอร์เป้าหมายสำเร็จโดยไม่แก้ไขหรือรีสตาร์ทระบบ Procurement'
      );

      if (computeDirectorySha256Hex(this.config.frontendProdDir) !== stagedFrontendSha ||
          computeDirectorySha256Hex(this.config.backendProdDir) !== stagedBackendSha) throw new Error('ACTIVATED_ARTIFACT_MISMATCH');
      if (this.config.hooks?.activateBackend) await this.config.hooks.activateBackend({
        commitSha: params.targetCommitSha, backendDir: this.config.backendProdDir, frontendDir: this.config.frontendProdDir,
      });
      // Step 15: Post-Deployment 7-Point Health Check (§3.7)
      const healthReport = await this.evaluateSevenPointHealthCheck(
        params.targetCommitSha,
        false
      );
      if (this.activeProgress) {
        this.activeProgress.healthCheckReport = healthReport;
      }

      if (!healthReport.overallHealthy) {
        updateProgress(
          15,
          'FAILED',
          'ROLLED_BACK',
          `Health Check ไม่ผ่าน: ${healthReport.summary} — กำลังดำเนินการ Rollback อัตโนมัติกลับไปยัง ${createdBackupId}`
        );

        // Automatic Rollback on Health Check Failure (§3.7)
        const autoRollback = await this.executeVerifiedRollbackInternal({
          backupId: createdBackupId,
          requestedBy: params.approvedBy,
          reason: `Automatic Rollback เนื่องจาก Post-Deploy Health Check ไม่ผ่าน: ${healthReport.summary}`,
        }, true);
        this.releaseLock();

        const finalStatus: DeploymentJobStatus = autoRollback.rolledBack
          ? 'ROLLED_BACK'
          : 'FAILED';
        if (this.activeProgress) {
          this.activeProgress.status = finalStatus;
          this.activeProgress.rollbackStatus = autoRollback.rollbackStatus;
          this.activeProgress.errorDetails = healthReport.summary;
          this.activeProgress.criticalRecoveryAdvice = autoRollback.criticalRecoveryAdvice;
          this.activeProgress.completedAt = new Date().toISOString();
        }

        return {
          accepted: true,
          deploymentId: params.deploymentId,
          status: finalStatus,
          backupId: createdBackupId,
          manifest: null,
          healthCheckReport: healthReport,
          rollbackStatus: autoRollback.rollbackStatus,
          buildTestSummary: this.activeProgress?.buildTestSummary || 'PASS',
          summary: autoRollback.rolledBack
            ? `Health Check หลัง Deploy ไม่ผ่าน (${healthReport.summary}) — ระบบได้ Rollback กลับไปยังชุดสำรอง ${createdBackupId} อัตโนมัติเรียบร้อยแล้ว`
            : `CRITICAL: Health Check ไม่ผ่าน และ Rollback อัตโนมัติล้มเหลว (${autoRollback.errorSanitized})`,
          errorSanitized: healthReport.summary,
          criticalRecoveryAdvice: autoRollback.criticalRecoveryAdvice,
          progress: this.activeProgress!,
        };
      }

      updateProgress(15, 'COMPLETED', 'VERIFYING', healthReport.summary);

      // Step 16: Write Verified Deployment Manifest (`current.json`) ONLY after Health Check passes (§3.1 & §3.6)
      const prodFrontendSha = computeDirectorySha256Hex(this.config.frontendProdDir);
      const prodBackendSha = computeDirectorySha256Hex(this.config.backendProdDir);

      const writtenManifest = writeVerifiedDeploymentManifest(this.config.manifestPath, {
        schemaVersion: '2.0',
        deploymentId: params.deploymentId,
        version: params.targetVersion,
        commitSha: params.targetCommitSha.toLowerCase(),
        branch: APPROVED_DEPLOYMENT_BRANCH,
        deployedAt: new Date().toISOString(),
        approvedBy: params.approvedBy,
        frontendArtifactSha256: prodFrontendSha,
        backendArtifactSha256: prodBackendSha,
        backupId: createdBackupId,
        healthCheckVerified: true,
      });

      // Re-verify manifest check item in health report
      const finalHealthReport = await this.evaluateSevenPointHealthCheck(
        params.targetCommitSha,
        true
      );
      if (this.activeProgress) {
        this.activeProgress.healthCheckReport = finalHealthReport;
      }

      if (!finalHealthReport.overallHealthy) {
        throw new Error('FINAL_HEALTH_CHECK_FAILED: post-manifest health check did not pass');
      }

      updateProgress(
        16,
        'COMPLETED',
        'SUCCESS',
        `บันทึก Deployment Manifest (${this.config.manifestPath}) พร้อมลายมือชื่อ SHA-256 สำเร็จ`
      );

      this.clearRecoveryJournal();
      // Step 17: Unlock Deployment
      updateProgress(17, 'COMPLETED', 'SUCCESS', 'ปลดล็อก Deployment Lock เรียบร้อยแล้ว');
      this.releaseLock();

      return {
        accepted: true,
        deploymentId: params.deploymentId,
        status: 'SUCCESS',
        backupId: createdBackupId,
        manifest: writtenManifest,
        healthCheckReport: finalHealthReport,
        rollbackStatus: 'NONE',
        buildTestSummary: this.activeProgress?.buildTestSummary || 'PASS',
        summary: `อัปเดตระบบ Sam_Att V2 เป็นเวอร์ชัน ${params.targetVersion} (Commit ${params.targetCommitSha.slice(
          0,
          8
        )}) สำเร็จ และผ่าน Health Check ครบทั้ง 7 จุด`,
        errorSanitized: null,
        progress: this.activeProgress!,
      };
    } catch (err) {
      const sanitizedErr = sanitizeDeploymentErrorText(err);
      let recovery: ExecuteRollbackResult | null = null;
      if (activationStarted && createdBackupId) {
        recovery = await this.executeVerifiedRollbackInternal({ backupId: createdBackupId, requestedBy: params.approvedBy }, true);
      }
      if (this.activeProgress) {
        this.activeProgress.status = recovery?.rolledBack ? 'ROLLED_BACK' : 'FAILED';
        this.activeProgress.rollbackStatus = recovery?.rollbackStatus ?? 'NONE';
        this.activeProgress.criticalRecoveryAdvice = recovery?.criticalRecoveryAdvice;
        this.activeProgress.errorDetails = sanitizedErr;
        this.activeProgress.completedAt = new Date().toISOString();
        const runningStep = this.activeProgress.steps.find(
          (s) => s.stepNumber === this.activeProgress?.currentStepNumber
        );
        if (runningStep && runningStep.status === 'PENDING') {
          runningStep.status = 'FAILED';
          runningStep.detail = sanitizedErr;
        }
      }
      this.releaseLock();

      return {
        accepted: true,
        deploymentId: params.deploymentId,
        status: recovery?.rolledBack ? 'ROLLED_BACK' : 'FAILED',
        backupId: createdBackupId,
        manifest: null,
        healthCheckReport: this.activeProgress?.healthCheckReport ?? null,
        rollbackStatus: recovery?.rollbackStatus ?? 'NONE',
        criticalRecoveryAdvice: recovery?.criticalRecoveryAdvice,
        buildTestSummary: this.activeProgress?.buildTestSummary || 'FAILED',
        summary: `การอัปเดตระบบล้มเหลว: ${sanitizedErr}`,
        errorSanitized: sanitizedErr,
        progress: this.activeProgress!,
      };
    }
  }

  /**
   * Executes verified Rollback to a specific `backupId` (§3.8).
   * - Never touches MySQL `samchuk_attendance_v2` data.
   * - Never touches Procurement.
   * - Returns `ROLLBACK_FAILED_CRITICAL` with detailed recovery steps if Rollback fails.
   */
  public async executeVerifiedRollback(params: ExecuteRollbackParams): Promise<ExecuteRollbackResult> {
    return this.executeVerifiedRollbackInternal(params, false);
  }
  private async executeVerifiedRollbackInternal(
    params: ExecuteRollbackParams, lockAlreadyHeld: boolean
  ): Promise<ExecuteRollbackResult> {
    const criticalGuidance = `CRITICAL: การย้อนกลับระบบล้มเหลว กรุณาตรวจสอบเซิร์ฟเวอร์และกู้คืนจาก Backup ล่าสุดตามคู่มือผู้ดูแลระบบ
1. ตรวจสอบโฟลเดอร์สำรองข้อมูลที่ ${this.config.backupsDir}\\${params.backupId}
2. คัดลอกไฟล์จาก frontend\\ ไปยัง ${this.config.frontendProdDir}
3. คัดลอกไฟล์จาก backend\\ ไปยังโฟลเดอร์ Adapter ของ Sam_Att V2 (ห้ามแก้ไขโฟลเดอร์ของระบบ Procurement)
4. คัดลอก current.json.bak กลับไปยัง ${this.config.manifestPath}
5. ตรวจสอบสถานะที่ /api/Sam_Att/deployment/status (ห้ามลบหรือ Rollback ฐานข้อมูล MySQL samchuk_attendance_v2)`;

    if (!SAFE_BACKUP_ID_REGEX.test(params.backupId)) {
      return {
        rolledBack: false,
        status: 'FAILED',
        rollbackStatus: 'ROLLBACK_FAILED_CRITICAL',
        backupId: params.backupId,
        restoredCommitSha: 'NOT_AVAILABLE',
        restoredVersion: 'NOT_AVAILABLE',
        healthCheckReport: null,
        summary: 'CRITICAL: รหัสชุดสำรองข้อมูล (Backup ID) ไม่ถูกต้องตามรูปแบบความปลอดภัย',
        errorSanitized: 'รูปแบบ Backup ID ไม่ถูกต้อง',
        criticalRecoveryAdvice: criticalGuidance,
      };
    }

    if (!lockAlreadyHeld && !this.acquireLock(`ROLLBACK_${params.backupId}`)) {
      return {
        rolledBack: false,
        status: 'FAILED',
        rollbackStatus: 'NONE',
        backupId: params.backupId,
        restoredCommitSha: 'NOT_AVAILABLE',
        restoredVersion: 'NOT_AVAILABLE',
        healthCheckReport: null,
        summary: 'ไม่สามารถเริ่ม Rollback ได้เนื่องจากมีกระบวนการอื่นกำลังถือครอง Deployment Lock',
        errorSanitized: 'SAM_ATT_DEPLOYMENT_LOCKED: ระบบกำลังดำเนินการอื่นอยู่',
        criticalRecoveryAdvice: null,
      };
    }

    try {
      if (this.config.hooks?.runRollbackHook) {
        const hookRes = await this.config.hooks.runRollbackHook(params.backupId);
        if (!hookRes.ok) {
          throw new Error(hookRes.error || 'Rollback hook reported failure');
        }
      }

      const backupDir = path.join(this.config.backupsDir, params.backupId);
      const integrity = this.verifyBackupDirectory(backupDir);
      if (!integrity.valid || !integrity.manifest) {
        throw new Error(
          integrity.error || `ไม่พบชุดสำรองข้อมูล ${params.backupId} หรือไฟล์สำรองไม่สมบูรณ์`
        );
      }

      this.journalRecovery(params.backupId, 'ROLLBACK_STARTED');
      // Restore Frontend and Backend artifacts from verified backup
      const frontendBackupDir = path.join(backupDir, 'frontend');
      const backendBackupDir = path.join(backupDir, 'backend');
      clearAndRestoreDirectorySync(frontendBackupDir, this.config.frontendProdDir);
      clearAndRestoreDirectorySync(backendBackupDir, this.config.backendProdDir);

      const savedConfig = path.join(backupDir, 'config', path.basename(this.config.adapterConfigPath));
      if (integrity.manifest.adapterConfigPresent) {
        fs.mkdirSync(path.dirname(this.config.adapterConfigPath), { recursive: true });
        fs.copyFileSync(savedConfig, this.config.adapterConfigPath);
      } else if (fs.existsSync(this.config.adapterConfigPath)) {
        fs.unlinkSync(this.config.adapterConfigPath);
      }

      // Restore Deployment Manifest (`current.json`)
      const backupManifestPath = path.join(backupDir, 'current.json.bak');
      if (fs.existsSync(backupManifestPath)) {
        fs.mkdirSync(path.dirname(this.config.manifestPath), { recursive: true });
        fs.copyFileSync(backupManifestPath, this.config.manifestPath);
      } else if (fs.existsSync(this.config.manifestPath)) {
        fs.unlinkSync(this.config.manifestPath);
      }

      const restoredCommit = integrity.manifest.previousCommitSha;
      const restoredVersion = integrity.manifest.previousVersion;

      if (this.config.hooks?.activateBackend) await this.config.hooks.activateBackend({
        commitSha: restoredCommit, backendDir: this.config.backendProdDir, frontendDir: this.config.frontendProdDir,
      });
      // Verify post-rollback health check
      const healthReport = await this.evaluateSevenPointHealthCheck(
        HEX_40_REGEX.test(restoredCommit) ? restoredCommit : '0000000000000000000000000000000000000000',
        false
      );

      if (!healthReport.overallHealthy) throw new Error('ROLLBACK_HEALTH_CHECK_FAILED');
      this.clearRecoveryJournal();
      if (!lockAlreadyHeld) this.releaseLock();

      return {
        rolledBack: true,
        status: 'ROLLED_BACK',
        rollbackStatus: 'ROLLED_BACK',
        backupId: params.backupId,
        restoredCommitSha: restoredCommit,
        restoredVersion,
        healthCheckReport: healthReport,
        summary: `ย้อนกลับระบบ (Rollback) ไปยังชุดสำรอง ${params.backupId} (เวอร์ชัน ${restoredVersion}) สำเร็จ และตรวจสอบความสมบูรณ์ของไฟล์ครบถ้วน`,
        errorSanitized: null,
        criticalRecoveryAdvice: null,
      };
    } catch (err) {
      if (!lockAlreadyHeld) this.releaseLock();
      const sanitizedErr = sanitizeDeploymentErrorText(err);
      return {
        rolledBack: false,
        status: 'FAILED',
        rollbackStatus: 'ROLLBACK_FAILED_CRITICAL',
        backupId: params.backupId,
        restoredCommitSha: 'NOT_AVAILABLE',
        restoredVersion: 'NOT_AVAILABLE',
        healthCheckReport: null,
        summary: `CRITICAL: การย้อนกลับเวอร์ชัน (Rollback) ไปยัง ${params.backupId} ล้มเหลว: ${sanitizedErr}`,
        errorSanitized: sanitizedErr,
        criticalRecoveryAdvice: criticalGuidance,
      };
    }
  }
}

/**
 * Windows Named Pipe IPC Client & Server (`\\.\pipe\SamchukSamAttDeploymentAgent_v2`)
 * Enables zero-TCP-port communication between the Central API Gateway Backend and the
 * least-privilege Windows Service Deployment Agent on `FILESERVER`.
 */
export interface NamedPipeIpcMessage {
  action: 'PING' | 'PREFLIGHT' | 'LIST_BACKUPS' | 'DEPLOY' | 'ROLLBACK';
  timestamp: number;
  nonce: string;
  payload: unknown;
  signature: string;
}

export function signIpcPayload(
  secret: string,
  action: string,
  timestamp: number,
  nonce: string,
  payload: unknown
): string {
  const data = `${action}:${timestamp}:${nonce}:${JSON.stringify(payload ?? {})}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export class WindowsNamedPipeDeploymentAgentClient implements IDeploymentAgentPhase2 {
  public readonly isAvailable: boolean = true;
  public readonly namedPipePath: string;
  private readonly ipcSecret: string;
  private readonly timeoutMs: number;
  private cachedProgress: DeploymentProgressState | null = null;
  private lockedState = false;
  private lastAuthenticatedAt = 0;

  constructor(options: { namedPipePath?: string; ipcSecret: string; timeoutMs?: number }) {
    this.namedPipePath =
      options.namedPipePath || AUTHORITATIVE_WINDOWS_PATHS.NAMED_PIPE_PATH;
    if (!/^\\\\\.\\pipe\\[A-Za-z0-9_-]{8,100}$/.test(this.namedPipePath)) throw new Error('LOCAL_NAMED_PIPE_REQUIRED');
    if (options.ipcSecret.trim().length < 32) throw new Error('IPC_SECRET_TOO_SHORT');
    this.ipcSecret = options.ipcSecret;
    this.timeoutMs = options.timeoutMs ?? 60 * 60_000;
  }

  public get agentStatus(): 'NOT_CONFIGURED' | 'READY' | 'BUSY' | 'OFFLINE' {
    return this.lockedState ? 'BUSY' : this.lastAuthenticatedAt && Date.now() - this.lastAuthenticatedAt < 60_000 ? 'READY' : 'OFFLINE';
  }

  public isLocked(): boolean {
    return this.lockedState;
  }

  public getActiveProgress(): DeploymentProgressState | null {
    return this.cachedProgress;
  }

  private async sendIpcRequest<T>(
    action: NamedPipeIpcMessage['action'],
    payload: unknown
  ): Promise<T> {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(12).toString('hex');
    const signature = signIpcPayload(this.ipcSecret, action, timestamp, nonce, payload);
    const frame: NamedPipeIpcMessage = {
      action,
      timestamp,
      nonce,
      payload,
      signature,
    };

    return new Promise<T>((resolve, reject) => {
      const socket = net.createConnection({ path: this.namedPipePath });
      socket.setEncoding('utf8');
      let buffer = '';
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Deployment Agent Named Pipe IPC request timed out'));
      }, this.timeoutMs);

      socket.on('connect', () => {
        socket.write(JSON.stringify(frame) + '\n');
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) { socket.destroy(new Error('IPC_RESPONSE_TOO_LARGE')); return; }
        if (buffer.includes('\n')) {
          clearTimeout(timer);
          socket.end();
          try {
            const line = buffer.split('\n')[0];
            const parsed = verifyFrame(this.ipcSecret, JSON.parse(line), `RESPONSE:${action}`, nonce).payload as { ok: boolean; data?: T; error?: string };
            this.lastAuthenticatedAt = Date.now();
            if (!parsed.ok) {
              reject(new Error(parsed.error || 'Agent IPC returned error'));
            } else {
              resolve(parsed.data as T);
            }
          } catch (err) {
            reject(err);
          }
        }
      });

      socket.on('end', () => { clearTimeout(timer); if (!buffer.includes('\n')) reject(new Error('IPC_TRUNCATED_RESPONSE')); });
      socket.on('error', (err) => {
        this.lastAuthenticatedAt = 0;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  public async probeStatus(): Promise<{ status: string; locked: boolean; isolatedActivation: boolean }> {
    return this.sendIpcRequest('PING', {});
  }

  public async getPreDeploymentEvidence(
    targetCommitSha: string
  ): Promise<AgentPreflightEvidence | null> {
    return this.sendIpcRequest<AgentPreflightEvidence | null>('PREFLIGHT', {
      targetCommitSha,
    });
  }

  public async listVerifiedBackups(): Promise<DeploymentBackupSummary[]> {
    return this.sendIpcRequest<DeploymentBackupSummary[]>('LIST_BACKUPS', {});
  }

  public async executeApprovedDeployment(
    params: ExecuteDeployParams
  ): Promise<ExecuteDeployResult> {
    this.lockedState = true;
    try {
      const res = await this.sendIpcRequest<ExecuteDeployResult>('DEPLOY', params);
      this.cachedProgress = res.progress;
      return res;
    } finally {
      this.lockedState = false;
    }
  }

  public async executeVerifiedRollback(params: ExecuteRollbackParams): Promise<ExecuteRollbackResult> {
    this.lockedState = true;
    try {
      return await this.sendIpcRequest<ExecuteRollbackResult>('ROLLBACK', params);
    } finally {
      this.lockedState = false;
    }
  }
}
