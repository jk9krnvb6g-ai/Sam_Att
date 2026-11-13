import { APPROVED_DEPLOYMENT_BRANCH } from '../deployment/sourcePolicy';
/**
 * Sam_Att V2 — Deployment Center Service & Phase 2 Secure Deployment Management
 *
 * SECURITY & EVIDENCE-BASED GUARANTEES (§1–§7):
 * 1. Cryptographically Verified Deployment Manifest (`current.json`):
 *    - Reads `C:\ProgramData\SamchukHospital\Deployments\Sam_Att\current.json` (or configured manifest path).
 *    - Never guesses a Commit SHA if `current.json` is missing (displays `NOT AVAILABLE`).
 *    - Never uses Latest GitHub Commit SHA as Current Server Version automatically.
 *    - Never writes `current.json` before Deploy AND 7-Point Health Check succeed.
 *    - Detects corrupted or tampered manifests as `INVALID_MANIFEST` (`ERROR`).
 * 2. Zero False PASS Policy:
 *    - Never returns `PASS` from hardcoded values, assumptions, mere file existence (`package.json`,
 *      `node_modules`, `dist/index.html`), or unverified environment variables (`SAM_ATT_LAST_TEST_STATUS=PASS`,
 *      `SAM_ATT_BACKUP_VERIFIED=true`, `SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true`, `SAM_ATT_GITHUB_LATEST_SHA`).
 *    - Every `PASS` requires live, traceable verification evidence bound to `commitSha` and `verifiedAt`.
 *    - Procurement Health Check strictly rejects HTTP 404 as `FAIL` (never `PASS`).
 * 3. Secure Deployment Agent (Windows Named Pipe IPC):
 *    - Communicates over internal IPC without opening any new TCP port or HTTP listener.
 *    - Enforces Concurrent Deployment Lock (`HTTP 409 Conflict`), ADMIN RBAC (`HTTP 403`),
 *      ADMIN password re-authentication (`HTTP 401`), and Preflight Gate (`HTTP 412`).
 *    - Rejects any request attempting to pass shell commands, scripts, arbitrary Git URLs, or file paths (`HTTP 400`).
 * 4. Accurate Deployment History:
 *    - Never records "Check for Updates" or "Preflight Check" as a Deployment `SUCCESS`.
 */

import fs from 'fs';
import path from 'path';
import { ISamAttRepository } from '../repositories/interfaces';
import {
  ChecklistItemStatus,
  DeploymentBackupSummary,
  DeploymentJobStatus,
  DeploymentProgressState,
  PostDeployHealthCheckReport,
  PreflightCheckEvidence,
  RollbackExecutionStatus,
  VersionComparisonStatus,
} from '../../src/types/deploymentCenter';
import {
  AUTHORITATIVE_WINDOWS_PATHS,
  ExecuteDeployResult,
  ExecuteRollbackResult,
  IDeploymentAgentPhase2,
  readAndVerifyDeploymentManifest,
  sanitizeDeploymentErrorText,
  WindowsNamedPipeDeploymentAgentClient,
} from './deploymentAgentService';

export const AUTHORITATIVE_GITHUB_REPO_URL = 'https://github.com/jk9krnvb6g-ai/Sam_Att';
export const AUTHORITATIVE_GITHUB_COMMITS_API =
  `https://api.github.com/repos/jk9krnvb6g-ai/Sam_Att/commits/${encodeURIComponent(APPROVED_DEPLOYMENT_BRANCH)}`;
export const AUTHORITATIVE_PRODUCTION_DATABASE_NAME = 'samchuk_attendance_v2';

export type { ChecklistItemStatus };

export interface DeploymentChecklistItem {
  id:
    | 'github_source'
    | 'dependencies'
    | 'build'
    | 'automated_tests'
    | 'backup'
    | 'database_config'
    | 'central_gateway'
    | 'procurement_health';
  stepNumber: number;
  label: string;
  description: string;
  status: ChecklistItemStatus;
  detail: string;
  checkedAt: string | null;
  evidence?: PreflightCheckEvidence;
}

export interface VersionInfo {
  version: string;
  commitSha: string;
  date: string;
  commitMessage?: string;
  branch?: string;
  available: boolean;
  source:
    | 'DEPLOYMENT_MANIFEST'
    | 'ENVIRONMENT_METADATA'
    | 'GITHUB_API'
    | 'NOT_CONFIGURED'
    | 'NOT_AVAILABLE'
    | 'INVALID_MANIFEST'
    | 'ERROR'
    | 'DEMO_DATA';
  manifestPath?: string;
  manifestValid?: boolean;
  manifestError?: string | null;
  backupId?: string | null;
  frontendArtifactSha256?: string | null;
  backendArtifactSha256?: string | null;
}

export interface DeploymentHistoryRecord {
  id: string;
  deploymentId: string;
  deployedAt: string;
  version: string;
  commitSha: string;
  versionOrCommit: string;
  actor: string;
  actorName: string;
  actorUsername: string;
  actorFullName: string;
  approvedBy: string;
  buildTestResult: string;
  backupId: string | null;
  status: DeploymentJobStatus;
  healthCheckResult: string;
  rollbackStatus: RollbackExecutionStatus;
  summary: string;
  errorSanitized: string | null;
  criticalRecoveryAdvice?: string | null;
  isDemoData?: boolean;
}

export interface DeploymentReadinessSummary {
  readyToDeploy: boolean;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  notCheckedCount: number;
  totalCount: number;
  readinessStatus:
    | 'READY_TO_DEPLOY'
    | 'NOT_READY'
    | 'CHECKS_INCOMPLETE'
    | 'FAILED_CHECKS'
    | 'AGENT_NOT_CONFIGURED'
    | 'UP_TO_DATE';
  readinessMessage: string;
  targetCommitSha?: string | null;
}

export interface DeploymentCenterStatusPayload {
  success: boolean;
  phase: 'PHASE_1_READ_ONLY' | 'PHASE_2_AGENT_MANAGED';
  isDemoData: boolean;
  checkedAt: string;
  systemStatus: {
    samAttStatus: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
    samAttStatusText: string;
    samAttFrontendPort: number;
    samAttFrontendPath: string;
    backendApiStatus: 'ONLINE' | 'UNAVAILABLE';
    backendApiMount: string;
    backendGatewayPort: number;
    backendGatewayPath: string;
    databaseName: string;
    databaseHealthy: boolean;
    githubConnectionStatus:
      | 'CONNECTED'
      | 'NOT_CONFIGURED'
      | 'NOT_AVAILABLE'
      | 'NOT_CHECKED'
      | 'ERROR';
    githubRepositoryUrl: string;
    lastDeployedAt: string;
    isolatedDatabase: string;
    repositoryMode: string;
  };
  currentVersion: {
    version: string;
    commitSha: string;
    deploymentDate: string;
    configured: boolean;
    source: string;
    manifestPath?: string;
    manifestValid?: boolean;
    manifestError?: string | null;
    backupId?: string | null;
    frontendArtifactSha256?: string | null;
    backendArtifactSha256?: string | null;
  };
  latestGitHubVersion: {
    repositoryUrl: string;
    version: string;
    commitSha: string;
    latestCommitDate: string;
    commitMessage?: string;
    branch: string;
    reachable: boolean;
    configured: boolean;
    message: string;
  };
  versionComparison: {
    status: VersionComparisonStatus;
    statusLabel: string;
    summary: string;
    currentServer: VersionInfo;
    latestGitHub: VersionInfo;
    comparisonStatus: VersionComparisonStatus;
    comparisonMessage: string;
  };
  checklist: DeploymentChecklistItem[];
  deploymentReadiness: DeploymentReadinessSummary;
  deploymentAgent: {
    phase2AgentAvailable: boolean;
    approveEnabled: boolean;
    rollbackEnabled: boolean;
    lockReason: string;
    agentAvailable: boolean;
    agentStatus: 'NOT_CONFIGURED' | 'READY' | 'BUSY' | 'OFFLINE';
    ipcTransport: string;
    namedPipePath: string;
    canApproveDeploy: boolean;
    canRollback: boolean;
    verifiedBackupAvailable: boolean;
    activeDeploymentLock: boolean;
    statusMessage: string;
  };
  activeProgress: DeploymentProgressState | null;
  availableBackups: DeploymentBackupSummary[];
  historyStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_CONFIGURED';
  history: DeploymentHistoryRecord[];
  lastCheckedAt: string;
}

export interface DeploymentAgentRequest {
  requestId: string;
  targetCommitSha: string;
  requestedByUserId: string;
  requestedByUsername: string;
  requestedAt: string;
  maintenanceWindowVerified: boolean;
}

export interface IDeploymentAgent {
  readonly isAvailable: boolean;
  submitAuthorizedDeploymentRequest(
    request: DeploymentAgentRequest
  ): Promise<{ accepted: boolean; jobId?: string; reason: string }>;
  verifyGitCommit(commitSha: string): Promise<{ valid: boolean; reason: string }>;
  runBuildAndAutomatedTests(
    commitSha: string
  ): Promise<{ buildPassed: boolean; testsPassed: boolean; summary: string }>;
  backupCurrentVersion(): Promise<{ backupId: string; createdAt: string; verified: boolean }>;
  deploySamAttV2Only(commitSha: string): Promise<{ deployed: boolean; summary: string }>;
  restartGatewayInMaintenanceWindowIfNeeded(params: {
    backendChanged: boolean;
    inMaintenanceWindow: boolean;
  }): Promise<{ restarted: boolean; reason: string }>;
  verifyPostDeploymentHealth(): Promise<{
    samAttHealthy: boolean;
    procurementHealthy: boolean;
  }>;
  rollbackToBackup(backupId: string): Promise<{ rolledBack: boolean; summary: string }>;
  recordDeploymentHistory(entry: DeploymentHistoryRecord): Promise<void>;
}

