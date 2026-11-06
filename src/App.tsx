import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { LoginView } from './views/LoginView';
import { MyAttendanceView } from './views/MyAttendanceView';
import { DashboardView } from './views/DashboardView';
import { AttendanceReviewView } from './views/AttendanceReviewView';
import { RawScansView } from './views/RawScansView';
import { ScannerManagementView } from './views/ScannerManagementView';
import { PersonnelView } from './views/PersonnelView';
import { ShiftsView } from './views/ShiftsView';
import { ReportsView } from './views/ReportsView';
import { HOSOfficePushView } from './views/HOSOfficePushView';
import { SettingsView } from './views/SettingsView';
import { GatewayDocView } from './views/GatewayDocView';

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

  // Render view component
  const renderView = () => {
    // Enforcement: GENERAL_USER cannot see other views
    if (currentUser?.role === 'GENERAL_USER') {
      return <MyAttendanceView />;
    }

    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView
            onNavigateToReview={() => setActiveView('attendance-review')}
          />
        );
      case 'my-attendance':
        return <MyAttendanceView />;
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
      case 'reports':
        return <ReportsView />;
      case 'hosoffice-push':
        return <HOSOfficePushView />;
      case 'settings':
        // Guard ADMIN only
        return currentUser?.role === 'ADMIN' ? <SettingsView /> : <DashboardView />;
      case 'gateway-doc':
        return <GatewayDocView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
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

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
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
