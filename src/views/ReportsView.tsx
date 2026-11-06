import React, { useState, useMemo } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { Personnel } from '../types/attendance';
import {
  FileBarChart2,
  Download,
  Calendar,
  Filter,
  ArrowUpDown,
  Building2,
  Users,
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const [reportType, setReportType] = useState<'MONTHLY' | 'DAILY' | 'RANGE'>('MONTHLY');
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [fromDate, setFromDate] = useState('2026-11-01');
  const [toDate, setToDate] = useState('2026-11-06');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [rankOrder, setRankOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Compute effective date range
  const { start, end } = useMemo(() => {
    if (reportType === 'DAILY') return { start: selectedDate, end: selectedDate };
    if (reportType === 'MONTHLY') return { start: `${selectedMonth}-01`, end: `${selectedMonth}-31` };
    return { start: fromDate, end: toDate };
  }, [reportType, selectedDate, selectedMonth, fromDate, toDate]);

  // Load rankings & report items
  const reportData = useMemo(() => {
    return mockAttendanceService.getLateRankings({
      fromDate: start,
      toDate: end,
      order: rankOrder,
      department: selectedDept,
    });
  }, [start, end, rankOrder, selectedDept]);

  // Unique departments
  const departments: string[] = useMemo(() => {
    const list = mockAttendanceService.getPersonnel().map((p: Personnel) => p.department);
    return Array.from(new Set(list));
  }, []);

  // Summary figures
  const totalLatePersons = reportData.filter((r) => r.lateOccurrences > 0).length;
  const totalLateOccurrences = reportData.reduce((sum, r) => sum + r.lateOccurrences, 0);
  const totalLateMinutes = reportData.reduce((sum, r) => sum + r.totalLateMinutes, 0);

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['อันดับ', 'PERSON_ID', 'ชื่อ-นามสกุล', 'ฝ่าย/งาน', 'จำนวนครั้งที่สาย', 'นาทีสายรวม', 'นาทีสายเฉลี่ยต่อครั้ง'];
    const rows = reportData.map((r, i) => [
      i + 1,
      r.personId,
      r.fullName,
      r.department,
      r.lateOccurrences,
      r.totalLateMinutes,
      r.avgLateMinutes,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sam_Att_Report_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            รายงานสถิติ & อันดับการมาสาย (Reports & Rankings)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            สรุปข้อมูลสถิติการปฏิบัติงาน แยกตามคน กลุ่มงาน ฝ่าย และทั้งโรงพยาบาลสามชุก
          </p>
        </div>

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>ส่งออกไฟล์ CSV (Export)</span>
        </button>
      </div>

      {/* Filter Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-3">
        {/* Report Period Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setReportType('MONTHLY')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              reportType === 'MONTHLY' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            รายเดือน
          </button>
          <button
            onClick={() => setReportType('DAILY')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              reportType === 'DAILY' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            รายวัน
          </button>
          <button
            onClick={() => setReportType('RANGE')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              reportType === 'RANGE' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600'
            }`}
          >
            กำหนดช่วงวันที่
          </button>
        </div>

        {/* Dynamic Inputs based on type */}
        {reportType === 'MONTHLY' && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="2026-11">พฤศจิกายน 2569 (2026-11)</option>
            <option value="2026-10">ตุลาคม 2569 (2026-10)</option>
            <option value="2026-09">กันยายน 2569 (2026-09)</option>
          </select>
        )}

        {reportType === 'DAILY' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-mono font-medium"
          />
        )}

        {reportType === 'RANGE' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono"
            />
            <span className="text-slate-400">ถึง</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono"
            />
          </div>
        )}

        {/* Department Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs bg-transparent focus:outline-none font-medium"
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

      {/* KPI Cards for Report Range */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">จำนวนคนที่มาสาย (Distinct Persons)</div>
          <div className="text-2xl font-bold text-amber-700 font-mono-data mt-1">
            {totalLatePersons}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">คน</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">นับเฉพาะบุคคลที่ไม่ซ้ำคน</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">จำนวนครั้งที่มาสาย (Late Occurrences)</div>
          <div className="text-2xl font-bold text-slate-900 font-mono-data mt-1">
            {totalLateOccurrences}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">ครั้ง</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">รวมทุกกะที่สายในช่วงเวลา</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">นาทีสายสะสมรวม</div>
          <div className="text-2xl font-bold text-amber-800 font-mono-data mt-1">
            {totalLateMinutes}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">นาที</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            เฉลี่ย{' '}
            {totalLateOccurrences > 0 ? Math.round(totalLateMinutes / totalLateOccurrences) : 0} นาที/ครั้งที่สาย
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            ตารางสรุปอันดับรายบุคคล (ช่วงวันที่: {start} ถึง {end})
          </div>

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
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 font-mono">อันดับ</th>
                <th className="py-2.5 px-4 font-mono">PERSON_ID</th>
                <th className="py-2.5 px-4">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-4">ฝ่าย/งาน</th>
                <th className="py-2.5 px-4 text-center">จำนวนครั้งที่สาย</th>
                <th className="py-2.5 px-4 text-right">นาทีสายรวม</th>
                <th className="py-2.5 px-4 text-right">เฉลี่ยต่อครั้ง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.map((row, idx) => (
                <tr key={row.personId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono-data text-slate-500 font-medium">
                    #{idx + 1}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 font-bold">
                    {row.personId}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {row.fullName}
                  </td>
                  <td className="py-3 px-4 text-slate-600 truncate max-w-[140px]">
                    {row.department}
                  </td>
                  <td className="py-3 px-4 text-center font-mono-data">
                    {row.lateOccurrences > 0 ? (
                      <span className="font-semibold text-amber-700">{row.lateOccurrences} ครั้ง</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-data font-semibold text-amber-800">
                    {row.totalLateMinutes > 0 ? `+${row.totalLateMinutes} นาที` : '0'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-data text-slate-600">
                    {row.avgLateMinutes > 0 ? `${row.avgLateMinutes} น.` : '-'}
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