const FORBIDDEN_PAYLOAD_KEYS = [
  'command',
  'cmd',
  'shell',
  'powershell',
  'script',
  'exec',
  'gitUrl',
  'repoUrl',
  'filePath',
  'targetPath',
  'workingDir',
];

const HEX_COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

export type CustomGitHubCommitFetcher = () => Promise<{
  ok: boolean;
  status: number;
  data?: {
    sha?: string;
    commit?: {
      message?: string;
      committer?: { date?: string };
      author?: { date?: string };
    };
  };
  error?: string;
}>;

export class DeploymentCenterService {
  private static cachedGitHubVersion: VersionInfo | null = null;
  private static lastPreflightChecklist: DeploymentChecklistItem[] | null = null;
  private static configuredPhase2Agent: IDeploymentAgentPhase2 | null = null;
  private static customManifestPath: string | null = null;
  private static customHistoryFilePath: string | null = null;
  private static customGitHubFetcher: CustomGitHubCommitFetcher | null = null;
  private static inMemoryHistoryRecords: DeploymentHistoryRecord[] = [];

  public static resetStateForTests(): void {
    this.cachedGitHubVersion = null;
    this.lastPreflightChecklist = null;
    this.configuredPhase2Agent = null;
    this.customManifestPath = null;
    this.customHistoryFilePath = null;
    this.customGitHubFetcher = null;
    this.inMemoryHistoryRecords = [];
  }

  /**
   * Configures the Phase 2 Secure Deployment Agent & Manifest path for either
   * Production Named Pipe IPC or isolated Staging/Simulation verification.
   */
  public static configurePhase2Environment(options: {
    agent?: IDeploymentAgentPhase2 | null;
    manifestPath?: string | null;
    historyFilePath?: string | null;
    gitHubFetcher?: CustomGitHubCommitFetcher | null;
  }): void {
    if (options.agent !== undefined) {
      this.configuredPhase2Agent = options.agent;
    }
    if (options.manifestPath !== undefined) {
      this.customManifestPath = options.manifestPath;
    }
    if (options.historyFilePath !== undefined) {
      this.customHistoryFilePath = options.historyFilePath;
    }
    if (options.gitHubFetcher !== undefined) {
      this.customGitHubFetcher = options.gitHubFetcher;
    }
  }

  public static getActiveAgent(): IDeploymentAgentPhase2 | null {
    if (this.configuredPhase2Agent) {
      return this.configuredPhase2Agent;
    }
    const ipcSecret = (process.env.SAM_ATT_AGENT_IPC_SECRET || '').trim();
    const pipeEnabled =
      (process.env.SAM_ATT_ENABLE_NAMED_PIPE_AGENT || '').trim().toLowerCase() === 'true';
    if (pipeEnabled && ipcSecret.length >= 32) {
      this.configuredPhase2Agent = new WindowsNamedPipeDeploymentAgentClient({
        namedPipePath:
          process.env.SAM_ATT_AGENT_NAMED_PIPE?.trim() ||
          AUTHORITATIVE_WINDOWS_PATHS.NAMED_PIPE_PATH,
        ipcSecret,
      });
      return this.configuredPhase2Agent;
    }
    return null;
  }

  public static getEffectiveManifestPath(): string {
    if (this.customManifestPath) {
      return this.customManifestPath;
    }
    const envPath = (process.env.SAM_ATT_DEPLOYMENT_MANIFEST_PATH || '').trim();
    if (envPath) {
      return envPath;
    }
    return AUTHORITATIVE_WINDOWS_PATHS.MANIFEST_FILE;
  }

