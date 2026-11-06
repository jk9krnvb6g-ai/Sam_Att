import React, { useState, useEffect, useMemo } from 'react';
import {
  AttendanceRecord,
  Personnel,
  RawScanEvent,
  ScannerDevice,
  SyncRunLog,
  PushHistory,
} from '../../types/attendance';
import { StatusBadge } from '../common/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Search,
  ArrowUpDown,
  Calendar,
  Building2,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  History,
  Fingerprint,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Users,
  Database,
  Info,
} from 'lucide-react';

export type DashboardModalType =
  | 'ALL_PERSONNEL'
  | 'PRESENT_TODAY'
  | 'NORMAL_STATUS'
  | 'LATE_STATUS'
  | 'NO_SCAN_STATUS'
  | 'SCANNERS_OVERVIEW'
  | 'HOURLY_SCANS'
  | 'DEPARTMENT_DETAIL'
  | 'SCANNER_DEVICE_DETAIL'
  | 'HOSOFFICE_PENDING'
  | 'HOSOFFICE_HISTORY'
  | 'RAW_SCAN_SINGLE'
  | 'ALL_RAW_SCANS';

export interface DashboardModalState {
  type: DashboardModalType;
  title: string;
  subtitle?: string;
  hour?: number;
  departmentName?: string;
  scannerDevice?: ScannerDevice;
  selectedRawScan?: RawScanEvent;
}

interface DashboardDetailModalProps {
  modalState: DashboardModalState | null;
  onClose: () => void;
  selectedDate: string;
  selectedGroup: string;
  personnelList: Personnel[];
  attendanceList: AttendanceRecord[];
  rawScansList: RawScanEvent[];
  scannersList: ScannerDevice[];
  syncRunsList: SyncRunLog[];
  pushHistoryList: PushHistory[];
  onNavigateToView?: (viewId: string) => void;
  onSelectRawScan?: (scan: RawScanEvent) => void;
}

