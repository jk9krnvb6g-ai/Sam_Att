import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, UserCheck, User, LogOut, AlertTriangle } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
  activeView: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { currentUser, logout, switchUser, availableUsers } = useAuth();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Shield className="w-3 h-3 mr-1" />
            ADMIN
          </span>
        );
      case 'RESPONSIBLE_STAFF':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck className="w-3 h-3 mr-1" />
            STAFF
          </span>
        );
      case 'GENERAL_USER':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <User className="w-3 h-3 mr-1" />
            GENERAL USER
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Test / Prototype Banner */}
      <div className="bg-amber-500/10 border-b border-amber-200/80 px-4 py-1.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="font-semibold">โหมดทดสอบระบบ (UI Prototype & Mock Data):</span>
          <span className="text-amber-800">
            จำลองการเชื่อมต่อเครื่องสแกนและ HOSOffice ด้วย Mock Adapter ตาม MASTER PROMPT
          </span>
        </div>
        {/* Quick Persona Switcher for effortless GitHub & client testing */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[11px] font-medium mr-1">สลับบทบาททดสอบ:</span>
          {availableUsers.map((u) => {
            const isCurrent = currentUser?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => switchUser(u.id)}
                className={`text-[11px] px-2 py-0.5 rounded transition-all whitespace-nowrap cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-600 text-white font-medium shadow-xs'
                    : 'bg-white/80 hover:bg-white text-slate-700 border border-amber-200 hover:border-amber-300'
                }`}
                title={`สลับไปเป็น ${u.fullName} (${u.role})`}
              >
                {u.role === 'ADMIN' && 'แอดมิน (Admin)'}
                {u.role === 'RESPONSIBLE_STAFF' && 'จนท.ลงเวลา (Staff)'}
                {u.id === 'USR003' && 'พญ.สุดารัตน์ (User)'}
                {u.id === 'USR004' && 'นายวิชัย (User)'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Top Bar */}
      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              SA
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900 leading-none">
                Sam_Att V2
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">
                โรงพยาบาลสามชุก (Samchuk Hospital)
              </div>
            </div>
          </div>
        </div>

        {/* Zone 2: System Spec Badges / Status */}
        <div className="hidden md:flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Gateway:</span>
            <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              :3002/api/Sam_Att/
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Database:</span>
            <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              samchuk_attendance
            </span>
          </div>
        </div>

        {/* Zone 3: User Profile & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser && (
            <div className="flex items-center gap-2.5 text-right">
              <div>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs font-semibold text-slate-900 truncate max-w-[180px]">
                    {currentUser.fullName}
                  </span>
                  {getRoleBadge(currentUser.role)}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                  {currentUser.department}
                </div>
              </div>

              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="ออกจากระบบ (Logout)"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
