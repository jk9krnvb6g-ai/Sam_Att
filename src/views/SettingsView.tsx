import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserAccount } from '../types/attendance';
import {
  Sliders,
  Database,
  Shield,
  CheckCircle,
  AlertTriangle,
  Server,
  Lock,
  UserPlus,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { availableUsers } = useAuth();
  const [dbTestResult, setDbTestResult] = useState<string | null>(null);
  const [hosTestResult, setHosTestResult] = useState<string | null>(null);

  const handleTestDb = () => {
    setDbTestResult('กำลังตรวจสอบ...');
    setTimeout(() => {
      setDbTestResult(
        'การเชื่อมต่อฐานข้อมูล samchuk_attendance สำเร็จ (Mock Verified): พบ 12 ตารางระบบ พร้อมรองรับการจัดเก็บ Raw Scans และ Attendance'
      );
    }, 500);
  };

  const handleTestHosOffice = () => {
    setHosTestResult('กำลังตรวจสอบ...');
    setTimeout(() => {
      setHosTestResult(
        'การเชื่อมต่อ HOSOffice Database สำเร็จ (Mock Verified): อ่าน personnel และ schema สำเร็จใน 58ms'
      );
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          ตั้งค่าระบบ & การเชื่อมต่อ (System Settings)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          เฉพาะผู้ดูแลระบบ (ADMIN): จัดการฐานข้อมูลแยก, การเชื่อมต่อ HOSOffice, และบัญชีผู้ใช้งาน
        </p>
      </div>

      {/* Gateway Integration Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Server className="w-4 h-4 text-teal-600" />
          สถาปัตยกรรม Central API Gateway (MASTER DEVELOPMENT PROMPT §2)
        </div>
        <p className="text-xs text-slate-500">
          ระบบ Sam_Att V2 ทำงานร่วมกับ Central API Gateway เดิมของโรงพยาบาลสามชุก โดยไม่มีการเปิดพอร์ตใหม่
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Frontend Web</span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              HTTPS Port 3001
            </div>
            <div className="text-[11px] text-teal-700 font-mono mt-0.5">
              URL Base: /Sam_Att/
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Central API Gateway</span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              Port 3002 (Shared Listener)
            </div>
            <div className="text-[11px] text-teal-700 font-mono mt-0.5">
              Mount: /api/Sam_Att/
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 font-semibold uppercase">Database Name</span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              samchuk_attendance
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              แยกอิสระจาก Procurement & Cash
            </div>
          </div>
        </div>
      </div>

      {/* Database Connection Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* samchuk_attendance DB */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="w-4 h-4 text-teal-600" />
              ฐานข้อมูล Sam_Att (samchuk_attendance)
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-semibold">
              Isolate DB
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Host & Port:</label>
              <input
                type="text"
                disabled
                value="192.168.111.10:3306"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-700"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Database Name:</label>
              <input
                type="text"
                disabled
                value="samchuk_attendance"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1">DB User:</label>
                <input
                  type="text"
                  disabled
                  value="sam_att_app"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Password:</label>
                <div className="relative">
                  <input
                    type="password"
                    disabled
                    value="••••••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {dbTestResult && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                {dbTestResult}
              </div>
            )}

            <button
              onClick={handleTestDb}
              className="w-full py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              ทดสอบการเชื่อมต่อ (Test Connection)
            </button>
          </div>
        </div>

        {/* HOSOffice Connection */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="w-4 h-4 text-blue-600" />
              การเชื่อมต่อ HOSOffice (Authoritative)
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono font-semibold">
              Read / Direct Push
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Host & Port:</label>
              <input
                type="text"
                disabled
                value="192.168.111.5:3306"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-700"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Database Name:</label>
              <input
                type="text"
                disabled
                value="hosoffice_samchuk"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1">DB User:</label>
                <input
                  type="text"
                  disabled
                  value="hos_reader"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Password:</label>
                <div className="relative">
                  <input
                    type="password"
                    disabled
                    value="••••••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono text-slate-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {hosTestResult && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                {hosTestResult}
              </div>
            )}

            <button
              onClick={handleTestHosOffice}
              className="w-full py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              ทดสอบการเชื่อมต่อ HOSOffice
            </button>
          </div>
        </div>
      </div>

      {/* User Accounts & PERSON_ID Mapping */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              การจัดการผู้ใช้งาน & ผูกรหัสบุคคล (Users & Role Management)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              3 บทบาทตามข้อกำหนด: ADMIN, RESPONSIBLE_STAFF, GENERAL_USER
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 font-mono">User ID</th>
                <th className="py-2.5 px-4">ชื่อผู้ใช้ (Username)</th>
                <th className="py-2.5 px-4">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-4">บทบาท (Role)</th>
                <th className="py-2.5 px-4 font-mono">PERSON_ID ที่ผูก</th>
                <th className="py-2.5 px-4">ตำแหน่ง / ฝ่าย</th>
                <th className="py-2.5 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {availableUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {u.id}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                    {u.username}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">
                    {u.fullName}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded border ${
                        u.role === 'ADMIN'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : u.role === 'RESPONSIBLE_STAFF'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">
                    {u.personId ? (
                      <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {u.personId}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">ไม่ได้ผูก (Admin)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{u.position}</div>
                    <div className="text-[11px] text-slate-400">{u.department}</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ใช้งานปกติ
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