export const DashboardDetailModal: React.FC<DashboardDetailModalProps> = ({
  modalState,
  onClose,
  selectedDate,
  selectedGroup,
  personnelList,
  attendanceList,
  rawScansList,
  scannersList,
  syncRunsList,
  pushHistoryList,
  onNavigateToView,
  onSelectRawScan,
}) => {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [lateSortOrder, setLateSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [subFilter, setSubFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Reset internal controls when modal changes
  useEffect(() => {
    setSearchQuery('');
    setSubFilter('ALL');
    setCurrentPage(1);
    setLateSortOrder('DESC');
  }, [modalState?.type, modalState?.hour, modalState?.departmentName, modalState?.scannerDevice?.id]);

  // Handle Escape key and lock background body scroll
  useEffect(() => {
    if (!modalState) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalState, onClose]);

  // Reset page when search or subFilter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, subFilter, lateSortOrder]);

  // Helper map for FINGLE_ID -> Personnel
  const personnelByFingle = useMemo(() => {
    const map = new Map<number, Personnel>();
    personnelList.forEach((p) => map.set(p.fingleId, p));
    return map;
  }, [personnelList]);

  // Helper map for FINGLE_ID + workDate -> AttendanceRecord
  const attendanceByFingleDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendanceList.forEach((a) => map.set(`${a.fingleId}_${a.workDate}`, a));
    return map;
  }, [attendanceList]);

  if (!modalState) return null;

  // Security guard: GENERAL_USER must never inspect other personnel's records via modal
  if (currentUser?.role === 'GENERAL_USER') {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">จำกัดสิทธิ์การเข้าถึงข้อมูล</h3>
          <p className="text-xs text-slate-600 mt-1">
            บัญชีผู้ใช้งานทั่วไป (GENERAL_USER) ไม่สามารถเปิดดูข้อมูลการลงเวลาของบุคลากรท่านอื่นได้ตามข้อกำหนดด้านความปลอดภัย
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    );
  }

  // Render content based on modal type
  const renderModalBody = () => {
    const q = searchQuery.toLowerCase().trim();

    // 1. ALL_PERSONNEL
    if (modalState.type === 'ALL_PERSONNEL') {
      const filtered = personnelList.filter((p) => {
        const fullName = `${p.prefix}${p.firstName} ${p.lastName}`.toLowerCase();
        const matchesSearch =
          !q ||
          fullName.includes(q) ||
          p.personId.toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q) ||
          p.groupName.toLowerCase().includes(q) ||
          String(p.fingleId).includes(q);
        const matchesSub = subFilter === 'ALL' || p.personnelType === subFilter;
        return matchesSearch && matchesSub;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      const personnelTypes = Array.from(new Set(personnelList.map((p) => p.personnelType)));

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Users className="w-4 h-4 text-teal-600" />
              <span>
                บุคลากรในขอบเขตทั้งหมด{' '}
                <strong className="font-mono-data text-slate-900">{filtered.length}</strong> ท่าน
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={subFilter}
                onChange={(e) => setSubFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
              >
                <option value="ALL">ทุกประเภทบุคลากร</option>
                {personnelTypes.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">รหัสบุคลากร</th>
                  <th className="py-2.5 px-3 font-mono">FINGLE_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-3">ตำแหน่ง / แผนก</th>
                  <th className="py-2.5 px-3">กลุ่มงาน</th>
                  <th className="py-2.5 px-3">ประเภทบุคลากร</th>
                  <th className="py-2.5 px-3 text-center">สถานะวันนี้</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ไม่พบข้อมูลบุคลากรที่ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                ) : (
                  paged.map((p) => {
                    const todayAtt = attendanceList.find((a) => a.personId === p.personId);
                    return (
                      <tr key={p.personId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {p.personId}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-teal-700">
                          #{p.fingleId}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {p.prefix}
                          {p.firstName} {p.lastName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div className="font-medium text-slate-800">{p.department}</div>
                          <div className="text-[11px] text-slate-400">{p.position}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{p.groupName}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                            {p.personnelType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {todayAtt ? (
                            <StatusBadge status={todayAtt.status} size="sm" />
                          ) : (
                            <span className="text-[11px] text-slate-400">ไม่มีตารางเวร</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {renderPagination(currentPage, totalPages, filtered.length)}
        </div>
      );
    }

    // 2. PRESENT_TODAY, NORMAL_STATUS, LATE_STATUS, NO_SCAN_STATUS, DEPARTMENT_DETAIL
    if (
      modalState.type === 'PRESENT_TODAY' ||
      modalState.type === 'NORMAL_STATUS' ||
      modalState.type === 'LATE_STATUS' ||
      modalState.type === 'NO_SCAN_STATUS' ||
      modalState.type === 'DEPARTMENT_DETAIL'
    ) {
      let baseRecords = [...attendanceList];

      if (modalState.type === 'PRESENT_TODAY') {
        baseRecords = baseRecords.filter((r) => r.status === 'NORMAL' || r.status === 'LATE');
      } else if (modalState.type === 'NORMAL_STATUS') {
        baseRecords = baseRecords.filter((r) => r.status === 'NORMAL');
      } else if (modalState.type === 'LATE_STATUS') {
        baseRecords = baseRecords.filter((r) => r.status === 'LATE');
      } else if (modalState.type === 'NO_SCAN_STATUS') {
        baseRecords = baseRecords.filter((r) => r.status === 'NO_SCAN');
      } else if (modalState.type === 'DEPARTMENT_DETAIL' && modalState.departmentName) {
        baseRecords = baseRecords.filter(
          (r) =>
            r.groupName === modalState.departmentName || r.department === modalState.departmentName
        );
      }

      if (subFilter !== 'ALL') {
        baseRecords = baseRecords.filter((r) => r.status === subFilter);
      }

      const filtered = baseRecords.filter((r) => {
        if (!q) return true;
        return (
          r.fullName.toLowerCase().includes(q) ||
          r.personId.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.groupName.toLowerCase().includes(q) ||
          String(r.fingleId).includes(q)
        );
      });

      if (modalState.type === 'LATE_STATUS') {
        filtered.sort((a, b) =>
          lateSortOrder === 'DESC'
            ? b.lateMinutes - a.lateMinutes
            : a.lateMinutes - b.lateMinutes
        );
      }

      const distinctPeopleCount = new Set(filtered.map((r) => r.personId)).size;
      const totalLateMins = filtered.reduce((sum, r) => sum + r.lateMinutes, 0);
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      return (
        <div className="space-y-4">
          {/* Summary Strip inside Modal */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500">จำนวนบุคลากร (Distinct): </span>
                <strong className="font-mono-data text-slate-900 text-sm">
                  {distinctPeopleCount} ท่าน
                </strong>
              </div>
              <span className="text-slate-300">|</span>
              <div>
                <span className="text-slate-500">จำนวนรายการ/กะ: </span>
                <strong className="font-mono-data text-slate-900 text-sm">
                  {filtered.length} กะ
                </strong>
              </div>
              {modalState.type === 'LATE_STATUS' && (
                <>
                  <span className="text-slate-300">|</span>
                  <div>
                    <span className="text-amber-800">นาทีสายรวม: </span>
                    <strong className="font-mono-data text-amber-700 text-sm">
                      {totalLateMins} นาที
                    </strong>
                    <span className="text-[11px] text-slate-500 ml-1">
                      (เฉลี่ย {filtered.length > 0 ? Math.round(totalLateMins / filtered.length) : 0}{' '}
                      นาที ÷ {filtered.length} กะ)
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {(modalState.type === 'PRESENT_TODAY' ||
                modalState.type === 'DEPARTMENT_DETAIL') && (
                <select
                  value={subFilter}
                  onChange={(e) => setSubFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
                >
                  <option value="ALL">ทุกสถานะ</option>
                  <option value="NORMAL">ปกติ (ตรงเวลา)</option>
                  <option value="LATE">มาสาย (Late)</option>
                  <option value="NO_SCAN">ไม่พบสแกน</option>
                </select>
              )}

              {modalState.type === 'LATE_STATUS' && (
                <button
                  onClick={() => setLateSortOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                  <span>{lateSortOrder === 'DESC' ? 'เรียงสายมาก → น้อย' : 'เรียงสายน้อย → มาก'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">รหัส / FID</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-3">ฝ่าย / กลุ่มงาน</th>
                  <th className="py-2.5 px-3">กะเวลาปฏิบัติงาน</th>
                  <th className="py-2.5 px-3">เวลาสแกนเข้า</th>
                  <th className="py-2.5 px-3">เวลาสแกนออก</th>
                  <th className="py-2.5 px-3">สถานะ</th>
                  <th className="py-2.5 px-3 text-right">นาทีสาย / หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      ไม่พบข้อมูลรายการในหมวดหมู่นี้
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-800">{r.personId}</div>
                        <div className="text-[10px] text-teal-700">FID: #{r.fingleId}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {r.fullName}
                        <span className="block text-[11px] font-normal text-slate-400">
                          {r.personnelType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div className="font-medium text-slate-800">{r.department}</div>
                        <div className="text-[11px] text-slate-400">{r.groupName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <div className="font-medium">{r.shiftName}</div>
                        <div className="text-[11px] font-mono-data text-slate-400">
                          เริ่ม {r.shiftStartTime} - {r.shiftEndTime} น.
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-900">
                        {r.checkInAt ? (
                          <span className="text-teal-800 bg-teal-50/80 px-2 py-0.5 rounded border border-teal-200/60">
                            {r.checkInAt}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono-data text-slate-600">
                        {r.checkOutAt || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={r.status} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.status === 'LATE' && (
                          <span className="font-mono-data font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            +{r.lateMinutes} นาที
                          </span>
                        )}
                        {r.status === 'NO_SCAN' && (
                          <div className="text-right">
                            {r.notes ? (
                              <div>
                                <span className="font-semibold text-rose-800 block">
                                  {r.notes.reasonLabel}
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  {r.notes.note}
                                </span>
                              </div>
                            ) : (
                              <span className="text-rose-600 text-[11px] font-medium">
                                ยังไม่ได้ระบุสาเหตุ
                              </span>
                            )}
                          </div>
                        )}
                        {r.status === 'NORMAL' && (
                          <span className="text-emerald-700 font-medium text-[11px]">
                            ตรงเวลา
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {renderPagination(currentPage, totalPages, filtered.length)}
        </div>
      );
    }

    // 3. HOURLY_SCANS
    if (modalState.type === 'HOURLY_SCANS') {
      const targetHour = modalState.hour ?? 8;
      const hourPrefix = String(targetHour).padStart(2, '0');

      const hourScans = rawScansList.filter((scan) => {
        const timePart = scan.scanDateTime.split(' ')[1] || '';
        const matchesHour = timePart.startsWith(`${hourPrefix}:`);
        if (!matchesHour) return false;
        const person = personnelByFingle.get(scan.enrollNumber);
        if (selectedGroup !== 'ALL') {
          if (!person || (person.groupName !== selectedGroup && person.department !== selectedGroup)) {
            return false;
          }
        }
        if (q) {
          const fullName = person ? `${person.prefix}${person.firstName} ${person.lastName}`.toLowerCase() : '';
          return (
            fullName.includes(q) ||
            String(scan.enrollNumber).includes(q) ||
            scan.scanDateTime.includes(q)
          );
        }
        return true;
      });

      const totalPages = Math.max(1, Math.ceil(hourScans.length / pageSize));
      const paged = hourScans.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      return (
        <div className="space-y-4">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <span>
                ช่วงเวลาที่เลือก:{' '}
                <strong className="font-mono-data text-slate-900">
                  {hourPrefix}:00 - {hourPrefix}:59 น.
                </strong>
              </span>
            </div>
            <div>
              พบข้อมูลสแกนทั้งหมด{' '}
              <strong className="font-mono-data text-teal-700">{hourScans.length}</strong> รายการ
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">เวลาสแกนต้นฉบับ</th>
                  <th className="py-2.5 px-3">เครื่องสแกน</th>
                  <th className="py-2.5 px-3 font-mono">FINGLE_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล (HR)</th>
                  <th className="py-2.5 px-3">ฝ่าย / กลุ่มงาน</th>
                  <th className="py-2.5 px-3">ประเภทสแกน</th>
                  <th className="py-2.5 px-3">ผลการคำนวณเวร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ไม่มีรายการสแกนในช่วงเวลา {hourPrefix}:00 - {hourPrefix}:59 น.
                    </td>
                  </tr>
                ) : (
                  paged.map((scan) => {
                    const person = personnelByFingle.get(scan.enrollNumber);
                    const scanDate = scan.scanDateTime.slice(0, 10);
                    const att = attendanceByFingleDate.get(`${scan.enrollNumber}_${scanDate}`);
                    const isCheckout = scan.inOutMode === 2;

                    return (
                      <tr
                        key={scan.id}
                        onClick={() => onSelectRawScan && onSelectRawScan(scan)}
                        className="hover:bg-teal-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-mono-data font-bold text-slate-900">
                          {scan.scanDateTime}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          Scanner #{scan.machineNo}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-teal-700">
                          #{scan.enrollNumber}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {person ? (
                            `${person.prefix}${person.firstName} ${person.lastName}`
                          ) : (
                            <span className="text-amber-700 font-medium">
                              ไม่พบรหัสบุคลากร (PENDING_MAPPING)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {person ? `${person.department} (${person.groupName})` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          {isCheckout ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium text-[11px]">
                              สแกนออก (Out)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-[11px]">
                              สแกนเข้า (In)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {isCheckout ? (
                            <span className="text-blue-700 font-medium text-[11px]">
                              บันทึกเวลาออกงาน
                            </span>
                          ) : att ? (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={att.status} size="sm" />
                              {att.lateMinutes > 0 && (
                                <span className="text-[11px] font-mono-data text-amber-700 font-semibold">
                                  (+{att.lateMinutes} น.)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-700 text-[11px]">รอจับคู่บุคลากร</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {renderPagination(currentPage, totalPages, hourScans.length)}
        </div>
      );
    }

    // 4. SCANNERS_OVERVIEW or SCANNER_DEVICE_DETAIL
    if (
      modalState.type === 'SCANNERS_OVERVIEW' ||
      modalState.type === 'SCANNER_DEVICE_DETAIL'
    ) {
      const targetMachineNo = modalState.scannerDevice?.machineNo;
      const relevantScanners = targetMachineNo
        ? scannersList.filter((s) => s.machineNo === targetMachineNo)
        : scannersList;

      const deviceScans = rawScansList.filter((s) =>
        targetMachineNo ? s.machineNo === targetMachineNo : true
      );
      const deviceSyncRuns = syncRunsList.filter((r) =>
        targetMachineNo ? r.machineNo === targetMachineNo : true
      );

      return (
        <div className="space-y-5">
          {/* Device Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {relevantScanners.map((sc) => {
              const countForDevice = rawScansList.filter(
                (r) => r.machineNo === sc.machineNo
              ).length;
              return (
                <div
                  key={sc.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      Scanner #{sc.machineNo}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      Online (Mock)
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900">{sc.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono space-y-0.5">
                    <div>IP: {sc.ip}:{sc.port} (Model: HIP CMiF68S)</div>
                    <div>ซิงค์ล่าสุด: {sc.lastSyncAt || '-'}</div>
                    <div>สแกนล่าสุด: {sc.lastEventAt || '-'}</div>
                    <div className="text-teal-700 font-semibold pt-1">
                      จำนวน Raw Scan ในระบบ: {countForDevice} รายการ
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sync Runs History for this scanner */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <History className="w-4 h-4 text-teal-600" />
              ประวัติการซิงค์ข้อมูล (Sync Runs Log)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">เครื่องสแกน</th>
                    <th className="py-2 px-3">โหมด</th>
                    <th className="py-2 px-3">เวลาเริ่ม - สิ้นสุด</th>
                    <th className="py-2 px-3 text-right">อ่านได้</th>
                    <th className="py-2 px-3 text-right">รายการใหม่</th>
                    <th className="py-2 px-3 text-right">ซ้ำ (ข้าม)</th>
                    <th className="py-2 px-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deviceSyncRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-800">{run.deviceName}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{run.mode}</td>
                      <td className="py-2 px-3 font-mono-data text-[11px] text-slate-600">
                        {run.startedAt}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-data font-semibold">
                        {run.totalRead}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-data text-emerald-700 font-bold">
                        +{run.newScans}
                      </td>
                      <td className="py-2 px-3 text-right font-mono-data text-slate-500">
                        {run.duplicateScans}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                          {run.status} (Mock)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw Scans from this scanner */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-teal-600" />
              รายการสแกนดิบล่าสุดจากเครื่อง ({deviceScans.length} รายการ)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2 px-3 font-mono">scanDateTime</th>
                    <th className="py-2 px-3 font-mono">machineNo</th>
                    <th className="py-2 px-3 font-mono">enrollNumber</th>
                    <th className="py-2 px-3">บุคลากรที่จับคู่ได้</th>
                    <th className="py-2 px-3 font-mono">inOutMode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deviceScans.map((sc) => {
                    const person = personnelByFingle.get(sc.enrollNumber);
                    return (
                      <tr key={sc.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono-data font-semibold text-slate-900">
                          {sc.scanDateTime}
                        </td>
                        <td className="py-2 px-3 font-mono">#{sc.machineNo}</td>
                        <td className="py-2 px-3 font-mono font-bold text-teal-700">
                          #{sc.enrollNumber}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {person
                            ? `${person.prefix}${person.firstName} ${person.lastName} (${person.department})`
                            : 'ไม่พบรหัสบุคลากร (PENDING_MAPPING)'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {sc.inOutMode} ({sc.inOutMode === 1 ? 'เข้า' : 'ออก'})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // 5. HOSOFFICE_PENDING
    if (modalState.type === 'HOSOFFICE_PENDING') {
      const pendingList = attendanceList.filter((r) => !r.isPushedToHosOffice).filter((r) => {
        if (!q) return true;
        return (
          r.fullName.toLowerCase().includes(q) ||
          r.personId.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q)
        );
      });

      const totalPages = Math.max(1, Math.ceil(pendingList.length / pageSize));
      const paged = pendingList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      return (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                มีรายการรอส่งเข้า HOSOffice ทั้งหมด{' '}
                <strong className="font-mono-data text-sm">{pendingList.length}</strong> รายการ
                (โหมดจำลองข้อมูล Staging PENDING)
              </span>
            </div>
            {onNavigateToView && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToView('hosoffice-push');
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                ไปหน้าส่งข้อมูล HOSOffice →
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">PERSON_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-3">ฝ่าย / กลุ่มงาน</th>
                  <th className="py-2.5 px-3">เวลาสแกนเข้า</th>
                  <th className="py-2.5 px-3">สถานะการลงเวลา</th>
                  <th className="py-2.5 px-3">หมายเหตุ</th>
                  <th className="py-2.5 px-3 text-center">สถานะ HOSOffice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ไม่มีรายการค้างส่งในขณะนี้
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {r.personId}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{r.fullName}</td>
                      <td className="py-2.5 px-3 text-slate-600">{r.department}</td>
                      <td className="py-2.5 px-3 font-mono-data font-medium text-slate-900">
                        {r.checkInAt || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge status={r.status} size="sm" />
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {r.notes ? r.notes.reasonLabel : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                          Pending (รอส่ง)
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {renderPagination(currentPage, totalPages, pendingList.length)}
        </div>
      );
    }

    // 6. HOSOFFICE_HISTORY
    if (modalState.type === 'HOSOFFICE_HISTORY') {
      const filtered = pushHistoryList.filter((h) => {
        if (!q) return true;
        return (
          h.fullName.toLowerCase().includes(q) ||
          h.personId.toLowerCase().includes(q) ||
          h.idempotencyKey.toLowerCase().includes(q)
        );
      });

      return (
        <div className="space-y-4">
          <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3.5 text-xs text-teal-900 flex items-center justify-between">
            <span>
              ประวัติการส่งข้อมูลเข้า HOSOffice (จำลองการส่งผ่าน Mock Adapter จำนวน{' '}
              <strong className="font-mono-data">{filtered.length}</strong> รายการ)
            </span>
            <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-teal-200">
              Target: HOSOffice_Attend (Mock)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">วันเวลาที่ส่ง</th>
                  <th className="py-2.5 px-3 font-mono">PERSON_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-3">ผู้กดส่ง</th>
                  <th className="py-2.5 px-3 font-mono">Idempotency Key</th>
                  <th className="py-2.5 px-3">ผลลัพธ์ (Mock)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      ยังไม่มีประวัติการส่งเข้า HOSOffice
                    </td>
                  </tr>
                ) : (
                  filtered.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono-data text-slate-700">{h.pushedAt}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {h.personId}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">{h.fullName}</td>
                      <td className="py-2.5 px-3 text-slate-600">{h.pushedByName}</td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                        {h.idempotencyKey}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-700 font-medium">
                        {h.responseSummary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 7. RAW_SCAN_SINGLE (Inspect 6-field contract + HR mapping)
    if (modalState.type === 'RAW_SCAN_SINGLE' && modalState.selectedRawScan) {
      const scan = modalState.selectedRawScan;
      const person = personnelByFingle.get(scan.enrollNumber);
      const scanDate = scan.scanDateTime.slice(0, 10);
      const att = attendanceByFingleDate.get(`${scan.enrollNumber}_${scanDate}`);
      const scanner = scannersList.find((s) => s.machineNo === scan.machineNo);

      return (
        <div className="space-y-5 text-xs">
          <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-3.5 text-teal-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">ข้อมูลสแกนดิบต้นฉบับ (Immutable Raw Scan — Read-Only)</div>
              <div className="text-[11px] text-teal-800 mt-0.5">
                รับค่าจากโปรแกรม Scanner Reader EXE ตัวเดิมตามสัญญา JSON 6 ฟิลด์ ห้ามแก้ไขหรือดัดแปลงเวลาสแกนต้นฉบับ
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 6 Fields Box */}
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-2.5 font-mono">
              <div className="text-teal-400 font-sans font-bold text-xs border-b border-slate-800 pb-2">
                1. สัญญาข้อมูลดิบ 6 ฟิลด์ (Scanner Raw JSON)
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <span className="text-slate-400">machineNo:</span>
                <span className="font-bold text-white">{scan.machineNo}</span>

                <span className="text-slate-400">enrollNumber:</span>
                <span className="font-bold text-teal-300">{scan.enrollNumber}</span>

                <span className="text-slate-400">scanDateTime:</span>
                <span className="font-bold text-amber-300">"{scan.scanDateTime}"</span>

                <span className="text-slate-400">verifyMode:</span>
                <span className="text-slate-200">{scan.verifyMode}</span>

                <span className="text-slate-400">inOutMode:</span>
                <span className="text-slate-200">
                  {scan.inOutMode} ({scan.inOutMode === 1 ? 'สแกนเข้า' : 'สแกนออก'})
                </span>

                <span className="text-slate-400">workCode:</span>
                <span className="text-slate-400">
                  {scan.workCode === null ? 'null' : scan.workCode}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                <div>dedupeKey: {scan.dedupeKey}</div>
                <div>importedAt: {scan.importedAt}</div>
              </div>
            </div>

            {/* Personnel Mapping & Attendance Status Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="font-bold text-slate-900 border-b border-slate-200 pb-2">
                2. ข้อมูลการจับคู่บุคลากร HOSOffice & สถานะเวร
              </div>

              {person ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">ชื่อ - นามสกุล (HR):</span>
                    <span className="font-bold text-slate-900">
                      {person.prefix}
                      {person.firstName} {person.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">รหัสบุคลากร / FINGLE_ID:</span>
                    <span className="font-mono font-bold text-teal-700">
                      {person.personId} / #{person.fingleId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ตำแหน่ง / ฝ่าย:</span>
                    <span className="text-slate-800 font-medium">
                      {person.position} ({person.department})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">กลุ่มงาน:</span>
                    <span className="text-slate-700">{person.groupName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">เครื่องสแกน:</span>
                    <span className="text-slate-700">
                      {scanner?.name || `Scanner #${scan.machineNo}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                    <span className="text-slate-500">สถานะการส่ง HOSOffice:</span>
                    {att?.isPushedToHosOffice ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                        ส่ง HOSOffice แล้ว (Mock)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                        รอส่ง HOSOffice (Pending)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                  <div className="font-bold">ไม่พบรหัสบุคลากรใน HOSOffice (PENDING_MAPPING)</div>
                  <p className="text-[11px]">
                    รหัสนิ้วมือ <strong className="font-mono">enrollNumber: {scan.enrollNumber}</strong>{' '}
                    ยังไม่ได้ผูกกับ PERSON_ID ในตารางบุคลากร ระบบเก็บ Raw Scan นี้ไว้อย่างปลอดภัยเพื่อรอการอัปเดตบุคลากรและกด Reprocess
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 8. ALL_RAW_SCANS
    if (modalState.type === 'ALL_RAW_SCANS') {
      const filtered = rawScansList.filter((scan) => {
        const person = personnelByFingle.get(scan.enrollNumber);
        if (!q) return true;
        const fullName = person
          ? `${person.prefix}${person.firstName} ${person.lastName}`.toLowerCase()
          : '';
        return (
          fullName.includes(q) ||
          String(scan.enrollNumber).includes(q) ||
          scan.scanDateTime.includes(q)
        );
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      return (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">เวลาสแกน</th>
                  <th className="py-2.5 px-3">เครื่องสแกน</th>
                  <th className="py-2.5 px-3 font-mono">FINGLE_ID</th>
                  <th className="py-2.5 px-3">ชื่อ - สกุล (HR)</th>
                  <th className="py-2.5 px-3">ตำแหน่ง / หน่วยงาน</th>
                  <th className="py-2.5 px-3">สถานะจับคู่</th>
                  <th className="py-2.5 px-3">สถานะส่ง HOSOffice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((scan) => {
                  const person = personnelByFingle.get(scan.enrollNumber);
                  const scanDate = scan.scanDateTime.slice(0, 10);
                  const att = attendanceByFingleDate.get(`${scan.enrollNumber}_${scanDate}`);
                  return (
                    <tr
                      key={scan.id}
                      onClick={() => onSelectRawScan && onSelectRawScan(scan)}
                      className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-900">
                        {scan.scanDateTime}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">Scanner #{scan.machineNo}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-teal-700">
                        #{scan.enrollNumber}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {person
                          ? `${person.prefix}${person.firstName} ${person.lastName}`
                          : 'ไม่พบข้อมูลบุคลากร'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {person ? `${person.position} • ${person.department}` : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        {person ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                            จับคู่สำเร็จ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                            PENDING_MAPPING
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {att?.isPushedToHosOffice ? (
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-medium">
                            ส่งแล้ว (Mock)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">
                            รอส่ง (Pending)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {renderPagination(currentPage, totalPages, filtered.length)}
        </div>
      );
    }

    return null;
  };

  const renderPagination = (page: number, totalPages: number, totalItems: number) => {
    if (totalItems <= pageSize) return null;
    return (
      <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
        <div>
          แสดงหน้า <strong className="font-mono-data text-slate-800">{page}</strong> จาก{' '}
          <strong className="font-mono-data text-slate-800">{totalPages}</strong> (ทั้งหมด{' '}
          <strong className="font-mono-data text-slate-800">{totalItems}</strong> รายการ)
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            ก่อนหน้า
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            ถัดไป
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const showSearchBar =
    modalState.type !== 'RAW_SCAN_SINGLE' && modalState.type !== 'SCANNERS_OVERVIEW';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{modalState.title}</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                <Calendar className="w-3 h-3" />
                วันที่ข้อมูล: {selectedDate}
              </span>
              {selectedGroup !== 'ALL' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                  <Building2 className="w-3 h-3" />
                  {selectedGroup}
                </span>
              )}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                Mock Data
              </span>
            </div>
            {modalState.subtitle && (
              <p className="text-xs text-slate-500 mt-1">{modalState.subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showSearchBar && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs w-52 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ, รหัส, แผนก, FID..."
                  className="w-full bg-transparent focus:outline-none text-slate-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
              title="ปิดหน้าต่าง (Esc)"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 overflow-y-auto flex-1">{renderModalBody()}</div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            กดปุ่ม <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono">Esc</kbd> หรือคลิกพื้นหลังเพื่อปิดหน้าต่าง
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
