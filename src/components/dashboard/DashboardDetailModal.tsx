import React, { useState, useMemo, useEffect } from 'react';
import {
  AttendanceRecord,
  HosOfficePushBatch,
  RawScanEvent,
} from '../../types/attendance';
import { AttendanceStatusBadge } from '../common/StatusBadge';
import { NavItemKey } from '../layout/Sidebar';
import {
  X,
  Search,
  Download,
  ExternalLink,
  Fingerprint,
  Send,
  CheckCircle2,
  Building2,
  UserCheck,
  ArrowUpDown,
} from 'lucide-react';

export interface PersonnelRankRow {
  personId: string;
  fingleId: number;
  fullName: string;
  position: string;
  department: string;
  groupName: string;
  personnelType: string;
  totalWorkDays: number;
  normalCount: number;
  lateCount: number;
  totalLateMinutes: number;
  incompleteCount: number;
  onTimeRatePct: number;
  records: AttendanceRecord[];
}

export interface GroupExecutiveRow {
  groupName: string;
  headcount: number;
  totalShifts: number;
  normalCount: number;
  onTimePct: number;
  lateCount: number;
  totalLateMinutes: number;
  incompleteCount: number;
  records: AttendanceRecord[];
}

export interface ScannerUsageStat {
  machineNo: number;
  name: string;
  ip: string;
  totalScans: number;
  inCount: number;
  outCount: number;
  mappedCount: number;
  unmappedCount: number;
  sharePct: number;
  scans: RawScanEvent[];
}

export type DashboardModalPayload =
  | {
      type: 'KPI_RECORDS';
      title: string;
      subtitle: string;
      badgeColor: 'purple' | 'emerald' | 'amber' | 'orange' | 'rose';
      records: AttendanceRecord[];
    }
  | {
      type: 'PERSON_HISTORY';
      person: PersonnelRankRow;
    }
  | {
      type: 'GROUP_DETAIL';
      group: GroupExecutiveRow;
    }
  | {
      type: 'SCANNER_DETAIL';
      stat: ScannerUsageStat;
    }
  | {
      type: 'HOSOFFICE_PUSH';
      title: string;
      subtitle: string;
      pushedRecords: AttendanceRecord[];
      pendingRecords: AttendanceRecord[];
      batches: HosOfficePushBatch[];
    };

interface DashboardDetailModalProps {
  payload: DashboardModalPayload | null;
  onClose: () => void;
  onNavigate: (key: NavItemKey) => void;
}

