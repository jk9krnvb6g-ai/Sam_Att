import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Fingerprint, Lock, UserCheck, Shield, Server, Database } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, availableUsers } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = login(username.trim());
    if (!ok) {
      setError('ไม่พบชื่อผู้ใช้งานนี้ในระบบ กรุณาตรวจสอบอีกครั้ง');
    }
  };

  const handleQuickLogin = (uname: string) => {
    setUsername(uname);
    login(uname);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FC] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#E9E5F2] shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#6D28D9] via-[#7C3AED] to-[#8B5CF6] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs border border-white/25 flex items-center justify-center shadow-inner">
              <Fingerprint className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono-data uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-md font-semibold">
                  Sam_Att V2
                </span>
                <span className="text-xs text-purple-100">รพ.สามชุก</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight mt-0.5">
                ระบบบริหารจัดการเวลาปฏิบัติงาน
              </h1>
              <p className="text-xs text-purple-100 mt-0.5">
                Samchuk Hospital Attendance Management System
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap gap-2 text-[11px] font-mono-data text-purple-100">
            <span className="inline-flex items-center gap-1 bg-black/15 px-2 py-0.5 rounded">
              <Server className="w-3 h-3" /> HTTPS :3001/Sam_Att/
            </span>
            <span className="inline-flex items-center gap-1 bg-black/15 px-2 py-0.5 rounded">
              <Shield className="w-3 h-3" /> Gateway :3002/api/Sam_Att/
            </span>
            <span className="inline-flex items-center gap-1 bg-black/15 px-2 py-0.5 rounded">
              <Database className="w-3 h-3" /> DB: samchuk_attendance
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ชื่อผู้ใช้งาน (Username)
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 transition-all"
                  placeholder="เช่น admin, staff_patcharee, dr_sudarat"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 transition-all"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
            >
              เข้าสู่ระบบ (Sign In)
            </button>
          </form>

          {/* Quick Demo Role Login */}
          <div className="pt-4 border-t border-[#E9E5F2]">
            <p className="text-xs font-semibold text-slate-500 mb-2.5">
              ทดสอบเข้าสู่ระบบด่วนตามบทบาท (3 Roles ตามข้อกำหนด):
            </p>
            <div className="space-y-2">
              {availableUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickLogin(u.username)}
                  className="w-full text-left p-2.5 rounded-xl border border-[#E9E5F2] hover:border-purple-300 hover:bg-purple-50/50 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-purple-950">
                      {u.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono-data">
                      username: <strong className="text-slate-700">{u.username}</strong>
                      {u.personId && ` · PERSON_ID: ${u.personId}`}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                      u.role === 'ADMIN'
                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                        : u.role === 'RESPONSIBLE_STAFF'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
