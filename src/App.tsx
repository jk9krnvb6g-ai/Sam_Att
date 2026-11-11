import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavItemKey } from './components/layout/Sidebar';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { MyAttendanceView } from './views/MyAttendanceView';
import { PersonnelView } from './views/PersonnelView';
import { ShiftsView } from './views/ShiftsView';
import { AttendanceReviewView } from './views/AttendanceReviewView';
import { HRAttendanceManagementView } from './views/HRAttendanceManagementView';
import { RawScansView } from './views/RawScansView';
import { HOSOfficePushView } from './views/HOSOfficePushView';
import { ScannerManagementView } from './views/ScannerManagementView';
import { ReportsView } from './views/ReportsView';
import { SystemLogsView } from './views/SystemLogsView';
import { SettingsView } from './views/SettingsView';
import { DeploymentCenterView } from './views/DeploymentCenterView';
import { mockAttendanceService } from './services/mockAttendanceService';
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, Rocket, LogOut } from 'lucide-react';

const MainShell: React.FC = () => {
  const { currentUser, isLoadingAuth, isDemoMode, exitDemoMode } = useAuth();
  const [activeNav, setActiveNav] = useState<NavItemKey>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const lastHydratedSessionRef = useRef<string | null>(null);

  const userId = currentUser?.id ?? null;
  const userRole = currentUser?.role ?? null;

  // Enforce role-based default view and hydrate real API data once when user session changes
  useEffect(() => {
    if (!currentUser || !userId || !userRole) {
      lastHydratedSessionRef.current = null;
      mockAttendanceService.clearState();
      return;
    }

    // Rule 8.7: When in Development Preview Demo Admin Mode, open Deployment Center
    // and NEVER call Production Backend APIs.
    if (isDemoMode && import.meta.env.DEV && !import.meta.env.PROD) {
      lastHydratedSessionRef.current = `DEMO:${userId}`;
      mockAttendanceService.clearState();
      setActiveNav('deployment-center');
      return;
    }

    if (userRole === 'GENERAL_USER') {
      setActiveNav('my-attendance');
    } else if (
      (activeNav === 'settings' || activeNav === 'deployment-center') &&
      userRole !== 'ADMIN'
    ) {
      setActiveNav('dashboard');
    }

    const sessionKey = `${userId}:${userRole}`;
    if (lastHydratedSessionRef.current !== sessionKey) {
      lastHydratedSessionRef.current = sessionKey;
      void mockAttendanceService.hydrateFromRealApi(userRole);
    }
  }, [currentUser, userId, userRole, isDemoMode, activeNav]);

  useEffect(() => {
    const handleHydrated = () => {
      setDataVersion((v) => v + 1);
    };
    window.addEventListener('sam-att-data-hydrated', handleHydrated);
    return () => window.removeEventListener('sam-att-data-hydrated', handleHydrated);
  }, []);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F7FC] flex flex-col items-center justify-center p-6 text-slate-600">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-800">
          กำลังตรวจสอบสถานะการเข้าสู่ระบบ (Session Validation)...
        </p>
        <p className="text-xs text-slate-500 mt-1 font-mono-data">
          GET /api/Sam_Att/auth/me
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  const lastApiError = isDemoMode ? null : mockAttendanceService.getLastApiError();
  const isRateLimitError = isDemoMode ? false : mockAttendanceService.isLastErrorRateLimit();

  const renderActiveView = () => {
    // Strict guard: GENERAL_USER can ONLY see MyAttendanceView
    if (currentUser.role === 'GENERAL_USER') {
      return <MyAttendanceView key={`my-att-${dataVersion}`} />;
    }

    switch (activeNav) {
      case 'dashboard':
        return <DashboardView key="dashboard" onNavigate={setActiveNav} />;
      case 'my-attendance':
        return <MyAttendanceView key={`my-att-${dataVersion}`} />;
      case 'hr-attendance':
      case 'hr-reports':
        return <HRAttendanceManagementView key={`hr-${dataVersion}`} />;
      case 'personnel':
        return <PersonnelView key={`pers-${dataVersion}`} />;
      case 'shifts':
        return <ShiftsView key={`shifts-${dataVersion}`} />;
      case 'attendance-review':
        return <AttendanceReviewView key={`rev-${dataVersion}`} />;
      case 'raw-scans':
        return <RawScansView key={`raw-${dataVersion}`} />;
      case 'hosoffice-push':
        return <HOSOfficePushView key={`push-${dataVersion}`} />;
      case 'scanners':
        return <ScannerManagementView key="scanners" />;
      case 'reports':
        return <ReportsView key={`rep-${dataVersion}`} />;
      case 'system-logs':
        return <SystemLogsView key="system-logs" />;
      case 'settings':
        return currentUser.role === 'ADMIN' ? (
          <SettingsView key="settings" />
        ) : (
          <DashboardView key="dashboard" onNavigate={setActiveNav} />
        );
      case 'deployment-center':
        return currentUser.role === 'ADMIN' ? (
          <DeploymentCenterView key="deployment-center" />
        ) : (
          <DashboardView key="dashboard" onNavigate={setActiveNav} />
        );
      default:
        return <DashboardView key="dashboard" onNavigate={setActiveNav} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7FC] text-slate-900">
      {/* Rule 8.6: Prominent top banner when in Development Preview Demo Admin Mode */}
      {isDemoMode && import.meta.env.DEV && !import.meta.env.PROD && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 border-b border-amber-600 shadow-xs z-50">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-950 text-amber-300 font-mono-data font-bold tracking-wide">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                DEVELOPMENT PREVIEW — DEMO MODE
              </span>
              <span className="font-bold">
                ผู้ใช้จำลอง: {currentUser.fullName} | สิทธิ์: ADMIN (Frontend Preview Only)
              </span>
              <span className="hidden xl:inline text-slate-900 font-medium">
                • แสดงผลเฉพาะ Google AI Studio Preview เท่านั้น (ไม่มีการสร้างบัญชีใน DB / ไม่สร้าง JWT / ไม่เรียก Production API)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeNav !== 'deployment-center' && (
                <button
                  type="button"
                  onClick={() => setActiveNav('deployment-center')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-900 font-bold transition-colors cursor-pointer"
                >
                  <Rocket className="w-3.5 h-3.5 text-violet-700" />
                  <span>ไปที่ Deployment Center</span>
                </button>
              )}
              <button
                type="button"
                onClick={exitDemoMode}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-white font-bold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>สลับไปหน้าเข้าสู่ระบบจริง (Real Login)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)} />
      <div className="flex-1 flex">
        <Sidebar
          activeKey={currentUser.role === 'GENERAL_USER' ? 'my-attendance' : activeNav}
          onSelect={setActiveNav}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-7 max-w-[1600px] mx-auto w-full space-y-4">
          {lastApiError &&
            activeNav !== 'dashboard' &&
            activeNav !== 'deployment-center' &&
            activeNav !== 'scanners' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900">
                      {isRateLimitError
                        ? 'ระบบจำกัดจำนวนคำขอชั่วคราว (HTTP 429: RATE_LIMIT_EXCEEDED)'
                        : 'ไม่สามารถดึงข้อมูลจริงจาก Central API Gateway (`/api/Sam_Att/*`) ได้ (No Mock Data Fallback)'}
                    </div>
                    <div className="text-amber-800 mt-0.5 font-mono-data">
                      สาเหตุ: {lastApiError}
                    </div>
                  </div>
                </div>
                {!isRateLimitError && (
                  <button
                    type="button"
                    onClick={() => void mockAttendanceService.hydrateFromRealApi(currentUser.role)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ลองเชื่อมต่อใหม่</span>
                  </button>
                )}
              </div>
            )}
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  );
}

export default App;
