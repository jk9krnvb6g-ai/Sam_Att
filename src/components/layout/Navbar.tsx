import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/StatusBadge';
import {
  Fingerprint,
  LogOut,
  Menu,
  Server,
  Database,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';

interface NavbarProps {
  onToggleMobileSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileSidebar }) => {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E9E5F2] shadow-2xs">
      {/* Main Header */}
      <div className="px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer"
            aria-label="เปิดเมนูนำทาง"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center text-white shadow-sm">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                  Sam_Att V2
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  โรงพยาบาลสามชุก
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                ระบบบริหารจัดการเวลาปฏิบัติงานและเครื่องสแกนลายนิ้วมือ (Samchuk Attendance System)
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Architecture Pill + User Profile */}
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 font-mono-data text-[11px] text-purple-700 font-medium">
              <Server className="w-3.5 h-3.5 text-purple-600" />
              Frontend :3001/Sam_Att/
            </span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1 font-mono-data text-[11px] text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Gateway :3002/api/Sam_Att/
            </span>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1 font-mono-data text-[11px] text-slate-600">
              <Database className="w-3.5 h-3.5 text-purple-600" />
              DB: samchuk_attendance_v2
            </span>
          </div>

          <div className="flex items-center gap-3 pl-2 border-l border-[#E9E5F2]">
            <div className="text-right hidden md:block">
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm font-semibold text-slate-800">
                  {currentUser.fullName}
                </span>
                <RoleBadge role={currentUser.role} />
              </div>
              <div className="text-xs text-slate-500 flex items-center justify-end gap-1.5 mt-0.5">
                <span>{currentUser.position || currentUser.username}</span>
                {currentUser.department && (
                  <>
                    <span>·</span>
                    <span className="text-purple-700 font-medium">{currentUser.department}</span>
                  </>
                )}
                {currentUser.personId && (
                  <span className="font-mono-data text-[11px] bg-slate-100 px-1.5 py-0.2 rounded text-slate-600">
                    ID: {currentUser.personId}
                  </span>
                )}
              </div>
            </div>

            <div className="w-9 h-9 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-bold text-sm">
              <UserIcon className="w-4 h-4" />
            </div>

            <button
              onClick={() => {
                void logout();
              }}
              title="ออกจากระบบ (Logout)"
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
