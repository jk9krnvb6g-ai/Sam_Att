import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { LoginView } from './views/LoginView';
import { MyAttendanceView } from './views/MyAttendanceView';
import { DashboardView } from './views/DashboardView';
import { HRAttendanceManagementView } from './views/HRAttendanceManagementView';
import { AttendanceReviewView } from './views/AttendanceReviewView';
import { RawScansView } from './views/RawScansView';
import { ScannerManagementView } from './views/ScannerManagementView';
import { PersonnelView } from './views/PersonnelView';
import { ShiftsView } from './views/ShiftsView';
import { HOSOfficePushView } from './views/HOSOfficePushView';
import { SystemLogsView } from './views/SystemLogsView';
import { SettingsView } from './views/SettingsView';

const MainLayout: React.FC = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (currentUser?.role === 'GENERAL_USER') {
      setActiveView('my-attendance');
    }
  }, [currentUser?.role]);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  // Render view component with strict role-based access enforcement
  const renderView = () => {
    // Enforcement: GENERAL_USER can only view their own attendance
    if (currentUser?.role === 'GENERAL_USER') {
      return <MyAttendanceView />;
    }

    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView
            onNavigateToReview={() => setActiveView('attendance-review')}
            onNavigateToView={(v) => setActiveView(v)}
          />
        );
      case 'my-attendance':
        return <MyAttendanceView />;
      case 'hr-reports':
        return <HRAttendanceManagementView />;
      case 'attendance-review':
        return <AttendanceReviewView />;
      case 'raw-scans':
        return <RawScansView />;
      case 'scanners':
        return <ScannerManagementView />;
      case 'personnel':
        return <PersonnelView />;
      case 'shifts':
        return <ShiftsView />;
      case 'hosoffice-push':
        return <HOSOfficePushView />;
      case 'system-logs':
        return <SystemLogsView />;
      case 'settings':
        // Guard ADMIN only
        return currentUser?.role === 'ADMIN' ? (
          <SettingsView />
        ) : (
          <DashboardView
            onNavigateToReview={() => setActiveView('attendance-review')}
            onNavigateToView={(v) => setActiveView(v)}
          />
        );
      default:
        return (
          <DashboardView
            onNavigateToReview={() => setActiveView('attendance-review')}
            onNavigateToView={(v) => setActiveView(v)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FC] flex flex-col text-[#1F2937]">
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        activeView={activeView}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onSelectView={(v) => setActiveView(v)}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto max-w-[1440px] mx-auto w-full">
          {renderView()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
