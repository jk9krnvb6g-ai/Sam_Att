import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, UserCheck, User, LogOut, Sparkles } from 'lucide-react';

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
          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200">
            <Shield className="w-3 h-3 mr-1" />
            ADMIN
          </span>
        );
      case 'RESPONSIBLE_STAFF':
        return (
          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
            <UserCheck className="w-3 h-3 mr-1" />
            STAFF
          </span>
        );
      case 'GENERAL_USER':
        return (
          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <User className="w-3 h-3 mr-1" />
            GENERAL USER
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E9E5F2] shadow-2xs">
      {/* Prototype Role Switcher & Mock Status Banner */}
      <div className="bg-gradient-to-r from-violet-950 via-violet-900 to-purple-900 px-4 py-1.5 text-xs text-violet-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
          <span className="font-semibold text-white">โหมดทดสอบระบบ (UI Prototype & Mock Data):</span>
          <span className="text-violet-200">
            จำลองการเชื่อมต่อเครื่องสแกน 3 จุด, ฐานข้อมูล samchuk_attendance และ HOSOffice ด้วย Mock State
          </span>
        </div>

        {/* Quick Persona Switcher for effortless GitHub & client testing */}
        <div className="flex items-center gap-1.5">
          <span className="text-violet-200 text-[11px] font-medium mr-1">สลับบทบาททดสอบ:</span>
          {availableUsers.map((u) => {
            const isCurrent = currentUser?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => switchUser(u.id)}
                className={`text-[11px] px-2.5 py-0.5 rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  isCurrent
                    ? 'bg-violet-500 text-white font-bold shadow-xs ring-1 ring-violet-300'
                    : 'bg-white/10 hover:bg-white/20 text-violet-100 border border-white/15'
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
      <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-violet-700 hover:bg-violet-50 cursor-pointer"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white flex items-center justify-center font-bold text-sm shadow-xs">
              SA
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900 leading-none">
                Sam_Att V2
              </div>
              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                โรงพยาบาลสามชุก (Samchuk Hospital Attendance System)
              </div>
            </div>
          </div>
        </div>

        {/* Zone 2: System Architecture Metadata */}
        <div className="hidden xl:flex items-center gap-3 text-xs text-slate-600">
          <span className="font-mono text-[11px] text-violet-800 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/80">
            Frontend :3001/Sam_Att/
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-[11px] text-violet-800 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200/80">
            Gateway :3002/api/Sam_Att/
          </span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-[11px] text-slate-700 bg-[#F8F7FC] px-2 py-0.5 rounded-md border border-[#E9E5F2]">
            DB: samchuk_attendance
          </span>
        </div>

        {/* Zone 3: User Profile & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {currentUser && (
            <div className="flex items-center gap-2.5 text-right">
              <div>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[190px]">
                    {currentUser.fullName}
                  </span>
                  {getRoleBadge(currentUser.role)}
                </div>
                <div className="text-[11px] text-slate-500 truncate max-w-[210px]">
                  {currentUser.department}
                </div>
              </div>

              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
