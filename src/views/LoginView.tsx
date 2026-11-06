import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, UserCheck, User, Lock, AlertCircle } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('staff_patcharee');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ok = login(username);
    if (!ok) {
      setError('ไม่พบชื่อผู้ใช้งานนี้ในระบบ หรือบัญชีถูกระงับ');
    }
  };

  const handleQuickLogin = (uname: string) => {
    setUsername(uname);
    login(uname);
  };

  return (
    <div className="min-h-screen bg-[#F8F7FC] flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Hospital Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] text-white font-bold text-xl shadow-md">
            SA
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Sam_Att V2
          </h1>
          <p className="text-xs text-slate-500">
            ระบบบริหารจัดการเวลาการปฏิบัติงาน โรงพยาบาลสามชุก
            <br />
            (Samchuk Hospital Attendance Management System)
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-6 shadow-sm space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ชื่อผู้ใช้งาน (Username):
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ระบุชื่อผู้ใช้งาน..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                รหัสผ่าน (Password):
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:bg-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
                />
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              เข้าสู่ระบบ (Sign In)
            </button>
          </form>

          {/* Quick Persona Selector for effortless Testing & GitHub Review */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block text-center">
              หรือคลิกเพื่อทดสอบ 3 บทบาทสิทธิ์ (Demo Personas)
            </span>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleQuickLogin('staff_patcharee')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-700 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-indigo-900">
                      นางสาวพัชรี (RESPONSIBLE_STAFF)
                    </div>
                    <div className="text-[10px] text-indigo-700">
                      ตรวจเวลาทุกคน, รายงาน HR, บันทึกสาเหตุ NO_SCAN, ส่ง HOSOffice
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-indigo-800 font-semibold bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                  Staff
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('dr_sudarat')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-900">
                      พญ.สุดารัตน์ (GENERAL_USER)
                    </div>
                    <div className="text-[10px] text-emerald-700">
                      ดูได้เฉพาะเวลาตนเอง (My Attendance) เท่านั้น
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-800 font-semibold bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                  User
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-violet-200 bg-violet-50/70 hover:bg-violet-100/70 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-violet-700 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-violet-900">
                      นายพิสิษฐ์ (ADMIN)
                    </div>
                    <div className="text-[10px] text-violet-700">
                      จัดการเครื่องสแกน, ผูกบัญชีผู้ใช้, จัดการฐานข้อมูลและกะเวลา
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-violet-800 font-semibold bg-white px-1.5 py-0.5 rounded border border-violet-200">
                  Admin
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400">
          Samchuk Hospital Attendance Management System V2 · Port 3001 (/Sam_Att/) & Port 3002 (/api/Sam_Att/)
        </div>
      </div>
    </div>
  );
};
