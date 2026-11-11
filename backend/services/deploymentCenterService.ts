/**
 * Sam_Att V2 — Deployment Center Service & Future Deployment Agent Interface (Phase 1 Read-Only)
 *
 * SECURITY & EVIDENCE-BASED PREFLIGHT GUARANTEES (§1, §3, §4, §5):
 * 1. Read-Only in Phase 1: Does NOT execute OS commands, PowerShell scripts, or git CLI from web requests.
 * 2. Zero False PASS Policy:
 *    - Never returns `PASS` from hardcoded values, assumptions, mere file existence (`package.json`,
 *      `node_modules`, `dist/index.html`), or unverified environment variables (`SAM_ATT_LAST_TEST_STATUS=PASS`,
 *      `SAM_ATT_BACKUP_VERIFIED=true`, `SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true`, `SAM_ATT_GITHUB_LATEST_SHA`).
 *    - Every `PASS` requires live, traceable verification evidence.
 *    - Checks that cannot be verified in Phase 1 Read-Only honestly report `NOT_CHECKED` with the exact reason.
 * 3. Strictly rejects any request attempting to pass shell commands, scripts, arbitrary Git URLs, or file paths.
 * 4. Never fabricates fake version numbers (e.g. v2.0.0 / v2.0.1) as real server or GitHub data;
 *    returns `NOT CONFIGURED` or `NOT AVAILABLE` when real metadata or GitHub connectivity is unavailable.
 * 5. Defines the `IDeploymentAgent` contract for Phase 2 Windows IPC integration without opening any new TCP port.
 */

import fs from 'fs';
import path from 'path';
import { ISamAttRepository } from '../repositories/interfaces';

export const AUTHORITATIVE_GITHUB_REPO_URL = 'https://github.com/jk9krnvb6g-ai/Sam_Att';
export const AUTHORITATIVE_GITHUB_COMMITS_API =
  'https://api.github.com/repos/jk9krnvb6g-ai/Sam_Att/commits/main';
export const AUTHORITATIVE_PRODUCTION_DATABASE_NAME = 'samchuk_attendance_v2';

export type ChecklistItemStatus =
  | 'PASS'
  | 'FAIL'
  | 'WARNING'
  | 'NOT_CHECKED'
  | 'NOT_AVAILABLE';

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
}

export interface VersionInfo {
  version: string;
  commitSha: string;
  date: string;
  available: boolean;
  source:
    | 'ENVIRONMENT_METADATA'
    | 'GITHUB_API'
    | 'NOT_CONFIGURED'
    | 'NOT_AVAILABLE'
    | 'DEMO_DATA';
}

export interface DeploymentHistoryRecord {
  id: string;
  deployedAt: string;
  version: string;
  commitSha: string;
  versionOrCommit: string;
  actor: string;
  actorName: string;
  actorUsername: string;
  actorFullName: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  summary: string;
  errorSanitized: string | null;
  backupId: string | null;
  isDemoData?: boolean;
}

export interface DeploymentReadinessSummary {
  readyToDeploy: boolean;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  notCheckedCount: number;
  totalCount: number;
  readinessStatus: 'NOT_READY' | 'CHECKS_INCOMPLETE' | 'FAILED_CHECKS';
  readinessMessage: string;
}

export interface DeploymentCenterStatusPayload {
  success: boolean;
  phase: 'PHASE_1_READ_ONLY';
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
    githubConnectionStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'NOT_CHECKED';
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
  };
  latestGitHubVersion: {
    repositoryUrl: string;
    version: string;
    commitSha: string;
    latestCommitDate: string;
    branch: string;
    reachable: boolean;
    configured: boolean;
    message: string;
  };
  versionComparison: {
    status: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'NOT_AVAILABLE';
    statusLabel: string;
    summary: string;
    currentServer: VersionInfo;
    latestGitHub: VersionInfo;
    comparisonStatus: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'NOT_AVAILABLE';
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
    ipcTransport: 'WINDOWS_NAMED_PIPE_PENDING_PHASE_2';
    canApproveDeploy: boolean;
    canRollback: boolean;
    verifiedBackupAvailable: boolean;
    statusMessage: string;
  };
  historyStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_CONFIGURED';
  history: DeploymentHistoryRecord[];
  lastCheckedAt: string;
}

