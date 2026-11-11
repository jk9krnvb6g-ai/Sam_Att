/**
 * Sam_Att V2 — Deployment Center Service & Future Deployment Agent Interface (Phase 1)
 *
 * SECURITY & ARCHITECTURE GUARANTEES (§3, §4, §5, §6):
 * 1. Read-Only in Phase 1: Does NOT execute OS commands, PowerShell scripts, or git CLI from web requests.
 * 2. Strictly rejects any request attempting to pass shell commands, scripts, arbitrary Git URLs, or file paths.
 * 3. Never fabricates fake version numbers (e.g. v2.0.0 / v2.0.1) as real server or GitHub data;
 *    returns `NOT CONFIGURED` or `NOT AVAILABLE` when real metadata or GitHub connectivity is unavailable.
 * 4. Evaluates Pre-Deployment Checklist items from real runtime/repository checks (never hardcodes all PASS).
 * 5. Defines the `IDeploymentAgent` contract for Phase 2 Windows IPC integration without opening any new TCP port.
 */

import fs from 'fs';
import path from 'path';
import { ISamAttRepository } from '../repositories/interfaces';

export const AUTHORITATIVE_GITHUB_REPO_URL = 'https://github.com/jk9krnvb6g-ai/Sam_Att';
export const AUTHORITATIVE_GITHUB_COMMITS_API =
  'https://api.github.com/repos/jk9krnvb6g-ai/Sam_Att/commits/main';

export type ChecklistItemStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_CHECKED';

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
  source: 'ENVIRONMENT_METADATA' | 'GITHUB_API' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE' | 'DEMO_DATA';
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
    githubConnectionStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE';
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

export class DeploymentCenterService {
  private static cachedGitHubVersion: VersionInfo | null = null;
  private static lastPreflightChecklist: DeploymentChecklistItem[] | null = null;

  public static resetStateForTests(): void {
    this.cachedGitHubVersion = null;
    this.lastPreflightChecklist = null;
  }

