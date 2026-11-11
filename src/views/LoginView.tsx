import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Fingerprint, Lock, UserCheck, Shield, Server, Database, AlertCircle, Loader2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, enterDemoMode } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      } else {
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
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
              <Database className="w-3 h-3" /> DB: samchuk_attendance_v2
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
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
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 transition-all"
                  placeholder="กรอกชื่อผู้ใช้งาน (Username)"
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
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/30 focus:border-purple-600 transition-all"
                  placeholder="กรอกรหัสผ่าน"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังยืนยันตัวตนผ่าน Central API Gateway...</span>
                </>
              ) : (
                <span>เข้าสู่ระบบ (Sign In)</span>
              )}
            </button>
          </form>

          {import.meta.env.DEV && !import.meta.env.PROD && (
            <div className="pt-4 border-t border-slate-100">
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="font-bold text-amber-950 flex items-center justify-between">
                  <span>DEVELOPMENT PREVIEW — DEMO MODE</span>
                  <span className="text-[10px] font-mono-data px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950">
                    DEV ONLY
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  สำหรับตรวจสอบหน้า Deployment Center ใน Google AI Studio Preview โดยจำลองสิทธิ์{' '}
                  <span className="font-semibold">Demo Administrator (ADMIN)</span>{' '}
                  โดยไม่เชื่อมต่อฐานข้อมูลจริงและไม่สร้าง Token บนเซิร์ฟเวอร์
                </p>
                <button
                  type="button"
                  onClick={enterDemoMode}
                  className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  เปิดหน้า Deployment Center (Demo Administrator — Preview Only)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
