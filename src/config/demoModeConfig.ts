import { UserAccount } from '../types/attendance';
import { DeploymentCenterStatusPayload } from '../types/deploymentCenter';

/**
 * Sam_Att V2 — Development Preview Demo Admin Configuration
 *
 * SECURITY INVARIANTS:
 * 1. Exclusively active when Vite compile-time flags satisfy `import.meta.env.DEV && !import.meta.env.PROD`.
 * 2. Never creates a user in `samchuk_attendance_v2`.
 * 3. Never issues or stores a Backend JWT / Bearer token.
 * 4. Never bypasses Backend authentication/authorization middleware.
 * 5. Never calls Production APIs when active; uses clearly labeled `DEMO DATA` fixtures.
 * 6. Dead-code eliminated in Production builds (`npm run build`), so it cannot be enabled via
 *    URL parameters, `localStorage`, or browser console in Production.
 */

export function isDemoAdminBuildAllowed(): boolean {
  if (import.meta.env.DEV && !import.meta.env.PROD) {
    return true;
  }
  return false;
}

export function getDemoAdminUser(): UserAccount | null {
  if (import.meta.env.DEV && !import.meta.env.PROD) {
    return {
      id: 'DEMO_PREVIEW_ADMIN_ONLY',
      username: 'demo_admin_preview',
      fullName: 'Demo Administrator',
      role: 'ADMIN',
      personId: null,
      department: 'Development Preview (Google AI Studio)',
      position: 'ADMIN (Frontend Preview Only — No Backend Token)',
      active: true,
    };
  }
  return null;
}