/**
 * Phase 2 Future Integration Contract (§5):
 * Separate Windows service/agent communicating over internal Windows IPC (Named Pipe)
 * without opening any new TCP port or running the web server as Windows Administrator.
 */
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

export class DeploymentCenterService {
  private static cachedGitHubVersion: VersionInfo | null = null;
  private static lastPreflightChecklist: DeploymentChecklistItem[] | null = null;

  public static resetStateForTests(): void {
    this.cachedGitHubVersion = null;
    this.lastPreflightChecklist = null;
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
   * Read Current Server Version from explicit build/deployment metadata only.
   * Never invents fake version numbers like v2.0.0 or v2.0.1.
   */
  public static getCurrentServerVersion(): VersionInfo {
    const envVersion = (process.env.SAM_ATT_DEPLOYED_VERSION || '').trim();
    const envCommit = (process.env.SAM_ATT_DEPLOYED_COMMIT_SHA || '').trim();
    const envDate = (process.env.SAM_ATT_DEPLOYED_AT || '').trim();

    if (envVersion || envCommit) {
      return {
        version: envVersion || `commit-${envCommit.slice(0, 8)}`,
        commitSha: envCommit || 'NOT AVAILABLE',
        date: envDate || 'NOT AVAILABLE',
        available: Boolean(envCommit && HEX_COMMIT_SHA_REGEX.test(envCommit)),
        source: 'ENVIRONMENT_METADATA',
      };
    }

    return {
      version: 'NOT CONFIGURED',
      commitSha: 'NOT AVAILABLE',
      date: 'NOT AVAILABLE',
      available: false,
      source: 'NOT_CONFIGURED',
    };
  }

  /**
   * Check 1 Evidence Helper: Fetch Latest GitHub Version strictly from the real GitHub REST API.
   * - Never trusts `SAM_ATT_GITHUB_LATEST_SHA` environment variable to fake a PASS.
   * - Never fabricates a version or commit SHA if GitHub API is unreachable or fails.
   */
  public static async fetchLatestGitHubVersion(forceRefresh = false): Promise<{
    githubStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'NOT_CHECKED';
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
          available: false,
          source: 'NOT_CONFIGURED',
        },
      };
    }

    // Read-only fetch to real GitHub Commits API (with 5-second timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(AUTHORITATIVE_GITHUB_COMMITS_API, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Samchuk-Hospital-SamAttV2-DeploymentCenter',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const unavailable: VersionInfo = {
          version: 'NOT AVAILABLE',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
          available: false,
          source: 'NOT_AVAILABLE',
        };
        this.cachedGitHubVersion = unavailable;
        return {
          githubStatus: 'NOT_AVAILABLE',
          versionInfo: unavailable,
          errorDetail: `GitHub API ตอบกลับด้วยสถานะ HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as {
        sha?: string;
        commit?: { committer?: { date?: string }; author?: { date?: string } };
      };

      const sha = typeof data?.sha === 'string' ? data.sha.trim() : '';
      const rawDate =
        data?.commit?.committer?.date || data?.commit?.author?.date || '';
      const formattedDate = rawDate
        ? rawDate.replace('T', ' ').slice(0, 19)
        : 'NOT AVAILABLE';

      if (!HEX_COMMIT_SHA_REGEX.test(sha)) {
        const unavailable: VersionInfo = {
          version: 'NOT AVAILABLE',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
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
        version: `main@${sha.slice(0, 8)}`,
        commitSha: sha,
        date: formattedDate,
        available: true,
        source: 'GITHUB_API',
      };
      this.cachedGitHubVersion = connectedInfo;
      return {
        githubStatus: 'CONNECTED',
        versionInfo: connectedInfo,
      };
    } catch (err) {
      const unavailable: VersionInfo = {
        version: 'NOT AVAILABLE',
        commitSha: 'NOT AVAILABLE',
        date: 'NOT AVAILABLE',
        available: false,
        source: 'NOT_AVAILABLE',
      };
      this.cachedGitHubVersion = unavailable;
      return {
        githubStatus: 'NOT_AVAILABLE',
        versionInfo: unavailable,
        errorDetail:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถเชื่อมต่อ GitHub API ได้',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Compare Current Server Version vs Latest GitHub Version honestly.
   */
  public static compareVersions(current: VersionInfo, latest: VersionInfo): {
    comparisonStatus: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'NOT_AVAILABLE';
    comparisonMessage: string;
  } {
    if (!current.available || !latest.available) {
      return {
        comparisonStatus: 'NOT_AVAILABLE',
        comparisonMessage:
          'NOT AVAILABLE — ยังไม่มีข้อมูล Commit SHA ที่ยืนยันได้ครบทั้งสองฝั่งสำหรับเปรียบเทียบเวอร์ชันอัตโนมัติ (กรุณากด "ตรวจสอบอัปเดต" และตั้งค่า SAM_ATT_DEPLOYED_COMMIT_SHA จากระบบติดตั้งจริง)',
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
   * Compute overall deployment readiness summary from the 8 checklist items (§4).
   * Never reports readyToDeploy = true unless all 8 items are genuinely PASS AND Phase 2 Agent is active.
   */
  public static computeReadinessSummary(
    checklist: DeploymentChecklistItem[]
  ): DeploymentReadinessSummary {
    const passedCount = checklist.filter((i) => i.status === 'PASS').length;
    const failedCount = checklist.filter((i) => i.status === 'FAIL').length;
    const warningCount = checklist.filter((i) => i.status === 'WARNING').length;
    const notCheckedCount = checklist.filter(
      (i) => i.status === 'NOT_CHECKED' || i.status === 'NOT_AVAILABLE'
    ).length;
    const totalCount = checklist.length;

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
      };
    }

    return {
      readyToDeploy: false,
      passedCount,
      failedCount,
      warningCount,
      notCheckedCount,
      totalCount,
      readinessStatus: notCheckedCount > 0 ? 'CHECKS_INCOMPLETE' : 'NOT_READY',
      readinessMessage:
        notCheckedCount > 0 || warningCount > 0
          ? `ยังไม่พร้อม Deploy — มีรายการที่ยังไม่ได้ตรวจสอบหรือไม่มีหลักฐานยืนยัน (${notCheckedCount} รายการ NOT CHECKED, ${warningCount} รายการ WARNING)`
          : 'Phase 1 Read-Only Mode — ระบบปิดการสั่ง Deploy จากหน้าเว็บจนกว่าจะมี Phase 2 Deployment Agent',
    };
  }

  /**
   * Evaluate the 8-item Pre-Deployment Checklist strictly from real evidence (§1 & §3).
   * Zero False PASS Policy:
   * - Never hardcodes PASS.
   * - Never returns PASS from mere file existence (`package.json`, `node_modules`, `dist/index.html`).
   * - Never returns PASS from unverified environment variables (`SAM_ATT_LAST_TEST_STATUS=PASS`,
   *   `SAM_ATT_BACKUP_VERIFIED=true`, `SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true`).
   */
  public static async evaluateChecklist(
    repo: ISamAttRepository,
    executeLivePreflight: boolean
  ): Promise<DeploymentChecklistItem[]> {
    if (!executeLivePreflight && this.lastPreflightChecklist) {
      return this.lastPreflightChecklist;
    }

    const nowStr = new Date().toISOString();
    const dbName =
      process.env.SAM_ATT_DB_NAME?.trim() ||
      repo.getDatabaseName() ||
      AUTHORITATIVE_PRODUCTION_DATABASE_NAME;

    if (!executeLivePreflight) {
      return [
        {
          id: 'github_source',
          stepNumber: 1,
          label: '1. GitHub Source ตรวจสอบผ่าน',
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
          label: '5. Backup พร้อม',
          description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันพร้อมหลักฐานความสมบูรณ์ก่อนอัปเดต',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่มีระบบ Backup Agent และยังไม่มีหลักฐานตรวจสอบความสมบูรณ์ของ Backup จริง',
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
            'NOT_CHECKED — ยังไม่มีกลไกตรวจสอบเส้นทาง /api/Sam_Att/ จาก Central API Gateway พอร์ต 3002 ที่มีหลักฐานยืนยันได้จริง (ไม่สรุป PASS เพียงเพราะมี Router หรือกำหนดค่าพอร์ต)',
          checkedAt: null,
        },
        {
          id: 'procurement_health',
          stepNumber: 8,
          label: '8. Procurement Health Check ผ่าน',
          description: 'ตรวจสอบผล Health Check จริงของระบบ Procurement บน Central API Gateway',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED — ยังไม่มี Endpoint หรือกลไกตรวจสอบสถานะระบบ Procurement ที่ได้รับการยืนยัน (ไม่เชื่อถือค่า Environment Variable เพียงอย่างเดียว)',
          checkedAt: null,
        },
      ];
    }

    // =========================================================================
    // Live Read-Only Preflight Evaluation (Evidence-Based Only — Zero False PASS)
    // =========================================================================

    // Check 1 — GitHub Source (§3 Check 1):
    // Must verify GitHub Repository and Commit SHA from the real GitHub API.
    // If calling GitHub API fails, MUST NOT display PASS.
    const ghCheck = await this.fetchLatestGitHubVersion(true);
    const isGitHubVerifiedFromApi =
      ghCheck.githubStatus === 'CONNECTED' &&
      ghCheck.versionInfo.available &&
      ghCheck.versionInfo.source === 'GITHUB_API' &&
      HEX_COMMIT_SHA_REGEX.test(ghCheck.versionInfo.commitSha);

    const githubStatus: ChecklistItemStatus = isGitHubVerifiedFromApi ? 'PASS' : 'FAIL';
    const githubDetail = isGitHubVerifiedFromApi
      ? `PASS — ตรวจสอบจาก GitHub API จริงสำเร็จ (${AUTHORITATIVE_GITHUB_REPO_URL}) ล่าสุด Commit SHA: ${ghCheck.versionInfo.commitSha} เมื่อ ${ghCheck.versionInfo.date}`
      : `FAIL — ไม่สามารถยืนยัน Commit SHA จาก GitHub API จริงได้ (${
          ghCheck.errorDetail || 'GitHub API unreachable'
        }) ห้ามสรุป PASS เมื่อเรียก GitHub API ไม่สำเร็จ`;

    // Check 2 — Dependencies (§3 Check 2):
    // Finding package.json and node_modules alone is NOT sufficient to return PASS.
    // Without verifiable evidence from a trusted Build/Test process, return NOT_CHECKED (or FAIL if files are missing).
    const pkgJsonExists = fs.existsSync(path.resolve(process.cwd(), 'package.json'));
    const nodeModulesExists = fs.existsSync(path.resolve(process.cwd(), 'node_modules'));
    const depStatus: ChecklistItemStatus =
      !pkgJsonExists || !nodeModulesExists ? 'FAIL' : 'NOT_CHECKED';
    const depDetail =
      depStatus === 'FAIL'
        ? 'FAIL — ไม่พบไฟล์ package.json หรือโฟลเดอร์ node_modules บนเซิร์ฟเวอร์'
        : 'NOT_CHECKED — พบไฟล์ package.json และ node_modules บนดิสก์ แต่การมีไฟล์เพียงอย่างเดียวไม่เพียงพอที่จะยืนยันว่า Dependencies ถูกต้องครบถ้วน (ต้องรอผลตรวจสอบที่มีหลักฐานจากกระบวนการ Build/Test ของ Deployment Agent ใน Phase 2)';

    // Check 3 — Production Build (§3 Check 3):
    // Must NEVER return PASS merely because dist/index.html exists on disk.
    // Requires verifiable Build Evidence proving the build succeeded AND matches the verified Commit SHA.
    const distIndexExists = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
    const buildStatus: ChecklistItemStatus = 'NOT_CHECKED';
    const buildDetail = distIndexExists
      ? 'NOT_CHECKED — พบไฟล์ dist/index.html บนดิสก์ แต่ยังไม่มีหลักฐานการ Build (Build Evidence) ที่ยืนยันว่า Build สำเร็จและสัมพันธ์กับ Commit SHA ที่ตรวจสอบ (ห้ามสรุป PASS จากการมีไฟล์เพียงอย่างเดียว)'
      : 'NOT_CHECKED — ยังไม่พบไฟล์ dist/index.html และยังไม่ได้ตรวจสอบการ Build จริงจากกระบวนการที่เชื่อถือได้';

    // Check 4 — Automated Tests (§3 Check 4):
    // Must NEVER trust SAM_ATT_LAST_TEST_STATUS=PASS alone.
    // Requires traceable test evidence (Commit SHA, Timestamp, and Test Result from a trusted runner).
    const envTestStatus = (process.env.SAM_ATT_LAST_TEST_STATUS || '').trim().toUpperCase();
    const testStatus: ChecklistItemStatus =
      envTestStatus === 'FAIL' ? 'FAIL' : 'NOT_CHECKED';
    const testDetail =
      envTestStatus === 'FAIL'
        ? 'FAIL — มีรายงานผลทดสอบล่าสุดไม่ผ่านเกณฑ์ (FAIL)'
        : envTestStatus === 'PASS'
        ? 'NOT_CHECKED — พบค่า SAM_ATT_LAST_TEST_STATUS=PASS แต่ไม่มีหลักฐานผลทดสอบที่ตรวจสอบย้อนกลับได้ (Commit SHA, Timestamp และผลลัพธ์จากกระบวนการที่เชื่อถือได้) จึงไม่อนุญาตให้แสดง PASS'
        : 'NOT_CHECKED — ยังไม่มีหลักฐานผลทดสอบ Automated Tests ที่ผูกกับ Commit SHA และ Timestamp จากกระบวนการที่เชื่อถือได้';

    // Check 5 — Backup (§3 Check 5):
    // Must NEVER trust SAM_ATT_BACKUP_VERIFIED=true alone.
    // Requires a real Backup Agent and verifiable backup archive + integrity check.
    const envBackupFlag = (process.env.SAM_ATT_BACKUP_VERIFIED || '').trim().toLowerCase();
    const backupStatus: ChecklistItemStatus = 'NOT_CHECKED';
    const backupDetail =
      envBackupFlag === 'true'
        ? 'NOT_CHECKED — พบค่า SAM_ATT_BACKUP_VERIFIED=true แต่ยังไม่มีระบบ Backup Agent และไม่พบหลักฐานการตรวจสอบความสมบูรณ์ของไฟล์สำรองจริง จึงไม่อนุญาตให้แสดง PASS'
        : 'NOT_CHECKED — ยังไม่มีระบบ Backup Agent และยังไม่มีหลักฐานชุดข้อมูลสำรองที่ตรวจสอบความสมบูรณ์แล้ว';

    // Check 6 — Database Configuration (§3 Check 6):
    // Verify real MySQL connectivity via repo.checkHealth().
    // Must confirm:
    // 1. repo.mode === 'REAL'
    // 2. health.healthy === true
    // 3. database name matches 'samchuk_attendance_v2'
    // 4. Not using Mock Data or Test Database
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
      dbCheckDetail = `FAIL — การเชื่อมต่อฐานข้อมูลล้มเหลว: ${
        err instanceof Error ? err.message : 'Unknown database error'
      }`;
    }

    // Check 7 — Central API Gateway (§3 Check 7):
    // Must NOT hardcode PASS or return PASS merely because Router exists or Port 3002 is configured.
    // Since there is no verified external Gateway health probe in Phase 1, return NOT_CHECKED with reason.
    const gatewayStatus: ChecklistItemStatus = 'NOT_CHECKED';
    const gatewayDetail =
      'NOT_CHECKED — ยังไม่มีกลไก Health Check ที่เชื่อถือได้สำหรับยืนยันเส้นทาง /api/Sam_Att/ จาก Central API Gateway พอร์ต 3002 โดยตรง (ไม่สรุป PASS เพียงเพราะมี Router หรือกำหนดค่า Port 3002)';

    // Check 8 — Procurement Health Check (§3 Check 8):
    // Must NEVER trust SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true alone, and never treat HTTP 404 as healthy.
    const envProcurementFlag = (
      process.env.SAM_ATT_PROCUREMENT_HEALTH_VERIFIED || ''
    )
      .trim()
      .toLowerCase();
    const procurementStatus: ChecklistItemStatus = 'NOT_CHECKED';
    const procurementDetail =
      envProcurementFlag === 'true'
        ? 'NOT_CHECKED — พบค่า SAM_ATT_PROCUREMENT_HEALTH_VERIFIED=true แต่ไม่มีผลตรวจสอบจริงจาก Endpoint หรือกลไกที่ได้รับการยืนยัน จึงไม่อนุญาตให้แสดง PASS'
        : 'NOT_CHECKED — ยังไม่มี Endpoint หรือกลไกตรวจสอบสถานะระบบ Procurement ที่ได้รับการยืนยันว่าถูกต้อง (ไม่ถือว่า HTTP 404 จาก /api/Procurement/health หมายถึงทำงานปกติ)';

    const checklist: DeploymentChecklistItem[] = [
      {
        id: 'github_source',
        stepNumber: 1,
        label: '1. GitHub Source ตรวจสอบผ่าน',
        description: `ตรวจสอบการเข้าถึง Repository ${AUTHORITATIVE_GITHUB_REPO_URL} และ Commit SHA จาก GitHub API จริง`,
        status: githubStatus,
        detail: githubDetail,
        checkedAt: nowStr,
      },
      {
        id: 'dependencies',
        stepNumber: 2,
        label: '2. Dependencies พร้อม',
        description: 'ตรวจสอบความถูกต้องของ Dependencies จากหลักฐานกระบวนการ Build/Test ที่เชื่อถือได้',
        status: depStatus,
        detail: depDetail,
        checkedAt: nowStr,
      },
      {
        id: 'build',
        stepNumber: 3,
        label: '3. Build ผ่าน',
        description: 'ตรวจสอบหลักฐานว่า Production Build สำเร็จและ Artifact ตรงกับ Commit SHA ที่ตรวจสอบ',
        status: buildStatus,
        detail: buildDetail,
        checkedAt: nowStr,
      },
      {
        id: 'automated_tests',
        stepNumber: 4,
        label: '4. Automated Tests ผ่าน',
        description: 'ตรวจสอบหลักฐานผลการรัน Automated Tests ที่ผูกกับ Commit SHA และเวลาที่ตรวจสอบ',
        status: testStatus,
        detail: testDetail,
        checkedAt: nowStr,
      },
      {
        id: 'backup',
        stepNumber: 5,
        label: '5. Backup พร้อม',
        description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันพร้อมหลักฐานความสมบูรณ์ก่อนอัปเดต',
        status: backupStatus,
        detail: backupDetail,
        checkedAt: nowStr,
      },
      {
        id: 'database_config',
        stepNumber: 6,
        label: '6. Database Configuration ถูกต้อง',
        description: `ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล MySQL จริง (${AUTHORITATIVE_PRODUCTION_DATABASE_NAME})`,
        status: dbCheckStatus,
        detail: dbCheckDetail,
        checkedAt: nowStr,
      },
      {
        id: 'central_gateway',
        stepNumber: 7,
        label: '7. Central API Gateway พร้อม',
        description: 'ตรวจสอบหลักฐานการทำงานของเส้นทาง /api/Sam_Att/ บน Central API Gateway พอร์ต 3002',
        status: gatewayStatus,
        detail: gatewayDetail,
        checkedAt: nowStr,
      },
      {
        id: 'procurement_health',
        stepNumber: 8,
        label: '8. Procurement Health Check ผ่าน',
        description: 'ตรวจสอบผล Health Check จริงของระบบ Procurement บน Central API Gateway',
        status: procurementStatus,
        detail: procurementDetail,
        checkedAt: nowStr,
      },
    ];

    this.lastPreflightChecklist = checklist;
    return checklist;
  }

  /**
   * Read Deployment History from environment/audit logs if configured, or return NOT_CONFIGURED / empty list.
   * Never fabricates fake deployment records in production.
   */
  public static async getDeploymentHistory(repo: ISamAttRepository): Promise<{
    historyStatus: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_CONFIGURED';
    history: DeploymentHistoryRecord[];
  }> {
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
              return {
                id: String(item.id || `DEP_${idx + 1}`),
                deployedAt: String(item.deployedAt || 'NOT AVAILABLE'),
                version: versionStr,
                commitSha: commitStr,
                versionOrCommit: commitStr !== 'NOT AVAILABLE' ? commitStr : versionStr,
                actor: actorUsername,
                actorName: actorFullName,
                actorUsername,
                actorFullName,
                status:
                  item.status === 'FAILED'
                    ? 'FAILED'
                    : item.status === 'ROLLED_BACK'
                    ? 'ROLLED_BACK'
                    : 'SUCCESS',
                summary: String(item.summary || 'บันทึกประวัติการอัปเดตระบบ'),
                errorSanitized: item.errorSanitized ? String(item.errorSanitized) : null,
                backupId: item.backupId ? String(item.backupId) : null,
              };
            }),
          };
        }
      } catch {
        // Ignore malformed env JSON
      }
    }

    // Check if any deployment center audit logs exist in repository
    const logs = await repo.getAuditLogs(100);
    const deploymentActions = new Set([
      'DEPLOYMENT_EXECUTED',
      'DEPLOYMENT_PREFLIGHT_CHECK',
      'DEPLOYMENT_CHECK_UPDATES',
      'DEPLOYMENT_APPROVE_ATTEMPT',
      'DEPLOYMENT_ROLLBACK_ATTEMPT',
    ]);
    const deployAuditLogs = logs.filter((l) => deploymentActions.has(l.action));
    if (deployAuditLogs.length > 0) {
      return {
        historyStatus: 'AVAILABLE',
        history: deployAuditLogs.map((l) => {
          const versionStr = String(l.metadata?.version || 'Phase 1 Read-Only');
          const commitStr = String(
            l.metadata?.commitSha || l.metadata?.latestCommitSha || 'NOT AVAILABLE'
          );
          return {
            id: l.id,
            deployedAt: l.timestamp,
            version: versionStr,
            commitSha: commitStr,
            versionOrCommit: commitStr !== 'NOT AVAILABLE' ? commitStr : versionStr,
            actor: l.actor,
            actorName: l.actorName,
            actorUsername: l.actor,
            actorFullName: l.actorName,
            status:
              l.metadata?.status === 'FAILED'
                ? 'FAILED'
                : l.metadata?.status === 'ROLLED_BACK'
                ? 'ROLLED_BACK'
                : 'SUCCESS',
            summary: l.summary,
            errorSanitized: l.metadata?.errorSanitized
              ? String(l.metadata.errorSanitized)
              : null,
            backupId: l.metadata?.backupId ? String(l.metadata.backupId) : null,
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
   * Build the full Phase 1 Deployment Center Status Payload.
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
    const deploymentReadiness = this.computeReadinessSummary(checklist);
    const { historyStatus, history } = await this.getDeploymentHistory(repo);

    const statusLabel =
      comparison.comparisonStatus === 'UP_TO_DATE'
        ? 'ระบบเป็นเวอร์ชันล่าสุด (UP TO DATE)'
        : comparison.comparisonStatus === 'UPDATE_AVAILABLE'
        ? 'มีอัปเดตใหม่จาก GitHub (UPDATE AVAILABLE)'
        : 'ยังไม่สามารถเปรียบเทียบเวอร์ชันได้ (NOT AVAILABLE)';

    const lockMessage =
      'NOT CONFIGURED (Phase 1 Read-Only): ปุ่มอนุมัติ Deploy และ Rollback ถูกปิดใช้งานอย่างปลอดภัยจนกว่าจะติดตั้ง Backend Deployment Agent บน FILESERVER ใน Phase 2';

    return {
      success: true,
      phase: 'PHASE_1_READ_ONLY',
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
      },
      latestGitHubVersion: {
        repositoryUrl: AUTHORITATIVE_GITHUB_REPO_URL,
        version: latestGitHub.version,
        commitSha: latestGitHub.commitSha,
        latestCommitDate: latestGitHub.date,
        branch: 'main',
        reachable: latestGitHub.available,
        configured: latestGitHub.available,
        message: comparison.comparisonMessage,
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
        phase2AgentAvailable: false,
        approveEnabled: false,
        rollbackEnabled: false,
        lockReason: lockMessage,
        agentAvailable: false,
        agentStatus: 'NOT_CONFIGURED',
        ipcTransport: 'WINDOWS_NAMED_PIPE_PENDING_PHASE_2',
        canApproveDeploy: false,
        canRollback: false,
        verifiedBackupAvailable: false,
        statusMessage: lockMessage,
      },
      historyStatus,
      history,
      lastCheckedAt: nowStr,
    };
  }
}
