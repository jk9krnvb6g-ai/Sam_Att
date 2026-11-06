import React, { useState, useMemo } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { Personnel } from '../types/attendance';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  ArrowUpDown,
  Building2,
  Calendar,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToReview?: (filter?: { department?: string; status?: string }) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToReview }) => {
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [rankOrder, setRankOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Load summary metrics
  const summary = useMemo(() => {
    return mockAttendanceService.getDashboardSummary(selectedDate);
  }, [selectedDate]);

  // Load rankings
  const rankings = useMemo(() => {
    return mockAttendanceService.getLateRankings({
      fromDate: selectedDate,
      toDate: selectedDate,
      order: rankOrder,
      department: selectedDept,
    });
  }, [selectedDate, rankOrder, selectedDept]);

  // Unique departments for filter
  const departments: string[] = useMemo(() => {
    const list = mockAttendanceService.getPersonnel().map((p: Personnel) => p.department);
    return Array.from(new Set(list));
  }, []);

  return (
    <div className="space-y-6">
      {/* Title & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            แดชบอร์ดภาพรวมการลงเวลา (Attendance Overview)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            สรุปผลการสแกนนิ้วประจำวัน เปรียบเทียบกับตารางเวรและการมาสายของโรงพยาบาลสามชุก
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-mono font-medium focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs font-medium focus:outline-none bg-transparent"
            >
              <option value="ALL">ทุกฝ่าย/แผนก</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Personnel & Shifts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>บุคลากรที่ปฏิบัติงานวันนี้</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-data mt-2">
            {summary.totalShiftsToday}
            <span className="text-xs font-normal text-slate-400 font-sans ml-1">
              / {summary.totalPersonnel} คน
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            ลงเวลาปกติ: <span className="text-emerald-700 font-medium font-mono-data">{summary.normalCount} กะ</span>
          </div>
        </div>

        {/* KPI 2: Distinct Late Persons vs Occurrences */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="text-amber-800 font-medium">บุคลากรที่มาสาย (Distinct)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono-data mt-2">
            {summary.distinctLatePeople}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1">
              คน ({summary.totalLateOccurrences} กะ)
            </span>
          </div>
          <div className="text-[11px] text-amber-700 mt-1">
            อัตรามาสาย: {Math.round((summary.distinctLatePeople / (summary.totalPersonnel || 1)) * 100)}% ของบุคลากร
          </div>
        </div>

        {/* KPI 3: Total Late Minutes & Explicit Divisor */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>นาทีสายรวม / เฉลี่ยต่อกะ</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-data mt-2">
            {summary.totalLateMinutes}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1">นาที</span>
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            เฉลี่ย{' '}
            <span className="font-semibold text-slate-900 font-mono-data">
              {summary.avgLateMinutesPerLateShift}
            </span>{' '}
            นาที ÷ {summary.totalLateOccurrences} กะที่สาย
          </div>
        </div>

        {/* KPI 4: No Scan */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="text-rose-800 font-medium">ไม่พบสแกน (No Scan)</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 font-mono-data mt-2">
            {summary.noScanCount}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1">คน</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            บันทึกเหตุผลแล้ว: {summary.noScanCount > 0 ? `${summary.noScanCount} รายการ` : '0 รายการ'}
          </div>
        </div>
      </div>

      {/* Main Grid: Late Rankings & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Late Rankings (High to Low / Low to High) */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800">
              อันดับการมาสายประจำวัน (Late Ranking)
            </div>
            {/* Toggle High -> Low vs Low -> High */}
            <button
              onClick={() => setRankOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'))}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{rankOrder === 'DESC' ? 'สายมาก → น้อย' : 'สายน้อย → มาก'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">อันดับ</th>
                  <th className="py-2.5 px-3 font-semibold">ชื่อ-สกุล</th>
                  <th className="py-2.5 px-3 font-semibold">ฝ่าย/งาน</th>
                  <th className="py-2.5 px-3 font-semibold text-center">จำนวนครั้ง</th>
                  <th className="py-2.5 px-3 font-semibold text-right">นาทีสายรวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      ไม่พบประวัติการมาสายในวันที่เลือก
                    </td>
                  </tr>
                ) : (
                  rankings.map((r, idx) => (
                    <tr key={r.personId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono-data text-slate-500 font-medium">
                        #{idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {r.fullName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 truncate max-w-[130px]">
                        {r.department}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono-data text-slate-700">
                        {r.lateOccurrences} ครั้ง
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-data font-semibold text-amber-700">
                        {r.totalLateMinutes > 0 ? `+${r.totalLateMinutes} น.` : '0 น.'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Department Summary */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-400" />
              สรุปสถิติตามฝ่าย / แผนก
            </div>
            <span className="text-[11px] text-slate-400">
              {summary.departmentSummaries.length} แผนก
            </span>
          </div>

          <div className="overflow-x-auto max-h-[380px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">ฝ่าย/งาน</th>
                  <th className="py-2.5 px-3 font-semibold text-center">เข้างาน</th>
                  <th className="py-2.5 px-3 font-semibold text-center">ปกติ</th>
                  <th className="py-2.5 px-3 font-semibold text-center">มาสาย</th>
                  <th className="py-2.5 px-3 font-semibold text-center">ไม่พบสแกน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.departmentSummaries.map((dept) => (
                  <tr key={dept.department} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {dept.department}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-data text-slate-700">
                      {dept.total}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-data text-emerald-700 font-medium">
                      {dept.normalCount}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-data">
                      {dept.lateCount > 0 ? (
                        <span className="font-semibold text-amber-700">{dept.lateCount}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono-data">
                      {dept.noScanCount > 0 ? (
                        <span className="font-semibold text-rose-700">{dept.noScanCount}</span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