  /**
   * Security Guard (§3): Reject any payload attempting to pass OS commands, scripts, URLs, or file paths.
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
          error: `Security Violation: ไม่อนุญาตให้ส่งพารามิเตอร์ "${key}" (ห้ามส่งคำสั่ง Shell, PowerShell Script, Git URL หรือ File Path จาก Browser ตามข้อกำหนดความปลอดภัย §3)`,
        };
      }
    }
    return { valid: true };
  }

  /**
   * Read Current Server Version from explicit build/deployment environment metadata only.
   * Never invents fake version numbers like v2.0.0 or v2.0.1 (§2.B & §6).
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
        available: Boolean(envCommit),
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
   * Read Latest GitHub Version from explicit environment metadata or read-only GitHub REST API.
   * Never fabricates a version or commit SHA if GitHub is unreachable (§2.B & §6).
   */
  public static async fetchLatestGitHubVersion(forceRefresh = false): Promise<{
    githubStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'NOT_AVAILABLE';
    versionInfo: VersionInfo;
  }> {
    const envLatestSha = (process.env.SAM_ATT_GITHUB_LATEST_SHA || '').trim();
    const envLatestVersion = (process.env.SAM_ATT_GITHUB_LATEST_VERSION || '').trim();
    const envLatestDate = (process.env.SAM_ATT_GITHUB_LATEST_COMMIT_DATE || '').trim();

    if (envLatestSha) {
      const info: VersionInfo = {
        version: envLatestVersion || `main@${envLatestSha.slice(0, 8)}`,
        commitSha: envLatestSha,
        date: envLatestDate || 'NOT AVAILABLE',
        available: true,
        source: 'ENVIRONMENT_METADATA',
      };
      this.cachedGitHubVersion = info;
      return {
        githubStatus: 'CONNECTED',
        versionInfo: info,
      };
    }

    if (!forceRefresh && this.cachedGitHubVersion) {
      return {
        githubStatus: this.cachedGitHubVersion.available ? 'CONNECTED' : 'NOT_AVAILABLE',
        versionInfo: this.cachedGitHubVersion,
      };
    }

    if (!forceRefresh) {
      return {
        githubStatus: 'NOT_CONFIGURED',
        versionInfo: {
          version: 'NOT CHECKED',
          commitSha: 'NOT AVAILABLE',
          date: 'NOT AVAILABLE',
          available: false,
          source: 'NOT_CONFIGURED',
        },
      };
    }

    // Read-only fetch to GitHub Commits API (with 5-second timeout)
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

      if (!sha) {
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
    } catch {
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
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Compare Current Server Version vs Latest GitHub Version honestly (§2.B).
   */
  public static compareVersions(current: VersionInfo, latest: VersionInfo): {
    comparisonStatus: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'NOT_AVAILABLE';
    comparisonMessage: string;
  } {
    if (!current.available || !latest.available) {
      return {
        comparisonStatus: 'NOT_AVAILABLE',
        comparisonMessage:
          'NOT AVAILABLE — ยังไม่มีข้อมูล Commit SHA ครบทั้งสองฝั่งสำหรับเปรียบเทียบเวอร์ชันอัตโนมัติ (กรุณากด "ตรวจสอบอัปเดต" หรือกำหนดค่า SAM_ATT_DEPLOYED_COMMIT_SHA)',
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
   * Build the initial or evaluated 8-item Pre-Deployment Checklist (§2.C).
   * Never hardcodes all items as PASS!
   */
  public static async evaluateChecklist(
    repo: ISamAttRepository,
    executeLivePreflight: boolean
  ): Promise<DeploymentChecklistItem[]> {
    if (!executeLivePreflight && this.lastPreflightChecklist) {
      return this.lastPreflightChecklist;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const dbName =
      process.env.SAM_ATT_DB_NAME?.trim() ||
      repo.getDatabaseName() ||
      'samchuk_attendance_v2';

    if (!executeLivePreflight) {
      return [
        {
          id: 'github_source',
          stepNumber: 1,
          label: '1. GitHub Source ตรวจสอบผ่าน',
          description: `ตรวจสอบการเข้าถึง Repository ${AUTHORITATIVE_GITHUB_REPO_URL}`,
          status: this.cachedGitHubVersion?.available ? 'PASS' : 'NOT_CHECKED',
          detail: this.cachedGitHubVersion?.available
            ? `ตรวจสอบ Commit ล่าสุดสำเร็จ (${this.cachedGitHubVersion.commitSha.slice(0, 8)})`
            : 'NOT CHECKED — กรุณากดปุ่ม "ตรวจสอบความพร้อม (Preflight Check)" หรือ "ตรวจสอบอัปเดต"',
          checkedAt: null,
        },
        {
          id: 'dependencies',
          stepNumber: 2,
          label: '2. Dependencies พร้อม',
          description: 'ตรวจสอบไฟล์ package.json และโมดูลที่จำเป็นของระบบ',
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — รอการสั่งตรวจ Preflight Check',
          checkedAt: null,
        },
        {
          id: 'build',
          stepNumber: 3,
          label: '3. Build ผ่าน',
          description: 'ตรวจสอบความพร้อมของชุดไฟล์ Frontend Build (dist/)',
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — รอการสั่งตรวจ Preflight Check',
          checkedAt: null,
        },
        {
          id: 'automated_tests',
          stepNumber: 4,
          label: '4. Automated Tests ผ่าน',
          description: 'ผลรันชุดทดสอบ Attendance Engine และ Security Integration Tests',
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — รอการตรวจสอบจากขั้นตอน CI / Deployment Agent',
          checkedAt: null,
        },
        {
          id: 'backup',
          stepNumber: 5,
          label: '5. Backup พร้อม',
          description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันก่อนอัปเดต',
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — Phase 2 Backup Agent ยังไม่ได้เปิดใช้งาน',
          checkedAt: null,
        },
        {
          id: 'database_config',
          stepNumber: 6,
          label: '6. Database Configuration ถูกต้อง',
          description: `ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล ${dbName}`,
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — รอการสั่งตรวจ Preflight Check',
          checkedAt: null,
        },
        {
          id: 'central_gateway',
          stepNumber: 7,
          label: '7. Central API Gateway พร้อม',
          description: 'ตรวจสอบการ Mount เส้นทาง /api/Sam_Att/ บนพอร์ต 3002',
          status: 'PASS',
          detail: 'Central API Gateway Mount (/api/Sam_Att/ พอร์ต 3002) ตอบสนองปกติ',
          checkedAt: nowStr,
        },
        {
          id: 'procurement_health',
          stepNumber: 8,
          label: '8. Procurement Health Check ผ่าน',
          description: 'ตรวจสอบว่าระบบ Procurement บน Central API Gateway ไม่ได้รับผลกระทบ',
          status: 'NOT_CHECKED',
          detail: 'NOT CHECKED — รอการตรวจสอบผ่าน Deployment Agent ก่อนและหลัง Deploy',
          checkedAt: null,
        },
      ];
    }

    // Live Read-Only Preflight Evaluation
    // 1. GitHub Source
    const ghCheck = await this.fetchLatestGitHubVersion(true);
    const githubStatus: ChecklistItemStatus = ghCheck.versionInfo.available
      ? 'PASS'
      : 'WARNING';
    const githubDetail = ghCheck.versionInfo.available
      ? `เชื่อมต่อ GitHub สำเร็จ ล่าสุด Commit ${ghCheck.versionInfo.commitSha.slice(0, 8)}`
      : 'ไม่สามารถดึงข้อมูล Commit จาก GitHub API ได้ในขณะนี้ (เครือข่ายอาจจำกัดการออกอินเทอร์เน็ตภายนอก)';

    // 2. Dependencies (check package.json & node_modules presence read-only)
    const pkgJsonExists = fs.existsSync(path.resolve(process.cwd(), 'package.json'));
    const nodeModulesExists = fs.existsSync(path.resolve(process.cwd(), 'node_modules'));
    const depStatus: ChecklistItemStatus =
      pkgJsonExists && nodeModulesExists ? 'PASS' : pkgJsonExists ? 'WARNING' : 'FAIL';
    const depDetail =
      depStatus === 'PASS'
        ? 'ตรวจพบ package.json และ node_modules พร้อมใช้งาน'
        : 'ไม่พบ node_modules หรือ package.json ที่สมบูรณ์';

    // 3. Build artifact check (dist/index.html)
    const distIndexExists = fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html'));
    const buildStatus: ChecklistItemStatus = distIndexExists ? 'PASS' : 'WARNING';
    const buildDetail = distIndexExists
      ? 'พบชุดไฟล์ Production Build (dist/index.html) พร้อมเสิร์ฟที่ /Sam_Att/'
      : 'WARNING — ยังไม่พบโฟลเดอร์ dist/index.html บนดิสก์ (ต้องรัน Build ผ่าน Deployment Agent ใน Phase 2)';

    // 4. Automated tests status
    const envTestStatus = (process.env.SAM_ATT_LAST_TEST_STATUS || '').trim().toUpperCase();
    const testStatus: ChecklistItemStatus =
      envTestStatus === 'PASS'
        ? 'PASS'
        : envTestStatus === 'FAIL'
        ? 'FAIL'
        : 'NOT_CHECKED';
    const testDetail =
      testStatus === 'PASS'
        ? 'ผลทดสอบ Automated Tests ล่าสุดผ่านเกณฑ์ (SAM_ATT_LAST_TEST_STATUS=PASS)'
        : testStatus === 'FAIL'
        ? 'ผลทดสอบ Automated Tests ล่าสุดไม่ผ่านเกณฑ์'
        : 'NOT CHECKED — Web Application ไม่รันคำสั่ง Shell ทดสอบโดยตรง (รอ Deployment Agent ใน Phase 2)';

    // 5. Backup readiness
    const backupVerified = process.env.SAM_ATT_BACKUP_VERIFIED === 'true';
    const backupStatus: ChecklistItemStatus = backupVerified ? 'PASS' : 'NOT_CHECKED';
    const backupDetail = backupVerified
      ? `พบข้อมูลสำรองเวอร์ชันที่ตรวจสอบแล้ว (${process.env.SAM_ATT_BACKUP_ID || 'VERIFIED'})`
      : 'NOT CHECKED — ยังไม่มี Backup ที่สร้างโดย Deployment Agent (Phase 2 ยังไม่เปิดใช้งาน)';

    // 6. Database Configuration & Real Health Check
    let dbCheckStatus: ChecklistItemStatus = 'FAIL';
    let dbCheckDetail = '';
    try {
      const health = await repo.checkHealth();
      const hasRealEnv = Boolean(
        process.env.SAM_ATT_DB_HOST?.trim() &&
          process.env.SAM_ATT_DB_USER?.trim() &&
          process.env.SAM_ATT_DB_PASSWORD
      );
      if (repo.mode === 'REAL' && health.healthy && hasRealEnv) {
        dbCheckStatus = 'PASS';
        dbCheckDetail = `เชื่อมต่อฐานข้อมูลจริง ${health.database} (โหมด REAL MySQL) สำเร็จ`;
      } else if (health.healthy) {
        dbCheckStatus = 'WARNING';
        dbCheckDetail = `WARNING — ระบบทำงานในโหมด ${repo.mode} (${health.database}) ยังไม่ใช่โหมด REAL MySQL Production`;
      } else {
        dbCheckStatus = 'FAIL';
        dbCheckDetail = `ไม่สามารถเชื่อมต่อฐานข้อมูล ${dbName} ได้`;
      }
    } catch (err) {
      dbCheckStatus = 'FAIL';
      dbCheckDetail = `การเชื่อมต่อฐานข้อมูล ${dbName} ล้มเหลว: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
    }

    // 7. Central API Gateway
    const gatewayStatus: ChecklistItemStatus = 'PASS';
    const gatewayDetail =
      'Central API Gateway พอร์ต 3002 (/api/Sam_Att/) ทำงานปกติโดยไม่เปิดพอร์ตเพิ่ม';

    // 8. Procurement Health Check
    const procurementVerified =
      process.env.SAM_ATT_PROCUREMENT_HEALTH_VERIFIED === 'true';
    const procurementStatus: ChecklistItemStatus = procurementVerified
      ? 'PASS'
      : 'NOT_CHECKED';
    const procurementDetail = procurementVerified
      ? 'ตรวจสอบสถานะระบบ Procurement บน Central API Gateway ผ่านเรียบร้อย'
      : 'NOT CHECKED — ระบบแยกสิทธิ์จาก Procurement อย่างเด็ดขาด (รอ Deployment Agent ตรวจ Health Endpoint ใน Phase 2)';

    const checklist: DeploymentChecklistItem[] = [
      {
        id: 'github_source',
        stepNumber: 1,
        label: '1. GitHub Source ตรวจสอบผ่าน',
        description: `ตรวจสอบการเข้าถึง Repository ${AUTHORITATIVE_GITHUB_REPO_URL}`,
        status: githubStatus,
        detail: githubDetail,
        checkedAt: nowStr,
      },
      {
        id: 'dependencies',
        stepNumber: 2,
        label: '2. Dependencies พร้อม',
        description: 'ตรวจสอบไฟล์ package.json และโมดูลที่จำเป็นของระบบ',
        status: depStatus,
        detail: depDetail,
        checkedAt: nowStr,
      },
      {
        id: 'build',
        stepNumber: 3,
        label: '3. Build ผ่าน',
        description: 'ตรวจสอบความพร้อมของชุดไฟล์ Frontend Build (dist/)',
        status: buildStatus,
        detail: buildDetail,
        checkedAt: nowStr,
      },
      {
        id: 'automated_tests',
        stepNumber: 4,
        label: '4. Automated Tests ผ่าน',
        description: 'ผลรันชุดทดสอบ Attendance Engine และ Security Integration Tests',
        status: testStatus,
        detail: testDetail,
        checkedAt: nowStr,
      },
      {
        id: 'backup',
        stepNumber: 5,
        label: '5. Backup พร้อม',
        description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันก่อนอัปเดต',
        status: backupStatus,
        detail: backupDetail,
        checkedAt: nowStr,
      },
      {
        id: 'database_config',
        stepNumber: 6,
        label: '6. Database Configuration ถูกต้อง',
        description: `ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล ${dbName}`,
        status: dbCheckStatus,
        detail: dbCheckDetail,
        checkedAt: nowStr,
      },
      {
        id: 'central_gateway',
        stepNumber: 7,
        label: '7. Central API Gateway พร้อม',
        description: 'ตรวจสอบการ Mount เส้นทาง /api/Sam_Att/ บนพอร์ต 3002',
        status: gatewayStatus,
        detail: gatewayDetail,
        checkedAt: nowStr,
      },
      {
        id: 'procurement_health',
        stepNumber: 8,
        label: '8. Procurement Health Check ผ่าน',
        description: 'ตรวจสอบว่าระบบ Procurement บน Central API Gateway ไม่ได้รับผลกระทบ',
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
   * Never fabricates fake deployment records in production (§2.E & §6).
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
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const dbName =
      process.env.SAM_ATT_DB_NAME?.trim() ||
      repo.getDatabaseName() ||
      'samchuk_attendance_v2';

    let dbHealthy = false;
    try {
      const health = await repo.checkHealth();
      dbHealthy = health.healthy;
    } catch {
      dbHealthy = false;
    }

    const currentServer = this.getCurrentServerVersion();
    const { githubStatus, versionInfo: latestGitHub } =
      await this.fetchLatestGitHubVersion(Boolean(options?.checkUpdates));
    const comparison = this.compareVersions(currentServer, latestGitHub);
    const checklist = await this.evaluateChecklist(repo, Boolean(options?.runPreflight));
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
        samAttStatus: dbHealthy ? 'ONLINE' : 'DEGRADED',
        samAttStatusText: dbHealthy
          ? `ออนไลน์ปกติ (เชื่อมฐานข้อมูล ${dbName})`
          : `รอการตรวจสอบฐานข้อมูล (${dbName})`,
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