export function getDemoDeploymentCenterPayload(): DeploymentCenterStatusPayload | null {
  if (import.meta.env.DEV && !import.meta.env.PROD) {
    const nowIso = new Date().toISOString();
    return {
      success: true,
      phase: 'PHASE_1_READ_ONLY',
      isDemoData: true,
      checkedAt: nowIso,
      systemStatus: {
        samAttStatus: 'DEGRADED',
        samAttFrontendPath: '/Sam_Att/',
        samAttFrontendPort: 3001,
        backendApiStatus: 'ONLINE',
        backendGatewayPath: '/api/Sam_Att/',
        backendGatewayPort: 3002,
        databaseName: 'samchuk_attendance_v2 (DEMO DATA — Preview Only)',
        databaseHealthy: false,
        githubConnectionStatus: 'NOT_CHECKED',
        githubRepositoryUrl: 'https://github.com/jk9krnvb6g-ai/Sam_Att',
        lastDeployedAt: 'NOT CONFIGURED (DEMO DATA — Preview Simulation)',
      },
      currentVersion: {
        version: 'NOT CONFIGURED (DEMO DATA)',
        commitSha: 'NOT AVAILABLE (DEMO DATA)',
        deploymentDate: 'NOT AVAILABLE (DEMO DATA)',
        configured: false,
        source: 'DEMO_DATA',
      },
      latestGitHubVersion: {
        repositoryUrl: 'https://github.com/jk9krnvb6g-ai/Sam_Att',
        version: 'NOT CHECKED (DEMO DATA)',
        commitSha: 'NOT AVAILABLE (DEMO DATA)',
        latestCommitDate: 'NOT AVAILABLE (DEMO DATA)',
        branch: 'main',
        reachable: false,
        configured: false,
        message:
          'DEMO DATA: โหมดพรีวิวไม่ได้เชื่อมต่อ Production Server จริง และไม่สร้างเลขเวอร์ชันหรือ Commit SHA ปลอม',
      },
      versionComparison: {
        status: 'NOT_AVAILABLE',
        statusLabel: 'ยังไม่สามารถเปรียบเทียบเวอร์ชันได้ (NOT AVAILABLE — DEMO DATA)',
        summary:
          'DEMO DATA: โหมดพรีวิวแสดงโครงสร้างหน้าจอ Deployment Center เท่านั้น โดยไม่ปลอมแปลง Commit SHA หรือผลการตรวจสอบเป็น PASS',
      },
      checklist: [
        {
          id: 'github_source',
          stepNumber: 1,
          label: '1. GitHub Source ตรวจสอบผ่าน',
          description:
            'ตรวจสอบการเข้าถึง Repository https://github.com/jk9krnvb6g-ai/Sam_Att และ Commit SHA จาก GitHub API จริง',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — โหมดพรีวิวไม่ได้เรียก Production Backend เพื่อตรวจสอบ GitHub API จริง',
          checkedAt: null,
        },
        {
          id: 'dependencies',
          stepNumber: 2,
          label: '2. Dependencies พร้อม',
          description:
            'ตรวจสอบความถูกต้องของ Dependencies จากหลักฐานกระบวนการ Build/Test ที่เชื่อถือได้',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — การมี package.json และ node_modules เพียงอย่างเดียวไม่เพียงพอที่จะสรุป PASS ต้องมีหลักฐานจากกระบวนการ Build/Test',
          checkedAt: null,
        },
        {
          id: 'build',
          stepNumber: 3,
          label: '3. Build ผ่าน',
          description:
            'ตรวจสอบหลักฐานว่า Production Build สำเร็จและ Artifact ตรงกับ Commit SHA ที่ตรวจสอบ',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — ห้ามสรุป PASS จากการมีไฟล์ dist/index.html เพียงอย่างเดียวโดยไม่มี Build Evidence ที่ผูกกับ Commit SHA',
          checkedAt: null,
        },
        {
          id: 'automated_tests',
          stepNumber: 4,
          label: '4. Automated Tests ผ่าน',
          description:
            'ตรวจสอบหลักฐานผลการรัน Automated Tests ที่ผูกกับ Commit SHA และเวลาที่ตรวจสอบ',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — ห้ามเชื่อถือ SAM_ATT_LAST_TEST_STATUS=PASS เพียงค่าเดียวโดยไม่มีหลักฐานผลทดสอบที่ตรวจสอบย้อนกลับได้',
          checkedAt: null,
        },
        {
          id: 'backup',
          stepNumber: 5,
          label: '5. Backup พร้อม',
          description: 'ตรวจสอบชุดสำรองเวอร์ชันปัจจุบันพร้อมหลักฐานความสมบูรณ์ก่อนอัปเดต',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — ยังไม่มี Backup Agent และไม่ใช้ SAM_ATT_BACKUP_VERIFIED=true เพียงอย่างเดียวเพื่อสรุป PASS',
          checkedAt: null,
        },
        {
          id: 'database_config',
          stepNumber: 6,
          label: '6. Database Configuration ถูกต้อง',
          description: 'ตรวจสอบการตั้งค่าและเชื่อมต่อฐานข้อมูล MySQL จริง (samchuk_attendance_v2)',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — โหมดพรีวิวไม่ได้เชื่อมต่อฐานข้อมูล MySQL จริง (samchuk_attendance_v2)',
          checkedAt: null,
        },
        {
          id: 'central_gateway',
          stepNumber: 7,
          label: '7. Central API Gateway พร้อม',
          description:
            'ตรวจสอบหลักฐานการทำงานของเส้นทาง /api/Sam_Att/ บน Central API Gateway พอร์ต 3002',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — ยังไม่มีกลไก Health Check ที่เชื่อถือได้จาก Gateway พอร์ต 3002 (ไม่สรุป PASS เพียงเพราะมี Router)',
          checkedAt: null,
        },
        {
          id: 'procurement_health',
          stepNumber: 8,
          label: '8. Procurement Health Check ผ่าน',
          description: 'ตรวจสอบผล Health Check จริงของระบบ Procurement บน Central API Gateway',
          status: 'NOT_CHECKED',
          detail:
            'NOT_CHECKED (DEMO DATA) — ยังไม่มี Endpoint หรือกลไกตรวจสอบระบบ Procurement ที่ได้รับการยืนยัน',
          checkedAt: null,
        },
      ],
      deploymentReadiness: {
        readyToDeploy: false,
        passedCount: 0,
        failedCount: 0,
        warningCount: 0,
        notCheckedCount: 8,
        totalCount: 8,
        readinessStatus: 'CHECKS_INCOMPLETE',
        readinessMessage:
          'ยังไม่พร้อม Deploy — มีรายการที่ยังไม่ได้ตรวจสอบ (8 รายการ NOT CHECKED) และระบบอยู่ในโหมด Phase 1 Read-Only',
      },
      deploymentAgent: {
        phase2AgentAvailable: false,
        approveEnabled: false,
        rollbackEnabled: false,
        lockReason:
          'Phase 1 Read-Only Security Lock: ปุ่มอนุมัติ Deploy และ Rollback ถูกล็อกไว้จนกว่าจะมีระบบ Phase 2 Backend Deployment Agent (Windows Service / Scheduled Task IPC) เพื่อป้องกันการรันคำสั่ง OS/PowerShell จากหน้าเว็บโดยตรง',
      },
      history: [],
    };
  }
  return null;
}
