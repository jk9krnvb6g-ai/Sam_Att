import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import {
  AttendanceRecord,
  NoScanReasonCode,
  Personnel,
  PageSizeOption,
} from '../types/attendance';
import { StatusBadge } from '../components/common/StatusBadge';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
} from '../components/common/TablePaginationBar';
import {
  Search,
  Filter,
  RefreshCw,
  FileEdit,
  Info,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Eye,
  X,
} from 'lucide-react';

export const AttendanceReviewView: React.FC = () => {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<string>('personId');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Modal states
  const [activeNoteRecord, setActiveNoteRecord] =
    useState<AttendanceRecord | null>(null);
  const [noteReasonCode, setNoteReasonCode] =
    useState<NoScanReasonCode>('SICK_LEAVE');
  const [noteText, setNoteText] = useState('');

  const [isReprocessOpen, setIsReprocessOpen] = useState(false);
  const [reprocessFrom, setReprocessFrom] = useState('2026-11-06');
  const [reprocessTo, setReprocessTo] = useState('2026-11-06');
  const [reprocessResult, setReprocessResult] = useState<{
    reprocessedCount: number;
    updatedCount: number;
  } | null>(null);

  const [inspectRecord, setInspectRecord] = useState<AttendanceRecord | null>(
    null
  );

  // Load attendance
  const records = useMemo(() => {
    const list = mockAttendanceService.getAttendance({
      workDate: selectedDate,
      status: selectedStatus,
      department: selectedDept,
      searchQuery,
    });

    list.sort((a, b) => {
      const valA = (a as unknown as Record<string, unknown>)[sortKey];
      const valB = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'ASC' ? valA - valB : valB - valA;
      }
      const strA = String(valA ?? '');
      const strB = String(valB ?? '');
      return sortDirection === 'ASC'
        ? strA.localeCompare(strB, 'th')
        : strB.localeCompare(strA, 'th');
    });

    return list;
  }, [
    selectedDate,
    selectedStatus,
    selectedDept,
    searchQuery,
    refreshKey,
    sortKey,
    sortDirection,
  ]);

  const pagedRecords = useMemo(() => {
    if (pageSize === 'ALL') return records;
    const start = (currentPage - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, currentPage, pageSize]);

  // Load departments
  const departments: string[] = useMemo(() => {
    const list = mockAttendanceService
      .getPersonnel()
      .map((p: Personnel) => p.department);
    return Array.from(new Set(list));
  }, []);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDirection('ASC');
    }
    setCurrentPage(1);
  };

  // Save NO_SCAN Note
  const handleSaveNote = () => {
    if (!activeNoteRecord || !currentUser) return;

    const reasonLabels: Record<NoScanReasonCode, string> = {
      SICK_LEAVE: 'ลาป่วย (มีใบรับรองแพทย์/แจ้งการลา)',
      BUSINESS_LEAVE: 'ลากิจส่วนตัว',
      VACATION_LEAVE: 'ลาพักผ่อนประจำปี',
      OFFICIAL_DUTY: 'ไปราชการ / ประชุมภายนอก',
      TRAINING: 'อบรม / สัมมนาทางวิชาการ',
      DAY_OFF: 'วันหยุดตามเวร / วันหยุดนักขัตฤกษ์',
      OTHER: 'เหตุผลอื่นๆ',
    };

    mockAttendanceService.setNoScanReason(
      activeNoteRecord.id,
      noteReasonCode,
      reasonLabels[noteReasonCode],
      noteText,
      currentUser.id,
      currentUser.fullName
    );

    setActiveNoteRecord(null);
    setNoteText('');
    setRefreshKey((k) => k + 1);
  };

  // Run Reprocess
  const handleRunReprocess = () => {
    const result = mockAttendanceService.reprocessAttendance(
      reprocessFrom,
      reprocessTo
    );
    setReprocessResult(result);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ตรวจสอบบันทึกเวลาปฏิบัติงาน (Attendance Review)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ตรวจรายการสแกนนิ้วประจำวัน บันทึกสาเหตุ NO_SCAN และคำนวณเวรใหม่ (Reprocess) คลิกที่แถวเพื่อดูรายละเอียด Popup
          </p>
        </div>

        {/* Reprocess Trigger Button */}
        <button
          onClick={() => {
            setReprocessResult(null);
            setIsReprocessOpen(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>ประมวลผลย้อนหลัง (Reprocess)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-xs flex flex-wrap items-center gap-3">
        {/* Date */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-violet-600" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs font-mono font-bold bg-transparent focus:outline-none text-slate-800"
          />
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, รหัสบุคลากร, FINGLE_ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs bg-transparent focus:outline-none text-slate-800"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs bg-transparent focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="NORMAL">ปกติ (Normal)</option>
            <option value="LATE">มาสาย (Late)</option>
            <option value="NO_SCAN">ไม่พบสแกน (No Scan)</option>
            <option value="MISSING_CHECKOUT">ขาดสแกนออก</option>
          </select>
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs bg-transparent focus:outline-none font-medium text-slate-700"
          >
            <option value="ALL">ทุกฝ่าย/งาน</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            รายการลงเวลา ({records.length} รายการ)
          </div>
          <div className="text-xs text-slate-500">
            วันที่:{' '}
            <span className="font-mono-data font-bold text-violet-800">
              {selectedDate}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <SortableHeader
                  label="รหัส / FINGLE_ID"
                  sortKey="personId"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ชื่อ-นามสกุล"
                  sortKey="fullName"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ฝ่าย/งาน"
                  sortKey="department"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="กะงาน"
                  sortKey="shiftName"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="สแกนเข้า"
                  sortKey="checkInAt"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="สแกนออก"
                  sortKey="checkOutAt"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="สถานะ"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="นาทีสาย"
                  sortKey="lateMinutes"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <th className="py-2.5 px-4 font-semibold">หมายเหตุ / จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                pagedRecords.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setInspectRecord(r)}
                    className="hover:bg-violet-50/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3.5 font-mono-data text-slate-700 font-bold">
                      <div>{r.personId}</div>
                      <div className="text-[10px] text-violet-700">
                        FID: #{r.fingleId}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-slate-900">
                      {r.fullName}
                      <span className="block text-[11px] text-slate-400 font-normal">
                        {r.personnelType}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-slate-600 truncate max-w-[140px]">
                      {r.department}
                    </td>
                    <td className="py-3 px-3.5 text-slate-700">
                      <div>{r.shiftName}</div>
                      <div className="text-[10px] text-slate-400 font-mono-data">
                        {r.shiftStartTime} - {r.shiftEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-mono-data font-bold text-slate-900">
                      {r.checkInAt ? (
                        <span className="flex items-center gap-1">
                          {r.checkInAt}
                          <Eye className="w-3 h-3 text-violet-500 ml-1" />
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 font-mono-data text-slate-600">
                      {r.checkOutAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-3.5">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono-data">
                      {r.lateMinutes > 0 ? (
                        <span className="font-semibold text-amber-700">
                          +{r.lateMinutes} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td
                      className="py-3 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.status === 'NO_SCAN' ? (
                        <div className="flex items-center gap-2">
                          {r.notes ? (
                            <div className="text-[11px]">
                              <span className="font-medium text-slate-800">
                                {r.notes.reasonLabel}
                              </span>
                              <button
                                onClick={() => {
                                  setActiveNoteRecord(r);
                                  setNoteReasonCode(r.notes!.reasonCode);
                                  setNoteText(r.notes!.note);
                                }}
                                className="text-violet-700 hover:text-violet-900 ml-1.5 font-semibold cursor-pointer"
                              >
                                แก้ไข
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveNoteRecord(r);
                                setNoteReasonCode('SICK_LEAVE');
                                setNoteText('');
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md cursor-pointer"
                            >
                              <FileEdit className="w-3 h-3" />
                              ระบุสาเหตุ
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          {r.isPushedToHosOffice ? (
                            <span className="text-emerald-700 flex items-center gap-1 font-medium">
                              <CheckCircle className="w-3 h-3" />
                              ส่ง HOS แล้ว
                            </span>
                          ) : (
                            <span>พร้อมส่ง HOS</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={records.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Modal 1: Record NO_SCAN Reason */}
      <SharedModal
        isOpen={!!activeNoteRecord}
        onClose={() => setActiveNoteRecord(null)}
        title="ระบุสาเหตุไม่พบสแกน (NO_SCAN)"
        subtitle={
          activeNoteRecord
            ? `${activeNoteRecord.fullName} (${activeNoteRecord.department})`
            : ''
        }
        maxWidth="max-w-md"
      >
        {activeNoteRecord && (
          <div className="space-y-4 text-xs">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-violet-950">
              <Info className="w-4 h-4 text-violet-600 inline mr-1 -mt-0.5" />
              การระบุสาเหตุจะบันทึกเป็นประวัติเหตุผล (Note) โดยไม่แต่งข้อมูลสแกนปลอม ตามข้อกำหนดของ MASTER DEVELOPMENT PROMPT
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ประเภทการลา / เหตุผล:
              </label>
              <select
                value={noteReasonCode}
                onChange={(e) =>
                  setNoteReasonCode(e.target.value as NoScanReasonCode)
                }
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              >
                <option value="SICK_LEAVE">
                  ลาป่วย (มีใบรับรองแพทย์/แจ้งการลา)
                </option>
                <option value="BUSINESS_LEAVE">ลากิจส่วนตัว</option>
                <option value="VACATION_LEAVE">ลาพักผ่อนประจำปี</option>
                <option value="OFFICIAL_DUTY">ไปราชการ / ประชุมภายนอก</option>
                <option value="TRAINING">อบรม / สัมมนาทางวิชาการ</option>
                <option value="DAY_OFF">
                  วันหยุดตามเวร / วันหยุดนักขัตฤกษ์
                </option>
                <option value="OTHER">เหตุผลอื่นๆ</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                รายละเอียดเพิ่มเติม (คำอธิบาย/เลขที่ใบลา):
              </label>
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="เช่น ลาป่วยไข้หวัดใหญ่ ได้รับอนุมัติจากหัวหน้าฝ่ายแล้ว"
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setActiveNoteRecord(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveNote}
                className="px-4 py-2 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-xs cursor-pointer"
              >
                บันทึกเหตุผล
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      {/* Modal 2: Reprocess Confirmation */}
      <SharedModal
        isOpen={isReprocessOpen}
        onClose={() => setIsReprocessOpen(false)}
        title="คำนวณเวรย้อนหลัง (Reprocess Attendance)"
        subtitle="ประมวลผลตารางเวลาใหม่จาก Raw Scan เดิม + การจับคู่ FINGLE_ID ล่าสุด"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1 -mt-0.5" />
            <span className="font-semibold">คำเตือน:</span> ระบบจะคำนวณสถานะและนาทีสายใหม่โดยยึด Raw Scan เป็นข้อเท็จจริง (Source of Truth) โดยไม่ลบหมายเหตุ (Notes) หรือประวัติการส่งเดิม (Push History)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ตั้งแต่วันที่:
              </label>
              <input
                type="date"
                value={reprocessFrom}
                onChange={(e) => setReprocessFrom(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ถึงวันที่:
              </label>
              <input
                type="date"
                value={reprocessTo}
                onChange={(e) => setReprocessTo(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
            </div>
          </div>

          {reprocessResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                ประมวลผลสำเร็จเรียบร้อยแล้ว
              </div>
              <div className="text-[11px] text-emerald-800">
                จำนวนรายการที่ตรวจสอบ: {reprocessResult.reprocessedCount} รายการ | มีการเปลี่ยนแปลง: {reprocessResult.updatedCount} รายการ
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={() => setIsReprocessOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              onClick={handleRunReprocess}
              className="px-4 py-2 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-xs cursor-pointer"
            >
              ยืนยัน Reprocess ทันที
            </button>
          </div>
        </div>
      </SharedModal>

      {/* Modal 3: Row Detail & Raw Scan Trace Popup */}
      <SharedModal
        isOpen={!!inspectRecord}
        onClose={() => setInspectRecord(null)}
        title={`รายละเอียดการลงเวลา: ${inspectRecord?.fullName || ''}`}
        subtitle={`วันที่ ${inspectRecord?.workDate} • PERSON_ID: ${inspectRecord?.personId} • FINGLE_ID: #${inspectRecord?.fingleId}`}
        maxWidth="max-w-lg"
      >
        {inspectRecord && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-violet-50/40 border border-violet-200 rounded-xl p-3.5">
              <div>
                <div className="text-slate-500">กะเวลาปฏิบัติงาน:</div>
                <div className="font-bold text-slate-900">
                  {inspectRecord.shiftName} ({inspectRecord.shiftStartTime} -{' '}
                  {inspectRecord.shiftEndTime})
                </div>
              </div>
              <div>
                <div className="text-slate-500">สถานะการลงเวลา:</div>
                <div className="mt-0.5">
                  <StatusBadge status={inspectRecord.status} size="sm" />
                </div>
              </div>
              <div>
                <div className="text-slate-500">สแกนเข้า / สแกนออก:</div>
                <div className="font-mono font-bold text-slate-900">
                  {inspectRecord.checkInAt || '-'} /{' '}
                  {inspectRecord.checkOutAt || '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">จำนวนนาทีสาย:</div>
                <div className="font-mono font-bold text-amber-700">
                  {inspectRecord.lateMinutes} นาที
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-1.5 font-mono text-[11px]">
              <div className="text-violet-300 font-sans font-bold text-xs mb-1">
                ข้อมูล Raw Scan อ้างอิง (Read-Only 6-Field Contract)
              </div>
              <div>
                <span className="text-slate-400">Raw Scan ID:</span>{' '}
                {inspectRecord.rawScanInId || 'NO_RAW_SCAN_MATCHED'}
              </div>
              <div>
                <span className="text-slate-400">enrollNumber:</span>{' '}
                {inspectRecord.fingleId}
              </div>
              <div>
                <span className="text-slate-400">scanDateTime:</span>{' '}
                {inspectRecord.checkInAt
                  ? `${inspectRecord.workDate} ${inspectRecord.checkInAt}`
                  : 'null'}
              </div>
              <div>
                <span className="text-slate-400">verifyMode:</span> 268435456
                (ลายนิ้วมือ)
              </div>
              <div>
                <span className="text-slate-400">inOutMode:</span> 1 (เข้างาน)
              </div>
              <div>
                <span className="text-slate-400">workCode:</span> null
              </div>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
