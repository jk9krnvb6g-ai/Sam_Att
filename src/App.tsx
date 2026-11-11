import React, { useState, useEffect } from 'react';
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
import { mockAttendanceService } from './services/mockAttendanceService';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const MainShell: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeNav, setActiveNav] = useState<NavItemKey>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // Enforce role-based default view and hydrate real API data when user changes
  useEffect(() => {
    if (!currentUser) {
      mockAttendanceService.clearState();
      return;
    }
    if (currentUser.role === 'GENERAL_USER') {
      setActiveNav('my-attendance');
    } else if (activeNav === 'settings' && currentUser.role !== 'ADMIN') {
      setActiveNav('dashboard');
    }
    void mockAttendanceService.hydrateFromRealApi(currentUser.role);
  }, [currentUser]);

  useEffect(() => {
    const handleHydrated = () => {
      setDataVersion((v) => v + 1);
    };
    window.addEventListener('sam-att-data-hydrated', handleHydrated);
    return () => window.removeEventListener('sam-att-data-hydrated', handleHydrated);
  }, []);

  if (!currentUser) {
    return <LoginView />;
  }

  const lastApiError = mockAttendanceService.getLastApiError();

  const renderActiveView = () => {
    // Strict guard: GENERAL_USER can ONLY see MyAttendanceView
    if (currentUser.role === 'GENERAL_USER') {
      return <MyAttendanceView key={`my-att-${dataVersion}`} />;
    }

    switch (activeNav) {
      case 'dashboard':
        return <DashboardView key={`dash-${dataVersion}`} onNavigate={setActiveNav} />;
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
        return <ScannerManagementView key={`scan-${dataVersion}`} />;
      case 'reports':
        return <ReportsView key={`rep-${dataVersion}`} />;
      case 'system-logs':
        return <SystemLogsView key={`logs-${dataVersion}`} />;
      case 'settings':
        return currentUser.role === 'ADMIN' ? (
          <SettingsView key={`set-${dataVersion}`} />
        ) : (
          <DashboardView key={`dash-${dataVersion}`} onNavigate={setActiveNav} />
        );
      default:
        return <DashboardView key={`dash-${dataVersion}`} onNavigate={setActiveNav} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7FC] text-slate-900">
      <Navbar onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)} />
      <div className="flex-1 flex">
        <Sidebar
          activeKey={currentUser.role === 'GENERAL_USER' ? 'my-attendance' : activeNav}
          onSelect={setActiveNav}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-7 max-w-[1600px] mx-auto w-full space-y-4">
          {lastApiError && activeNav !== 'dashboard' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900">
                    ไม่สามารถดึงข้อมูลจริงจาก Central API Gateway (`/api/Sam_Att/*`) ได้ (No Mock Data Fallback)
                  </div>
                  <div className="text-amber-800 mt-0.5 font-mono-data">
                    สาเหตุ: {lastApiError}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void mockAttendanceService.hydrateFromRealApi(currentUser.role)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ลองเชื่อมต่อใหม่</span>
              </button>
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