  /**
   * Security Guard (§3 & §5): Reject any payload attempting to pass OS commands, scripts, URLs, or file paths.
   */
  public static validateSafeRequestPayload(body: unknown): {
    valid: boolean;
    error?: string;
  } {
    if (!body || typeof body !== 'object') {
      return { valid: true };
    }
    const record = body as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_PAYLOAD_KEYS.includes(key)) {
        return {
          valid: false,
          error: `Security Violation: ไม่อนุญาตให้ส่งพารามิเตอร์ "${key}" (ห้ามส่งคำสั่ง Shell, PowerShell Script, Git URL หรือ File Path จาก Browser ตามข้อกำหนดความปลอดภัย)`,
        };
      }
    }
    return { valid: true };
  }

  /**
   * Read Current Server Version (§3.1):
   * 1. First checks the cryptographically verified Deployment Manifest (`current.json`).
   * 2. If `current.json` exists and is corrupted/invalid, returns `INVALID_MANIFEST` (`available: false`).
   * 3. If `current.json` does not exist, checks explicit `SAM_ATT_DEPLOYED_COMMIT_SHA` metadata if present.
   * 4. Otherwise returns `NOT CONFIGURED` / `NOT AVAILABLE` without guessing any commit SHA.
   */
  public static getCurrentServerVersion(): VersionInfo {
    const manifestPath = this.getEffectiveManifestPath();
    const manifestResult = readAndVerifyDeploymentManifest(manifestPath);

    if (manifestResult.status === 'VALID' && manifestResult.manifest) {
      const m = manifestResult.manifest;
      return {
        version: m.version,
        commitSha: m.commitSha,
        date: m.deployedAt,
        branch: m.branch || 'main',
        available: true,
        source: 'DEPLOYMENT_MANIFEST',
        manifestPath,
        manifestValid: true,
        manifestError: null,
        backupId: m.backupId,
        frontendArtifactSha256: m.frontendArtifactSha256,
        backendArtifactSha256: m.backendArtifactSha256,
      };
    }

    if (manifestResult.status === 'INVALID_MANIFEST') {
      return {
        version: 'INVALID MANIFEST',
        commitSha: 'NOT AVAILABLE',
        date: 'NOT AVAILABLE',
        branch: APPROVED_DEPLOYMENT_BRANCH,
        available: false,
        source: 'INVALID_MANIFEST',
        manifestPath,
        manifestValid: false,
        manifestError: manifestResult.error,
      };
    }

    const envVersion = (process.env.SAM_ATT_DEPLOYED_VERSION || '').trim();
    const envCommit = (process.env.SAM_ATT_DEPLOYED_COMMIT_SHA || '').trim();
    const envDate = (process.env.SAM_ATT_DEPLOYED_AT || '').trim();

    if (envVersion || envCommit) {
      const validSha = Boolean(envCommit && HEX_COMMIT_SHA_REGEX.test(envCommit));
      return {
        version: envVersion || (validSha ? `commit-${envCommit.slice(0, 8)}` : 'NOT CONFIGURED'),
        commitSha: validSha ? envCommit : 'NOT AVAILABLE',
        date: envDate || 'NOT AVAILABLE',
        branch: APPROVED_DEPLOYMENT_BRANCH,
        available: validSha,
        source: 'ENVIRONMENT_METADATA',
        manifestPath,
        manifestValid: false,
        manifestError: null,
      };
    }

    return {
      version: 'NOT CONFIGURED',
      commitSha: 'NOT AVAILABLE',
      date: 'NOT AVAILABLE',
      branch: APPROVED_DEPLOYMENT_BRANCH,
      available: false,
      source: 'NOT_CONFIGURED',
      manifestPath,
      manifestValid: false,
      manifestError: null,
    };
  }

  /**
   * Check 1 Evidence Helper: Fetch Latest GitHub Version strictly from the real GitHub REST API (§3.1).
   * - Never trusts `SAM_ATT_GITHUB_LATEST_SHA` environment variable to fake a PASS.
   * - Never fabricates a version or commit SHA if GitHub API is unreachable or fails.
   */
  public static async fetchLatestGitHubVersion(forceRefresh = false): Promise<{
    githubStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'NOT_CHECKED' | 'ERROR';
    versionInfo: VersionInfo;
    errorDetail?: string;
  }> {
    if (!forceRefresh && this.cachedGitHubVersion) {
      return {
        githubStatus:
          this.cachedGitHubVersion.available &&
          this.cachedGitHubVersion.source === 'GITHUB_API'
            ? 'CONNECTED'
            : 'NOT_AVAILABLE',
        versionInfo: this.cachedGitHubVersion,
      };
    }

    if (!forceRefresh) {
      return {
        githubStatus: 'NOT_CHECKED',
        versionInfo: {
          version: 'NOT CHECKED',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
          commitMessage: 'ยังไม่ได้กดตรวจสอบจาก GitHub API',
          branch: APPROVED_DEPLOYMENT_BRANCH,
          available: false,
          source: 'NOT_CONFIGURED',
        },
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      let ok = false;
      let status = 0;
      let data: {
        sha?: string;
        commit?: {
          message?: string;
          committer?: { date?: string };
          author?: { date?: string };
        };
      } | null = null;

      if (this.customGitHubFetcher) {
        const customRes = await this.customGitHubFetcher();
        if (!customRes.ok) {
          const unavailable: VersionInfo = {
            version: 'NOT AVAILABLE',
            commitSha: 'NOT AVAILABLE',
            date: 'NOT AVAILABLE',
            commitMessage: customRes.error || `GitHub API HTTP ${customRes.status}`,
            branch: APPROVED_DEPLOYMENT_BRANCH,
            available: false,
            source: 'NOT_AVAILABLE',
          };
          this.cachedGitHubVersion = unavailable;
          return {
            githubStatus: 'NOT_AVAILABLE',
            versionInfo: unavailable,
            errorDetail: customRes.error || `GitHub API ตอบกลับด้วยสถานะ HTTP ${customRes.status}`,
          };
        }
        ok = true;
        status = customRes.status;
        data = customRes.data ?? null;
      } else {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Samchuk-Hospital-SamAttV2-DeploymentCenter',
        };
        const ghToken = (process.env.SAM_ATT_GITHUB_TOKEN || '').trim();
        if (ghToken) {
          headers.Authorization = `Bearer ${ghToken}`;
        }

        const res = await fetch(AUTHORITATIVE_GITHUB_COMMITS_API, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        ok = res.ok;
        status = res.status;
        if (ok) {
          data = (await res.json()) as {
            sha?: string;
            commit?: {
              message?: string;
              committer?: { date?: string };
              author?: { date?: string };
            };
          };
        }
      }

      if (!ok || !data) {
        const unavailable: VersionInfo = {
          version: 'NOT AVAILABLE',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
          commitMessage: `GitHub API HTTP ${status}`,
          branch: APPROVED_DEPLOYMENT_BRANCH,
          available: false,
          source: 'NOT_AVAILABLE',
        };
        this.cachedGitHubVersion = unavailable;
        return {
          githubStatus: 'NOT_AVAILABLE',
          versionInfo: unavailable,
          errorDetail: `GitHub API ตอบกลับด้วยสถานะ HTTP ${status}`,
        };
      }

      const sha = typeof data?.sha === 'string' ? data.sha.trim() : '';
      const rawDate =
        data?.commit?.committer?.date || data?.commit?.author?.date || '';
      const formattedDate = rawDate
        ? rawDate.replace('T', ' ').slice(0, 19)
        : 'NOT AVAILABLE';
      const rawCommitMsg =
        typeof data?.commit?.message === 'string'
          ? data.commit.message.split('\n')[0].trim()
          : '';

      if (!HEX_COMMIT_SHA_REGEX.test(sha)) {
        const unavailable: VersionInfo = {
          version: 'NOT AVAILABLE',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
          commitMessage: 'Invalid Commit SHA from GitHub API',
          branch: APPROVED_DEPLOYMENT_BRANCH,
          available: false,
          source: 'NOT_AVAILABLE',
        };
        this.cachedGitHubVersion = unavailable;
        return {
          githubStatus: 'NOT_AVAILABLE',
          versionInfo: unavailable,
          errorDetail: 'GitHub API ไม่ได้ส่งค่า Commit SHA 40 หลักที่ถูกต้องกลับมา',
        };
      }

      const connectedInfo: VersionInfo = {
        version: `${APPROVED_DEPLOYMENT_BRANCH}@${sha.slice(0, 8)}`,
        commitSha: sha,
        date: formattedDate,
        commitMessage: rawCommitMsg || `Commit ${sha.slice(0, 8)} on branch ${APPROVED_DEPLOYMENT_BRANCH}`,
        branch: APPROVED_DEPLOYMENT_BRANCH,
        available: true,
        source: 'GITHUB_API',
      };
      this.cachedGitHubVersion = connectedInfo;
      return {
        githubStatus: 'CONNECTED',
        versionInfo: connectedInfo,
      };
    } catch (err) {
      const sanitized = sanitizeDeploymentErrorText(err);
      const unavailable: VersionInfo = {
        version: 'NOT AVAILABLE',
        commitSha: 'NOT AVAILABLE',
        date: 'NOT AVAILABLE',
        commitMessage: sanitized,
        branch: APPROVED_DEPLOYMENT_BRANCH,
        available: false,
        source: 'NOT_AVAILABLE',
      };
      this.cachedGitHubVersion = unavailable;
      return {
        githubStatus: 'NOT_AVAILABLE',
        versionInfo: unavailable,
        errorDetail: sanitized || 'ไม่สามารถเชื่อมต่อ GitHub API ได้',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Compare Current Server Version vs Latest GitHub Version honestly (§3.1).
   * Supports: `UP_TO_DATE`, `UPDATE_AVAILABLE`, `NOT_AVAILABLE`, `ERROR`.
   */
  public static compareVersions(
    current: VersionInfo,
    latest: VersionInfo
  ): {
    comparisonStatus: VersionComparisonStatus;
    comparisonMessage: string;
  } {
    if (current.source === 'INVALID_MANIFEST') {
      return {
        comparisonStatus: 'ERROR',
        comparisonMessage:
          current.manifestError ||
          'ERROR — ไฟล์ Deployment Manifest (current.json) เสียหายหรือไม่ผ่านการตรวจสอบลายมือชื่อ SHA-256',
      };
    }

    if (latest.source === 'ERROR') {
      return {
        comparisonStatus: 'ERROR',
        comparisonMessage:
          'ERROR — เกิดข้อผิดพลาดในการตรวจสอบเวอร์ชันจาก GitHub API',
      };
    }

    if (!current.available || !latest.available) {
      return {
        comparisonStatus: 'NOT_AVAILABLE',
        comparisonMessage:
          'NOT AVAILABLE — ยังไม่มีข้อมูล Commit SHA ที่ยืนยันได้ครบทั้งสองฝั่งสำหรับเปรียบเทียบเวอร์ชันอัตโนมัติ (กรุณากด "ตรวจสอบอัปเดต" หรือตรวจสอบไฟล์ Deployment Manifest current.json)',
      };
    }

    const normCurrent = current.commitSha.toLowerCase().trim();
    const normLatest = latest.commitSha.toLowerCase().trim();

    if (
      normCurrent === normLatest ||
      normLatest.startsWith(normCurrent) ||
      normCurrent.startsWith(normLatest)
    ) {
      return {
        comparisonStatus: 'UP_TO_DATE',
        comparisonMessage: `เวอร์ชันบนเซิร์ฟเวอร์ตรงกับ Commit ล่าสุดบน GitHub แล้ว (${normCurrent.slice(0, 8)})`,
      };
    }

    return {
      comparisonStatus: 'UPDATE_AVAILABLE',
      comparisonMessage: `พบ Commit ใหม่บน GitHub (${normLatest.slice(0, 8)}) แตกต่างจากเวอร์ชันปัจจุบันบนเซิร์ฟเวอร์ (${normCurrent.slice(0, 8)})`,
    };
  }

  /**
   * Compute overall deployment readiness summary from the 8 checklist items and Phase 2 Agent state (§3.3 & §4).
   */
  public static computeReadinessSummary(
    checklist: DeploymentChecklistItem[],
    options?: {
      agent?: IDeploymentAgentPhase2 | null;
      currentVersion?: VersionInfo;
      latestGitHub?: VersionInfo;
    }
  ): DeploymentReadinessSummary {
    const passedCount = checklist.filter((i) => i.status === 'PASS').length;
    const failedCount = checklist.filter((i) => i.status === 'FAIL').length;
    const warningCount = checklist.filter((i) => i.status === 'WARNING').length;
    const notCheckedCount = checklist.filter(
      (i) => i.status === 'NOT_CHECKED' || i.status === 'NOT_AVAILABLE'
    ).length;
    const totalCount = checklist.length;

    const agent = options?.agent ?? this.getActiveAgent();
    const currentVersion = options?.currentVersion;
    const latestGitHub = options?.latestGitHub;

    if (currentVersion?.source === 'INVALID_MANIFEST') {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount: failedCount + 1,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'FAILED_CHECKS',
        readinessMessage: `ยังไม่พร้อม Deploy — ตรวจพบไฟล์ Deployment Manifest (current.json) ไม่ถูกต้อง (${
          currentVersion.manifestError || 'INVALID_MANIFEST'
        })`,
        targetCommitSha: null,
      };
    }

    if (failedCount > 0) {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'FAILED_CHECKS',
        readinessMessage: `ยังไม่พร้อม Deploy — พบรายการที่ไม่ผ่านการตรวจสอบ (${failedCount} รายการ FAIL, ${notCheckedCount} รายการ NOT CHECKED)`,
        targetCommitSha: latestGitHub?.available ? latestGitHub.commitSha : null,
      };
    }

    if (notCheckedCount > 0 || warningCount > 0) {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'CHECKS_INCOMPLETE',
        readinessMessage: `ยังไม่พร้อม Deploy — มีรายการที่ยังไม่ได้ตรวจสอบหรือไม่มีหลักฐานยืนยัน (${notCheckedCount} รายการ NOT CHECKED, ${warningCount} รายการ WARNING)`,
        targetCommitSha: latestGitHub?.available ? latestGitHub.commitSha : null,
      };
    }

    if (!agent || !agent.isAvailable || agent.agentStatus === 'NOT_CONFIGURED') {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'NOT_READY',
        readinessMessage:
          'NOT CONFIGURED — รายการตรวจสอบผ่านแต่ยังไม่ได้เปิดใช้งาน Secure Deployment Agent บน FILESERVER',
        targetCommitSha: latestGitHub?.available ? latestGitHub.commitSha : null,
      };
    }

    if (agent.isLocked() || agent.agentStatus === 'BUSY') {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'NOT_READY',
        readinessMessage:
          'BUSY — ระบบกำลังดำเนินการ Deploy หรือ Rollback อยู่ (Deployment Lock Active)',
        targetCommitSha: latestGitHub?.available ? latestGitHub.commitSha : null,
      };
    }

    const verifiedCommitSha =
      checklist.find((c) => c.id === 'github_source')?.evidence?.commitSha ||
      (latestGitHub?.available ? latestGitHub.commitSha : null);

    const allEvidenceBoundToSameCommit =
      Boolean(verifiedCommitSha && HEX_COMMIT_SHA_REGEX.test(verifiedCommitSha)) &&
      checklist.every(
        (c) =>
          c.status === 'PASS' &&
          (!c.evidence?.commitSha ||
            c.evidence.commitSha.toLowerCase() === verifiedCommitSha!.toLowerCase())
      );

    if (!allEvidenceBoundToSameCommit) {
      return {
        readyToDeploy: false,
        passedCount,
        failedCount,
        warningCount,
        notCheckedCount,
        totalCount,
        readinessStatus: 'NOT_READY',
        readinessMessage:
          'ยังไม่พร้อม Deploy — หลักฐานผลการตรวจสอบ Preflight ยังไม่ผูกกับ Commit SHA เดียวกันครบทุกรายการ',
        targetCommitSha: verifiedCommitSha,
      };
    }

    return {
      readyToDeploy: true,
      passedCount,
      failedCount,
      warningCount,
      notCheckedCount,
      totalCount,
      readinessStatus: 'READY_TO_DEPLOY',
      readinessMessage: `พร้อมสำหรับการอนุมัติ Deploy (ผ่านการตรวจสอบครบทั้ง ${totalCount}/${totalCount} รายการ สำหรับ Commit ${verifiedCommitSha!.slice(
        0,
        8
      )})`,
      targetCommitSha: verifiedCommitSha,
    };
  }

  /**
   * Evaluate the 8-item Pre-Deployment Checklist strictly from real evidence (§3.3).
   * Zero False PASS Policy:
   * - Never hardcodes PASS.
   * - Never returns PASS from mere file existence (`package.json`, `node_modules`, `dist/index.html`).
   * - Never returns PASS from unverified environment variables (`SAM_ATT_LAST_TEST_STATUS=PASS`,
   *   `SAM_ATT_BACKUP_VERIFIED=true`, `SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true`).
   * - Never treats HTTP 404 on Procurement Health Check as PASS.
   */
  public static async evaluateChecklist(
    repo: ISamAttRepository,
    executeLivePreflight: boolean
  ): Promise<DeploymentChecklistItem[]> {
    if (!executeLivePreflight && this.lastPreflightChecklist) {
      return this.lastPreflightChecklist;
    }

    const nowStr = new Date().toISOString();

    if (!executeLivePreflight) {
      return [
        {
          id: 'github_source',
          stepNumber: 1,
          label: '1. GitHub Source และ Commit ตรวจสอบผ่าน',
          description: `ตรวจสอบการเข้าถึง Repository ${AUTHORITATIVE_GITHUB_REPO_URL} และ Commit SHA จาก GitHub API จริง`,
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้เรียกตรวจสอบ GitHub API จริง (กรุณากดปุ่ม "ตรวจสอบความพร้อม (Preflight Check)")',
          checkedAt: null,
        },
        {
          id: 'dependencies',
          stepNumber: 2,
          label: '2. Dependencies พร้อม',
          description: 'ตรวจสอบความถูกต้องของ Dependencies จากหลักฐานกระบวนการ Build/Test ที่เชื่อถือได้',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้ตรวจสอบหลักฐานความถูกต้องของ Dependencies (การมี package.json และ node_modules เพียงอย่างเดียวไม่เพียงพอ)',
          checkedAt: null,
        },
        {
          id: 'build',
          stepNumber: 3,
          label: '3. Build ผ่าน',
          description: 'ตรวจสอบหลักฐานว่า Production Build สำเร็จและ Artifact ตรงกับ Commit SHA ที่ตรวจสอบ',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้ตรวจสอบหลักฐาน Production Build ที่ผูกกับ Commit SHA (ห้ามสรุป PASS จากการมีไฟล์ dist/index.html เพียงอย่างเดียว)',
          checkedAt: null,
        },
        {
          id: 'automated_tests',
          stepNumber: 4,
          label: '4. Automated Tests ผ่าน',
          description: 'ตรวจสอบหลักฐานผลการรัน Automated Tests ที่ผูกกับ Commit SHA และเวลาที่ตรวจสอบ',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่มีหลักฐานผลทดสอบที่ตรวจสอบย้อนกลับได้ (ไม่เชื่อถือค่า Environment Variable เพียงอย่างเดียว)',
          checkedAt: null,
        },
        {
          id: 'backup',
          stepNumber: 5,
          label: '5. Backup Capability พร้อม',
          description: 'ตรวจสอบความพร้อมของระบบสำรองข้อมูลและสิทธิ์เขียนโฟลเดอร์ Backup ก่อนอัปเดต',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้ตรวจสอบความพร้อมของระบบ Backup Agent และความสมบูรณ์ของโฟลเดอร์สำรองข้อมูลจริง',
          checkedAt: null,
        },
        {
          id: 'database_config',
          stepNumber: 6,
          label: '6. Database Configuration ถูกต้อง',
          description: `ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล MySQL จริง (${AUTHORITATIVE_PRODUCTION_DATABASE_NAME})`,
          status: 'NOT_CHECKED',
          detail: 'NOT_CHECKED — รอการสั่งตรวจ Preflight Check เพื่อทดสอบเชื่อมต่อฐานข้อมูลจริง',
          checkedAt: null,
        },
        {
          id: 'central_gateway',
          stepNumber: 7,
          label: '7. Central API Gateway พร้อม',
          description: 'ตรวจสอบหลักฐานการทำงานของเส้นทาง /api/Sam_Att/ บน Central API Gateway พอร์ต 3002',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้ตรวจสอบเส้นทาง /api/Sam_Att/ จาก Central API Gateway พอร์ต 3002 ที่มีหลักฐานยืนยันได้จริง',
          checkedAt: null,
        },
        {
          id: 'procurement_health',
          stepNumber: 8,
          label: '8. Procurement Health Check ผ่าน',
          description: 'ตรวจสอบผล Health Check จริงของระบบ Procurement บน Central API Gateway',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่ได้ตรวจสอบสถานะระบบ Procurement ที่ได้รับการยืนยัน (ห้ามถือว่า HTTP 404 คือ PASS)',
          checkedAt: null,
        },
      ];
    }

    // =========================================================================
    // Live Evidence-Based Preflight Evaluation (§3.3)
    // =========================================================================

    // Check 1 — GitHub Source & Commit
    const ghCheck = await this.fetchLatestGitHubVersion(true);
    const isGitHubVerifiedFromApi =
      ghCheck.githubStatus === 'CONNECTED' &&
      ghCheck.versionInfo.available &&
      ghCheck.versionInfo.source === 'GITHUB_API' &&
      HEX_COMMIT_SHA_REGEX.test(ghCheck.versionInfo.commitSha);

    const verifiedCommitSha = isGitHubVerifiedFromApi
      ? ghCheck.versionInfo.commitSha.toLowerCase()
      : undefined;

    const githubStatus: ChecklistItemStatus = isGitHubVerifiedFromApi ? 'PASS' : 'FAIL';
    const githubDetail = isGitHubVerifiedFromApi
      ? `PASS — ตรวจสอบจาก GitHub API จริงสำเร็จ (${AUTHORITATIVE_GITHUB_REPO_URL}) ล่าสุด Commit SHA: ${ghCheck.versionInfo.commitSha} เมื่อ ${ghCheck.versionInfo.date}`
      : `FAIL — ไม่สามารถยืนยัน Commit SHA จาก GitHub API จริงได้ (${
          ghCheck.errorDetail || 'GitHub API unreachable'
        }) ห้ามสรุป PASS เมื่อเรียก GitHub API ไม่สำเร็จ`;

    // Query Phase 2 Agent if configured & available
    const agent = this.getActiveAgent();
    const agentEvidence =
      agent && agent.isAvailable && verifiedCommitSha
        ? await agent.getPreDeploymentEvidence(verifiedCommitSha).catch(() => null)
        : null;

    // Check 2 — Dependencies
    const pkgJsonExists = fs.existsSync(path.resolve(process.cwd(), 'package.json'));
    const nodeModulesExists = fs.existsSync(path.resolve(process.cwd(), 'node_modules'));
    let depStatus: ChecklistItemStatus;
    let depDetail: string;
    let depEvidence: PreflightCheckEvidence | undefined;

    if (!pkgJsonExists || !nodeModulesExists) {
      depStatus = 'FAIL';
      depDetail = 'FAIL — ไม่พบไฟล์ package.json หรือโฟลเดอร์ node_modules บนเซิร์ฟเวอร์';
    } else if (agentEvidence) {
      depStatus = agentEvidence.dependenciesPassed ? 'PASS' : 'FAIL';
      depDetail = agentEvidence.dependenciesDetail;
      depEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        artifactSha256: agentEvidence.frontendArtifactSha256,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      depStatus = 'NOT_CHECKED';
      depDetail =
        'NOT_CHECKED — พบไฟล์ package.json และ node_modules บนดิสก์ แต่การมีไฟล์เพียงอย่างเดียวไม่เพียงพอที่จะยืนยันว่า Dependencies ถูกต้องครบถ้วน (ต้องมีหลักฐานจากกระบวนการ Build/Test ของ Deployment Agent)';
    }

    // Check 3 — Production Build
    const distIndexExists = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
    let buildStatus: ChecklistItemStatus;
    let buildDetail: string;
    let buildEvidence: PreflightCheckEvidence | undefined;

    if (agentEvidence) {
      buildStatus = agentEvidence.buildPassed ? 'PASS' : 'FAIL';
      buildDetail = `${agentEvidence.buildDetail} (Artifact SHA-256: ${agentEvidence.frontendArtifactSha256.slice(
        0,
        16
      )}...)`;
      buildEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        artifactSha256: agentEvidence.frontendArtifactSha256,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      buildStatus = 'NOT_CHECKED';
      buildDetail = distIndexExists
        ? 'NOT_CHECKED — พบไฟล์ dist/index.html บนดิสก์ แต่ยังไม่มีหลักฐานการ Build (Build Evidence) ที่ยืนยันว่า Build สำเร็จและสัมพันธ์กับ Commit SHA ที่ตรวจสอบ (ห้ามสรุป PASS จากการมีไฟล์เพียงอย่างเดียว)'
        : 'NOT_CHECKED — ยังไม่พบไฟล์ dist/index.html และยังไม่ได้ตรวจสอบการ Build จริงจากกระบวนการที่เชื่อถือได้';
    }

    // Check 4 — Automated Tests
    const envTestStatus = (process.env.SAM_ATT_LAST_TEST_STATUS || '').trim().toUpperCase();
    let testStatus: ChecklistItemStatus;
    let testDetail: string;
    let testEvidence: PreflightCheckEvidence | undefined;

    if (envTestStatus === 'FAIL') {
      testStatus = 'FAIL';
      testDetail = 'FAIL — มีรายงานผลทดสอบล่าสุดไม่ผ่านเกณฑ์ (FAIL)';
    } else if (agentEvidence) {
      testStatus = agentEvidence.testsPassed ? 'PASS' : 'FAIL';
      testDetail = agentEvidence.testsDetail;
      testEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        artifactSha256: agentEvidence.backendArtifactSha256,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      testStatus = 'NOT_CHECKED';
      testDetail =
        envTestStatus === 'PASS'
          ? 'NOT_CHECKED — พบค่า SAM_ATT_LAST_TEST_STATUS=PASS แต่ไม่มีหลักฐานผลทดสอบที่ตรวจสอบย้อนกลับได้ (Commit SHA, Timestamp และผลลัพธ์จากกระบวนการที่เชื่อถือได้) จึงไม่อนุญาตให้แสดง PASS'
          : 'NOT_CHECKED — ยังไม่มีหลักฐานผลทดสอบ Automated Tests ที่ผูกกับ Commit SHA และ Timestamp จากกระบวนการที่เชื่อถือได้';
    }

    // Check 5 — Backup Capability
    const envBackupFlag = (process.env.SAM_ATT_BACKUP_VERIFIED || '').trim().toLowerCase();
    let backupStatus: ChecklistItemStatus;
    let backupDetail: string;
    let backupEvidence: PreflightCheckEvidence | undefined;

    if (agentEvidence) {
      backupStatus = agentEvidence.backupCapabilityPassed ? 'PASS' : 'FAIL';
      backupDetail = agentEvidence.backupCapabilityDetail;
      backupEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      backupStatus = 'NOT_CHECKED';
      backupDetail =
        envBackupFlag === 'true'
          ? 'NOT_CHECKED — พบค่า SAM_ATT_BACKUP_VERIFIED=true แต่ยังไม่มีระบบ Backup Agent และไม่พบหลักฐานการตรวจสอบความสมบูรณ์ของไฟล์สำรองจริง จึงไม่อนุญาตให้แสดง PASS'
          : 'NOT_CHECKED — ยังไม่มีระบบ Backup Agent และยังไม่มีหลักฐานชุดข้อมูลสำรองที่ตรวจสอบความสมบูรณ์แล้ว';
    }

    // Check 6 — Database Configuration
    let dbCheckStatus: ChecklistItemStatus = 'FAIL';
    let dbCheckDetail = '';
    try {
      const health = await repo.checkHealth();
      const repoDbName = repo.getDatabaseName();
      const reportedDbName = health.database || repoDbName;
      const hasRealEnv = Boolean(
        process.env.SAM_ATT_DB_HOST?.trim() &&
          process.env.SAM_ATT_DB_USER?.trim() &&
          process.env.SAM_ATT_DB_PASSWORD
      );

      if (!health.healthy) {
        dbCheckStatus = 'FAIL';
        dbCheckDetail = `FAIL — ไม่สามารถเชื่อมต่อฐานข้อมูล ${reportedDbName} ได้ (${
          health.message || 'Connection failed'
        })`;
      } else if (
        reportedDbName !== AUTHORITATIVE_PRODUCTION_DATABASE_NAME ||
        repoDbName !== AUTHORITATIVE_PRODUCTION_DATABASE_NAME
      ) {
        dbCheckStatus = 'FAIL';
        dbCheckDetail = `FAIL — ชื่อฐานข้อมูลปัจจุบัน (${reportedDbName}) ไม่ตรงกับฐานข้อมูล Production ที่กำหนด (${AUTHORITATIVE_PRODUCTION_DATABASE_NAME})`;
      } else if (repo.mode !== 'REAL' || !hasRealEnv) {
        dbCheckStatus = 'WARNING';
        dbCheckDetail = `WARNING — ระบบกำลังทำงานในโหมด ${repo.mode} (ไม่ใช่โหมด REAL MySQL Production หรือยังไม่ได้ตั้งค่า Environment เชื่อมต่อฐานข้อมูลจริงครบถ้วน) ห้ามสรุป PASS จาก Mock/Test Repository`;
      } else {
        dbCheckStatus = 'PASS';
        dbCheckDetail = `PASS — เชื่อมต่อฐานข้อมูล MySQL จริง (${AUTHORITATIVE_PRODUCTION_DATABASE_NAME}) ในโหมด REAL สำเร็จและผ่านการตรวจสอบ SELECT 1`;
      }
    } catch (err) {
      dbCheckStatus = 'FAIL';
      dbCheckDetail = `FAIL — การเชื่อมต่อฐานข้อมูลล้มเหลว: ${sanitizeDeploymentErrorText(err)}`;
    }

    // Check 7 — Central API Gateway
    let gatewayStatus: ChecklistItemStatus;
    let gatewayDetail: string;
    let gatewayEvidence: PreflightCheckEvidence | undefined;

    if (agentEvidence) {
      gatewayStatus = agentEvidence.gatewayHealthPassed ? 'PASS' : 'FAIL';
      gatewayDetail = agentEvidence.gatewayHealthDetail;
      gatewayEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      gatewayStatus = 'NOT_CHECKED';
      gatewayDetail =
        'NOT_CHECKED — ยังไม่มีกลไก Health Check ที่เชื่อถือได้สำหรับยืนยันเส้นทาง /api/Sam_Att/ จาก Central API Gateway พอร์ต 3002 โดยตรง (ไม่สรุป PASS เพียงเพราะมี Router หรือกำหนดค่า Port 3002)';
    }

    // Check 8 — Procurement Health Check (HTTP 404 is strictly FAIL, never PASS)
    const envProcurementFlag = (
      process.env.SAM_ATT_PROCUREMENT_HEALTH_VERIFIED || ''
    )
      .trim()
      .toLowerCase();
    let procurementStatus: ChecklistItemStatus;
    let procurementDetail: string;
    let procurementEvidence: PreflightCheckEvidence | undefined;

    if (agentEvidence) {
      procurementStatus = agentEvidence.procurementHealthPassed ? 'PASS' : 'FAIL';
      procurementDetail = agentEvidence.procurementHealthDetail;
      procurementEvidence = {
        commitSha: agentEvidence.commitSha,
        verifiedAt: agentEvidence.verifiedAt,
        evidenceSource: 'PHASE_2_DEPLOYMENT_AGENT',
      };
    } else {
      procurementStatus = 'NOT_CHECKED';
      procurementDetail =
        envProcurementFlag === 'true'
          ? 'NOT_CHECKED — พบค่า SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true แต่ไม่มีผลตรวจสอบจริงจาก Endpoint หรือกลไกที่ได้รับการยืนยัน จึงไม่อนุญาตให้แสดง PASS'
          : 'NOT_CHECKED — ยังไม่มี Endpoint หรือกลไกตรวจสอบสถานะระบบ Procurement ที่ได้รับการยืนยันว่าถูกต้อง (ไม่ถือว่า HTTP 404 จาก /api/Procurement/health หมายถึงทำงานปกติ)';
    }

    const checklist: DeploymentChecklistItem[] = [
      {
        id: 'github_source',
        stepNumber: 1,
        label: '1. GitHub Source และ Commit ตรวจสอบผ่าน',
        description: `ตรวจสอบการเข้าถึง Repository ${AUTHORITATIVE_GITHUB_REPO_URL} และ Commit SHA จาก GitHub API จริง`,
        status: githubStatus,
        detail: githubDetail,
        checkedAt: nowStr,
        evidence: verifiedCommitSha
          ? {
              commitSha: verifiedCommitSha,
              verifiedAt: nowStr,
              evidenceSource: 'GITHUB_API',
            }
          : undefined,
      },
      {
        id: 'dependencies',
        stepNumber: 2,
        label: '2. Dependencies พร้อม',
        description: 'ตรวจสอบความถูกต้องของ Dependencies จากหลักฐานกระบวนการ Build/Test ที่เชื่อถือได้',
        status: depStatus,
        detail: depDetail,
        checkedAt: nowStr,
        evidence: depEvidence,
      },
      {
        id: 'build',
        stepNumber: 3,
        label: '3. Build ผ่าน',
        description: 'ตรวจสอบหลักฐานว่า Production Build สำเร็จและ Artifact ตรงกับ Commit SHA ที่ตรวจสอบ',
        status: buildStatus,
        detail: buildDetail,
        checkedAt: nowStr,
        evidence: buildEvidence,
      },
      {
        id: 'automated_tests',
        stepNumber: 4,
        label: '4. Automated Tests ผ่าน',
        description: 'ตรวจสอบหลักฐานผลการรัน Automated Tests ที่ผูกกับ Commit SHA และเวลาที่ตรวจสอบ',
        status: testStatus,
        detail: testDetail,
        checkedAt: nowStr,
        evidence: testEvidence,
      },
      {
        id: 'backup',
        stepNumber: 5,
        label: '5. Backup Capability พร้อม',
        description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันพร้อมหลักฐานความสมบูรณ์ก่อนอัปเดต',
        status: backupStatus,
        detail: backupDetail,
        checkedAt: nowStr,
        evidence: backupEvidence,
      },
      {
        id: 'database_config',
        stepNumber: 6,
        label: '6. Database Configuration ถูกต้อง',
        description: `ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล MySQL จริง (${AUTHORITATIVE_PRODUCTION_DATABASE_NAME})`,
        status: dbCheckStatus,
        detail: dbCheckDetail,
        checkedAt: nowStr,
        evidence:
          dbCheckStatus === 'PASS' && verifiedCommitSha
            ? {
                commitSha: verifiedCommitSha,
                verifiedAt: nowStr,
                evidenceSource: 'MYSQL_LIVE_PING',
              }
            : undefined,
      },
      {
        id: 'central_gateway',
        stepNumber: 7,
        label: '7. Central API Gateway พร้อม',
        description: 'ตรวจสอบหลักฐานการทำงานของเส้นทาง /api/Sam_Att/ บน Central API Gateway พอร์ต 3002',
        status: gatewayStatus,
        detail: gatewayDetail,
        checkedAt: nowStr,
        evidence: gatewayEvidence,
      },
      {
        id: 'procurement_health',
        stepNumber: 8,
        label: '8. Procurement Health Check ผ่าน',
        description: 'ตรวจสอบผล Health Check จริงของระบบ Procurement บน Central API Gateway',
        status: procurementStatus,
        detail: procurementDetail,
        checkedAt: nowStr,
        evidence: procurementEvidence,
      },
    ];

    this.lastPreflightChecklist = checklist;
    return checklist;
  }

  /**
   * Append a deployment or rollback execution record to persistent history (§3.9).
   * Never called for read-only "Check for Updates" or "Preflight Check".
   */
  public static recordDeploymentJobHistory(entry: DeploymentHistoryRecord): void {
    this.inMemoryHistoryRecords.unshift(entry);
    if (this.customHistoryFilePath) {
      try {
        fs.mkdirSync(path.dirname(this.customHistoryFilePath), { recursive: true });
        fs.writeFileSync(
          this.customHistoryFilePath,
          JSON.stringify(this.inMemoryHistoryRecords, null, 2),
          'utf8'
        );
      } catch {
        // Ignore write error
      }
    }
  }

  /**
   * Read Deployment History (§3.9).
   * Strictly excludes `DEPLOYMENT_CHECK_UPDATES` and `DEPLOYMENT_PREFLIGHT_CHECK` so
   * clicking "Check for Updates" is NEVER recorded as a Deployment `SUCCESS`.
   */
  public static async getDeploymentHistory(repo: ISamAttRepository): Promise<{
    historyStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_CONFIGURED';
    history: DeploymentHistoryRecord[];
  }> {
    if (this.customHistoryFilePath && fs.existsSync(this.customHistoryFilePath)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(this.customHistoryFilePath, 'utf8'));
        if (Array.isArray(fileData)) {
          return {
            historyStatus: 'AVAILABLE',
            history: fileData as DeploymentHistoryRecord[],
          };
        }
      } catch {
        // Ignore parse error
      }
    }

    if (this.inMemoryHistoryRecords.length > 0) {
      return {
        historyStatus: 'AVAILABLE',
        history: [...this.inMemoryHistoryRecords],
      };
    }

    const rawHistoryJson = (process.env.SAM_ATT_DEPLOYMENT_HISTORY_JSON || '').trim();
    if (rawHistoryJson) {
      try {
        const parsed = JSON.parse(rawHistoryJson);
        if (Array.isArray(parsed)) {
          return {
            historyStatus: 'AVAILABLE',
            history: parsed.map((item, idx) => {
              const versionStr = String(item.version || 'NOT AVAILABLE');
              const commitStr = String(item.commitSha || 'NOT AVAILABLE');
              const actorUsername = String(item.actorUsername || 'admin');
              const actorFullName = String(item.actorFullName || 'ผู้ดูแลระบบ');
              const depId = String(item.deploymentId || item.id || `DEP_${idx + 1}`);
              return {
                id: depId,
                deploymentId: depId,
                deployedAt: String(item.deployedAt || 'NOT AVAILABLE'),
                version: versionStr,
                commitSha: commitStr,
                versionOrCommit: commitStr !== 'NOT AVAILABLE' ? commitStr : versionStr,
                actor: actorUsername,
                actorName: actorFullName,
                actorUsername,
                actorFullName,
                approvedBy: `${actorFullName} (${actorUsername})`,
                buildTestResult: String(item.buildTestResult || 'PASS'),
                backupId: item.backupId ? String(item.backupId) : null,
                status: (item.status as DeploymentJobStatus) || 'SUCCESS',
                healthCheckResult: String(item.healthCheckResult || 'PASS'),
                rollbackStatus: (item.rollbackStatus as RollbackExecutionStatus) || 'NONE',
                summary: String(item.summary || 'บันทึกประวัติการอัปเดตระบบ'),
                errorSanitized: item.errorSanitized
                  ? sanitizeDeploymentErrorText(item.errorSanitized)
                  : null,
              };
            }),
          };
        }
      } catch {
        // Ignore malformed env JSON
      }
    }

    // Only include actual deployment/rollback actions from audit logs — NEVER include DEPLOYMENT_CHECK_UPDATES or DEPLOYMENT_PREFLIGHT_CHECK (§3.9)!
    const logs = await repo.getAuditLogs(100);
    const actualDeploymentActions = new Set([
      'DEPLOYMENT_EXECUTED',
      'DEPLOYMENT_ROLLBACK_EXECUTED',
    ]);
    const deployAuditLogs = logs.filter((l) => actualDeploymentActions.has(l.action));
    if (deployAuditLogs.length > 0) {
      return {
        historyStatus: 'AVAILABLE',
        history: deployAuditLogs.map((l) => {
          const versionStr = String(l.metadata?.version || 'NOT AVAILABLE');
          const commitStr = String(l.metadata?.commitSha || 'NOT AVAILABLE');
          const depId = String(l.metadata?.deploymentId || l.id);
          return {
            id: depId,
            deploymentId: depId,
            deployedAt: l.timestamp,
            version: versionStr,
            commitSha: commitStr,
            versionOrCommit: commitStr !== 'NOT AVAILABLE' ? commitStr : versionStr,
            actor: l.actor,
            actorName: l.actorName,
            actorUsername: l.actor,
            actorFullName: l.actorName,
            approvedBy: `${l.actorName} (${l.actor})`,
            buildTestResult: String(l.metadata?.buildTestResult || '-'),
            backupId: l.metadata?.backupId ? String(l.metadata.backupId) : null,
            status: (l.metadata?.status as DeploymentJobStatus) || 'FAILED',
            healthCheckResult: String(l.metadata?.healthCheckResult || '-'),
            rollbackStatus: (l.metadata?.rollbackStatus as RollbackExecutionStatus) || 'NONE',
            summary: l.summary,
            errorSanitized: l.metadata?.errorSanitized
              ? sanitizeDeploymentErrorText(l.metadata.errorSanitized)
              : null,
          };
        }),
      };
    }

    return {
      historyStatus: 'NOT_CONFIGURED',
      history: [],
    };
  }

  /**
   * Build the full Deployment Center Status Payload (§3 & §4).
   */
  public static async getFullStatusPayload(
    repo: ISamAttRepository,
    options?: { checkUpdates?: boolean; runPreflight?: boolean }
  ): Promise<DeploymentCenterStatusPayload> {
    const nowStr = new Date().toISOString();
    const dbName =
      process.env.SAM_ATT_DB_NAME?.trim() ||
      repo.getDatabaseName() ||
      AUTHORITATIVE_PRODUCTION_DATABASE_NAME;

    let dbHealthy = false;
    try {
      const health = await repo.checkHealth();
      dbHealthy = health.healthy;
    } catch {
      dbHealthy = false;
    }

    const currentServer = this.getCurrentServerVersion();
    const checklist = await this.evaluateChecklist(repo, Boolean(options?.runPreflight));
    const { githubStatus, versionInfo: latestGitHub } =
      await this.fetchLatestGitHubVersion(
        Boolean(options?.checkUpdates && !options?.runPreflight)
      );
    const comparison = this.compareVersions(currentServer, latestGitHub);

    const agent = this.getActiveAgent();
    const availableBackups =
      agent && agent.isAvailable ? await agent.listVerifiedBackups().catch(() => []) : [];
    const verifiedBackupAvailable = availableBackups.some((b) => b.verified);

    const deploymentReadiness = this.computeReadinessSummary(checklist, {
      agent,
      currentVersion: currentServer,
      latestGitHub,
    });

    const { historyStatus, history } = await this.getDeploymentHistory(repo);

    const statusLabel =
      comparison.comparisonStatus === 'UP_TO_DATE'
        ? 'ระบบเป็นเวอร์ชันล่าสุด (UP TO DATE)'
        : comparison.comparisonStatus === 'UPDATE_AVAILABLE'
        ? 'มีอัปเดตใหม่จาก GitHub (UPDATE AVAILABLE)'
        : comparison.comparisonStatus === 'ERROR'
        ? 'พบข้อผิดพลาดในการตรวจสอบเวอร์ชัน (ERROR)'
        : 'ยังไม่สามารถเปรียบเทียบเวอร์ชันได้ (NOT AVAILABLE)';

    const phase2Active = Boolean(agent && agent.isAvailable);
    const canApprove = Boolean(
      phase2Active &&
        deploymentReadiness.readyToDeploy &&
        !agent!.isLocked()
    );
    const canRollback = Boolean(
      phase2Active &&
        verifiedBackupAvailable &&
        !agent!.isLocked()
    );

    const lockMessage = !phase2Active
      ? 'NOT CONFIGURED: ยังไม่ได้เชื่อมต่อ Secure Deployment Agent (Windows Named Pipe IPC) บน FILESERVER — ปุ่มอนุมัติ Deploy และ Rollback ถูกปิดใช้งานอย่างปลอดภัย'
      : agent!.isLocked()
      ? 'BUSY: ระบบกำลังดำเนินการ Deploy หรือ Rollback อยู่ในขณะนี้ (Concurrent Deployment Lock Active)'
      : !deploymentReadiness.readyToDeploy
      ? `LOCKED: ปุ่มอนุมัติ Deploy ถูกล็อกไว้จนกว่าการตรวจสอบ Preflight ทั้ง 8 รายการจะผ่านครบถ้วน (${deploymentReadiness.readinessMessage})`
      : 'READY: ผ่านการตรวจสอบ Preflight ครบทั้ง 8 รายการ และพร้อมให้ผู้ดูแลระบบ (ADMIN) อนุมัติการอัปเดต';

    return {
      success: true,
      phase: phase2Active ? 'PHASE_2_AGENT_MANAGED' : 'PHASE_1_READ_ONLY',
      isDemoData: false,
      checkedAt: nowStr,
      systemStatus: {
        samAttStatus:
          dbHealthy && repo.mode === 'REAL' && dbName === AUTHORITATIVE_PRODUCTION_DATABASE_NAME
            ? 'ONLINE'
            : 'DEGRADED',
        samAttStatusText:
          dbHealthy && repo.mode === 'REAL'
            ? `ออนไลน์ปกติ (เชื่อมฐานข้อมูล ${dbName})`
            : `รอการยืนยันฐานข้อมูล Production (${dbName} / Mode: ${repo.mode})`,
        samAttFrontendPort: 3001,
        samAttFrontendPath: '/Sam_Att/',
        backendApiStatus: 'ONLINE',
        backendApiMount: ':3002/api/Sam_Att/',
        backendGatewayPort: 3002,
        backendGatewayPath: '/api/Sam_Att/',
        databaseName: dbName,
        databaseHealthy: dbHealthy,
        githubConnectionStatus: githubStatus,
        githubRepositoryUrl: AUTHORITATIVE_GITHUB_REPO_URL,
        lastDeployedAt: currentServer.date,
        isolatedDatabase: dbName,
        repositoryMode: repo.mode,
      },
      currentVersion: {
        version: currentServer.version,
        commitSha: currentServer.commitSha,
        deploymentDate: currentServer.date,
        configured: currentServer.available,
        source: currentServer.source,
        manifestPath: currentServer.manifestPath,
        manifestValid: currentServer.manifestValid,
        manifestError: currentServer.manifestError ?? null,
        backupId: currentServer.backupId ?? null,
        frontendArtifactSha256: currentServer.frontendArtifactSha256 ?? null,
        backendArtifactSha256: currentServer.backendArtifactSha256 ?? null,
      },
      latestGitHubVersion: {
        repositoryUrl: AUTHORITATIVE_GITHUB_REPO_URL,
        version: latestGitHub.version,
        commitSha: latestGitHub.commitSha,
        latestCommitDate: latestGitHub.date,
        commitMessage:
          latestGitHub.commitMessage ||
          (latestGitHub.available
            ? `Commit ${latestGitHub.commitSha.slice(0, 8)} on branch ${APPROVED_DEPLOYMENT_BRANCH}`
            : 'ยังไม่มีข้อมูล Commit Message จาก GitHub API'),
        branch: latestGitHub.branch || 'main',
        reachable: latestGitHub.available && latestGitHub.source === 'GITHUB_API',
        configured: true,
        message:
          latestGitHub.available && latestGitHub.source === 'GITHUB_API'
            ? `ดึงข้อมูลล่าสุดจาก GitHub API สำเร็จ (${AUTHORITATIVE_GITHUB_REPO_URL})`
            : githubStatus === 'NOT_CHECKED'
            ? 'ยังไม่ได้กดตรวจสอบจาก GitHub API จริง (กดปุ่ม "ตรวจสอบอัปเดต" เพื่อดึงข้อมูลล่าสุด)'
            : 'ไม่สามารถดึงข้อมูลเวอร์ชันล่าสุดจาก GitHub API ได้ในขณะนี้ (NOT AVAILABLE)',
      },
      versionComparison: {
        status: comparison.comparisonStatus,
        statusLabel,
        summary: comparison.comparisonMessage,
        currentServer,
        latestGitHub,
        comparisonStatus: comparison.comparisonStatus,
        comparisonMessage: comparison.comparisonMessage,
      },
      checklist,
      deploymentReadiness,
      deploymentAgent: {
        phase2AgentAvailable: phase2Active,
        approveEnabled: canApprove,
        rollbackEnabled: canRollback,
        lockReason: lockMessage,
        agentAvailable: phase2Active,
        agentStatus: !phase2Active ? 'NOT_CONFIGURED' : agent!.agentStatus,
        ipcTransport: phase2Active
          ? 'WINDOWS_NAMED_PIPE_IPC'
          : 'WINDOWS_NAMED_PIPE_PENDING_PHASE_2',
        namedPipePath:
          agent?.namedPipePath || AUTHORITATIVE_WINDOWS_PATHS.NAMED_PIPE_PATH,
        canApproveDeploy: canApprove,
        canRollback,
        verifiedBackupAvailable,
        activeDeploymentLock: Boolean(agent?.isLocked()),
        statusMessage: lockMessage,
      },
      activeProgress: agent?.getActiveProgress() ?? null,
      availableBackups,
      historyStatus,
      history,
      lastCheckedAt: nowStr,
    };
  }

  public static async listAvailableBackups() {
    const agent = this.getActiveAgent();
    if (!agent || !agent.isAvailable) {
      return [];
    }
    return agent.listVerifiedBackups().catch(() => []);
  }

  public static getActiveProgress() {
    const agent = this.getActiveAgent();
    if (!agent || !agent.isAvailable) {
      return null;
    }
    return agent.getActiveProgress();
  }

  /**
   * Executes an ADMIN-approved Deployment via the Phase 2 Secure Deployment Agent (§3.6).
   */
  public static async approveAndExecuteDeployment(
    repo: ISamAttRepository,
    params: {
      user: { id: string; username: string; fullName: string; role: string };
      targetCommitSha?: string;
      maintenanceWindowApproved?: boolean;
    }
  ): Promise<{
    httpStatus: number;
    body: Record<string, unknown>;
  }> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.isAvailable) {
      await repo.recordAuditLog({
        actor: params.user.username,
        actorName: params.user.fullName,
        actorRole: params.user.role as any,
        action: 'DEPLOYMENT_APPROVE_ATTEMPT',
        entityType: 'DeploymentCenter',
        entityId: 'Sam_Att_V2',
        summary: `ผู้ดูแลระบบ ${params.user.username} ทดสอบคำขออนุมัติ Deploy (ถูกระงับเนื่องจากยังไม่ได้ตั้งค่า Phase 2 Deployment Agent)`,
      });

      return {
        httpStatus: 501,
        body: {
          success: false,
          liveDeployExecuted: false,
          agentAvailable: false,
          phase: 'PHASE_1_READ_ONLY',
          error:
            'NOT CONFIGURED: ยังไม่เปิดใช้งานการสั่ง Deploy จริงจากหน้าเว็บจนกว่าจะติดตั้งและตั้งค่า Secure Deployment Agent บน FILESERVER',
        },
      };
    }

    if (agent.isLocked()) {
      await repo.recordAuditLog({
        actor: params.user.username,
        actorName: params.user.fullName,
        actorRole: params.user.role as any,
        action: 'DEPLOYMENT_APPROVE_REJECTED_LOCKED',
        entityType: 'DeploymentCenter',
        entityId: 'Sam_Att_V2',
        summary: `ปฏิเสธคำขอ Deploy ซ้อนจาก ${params.user.username} เนื่องจากมีกระบวนการ Deploy กำลังทำงานอยู่`,
      });
      return {
        httpStatus: 409,
        body: {
          success: false,
          code: 'SAM_ATT_DEPLOYMENT_LOCKED',
          error: 'มีกระบวนการอัปเดตหรือ Rollback กำลังดำเนินการอยู่ กรุณารอให้เสร็จสิ้นก่อนสั่งงานซ้ำ',
        },
      };
    }

    const checklist = this.lastPreflightChecklist || [];
    const currentServer = this.getCurrentServerVersion();
    const latestGitHub = this.cachedGitHubVersion || {
      version: 'NOT AVAILABLE',
      commitSha: 'NOT AVAILABLE',
      date: 'NOT AVAILABLE',
      available: false,
      source: 'NOT_AVAILABLE' as const,
    };
    const readiness = this.computeReadinessSummary(checklist, {
      agent,
      currentVersion: currentServer,
      latestGitHub,
    });

    if (!readiness.readyToDeploy || !readiness.targetCommitSha) {
      await repo.recordAuditLog({
        actor: params.user.username,
        actorName: params.user.fullName,
        actorRole: params.user.role as any,
        action: 'DEPLOYMENT_APPROVE_REJECTED_PREFLIGHT',
        entityType: 'DeploymentCenter',
        entityId: 'Sam_Att_V2',
        summary: `ปฏิเสธคำขออนุมัติ Deploy จาก ${params.user.username} เนื่องจากผลตรวจ Preflight ยังไม่ผ่านครบทุกข้อ`,
      });

      return {
        httpStatus: 412,
        body: {
          success: false,
          code: 'SAM_ATT_PREFLIGHT_NOT_PASSED',
          error: readiness.readinessMessage,
        },
      };
    }

    // Deploy Latest only: re-fetch the authoritative main branch at approval time.
    // A cached preflight result is not sufficient when GitHub has moved since review.
    const freshGitHub = await this.fetchLatestGitHubVersion(true);
    if (
      freshGitHub.githubStatus !== 'CONNECTED' ||
      !freshGitHub.versionInfo.available ||
      !HEX_COMMIT_SHA_REGEX.test(freshGitHub.versionInfo.commitSha)
    ) {
      return {
        httpStatus: 503,
        body: {
          success: false,
          code: 'SAM_ATT_LATEST_GITHUB_UNVERIFIED',
          error: 'ไม่สามารถยืนยัน Commit ล่าสุดจาก GitHub main ได้ กรุณาตรวจสอบอัปเดตและ Preflight ใหม่',
        },
      };
    }
    if (freshGitHub.versionInfo.commitSha.toLowerCase() !== readiness.targetCommitSha.toLowerCase()) {
      return {
        httpStatus: 409,
        body: {
          success: false,
          code: 'SAM_ATT_LATEST_COMMIT_CHANGED',
          error: 'GitHub main มี Commit ใหม่หลังการตรวจสอบความพร้อม กรุณากด Check for Updates และ Preflight ใหม่ก่อนอนุมัติ',
          latestCommitSha: freshGitHub.versionInfo.commitSha,
        },
      };
    }

    const requestedSha = (params.targetCommitSha || readiness.targetCommitSha).trim().toLowerCase();
    if (
      !HEX_COMMIT_SHA_REGEX.test(requestedSha) ||
      requestedSha !== readiness.targetCommitSha.toLowerCase()
    ) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          code: 'SAM_ATT_COMMIT_MISMATCH',
          error:
            'รหัส Commit SHA ที่ขออนุมัติไม่ตรงกับ Commit SHA ที่ผ่านการตรวจสอบ Preflight ล่าสุด กรุณารัน Preflight Check ใหม่',
        },
      };
    }

    const deploymentId = `DEP_${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)}_${requestedSha.slice(0, 6)}`;
    const targetVersion = `${APPROVED_DEPLOYMENT_BRANCH}@${requestedSha.slice(0, 8)}`;

    const execResult: ExecuteDeployResult = await agent.executeApprovedDeployment({
      deploymentId,
      targetCommitSha: requestedSha,
      targetVersion,
      approvedBy: {
        userId: params.user.id,
        username: params.user.username,
        fullName: params.user.fullName,
      },
      maintenanceWindowApproved: Boolean(params.maintenanceWindowApproved),
    });

    const historyRecord: DeploymentHistoryRecord = {
      id: deploymentId,
      deploymentId,
      deployedAt: new Date().toISOString(),
      version: targetVersion,
      commitSha: requestedSha,
      versionOrCommit: `${targetVersion} (${requestedSha.slice(0, 8)})`,
      actor: params.user.username,
      actorName: params.user.fullName,
      actorUsername: params.user.username,
      actorFullName: params.user.fullName,
      approvedBy: `${params.user.fullName} (${params.user.username})`,
      buildTestResult: execResult.buildTestSummary,
      backupId: execResult.backupId,
      status: execResult.status,
      healthCheckResult: execResult.healthCheckReport
        ? execResult.healthCheckReport.overallHealthy
          ? 'PASS (7/7)'
          : `FAIL (${execResult.healthCheckReport.summary})`
        : 'NOT_RUN',
      rollbackStatus: execResult.rollbackStatus,
      summary: execResult.summary,
      errorSanitized: execResult.errorSanitized,
      criticalRecoveryAdvice: execResult.criticalRecoveryAdvice ?? null,
    };

    this.recordDeploymentJobHistory(historyRecord);

    await repo.recordAuditLog({
      actor: params.user.username,
      actorName: params.user.fullName,
      actorRole: params.user.role as any,
      action: 'DEPLOYMENT_EXECUTED',
      entityType: 'DeploymentCenter',
      entityId: deploymentId,
      summary: execResult.summary,
      metadata: {
        deploymentId,
        previousCommitSha: currentServer.commitSha,
        targetCommitSha: requestedSha,
        version: targetVersion,
        commitSha: requestedSha,
        backupId: execResult.backupId,
        status: execResult.status,
        buildTestResult: execResult.buildTestSummary,
        healthCheckResult: historyRecord.healthCheckResult,
        rollbackStatus: execResult.rollbackStatus,
        errorSanitized: execResult.errorSanitized,
      },
    });

    const updatedPayload = await this.getFullStatusPayload(repo, {
      checkUpdates: false,
      runPreflight: false,
    });

    const httpStatus =
      execResult.status === 'SUCCESS'
        ? 200
        : execResult.status === 'MAINTENANCE_REQUIRED'
        ? 202
        : 500;

    return {
      httpStatus,
      body: {
        ...updatedPayload,
        success: execResult.status === 'SUCCESS' || execResult.status === 'MAINTENANCE_REQUIRED',
        status: execResult.status,
        deploymentId,
        previousCommitSha: currentServer.commitSha,
        targetCommitSha: requestedSha,
        backupId: execResult.backupId,
        message: execResult.summary,
        progress: execResult.progress,
        healthCheck: execResult.healthCheckReport,
        criticalManualRecoveryAdvice: execResult.criticalRecoveryAdvice || null,
        deploymentResult: execResult,
        error: execResult.errorSanitized || undefined,
      },
    };
  }

  /**
   * Executes an ADMIN-approved Rollback to a verified `backupId` (§3.8).
   */
  public static async executeRollback(
    repo: ISamAttRepository,
    params: {
      user: { id: string; username: string; fullName: string; role: string };
      backupId?: string;
      confirmRollback?: boolean;
      reason?: string;
    }
  ): Promise<{
    httpStatus: number;
    body: Record<string, unknown>;
  }> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.isAvailable) {
      await repo.recordAuditLog({
        actor: params.user.username,
        actorName: params.user.fullName,
        actorRole: params.user.role as any,
        action: 'DEPLOYMENT_ROLLBACK_ATTEMPT',
        entityType: 'DeploymentCenter',
        entityId: 'Sam_Att_V2',
        summary: `ผู้ดูแลระบบ ${params.user.username} ทดสอบคำขอ Rollback (ถูกระงับเนื่องจากยังไม่ได้ตั้งค่า Phase 2 Deployment Agent)`,
      });

      return {
        httpStatus: 501,
        body: {
          success: false,
          rollbackExecuted: false,
          liveRollbackExecuted: false,
          agentAvailable: false,
          phase: 'PHASE_1_READ_ONLY',
          error:
            'NOT CONFIGURED: ยังไม่เปิดใช้งานการ Rollback อัตโนมัติจนกว่าจะติดตั้ง Secure Deployment Agent และมีเวอร์ชันสำรองที่ตรวจสอบได้',
        },
      };
    }

    if (!params.backupId || typeof params.backupId !== 'string' || !params.backupId.trim()) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: 'กรุณาระบุรหัสชุดสำรองข้อมูล (Backup ID) ที่ต้องการย้อนกลับ',
        },
      };
    }

    if (params.confirmRollback !== true) {
      return {
        httpStatus: 400,
        body: {
          success: false,
          error: 'กรุณายืนยันการดำเนินการย้อนกลับเวอร์ชัน (confirmRollback: true)',
        },
      };
    }

    if (agent.isLocked()) {
      return {
        httpStatus: 409,
        body: {
          success: false,
          code: 'SAM_ATT_DEPLOYMENT_LOCKED',
          error: 'มีกระบวนการอัปเดตหรือ Rollback กำลังดำเนินการอยู่ กรุณารอให้เสร็จสิ้น',
        },
      };
    }

    const rollbackResult: ExecuteRollbackResult = await agent.executeVerifiedRollback({
      backupId: params.backupId.trim(),
      requestedBy: {
        userId: params.user.id,
        username: params.user.username,
        fullName: params.user.fullName,
      },
      reason: params.reason,
    });

    const rollbackId = `RBK_${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)}_${params.backupId.slice(-6)}`;

    const historyRecord: DeploymentHistoryRecord = {
      id: rollbackId,
      deploymentId: rollbackId,
      deployedAt: new Date().toISOString(),
      version: rollbackResult.restoredVersion,
      commitSha: rollbackResult.restoredCommitSha,
      versionOrCommit: `${rollbackResult.restoredVersion} (${params.backupId})`,
      actor: params.user.username,
      actorName: params.user.fullName,
      actorUsername: params.user.username,
      actorFullName: params.user.fullName,
      approvedBy: `${params.user.fullName} (${params.user.username})`,
      buildTestResult: 'RESTORED_FROM_VERIFIED_BACKUP',
      backupId: params.backupId.trim(),
      status: rollbackResult.rolledBack ? 'ROLLED_BACK' : 'FAILED',
      healthCheckResult: rollbackResult.healthCheckReport
        ? rollbackResult.healthCheckReport.overallHealthy
          ? 'PASS (7/7)'
          : `FAIL (${rollbackResult.healthCheckReport.summary})`
        : 'FAILED',
      rollbackStatus: rollbackResult.rollbackStatus,
      summary: rollbackResult.summary,
      errorSanitized: rollbackResult.errorSanitized,
      criticalRecoveryAdvice: rollbackResult.criticalRecoveryAdvice,
    };

    this.recordDeploymentJobHistory(historyRecord);

    await repo.recordAuditLog({
      actor: params.user.username,
      actorName: params.user.fullName,
      actorRole: params.user.role as any,
      action: 'DEPLOYMENT_ROLLBACK_EXECUTED',
      entityType: 'DeploymentCenter',
      entityId: rollbackId,
      summary: rollbackResult.summary,
      metadata: {
        deploymentId: rollbackId,
        backupId: params.backupId.trim(),
        version: rollbackResult.restoredVersion,
        commitSha: rollbackResult.restoredCommitSha,
        status: historyRecord.status,
        rollbackStatus: rollbackResult.rollbackStatus,
        errorSanitized: rollbackResult.errorSanitized,
      },
    });

    const updatedPayload = await this.getFullStatusPayload(repo, {
      checkUpdates: false,
      runPreflight: false,
    });

    return {
      httpStatus: rollbackResult.rolledBack ? 200 : 500,
      body: {
        ...updatedPayload,
        success: rollbackResult.rolledBack,
        rollbackExecuted: rollbackResult.rolledBack,
        status: rollbackResult.rolledBack ? 'ROLLED_BACK' : 'ROLLBACK_FAILED',
        backupId: params.backupId.trim(),
        restoredCommitSha: rollbackResult.restoredCommitSha,
        restoredVersion: rollbackResult.restoredVersion,
        message: rollbackResult.summary,
        healthCheck: rollbackResult.healthCheckReport,
        criticalManualRecoveryAdvice: rollbackResult.criticalRecoveryAdvice || null,
        rollbackResult,
        error: rollbackResult.errorSanitized || undefined,
      },
    };
  }
}