export const DashboardDetailModal: React.FC<DashboardDetailModalProps> = ({
  payload,
  onClose,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    setSearch('');
    setSortAsc(false);
  }, [payload]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (payload) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [payload, onClose]);

  const activeRecords = useMemo(() => {
    if (!payload) return [];
    let list: AttendanceRecord[] = [];
    if (payload.type === 'KPI_RECORDS') list = payload.records;
    else if (payload.type === 'PERSON_HISTORY') list = payload.person.records;
    else if (payload.type === 'GROUP_DETAIL') list = payload.group.records;
    else if (payload.type === 'HOSOFFICE_PUSH') {
      list = [...payload.pendingRecords, ...payload.pushedRecords];
    }

    const q = search.trim().toLowerCase();
    const filtered = list.filter(
      (r) =>
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.personId.toLowerCase().includes(q) ||
        String(r.fingleId).includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.groupName.toLowerCase().includes(q) ||
        r.workDate.includes(q) ||
        r.shiftName.toLowerCase().includes(q)
    );

    return [...filtered].sort((a, b) => {
      const cmp =
        b.workDate.localeCompare(a.workDate) ||
        b.lateMinutes - a.lateMinutes ||
        a.fullName.localeCompare(b.fullName, 'th');
      return sortAsc ? -cmp : cmp;
    });
  }, [payload, search, sortAsc]);

  const activeScans = useMemo(() => {
    if (!payload || payload.type !== 'SCANNER_DETAIL') return [];
    const q = search.trim().toLowerCase();
    return payload.stat.scans.filter(
      (s) =>
        !q ||
        String(s.enrollNumber).includes(q) ||
        s.scanDateTime.toLowerCase().includes(q) ||
        s.dedupeKey.toLowerCase().includes(q)
    );
  }, [payload, search]);

  if (!payload) return null;

  const handleExportCsv = () => {
    if (payload.type === 'SCANNER_DETAIL') {
      const header = ['MachineNo', 'EnrollNumber', 'ScanDateTime', 'VerifyMode', 'InOutMode', 'WorkCode'];
      const rows = activeScans.map((s) => [
        s.machineNo,
        s.enrollNumber,
        s.scanDateTime,
        s.verifyMode,
        s.inOutMode,
        s.workCode ?? '',
      ]);
      const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sam_Att_Scanner_M${payload.stat.machineNo}_RawScans.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const header = [
      'WorkDate',
      'PersonID',
      'FingleID',
      'FullName',
      'Department',
      'GroupName',
      'Shift',
      'CheckIn',
      'CheckOut',
      'LateMinutes',
      'Status',
      'Note',
    ];
    const rows = activeRecords.map((r) => [
      r.workDate,
      r.personId,
      r.fingleId,
      `"${r.fullName}"`,
      `"${r.department}"`,
      `"${r.groupName}"`,
      `"${r.shiftName}"`,
      r.checkInAt || '-',
      r.checkOutAt || '-',
      r.lateMinutes,
      r.status,
      `"${r.notes?.note || ''}"`,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sam_Att_Dashboard_Drilldown.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl max-h-[88vh] rounded-2xl border border-[#E9E5F2] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#F8F7FC] to-purple-50/60 border-b border-[#E9E5F2] flex items-start justify-between gap-4">
          <div>
            {payload.type === 'KPI_RECORDS' && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  รายละเอียดจาก KPI Summary Card
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{payload.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{payload.subtitle}</p>
              </>
            )}

            {payload.type === 'PERSON_HISTORY' && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  <UserCheck className="w-3.5 h-3.5" /> ประวัติการปฏิบัติงานรายบุคคล
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {payload.person.fullName}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    ({payload.person.position})
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono-data">
                  PERSON_ID: {payload.person.personId} · FINGLE_ID: #{payload.person.fingleId} ·{' '}
                  {payload.person.department} ({payload.person.groupName})
                </p>
              </>
            )}

            {payload.type === 'GROUP_DETAIL' && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  <Building2 className="w-3.5 h-3.5" /> สรุปรายละเอียดระดับกลุ่มงาน
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {payload.group.groupName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  บุคลากรในกลุ่มงาน {payload.group.headcount} คน · รายการประเมินกะทั้งหมด{' '}
                  {payload.group.totalShifts} รายการ · อัตราตรงเวลา {payload.group.onTimePct}%
                </p>
              </>
            )}

            {payload.type === 'SCANNER_DETAIL' && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  <Fingerprint className="w-3.5 h-3.5" /> ข้อมูลสแกนดิบตามจุดติดตั้งเครื่องสแกน
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{payload.stat.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono-data">
                  Machine #{payload.stat.machineNo} · IP: {payload.stat.ip}:4370 · สัดส่วน{' '}
                  {payload.stat.sharePct}% ({payload.stat.totalScans} รายการ)
                </p>
              </>
            )}

            {payload.type === 'HOSOFFICE_PUSH' && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  <Send className="w-3.5 h-3.5" /> สถานะการเตรียมส่งข้อมูลเข้า HOSOffice (Push Readiness)
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{payload.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{payload.subtitle}</p>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary Mini-KPI Strip inside Modal */}
        {payload.type === 'PERSON_HISTORY' && (
          <div className="px-6 py-3 bg-purple-50/50 border-b border-[#E9E5F2] grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-white p-2.5 rounded-xl border border-[#E9E5F2]">
              <div className="text-[11px] text-slate-500">กะที่ได้รับมอบหมาย</div>
              <div className="text-base font-bold font-mono-data text-slate-900">
                {payload.person.totalWorkDays} กะ
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
              <div className="text-[11px] text-emerald-700">ตรงเวลา (On-Time)</div>
              <div className="text-base font-bold font-mono-data text-emerald-700">
                {payload.person.normalCount} ({payload.person.onTimeRatePct}%)
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-amber-200">
              <div className="text-[11px] text-amber-700">จำนวนครั้งที่มาสาย</div>
              <div className="text-base font-bold font-mono-data text-amber-700">
                {payload.person.lateCount} ครั้ง
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-rose-200">
              <div className="text-[11px] text-rose-700">เวลามาสายสะสม</div>
              <div className="text-base font-bold font-mono-data text-rose-700">
                {payload.person.totalLateMinutes} นาที
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-xl border border-orange-200 col-span-2 sm:col-span-1">
              <div className="text-[11px] text-orange-700">สแกนไม่ครบ / NO_SCAN</div>
              <div className="text-base font-bold font-mono-data text-orange-700">
                {payload.person.incompleteCount} รายการ
              </div>
            </div>
          </div>
        )}

        {/* Filter & Export Bar */}
        <div className="px-6 py-3 bg-white border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อบุคลากร, รหัส PERSON_ID, FINGLE_ID, แผนก หรือวันที่..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600"
            />
          </div>

          <div className="flex items-center gap-2">
            {payload.type !== 'SCANNER_DETAIL' && (
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-purple-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-purple-600" />
                เรียงลำดับ ({sortAsc ? 'เก่า → ใหม่' : 'ใหม่ → เก่า'})
              </button>
            )}

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-xs font-semibold text-purple-800 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Body Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {payload.type === 'SCANNER_DETAIL' ? (
            <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Machine No</th>
                    <th className="py-2.5 px-3">Enroll Number (FINGLE_ID)</th>
                    <th className="py-2.5 px-3">Scan DateTime</th>
                    <th className="py-2.5 px-3">In/Out Mode</th>
                    <th className="py-2.5 px-3">Verify Mode</th>
                    <th className="py-2.5 px-3">Dedupe Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2] text-xs">
                  {activeScans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        ไม่พบข้อมูลสแกนดิบที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    activeScans.map((s) => (
                      <tr key={s.id} className="hover:bg-purple-50/40">
                        <td className="py-2.5 px-3 font-mono-data font-semibold text-purple-700">
                          เครื่อง #{s.machineNo}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-bold text-slate-800">
                          #{s.enrollNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-700">
                          {s.scanDateTime}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono-data font-semibold ${
                              s.inOutMode === 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {s.inOutMode === 0 ? '0 (สแกนเข้า)' : `${s.inOutMode} (สแกนออก)`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-500">
                          {s.verifyMode}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-[11px] text-slate-400">
                          {s.dedupeKey}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">วันที่ปฏิบัติงาน</th>
                    <th className="py-2.5 px-3">บุคลากร (PERSON_ID / FINGLE)</th>
                    <th className="py-2.5 px-3">หน่วยงาน / กลุ่มงาน</th>
                    <th className="py-2.5 px-3">กะเวลา</th>
                    <th className="py-2.5 px-3">สแกนเข้า</th>
                    <th className="py-2.5 px-3">สแกนออก</th>
                    <th className="py-2.5 px-3">สถานะ</th>
                    <th className="py-2.5 px-3">หมายเหตุ / HOSOffice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2] text-xs">
                  {activeRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        ไม่พบรายการปฏิบัติงานในช่วงเวลานี้
                      </td>
                    </tr>
                  ) : (
                    activeRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-purple-50/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-800 whitespace-nowrap">
                          {rec.workDate}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{rec.fullName}</div>
                          <div className="text-[11px] text-slate-500 font-mono-data">
                            ID: {rec.personId} · FINGLE: #{rec.fingleId}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-800 font-medium">{rec.department}</div>
                          <div className="text-[11px] text-purple-700">{rec.groupName}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-800">{rec.shiftName}</div>
                          <div className="text-[11px] font-mono-data text-slate-500">
                            {rec.shiftStartTime} - {rec.shiftEndTime}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-800 whitespace-nowrap">
                          {rec.checkInAt || <span className="text-slate-300">--:--</span>}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-800 whitespace-nowrap">
                          {rec.checkOutAt || <span className="text-slate-300">--:--</span>}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <AttendanceStatusBadge
                            status={rec.status}
                            lateMinutes={rec.lateMinutes}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-1">
                            {rec.notes ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-medium">
                                {rec.notes.reasonLabel}: {rec.notes.note}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">-</span>
                            )}
                            <span
                              className={`text-[10px] font-mono-data ${
                                rec.isPushedToHosOffice
                                  ? 'text-emerald-600 font-semibold'
                                  : 'text-amber-600'
                              }`}
                            >
                              {rec.isPushedToHosOffice
                                ? `ส่ง HOSOffice แล้ว (${rec.lastPushedAt || ''})`
                                : 'รอส่ง HOSOffice'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Extra Batch History Section for HOSOFFICE_PUSH */}
          {payload.type === 'HOSOFFICE_PUSH' && (
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs text-amber-800 font-medium">รายการรอส่ง (Pending Push)</div>
                  <div className="text-2xl font-bold font-mono-data text-amber-900 mt-1">
                    {payload.pendingRecords.length} รายการ
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    พร้อมตรวจสอบก่อนกดส่งเข้า HOSOffice
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs text-emerald-800 font-medium">
                    ส่งเข้า HOSOffice สำเร็จแล้ว
                  </div>
                  <div className="text-2xl font-bold font-mono-data text-emerald-900 mt-1">
                    {payload.pushedRecords.length} รายการ
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    ป้องกันการส่งซ้ำ (Idempotent Guard)
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200">
                  <div className="text-xs text-purple-800 font-medium">จำนวน Batch ที่ตรวจสอบแล้ว</div>
                  <div className="text-2xl font-bold font-mono-data text-purple-900 mt-1">
                    {payload.batches.length} รอบ
                  </div>
                  <div className="text-[11px] text-purple-700 mt-0.5">
                    Target: HOSOffice (`hr_attend` / `attendance_sync`)
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  ประวัติการตรวจสอบและส่งข้อมูลเข้า HOSOffice ล่าสุด (Push Batches)
                </h4>
                <div className="space-y-2">
                  {payload.batches.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Send className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-mono-data font-semibold text-purple-800">{b.id}</span>
                        <span className="text-slate-700">{b.note}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono-data text-[11px] text-slate-500">
                        <span>รายการ: {b.recordsCount} รายการ</span>
                        <span>ข้ามข้อมูลซ้ำ: {b.skippedDuplicateCount} รายการ</span>
                        <span>เวลา: {b.pushedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#F8F7FC] border-t border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-purple-600" />
            <span>ข้อมูลจริงจากฐานข้อมูล `samchuk_attendance` ผ่าน `/api/Sam_Att/*`</span>
          </div>

          <div className="flex items-center gap-2">
            {payload.type === 'SCANNER_DETAIL' && (
              <button
                onClick={() => {
                  onClose();
                  onNavigate('raw-scans');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                เปิดหน้าข้อมูลสแกนดิบทั้งหมด
              </button>
            )}

            {payload.type === 'HOSOFFICE_PUSH' && (
              <button
                onClick={() => {
                  onClose();
                  onNavigate('hosoffice-push');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                ไปที่หน้าส่งข้อมูลเข้า HOSOffice
              </button>
            )}

            {(payload.type === 'KPI_RECORDS' ||
              payload.type === 'PERSON_HISTORY' ||
              payload.type === 'GROUP_DETAIL') && (
              <button
                onClick={() => {
                  onClose();
                  onNavigate('attendance-review');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                เปิดในหน้าตรวจสอบเวลา / บันทึกหมายเหตุ
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#E9E5F2] bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
