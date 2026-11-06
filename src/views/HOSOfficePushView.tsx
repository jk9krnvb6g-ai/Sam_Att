import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import {
  AttendanceRecord,
  PushHistory,
  PageSizeOption,
} from '../types/attendance';
import { StatusBadge } from '../components/common/StatusBadge';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
} from '../components/common/TablePaginationBar';
import {
  Send,
  CheckCircle2,
  History,
  ShieldCheck,
  Check,
  Calendar,
} from 'lucide-react';

export const HOSOfficePushView: React.FC = () => {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushToast, setPushToast] = useState<{ count: number } | null>(null);

  // Sorting & Pagination for Pending Table
  const [sortKey, setSortKey] = useState<string>('personId');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Sorting & Pagination for History Table
  const [histSortKey, setHistSortKey] = useState<string>('pushedAt');
  const [histSortDir, setHistSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [histPage, setHistPage] = useState<number>(1);
  const [histPageSize, setHistPageSize] = useState<PageSizeOption>(10);

  // Detail Popup states
  const [selectedRecordPopup, setSelectedRecordPopup] =
    useState<AttendanceRecord | null>(null);
  const [selectedHistoryPopup, setSelectedHistoryPopup] =
    useState<PushHistory | null>(null);

  // Load records for push
  const records = useMemo(() => {
    const list = mockAttendanceService.getAttendance({ workDate: selectedDate });
    list.sort((a, b) => {
      const strA = String((a as unknown as Record<string, unknown>)[sortKey] ?? '');
      const strB = String((b as unknown as Record<string, unknown>)[sortKey] ?? '');
      return sortDirection === 'ASC'
        ? strA.localeCompare(strB, 'th')
        : strB.localeCompare(strA, 'th');
    });
    return list;
  }, [selectedDate, refreshKey, sortKey, sortDirection]);

  const pagedRecords = useMemo(() => {
    if (pageSize === 'ALL') return records;
    const start = (currentPage - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, currentPage, pageSize]);

  // Push history
  const historyList = useMemo(() => {
    const list = [...mockAttendanceService.getPushHistory()];
    list.sort((a, b) => {
      const strA = String((a as unknown as Record<string, unknown>)[histSortKey] ?? '');
      const strB = String((b as unknown as Record<string, unknown>)[histSortKey] ?? '');
      return histSortDir === 'ASC'
        ? strA.localeCompare(strB, 'th')
        : strB.localeCompare(strA, 'th');
    });
    return list;
  }, [refreshKey, histSortKey, histSortDir]);

  const pagedHistory = useMemo(() => {
    if (histPageSize === 'ALL') return historyList;
    const start = (histPage - 1) * histPageSize;
    return historyList.slice(start, start + histPageSize);
  }, [historyList, histPage, histPageSize]);

  // Toggle selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(records.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Execute manual push
  const handleExecutePush = () => {
    if (selectedIds.length === 0 || !currentUser) return;

    const res = mockAttendanceService.pushToHosOffice(
      selectedIds,
      currentUser.id,
      currentUser.fullName
    );

    setPushToast({ count: res.successCount });
    setSelectedIds([]);
    setRefreshKey((k) => k + 1);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDirection('ASC');
    }
    setCurrentPage(1);
  };

  const handleHistSort = (key: string) => {
    if (histSortKey === key) {
      setHistSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setHistSortKey(key);
      setHistSortDir('DESC');
    }
    setHistPage(1);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ส่งข้อมูลเวลาไป HOSOffice (HOSOffice Direct Push)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ส่งข้อมูลเวลาปฏิบัติงานและสถานะที่ผ่านการตรวจทานไปยังฐานข้อมูล HOSOffice ของโรงพยาบาลโดยตรง (คลิกแถวเพื่อดูรายละเอียด Popup)
          </p>
        </div>

        {/* Push Trigger Button */}
        <button
          onClick={handleExecutePush}
          disabled={selectedIds.length === 0}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer ${
            selectedIds.length > 0
              ? 'bg-[#6D28D9] hover:bg-[#5B21B6] text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>ส่งรายการที่เลือก ({selectedIds.length}) ไป HOSOffice</span>
        </button>
      </div>

      {/* Push Success Toast */}
      {pushToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold">
                ส่งข้อมูลไปยัง HOSOffice สำเร็จ {pushToast.count} รายการ (Mock Adapter)
              </span>
              <p className="text-[11px] text-emerald-800">
                ระบบได้สร้าง Idempotency Key ป้องกันการส่งซ้ำและบันทึกลง Push History เรียบร้อยแล้ว
              </p>
            </div>
          </div>
          <button
            onClick={() => setPushToast(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2.5 py-1 bg-emerald-100 rounded-lg cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Direct Push Notice */}
      <div className="bg-violet-50/50 border border-violet-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <ShieldCheck className="w-4 h-4 text-violet-600" />
          เงื่อนไขและนโยบายการส่งข้อมูล (MASTER DEVELOPMENT PROMPT §4.9):
        </div>
        <p className="text-slate-600">
          • <strong>ส่งได้ทันทีโดยไม่ต้องรอ Approval:</strong> เจ้าหน้าที่ผู้รับผิดชอบ (RESPONSIBLE_STAFF) และแอดมิน (ADMIN) สามารถกดส่งได้โดยตรง
        </p>
        <p className="text-slate-600">
          • <strong>ไม่มี Auto Push หลัง Sync หรือ Reprocess:</strong> ผู้ใช้ต้องเป็นผู้กดสั่ง Push เองเท่านั้น
        </p>
        <p className="text-slate-600">
          • <strong>Idempotency:</strong> มีการคำนวณ Idempotency Key ในแต่ละครั้ง ป้องกันการบันทึกรายการซ้ำใน HOSOffice
        </p>
      </div>

      {/* Date Filter Strip */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-3.5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-violet-600" />
            เลือกวันที่ปฏิบัติงาน:
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-mono font-bold text-slate-800"
          />
        </div>

        <div className="text-xs text-slate-500">
          เลือกแล้ว{' '}
          <span className="font-bold text-violet-800 font-mono-data">
            {selectedIds.length}
          </span>{' '}
          จาก <span className="font-mono-data">{records.length}</span> รายการ
        </div>
      </div>

      {/* Main Table: Pending / Pushable Records */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            รายการเวลาประจำวันที่พร้อมส่ง ({records.length} รายการ)
          </div>
          <span className="text-xs text-slate-500 font-mono">
            เป้าหมาย: HOSOffice_Attend Table (Mock)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      records.length > 0 && selectedIds.length === records.length
                    }
                    onChange={handleSelectAll}
                    className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </th>
                <SortableHeader
                  label="PERSON_ID"
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
                  label="สถานะ"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-2.5 px-3">หมายเหตุ / เหตุผล</th>
                <th className="py-2.5 px-4 text-center">สถานะการส่ง HOSOffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRecords.map((r) => {
                const isSelected = selectedIds.includes(r.id);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRecordPopup(r)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-violet-50/70'
                        : 'hover:bg-violet-50/30'
                    }`}
                  >
                    <td
                      className="py-3 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(r.id)}
                        className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3.5 font-mono text-slate-700 font-bold">
                      {r.personId}
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-slate-900">
                      {r.fullName}
                    </td>
                    <td className="py-3 px-3.5 text-slate-600 truncate max-w-[130px]">
                      {r.department}
                    </td>
                    <td className="py-3 px-3.5 text-slate-700">
                      <div>{r.shiftName}</div>
                      <div className="text-[10px] text-slate-400 font-mono-data">
                        {r.shiftStartTime} - {r.shiftEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-mono-data font-medium text-slate-900">
                      {r.checkInAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-3.5">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {r.notes ? (
                        <span className="text-slate-800 font-medium text-[11px]">
                          {r.notes.reasonLabel}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.isPushedToHosOffice ? (
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3 mr-1" />
                          ส่งแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          ยังไม่ส่ง
                        </span>
                      )}
                      {r.modifiedAfterPush && (
                        <span className="block text-[10px] text-amber-700 font-medium mt-0.5">
                          มีการแก้ไขหลังส่ง
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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

      {/* Push History Section */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <History className="w-4 h-4 text-violet-600" />
            ประวัติการส่งข้อมูลไป HOSOffice (Push History Log)
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Table: push_history
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <SortableHeader
                  label="วันเวลาที่ส่ง"
                  sortKey="pushedAt"
                  currentSortKey={histSortKey}
                  currentSortDirection={histSortDir}
                  onSort={handleHistSort}
                />
                <SortableHeader
                  label="ผู้ปฏิบัติการส่ง (Pushed By)"
                  sortKey="pushedByName"
                  currentSortKey={histSortKey}
                  currentSortDirection={histSortDir}
                  onSort={handleHistSort}
                />
                <SortableHeader
                  label="PERSON_ID / ชื่อ"
                  sortKey="fullName"
                  currentSortKey={histSortKey}
                  currentSortDirection={histSortDir}
                  onSort={handleHistSort}
                />
                <SortableHeader
                  label="วันปฏิบัติงาน"
                  sortKey="workDate"
                  currentSortKey={histSortKey}
                  currentSortDirection={histSortDir}
                  onSort={handleHistSort}
                />
                <th className="py-2.5 px-4">Idempotency Key</th>
                <th className="py-2.5 px-4">ผลการบันทึกใน HOSOffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedHistory.map((h) => (
                <tr
                  key={h.id}
                  onClick={() => setSelectedHistoryPopup(h)}
                  className="hover:bg-violet-50/40 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-3.5 font-mono-data text-slate-600 text-[11px]">
                    {h.pushedAt}
                  </td>
                  <td className="py-3 px-3.5 font-medium text-slate-800">
                    {h.pushedByName}
                  </td>
                  <td className="py-3 px-3.5 text-slate-800">
                    <span className="font-mono font-bold text-violet-700 mr-1.5">
                      {h.personId}
                    </span>
                    <span className="font-semibold">{h.fullName}</span>
                  </td>
                  <td className="py-3 px-3.5 font-mono-data text-slate-600">
                    {h.workDate}
                  </td>
                  <td className="py-3 px-4 font-mono text-[10px] text-slate-400 truncate max-w-[150px]">
                    {h.idempotencyKey}
                  </td>
                  <td className="py-3 px-4 text-emerald-800 text-[11px] font-medium">
                    {h.responseSummary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={historyList.length}
          currentPage={histPage}
          pageSize={histPageSize}
          onPageChange={setHistPage}
          onPageSizeChange={(sz) => {
            setHistPageSize(sz);
            setHistPage(1);
          }}
        />
      </div>

      {/* Modal 1: Staging Record Detail Popup */}
      <SharedModal
        isOpen={!!selectedRecordPopup}
        onClose={() => setSelectedRecordPopup(null)}
        title={`ข้อมูลเตรียมส่ง HOSOffice: ${selectedRecordPopup?.fullName || ''}`}
        subtitle={`PERSON_ID: ${selectedRecordPopup?.personId} • วันที่ปฏิบัติงาน: ${selectedRecordPopup?.workDate}`}
        maxWidth="max-w-lg"
      >
        {selectedRecordPopup && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-violet-50/40 border border-violet-200 rounded-xl p-4">
              <div>
                <div className="text-slate-500">ชื่อ - นามสกุล:</div>
                <div className="font-bold text-slate-900">
                  {selectedRecordPopup.fullName}
                </div>
              </div>
              <div>
                <div className="text-slate-500">ฝ่าย / กลุ่มงาน:</div>
                <div className="font-semibold text-slate-800">
                  {selectedRecordPopup.department}
                </div>
              </div>
              <div>
                <div className="text-slate-500">กะเวลาปฏิบัติงาน:</div>
                <div className="font-bold text-violet-800">
                  {selectedRecordPopup.shiftName} (
                  {selectedRecordPopup.shiftStartTime} -{' '}
                  {selectedRecordPopup.shiftEndTime})
                </div>
              </div>
              <div>
                <div className="text-slate-500">เวลาสแกนเข้า / สถานะ:</div>
                <div className="font-mono font-bold text-slate-900">
                  {selectedRecordPopup.checkInAt || '-'} (
                  {selectedRecordPopup.status})
                </div>
              </div>
            </div>
          </div>
        )}
      </SharedModal>

      {/* Modal 2: Push History Detail Popup */}
      <SharedModal
        isOpen={!!selectedHistoryPopup}
        onClose={() => setSelectedHistoryPopup(null)}
        title={`รายละเอียดประวัติการส่ง HOSOffice (${selectedHistoryPopup?.id || ''})`}
        subtitle={`ส่งเมื่อ ${selectedHistoryPopup?.pushedAt} โดย ${selectedHistoryPopup?.pushedByName}`}
        maxWidth="max-w-lg"
      >
        {selectedHistoryPopup && (
          <div className="space-y-3 text-xs">
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono space-y-2 text-[11px]">
              <div>
                <span className="text-slate-400">Push Log ID:</span>{' '}
                {selectedHistoryPopup.id}
              </div>
              <div>
                <span className="text-slate-400">Attendance ID:</span>{' '}
                {selectedHistoryPopup.attendanceId}
              </div>
              <div>
                <span className="text-slate-400">PERSON_ID / Name:</span>{' '}
                {selectedHistoryPopup.personId} ({selectedHistoryPopup.fullName})
              </div>
              <div>
                <span className="text-slate-400">Idempotency Key:</span>{' '}
                <span className="text-violet-300">
                  {selectedHistoryPopup.idempotencyKey}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Response Summary:</span>{' '}
                <span className="text-emerald-300">
                  {selectedHistoryPopup.responseSummary}
                </span>
              </div>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
