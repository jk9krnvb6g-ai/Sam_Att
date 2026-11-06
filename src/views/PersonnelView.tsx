import React, { useState } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { Personnel } from '../types/attendance';
import {
  Users,
  RefreshCw,
  Search,
  CheckCircle,
  Database,
  ShieldCheck,
  Building,
} from 'lucide-react';

export const PersonnelView: React.FC = () => {
  const [personnelList, setPersonnelList] = useState<Personnel[]>(() =>
    mockAttendanceService.getPersonnel()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Sync from HOSOffice mock
  const handleSyncHosOffice = () => {
    const res = mockAttendanceService.syncPersonnelFromHosOffice();
    setSyncToast(`อัปเดตข้อมูลบุคลากรจาก HOSOffice สำเร็จ: ตรวจสอบ ${res.updatedCount} รายการ (Authoritative Source)`);
    setPersonnelList(mockAttendanceService.getPersonnel());
  };

  const filteredList = personnelList.filter((p) => {
    const fullNameStr = `${p.prefix}${p.firstName} ${p.lastName}`.toLowerCase();
    const matchesSearch =
      fullNameStr.includes(searchQuery.toLowerCase()) ||
      p.personId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(p.fingleId).includes(searchQuery);

    const matchesGroup = selectedGroup === 'ALL' || p.groupName === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const groupNames: string[] = Array.from(new Set(personnelList.map((p) => p.groupName)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            บัญชีรายชื่อบุคลากร HOSOffice (Personnel Roster)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ข้อมูลหลักดึงจาก HOSOffice (Authoritative Source) เพื่อนำ FINGLE_ID มาจับคู่กับ Raw Scan
          </p>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleSyncHosOffice}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>ดึง/อัปเดตรายชื่อจาก HOSOffice</span>
        </button>
      </div>

      {/* Sync Toast */}
      {syncToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncToast}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2 py-0.5 bg-emerald-100 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Authority Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-900">
            HOSOffice เป็นแหล่งข้อมูลหลัก (Authoritative Source):
          </div>
          <p className="text-slate-600">
            ระบบ Sam_Att V2 <strong>ไม่อนุญาตให้แก้ไขชื่อ-สกุล, ตำแหน่ง, ฝ่าย หรือ FINGLE_ID</strong> ในระบบ Sam_Att โดยตรง
            เพื่อป้องกันข้อมูลไม่สอดคล้องกับระบบของโรงพยาบาล หากมีการเปลี่ยนแปลงข้อมูลใน HOSOffice ให้กดปุ่ม <strong>"ดึง/อัปเดตรายชื่อจาก HOSOffice"</strong> และกด <strong>Reprocess</strong> เพื่อปรับปรุงข้อมูลย้อนหลัง
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px] flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, สกุล, PERSON_ID, หรือ FINGLE_ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Building className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="text-xs bg-transparent focus:outline-none font-medium"
          >
            <option value="ALL">ทุกกลุ่มงาน</option>
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            รายชื่อบุคลากรทั้งหมด ({filteredList.length} คน)
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Authoritative Table: personnel
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 font-mono">PERSON_ID</th>
                <th className="py-2.5 px-4 font-mono text-teal-800">FINGLE_ID</th>
                <th className="py-2.5 px-4">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-4">ตำแหน่ง</th>
                <th className="py-2.5 px-4">ฝ่าย/งาน</th>
                <th className="py-2.5 px-4">กลุ่มงาน</th>
                <th className="py-2.5 px-4">ประเภทบุคลากร</th>
                <th className="py-2.5 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map((p) => (
                <tr key={p.personId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-700 font-bold">
                    {p.personId}
                  </td>
                  <td className="py-3 px-4 font-mono text-teal-700 font-bold">
                    {p.fingleId}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {p.prefix}{p.firstName} {p.lastName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {p.position}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {p.department}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {p.groupName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                      {p.personnelType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ปฏิบัติงาน
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
