import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { AttendanceRecord, NoScanReasonCode, Personnel } from '../types/attendance';
import { StatusBadge } from '../components/common/StatusBadge';
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

  // Trigger re-render state
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal states
  const [activeNoteRecord, setActiveNoteRecord] = useState<AttendanceRecord | null>(null);
  const [noteReasonCode, setNoteReasonCode] = useState<NoScanReasonCode>('SICK_LEAVE');
  const [noteText, setNoteText] = useState('');

  const [isReprocessOpen, setIsReprocessOpen] = useState(false);
  const [reprocessFrom, setReprocessFrom] = useState('2026-11-06');
  const [reprocessTo, setReprocessTo] = useState('2026-11-06');
  const [reprocessResult, setReprocessResult] = useState<{ reprocessedCount: number; updatedCount: number } | null>(null);

  const [inspectRawRecord, setInspectRawRecord] = useState<AttendanceRecord | null>(null);

  // Load attendance
  const records = useMemo(() => {
    return mockAttendanceService.getAttendance({
      workDate: selectedDate,
      status: selectedStatus,
      department: selectedDept,
      searchQuery,
    });
  }, [selectedDate, selectedStatus, selectedDept, searchQuery, refreshKey]);

  // Load departments
  const departments: string[] = useMemo(() => {
    const list = mockAttendanceService.getPersonnel().map((p: Personnel) => p.department);
    return Array.from(new Set(list));
  }, []);

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
    const result = mockAttendanceService.reprocessAttendance(reprocessFrom, reprocessTo);
    setReprocessResult(result);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ตรวจสอบบันทึกเวลาปฏิบัติงาน (Attendance Review)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ตรวจรายการสแกนนิ้วประจำวัน บันทึกสาเหตุ NO_SCAN และคำนวณเวรใหม่ (Reprocess) ได้อย่างแม่นยำ
          </p>
        </div>

        {/* Reprocess Trigger Button */}
        <button
          onClick={() => {
            setReprocessResult(null);
            setIsReprocessOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>ประมวลผลย้อนหลัง (Reprocess)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-3">
        {/* Date */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-mono font-medium bg-transparent focus:outline-none"
          />
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, รหัสบุคลากร, FINGLE_ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-transparent focus:outline-none font-medium"
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="NORMAL">ปกติ (Normal)</option>
            <option value="LATE">มาสาย (Late)</option>
            <option value="NO_SCAN">ไม่พบสแกน (No Scan)</option>
            <option value="MISSING_CHECKOUT">ขาดสแกนออก</option>
          </select>
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs bg-transparent focus:outline-none font-medium"
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
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            รายการลงเวลา ({records.length} รายการ)
          </div>
          <div className="text-xs text-slate-500">
            วันที่: <span className="font-mono-data font-medium text-slate-800">{selectedDate}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">รหัส / FINGLE_ID</th>
                <th className="py-2.5 px-4 font-semibold">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-4 font-semibold">ฝ่าย/งาน</th>
                <th className="py-2.5 px-4 font-semibold">กะงาน</th>
                <th className="py-2.5 px-4 font-semibold">สแกนเข้า</th>
                <th className="py-2.5 px-4 font-semibold">สแกนออก</th>
                <th className="py-2.5 px-4 font-semibold">สถานะ</th>
                <th className="py-2.5 px-4 font-semibold text-right">นาทีสาย</th>
                <th className="py-2.5 px-4 font-semibold">หมายเหตุ / จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono-data text-slate-600">
                      <div>{r.personId}</div>
                      <div className="text-[10px] text-slate-400">FID: {r.fingleId}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {r.fullName}
                      <span className="block text-[11px] text-slate-400 font-normal">
                        {r.personnelType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-[140px]">
                      {r.department}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{r.shiftName}</div>
                      <div className="text-[10px] text-slate-400 font-mono-data">
                        {r.shiftStartTime} - {r.shiftEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-data font-medium text-slate-900">
                      {r.checkInAt ? (
                        <span className="flex items-center gap-1">
                          {r.checkInAt}
                          <button
                            onClick={() => setInspectRawRecord(r)}
                            className="text-slate-400 hover:text-teal-600 ml-1"
                            title="ดู Raw Scan ที่จับคู่"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-data text-slate-600">
                      {r.checkOutAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data">
                      {r.lateMinutes > 0 ? (
                        <span className="font-semibold text-amber-700">+{r.lateMinutes} น.</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {r.status === 'NO_SCAN' ? (
                        <div className="flex items-center gap-2">
                          {r.notes ? (
                            <div className="text-[11px]">
                              <span className="font-medium text-slate-800">{r.notes.reasonLabel}</span>
                              <button
                                onClick={() => {
                                  setActiveNoteRecord(r);
                                  setNoteReasonCode(r.notes!.reasonCode);
                                  setNoteText(r.notes!.note);
                                }}
                                className="text-teal-600 hover:text-teal-800 ml-1.5 font-medium"
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
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded cursor-pointer"
                            >
                              <FileEdit className="w-3 h-3" />
                              ระบุสาเหตุ
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          {r.isPushedToHosOffice ? (
                            <span className="text-emerald-700 flex items-center gap-1">
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
      </div>

      {/* Modal: Record NO_SCAN Reason */}
      {activeNoteRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  ระบุสาเหตุไม่พบสแกน (NO_SCAN)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeNoteRecord.fullName} ({activeNoteRecord.department})
                </p>
              </div>
              <button
                onClick={() => setActiveNoteRecord(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900">
                <Info className="w-4 h-4 text-blue-600 inline mr-1 -mt-0.5" />
                การระบุสาเหตุจะบันทึกเป็นประวัติเหตุผล (Note) โดยไม่แต่งข้อมูลสแกนปลอม
                ตามข้อกำหนดของ MASTER DEVELOPMENT PROMPT
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ประเภทการลา / เหตุผล:
                </label>
                <select
                  value={noteReasonCode}
                  onChange={(e) => setNoteReasonCode(e.target.value as NoScanReasonCode)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="SICK_LEAVE">ลาป่วย (มีใบรับรองแพทย์/แจ้งการลา)</option>
                  <option value="BUSINESS_LEAVE">ลากิจส่วนตัว</option>
                  <option value="VACATION_LEAVE">ลาพักผ่อนประจำปี</option>
                  <option value="OFFICIAL_DUTY">ไปราชการ / ประชุมภายนอก</option>
                  <option value="TRAINING">อบรม / สัมมนาทางวิชาการ</option>
                  <option value="DAY_OFF">วันหยุดตามเวร / วันหยุดนักขัตฤกษ์</option>
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
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="text-[11px] text-slate-500 font-mono">
                ผู้บันทึก: {currentUser?.fullName} ({currentUser?.role})
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setActiveNoteRecord(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveNote}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                บันทึกเหตุผล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reprocess Confirmation */}
      {isReprocessOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  คำนวณเวรย้อนหลัง (Reprocess Attendance)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ประมวลผลตารางเวลาใหม่จาก Raw Scan เดิม + การจับคู่ FINGLE_ID ล่าสุด
                </p>
              </div>
              <button
                onClick={() => setIsReprocessOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 inline mr-1 -mt-0.5" />
                <span className="font-semibold">คำเตือน:</span>{' '}
                ระบบจะคำนวณสถานะและนาทีสายใหม่โดยยึด Raw Scan เป็นข้อเท็จจริง (Source of Truth)
                โดยไม่ลบหมายเหตุ (Notes) หรือประวัติการส่งเดิม (Push History)
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
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-medium focus:ring-1 focus:ring-teal-500"
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
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-medium focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {reprocessResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ประมวลผลสำเร็จเรียบร้อยแล้ว
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    จำนวนรายการที่ตรวจสอบ: {reprocessResult.reprocessedCount} รายการ | มีการเปลี่ยนแปลง: {reprocessResult.updatedCount} รายการ
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsReprocessOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={handleRunReprocess}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                ยืนยัน Reprocess ทันที
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Raw Scan Modal */}
      {inspectRawRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  รายละเอียดเหตุการณ์สแกนดิบ (Raw Scan Trace)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {inspectRawRecord.fullName} — FID: {inspectRawRecord.fingleId}
                </p>
              </div>
              <button
                onClick={() => setInspectRawRecord(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400">Raw Scan ID:</span> {inspectRawRecord.rawScanInId || 'MOCK_ID'}
                </div>
                <div>
                  <span className="text-slate-400">enrollNumber:</span> {inspectRawRecord.fingleId}
                </div>
                <div>
                  <span className="text-slate-400">scanDateTime:</span> {inspectRawRecord.workDate} {inspectRawRecord.checkInAt}
                </div>
                <div>
                  <span className="text-slate-400">verifyMode:</span> 268435456 (ลายนิ้วมือ)
                </div>
                <div>
                  <span className="text-slate-400">inOutMode:</span> 1 (เข้างาน)
                </div>
                <div>
                  <span className="text-slate-400">workCode:</span> null
                </div>
              </div>
              <p className="text-slate-500 text-[11px]">
                สแกนนี้ถูกจับคู่กับกะ <strong>{inspectRawRecord.shiftName}</strong> ({inspectRawRecord.shiftStartTime} - {inspectRawRecord.shiftEndTime})
                และคำนวณสถานะเป็น <strong>{inspectRawRecord.status}</strong> (สาย {inspectRawRecord.lateMinutes} นาที)
              </p>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectRawRecord(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg shadow-xs"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
