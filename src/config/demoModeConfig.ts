import { UserAccount } from '../types/attendance';
import { DeploymentCenterStatusPayload } from '../types/deploymentCenter';

/**
 * Sam_Att V2 — Development Preview Demo Admin Configuration (§8)
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
        samAttStatus: 'ONLINE',
        samAttFrontendPath: '/Sam_Att/',
        samAttFrontendPort: 3001,
        backendApiStatus: 'ONLINE',
        backendGatewayPath: '/api/Sam_Att/',
        backendGatewayPort: 3002,
        databaseName: 'samchuk_attendance_v2 (DEMO DATA)',
        databaseHealthy: true,
        githubConnectionStatus: 'CONNECTED',
        githubRepositoryUrl: 'https://github.com/jk9krnvb6g-ai/Sam_Att',
        lastDeployedAt: 'DEMO DATA — 2026-11-11 08:30:00 (Preview Simulation)',
      },
      currentVersion: {
        version: 'DEMO DATA — sam-att-v2-preview',
        commitSha: 'DEMO DATA — 03c0d175 (Server Preview)',
        deploymentDate: 'DEMO DATA — 2026-11-10 17:45:00',
        configured: true,
        source: 'DEMO DATA (Frontend Development Preview Only)',
      },
      latestGitHubVersion: {
        repositoryUrl: 'https://github.com/jk9krnvb6g-ai/Sam_Att',
        version: 'DEMO DATA — github-main-latest',
        commitSha: 'DEMO DATA — a25f9c12 (GitHub Latest)',
        latestCommitDate: 'DEMO DATA — 2026-11-11 09:15:00',
        branch: 'main',
        reachable: true,
        configured: true,
        message: 'DEMO DATA: ข้อมูลจำลองสำหรับการแสดงผลใน Google AI Studio Development Preview เท่านั้น (ไม่ได้เรียก Production API)',
      },
      versionComparison: {
        status: 'UPDATE_AVAILABLE',
        statusLabel: 'DEMO DATA — มีอัปเดตใหม่จาก GitHub (Preview Simulation)',
        summary:
          'DEMO DATA: เซิร์ฟเวอร์จำลองอยู่ที่ Commit 03c0d175 ขณะที่ GitHub ล่าสุดอยู่ที่ Commit a25f9c12 (แสดงผลเฉพาะโหมดพรีวิว ไม่มีการเชื่อมต่อเซิร์ฟเวอร์จริง)',
      },
      checklist: [
        {
          id: 'github_source_verified',
          stepNumber: 1,
          label: 'GitHub Source ตรวจสอบผ่าน',
          description: 'ตรวจสอบการเข้าถึง Repository https://github.com/jk9krnvb6g-ai/Sam_Att และ Commit ล่าสุด',
          status: 'PASS',
          detail: 'DEMO DATA: ตรวจสอบ Repository jk9krnvb6g-ai/Sam_Att สำเร็จ (Preview Mode)',
          checkedAt: nowIso,
        },
        {
          id: 'dependencies_ready',
          stepNumber: 2,
          label: 'Dependencies พร้อม',
          description: 'ตรวจสอบ package.json, package-lock.json และโฟลเดอร์ node_modules บนเซิร์ฟเวอร์',
          status: 'PASS',
          detail: 'DEMO DATA: ตรวจพบ package.json, package-lock.json และ node_modules ครบถ้วน',
          checkedAt: nowIso,
        },
        {
          id: 'build_passed',
          stepNumber: 3,
          label: 'Build ผ่าน',
          description: 'ตรวจสอบความพร้อมของ Production Build Artifact (dist/index.html)',
          status: 'PASS',
          detail: 'DEMO DATA: ตรวจพบ Production Build Artifact (dist/index.html) พร้อมใช้งาน',
          checkedAt: nowIso,
        },
        {
          id: 'automated_tests_passed',
          stepNumber: 4,
          label: 'Automated Tests ผ่าน',
          description: 'ตรวจสอบชุดทดสอบ Unit & Integration Tests ของระบบ Sam_Att V2',
          status: 'PASS',
          detail: 'DEMO DATA: ชุดทดสอบ Unit & Phase 1+2 Integration Tests ผ่านครบถ้วน',
          checkedAt: nowIso,
        },
        {
          id: 'backup_ready',
          stepNumber: 5,
          label: 'Backup พร้อม',
          description: 'ตรวจสอบพื้นที่จัดเก็บ Backup และสถานะ Backup ล่าสุดก่อนการอัปเดต',
          status: 'WARNING',
          detail: 'DEMO DATA: Phase 1 Read-Only — การสร้างจุดสำรองข้อมูลอัตโนมัติจะทำงานร่วมกับ Phase 2 Deployment Agent',
          checkedAt: nowIso,
        },
        {
          id: 'database_config_valid',
          stepNumber: 6,
          label: 'Database Configuration ถูกต้อง',
          description: 'ตรวจสอบการตั้งค่าและการเชื่อมต่อฐานข้อมูล MySQL (samchuk_attendance_v2)',
          status: 'PASS',
          detail: 'DEMO DATA: ตั้งค่าฐานข้อมูล samchuk_attendance_v2 ถูกต้อง (Preview Simulation)',
          checkedAt: nowIso,
        },
        {
          id: 'central_gateway_ready',
          stepNumber: 7,
          label: 'Central API Gateway พร้อม',
          description: 'ตรวจสอบความพร้อมของ Central API Gateway พอร์ต 3002 ภายใต้ /api/Sam_Att/',
          status: 'PASS',
          detail: 'DEMO DATA: Central API Gateway (:3002/api/Sam_Att/) พร้อมทำงานโดยไม่เปิดพอร์ตเพิ่ม',
          checkedAt: nowIso,
        },
        {
          id: 'procurement_health_passed',
          stepNumber: 8,
          label: 'Procurement Health Check ผ่าน',
          description: 'ตรวจสอบว่าระบบจัดซื้อจัดจ้าง (Procurement) บน Central API Gateway ไม่ได้รับผลกระทบ',
          status: 'NOT_CHECKED',
          detail: 'DEMO DATA: รอเชื่อมต่อ SAM_ATT_PROCUREMENT_HEALTH_URL บน FILESERVER จริงเพื่อตรวจสอบสถานะ Procurement',
          checkedAt: nowIso,
        },
      ],
      deploymentAgent: {
        phase2AgentAvailable: false,
        approveEnabled: false,
        rollbackEnabled: false,
        lockReason:
          'Phase 1 Read-Only Security Lock: ปุ่มอนุมัติ Deploy และ Rollback ถูกล็อกไว้จนกว่าจะมีระบบ Phase 2 Backend Deployment Agent (Windows Service / Scheduled Task IPC) เพื่อป้องกันการรันคำสั่ง OS/PowerShell จากหน้าเว็บโดยตรง',
      },
      history: [
        {
          id: 'DEMO-HIST-001',
          deployedAt: '2026-11-11T01:30:00.000Z',
          versionOrCommit: 'DEMO DATA — 03c0d175',
          actor: 'demo_admin_preview',
          actorName: 'Demo Administrator (DEMO DATA)',
          status: 'SUCCESS',
          summary:
            'DEMO DATA: ตรวจสอบความพร้อมระบบ (Preflight Check) และบันทึกสถานะชุดติดตั้ง Sam_Att V2 บนโหมดพรีวิว',
        },
        {
          id: 'DEMO-HIST-002',
          deployedAt: '2026-11-10T10:45:00.000Z',
          versionOrCommit: 'DEMO DATA — 62af82e2',
          actor: 'admin_samchuk',
          actorName: 'ผู้ดูแลระบบ รพ.สามชุก (DEMO DATA)',
          status: 'SUCCESS',
          summary:
            'DEMO DATA: อัปเดตระบบตรวจสอบการเชื่อมต่อฐานข้อมูล samchuk_attendance_v2 และ HOSOffice Live Sync',
        },
      ],
    };
  }
  return null;
}
