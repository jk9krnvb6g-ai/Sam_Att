import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { StatusBadge } from '../components/common/StatusBadge';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
} from '../components/common/TablePaginationBar';
import { AttendanceRecord, PageSizeOption, RawScanEvent } from '../types/attendance';
import { Clock, Calendar, AlertCircle, CheckCircle2, Fingerprint } from 'lucide-react';

export const MyAttendanceView: React.FC = () => {
  const { currentUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState('2026-11');

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<string>('workDate');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Detail Popup
  const [selectedRecordPopup, setSelectedRecordPopup] =
    useState<AttendanceRecord | null>(null);

  const isUnmapped = !currentUser?.personId;

  // Retrieve current user's Personnel record & Raw Scans so P001 sees all 6 raw scans on 2026-11-06 (§5)
  const myPerson = useMemo(() => {
    if (!currentUser?.personId) return null;
    return (
      mockAttendanceService
        .getPersonnel()
        .find((p) => p.personId === currentUser.personId) || null
    );
  }, [currentUser?.personId]);

  const myRawScansByDate = useMemo(() => {
    const map = new Map<string, RawScanEvent[]>();
    if (!myPerson) return map;
    const allScans = mockAttendanceService
      .getRawScans()
      .filter((sc) => sc.enrollNumber === myPerson.fingleId);
    allScans.forEach((sc) => {
      const d = sc.scanDateTime.slice(0, 10);
      const list = map.get(d) || [];
      list.push(sc);
      map.set(d, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime))
    );
    return map;
  }, [myPerson]);

  // Retrieve records for current user
  const attendanceList = useMemo(() => {
    if (!currentUser?.personId) return [];
    const list = mockAttendanceService.getMyAttendance(
      currentUser.personId,
      `${selectedMonth}-01`,
      `${selectedMonth}-31`
    );

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
  }, [currentUser?.personId, selectedMonth, sortKey, sortDirection]);

  const pagedRecords = useMemo(() => {
    if (pageSize === 'ALL') return attendanceList;
    const start = (currentPage - 1) * pageSize;
    return attendanceList.slice(start, start + pageSize);
  }, [attendanceList, currentPage, pageSize]);

  // Monthly stats
  const stats = useMemo(() => {
    const total = attendanceList.length;
    const normal = attendanceList.filter((a) => a.status === 'NORMAL').length;
    const lateRecords = attendanceList.filter((a) => a.status === 'LATE');
    const lateCount = lateRecords.length;
    const totalLateMinutes = lateRecords.reduce(
      (sum, r) => sum + r.lateMinutes,
      0
    );
    const noScan = attendanceList.filter((a) => a.status === 'NO_SCAN').length;

    return { total, normal, lateCount, totalLateMinutes, noScan };
  }, [attendanceList]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDirection('ASC');
    }
    setCurrentPage(1);
  };

  if (isUnmapped) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-amber-900 mb-1">
            ยังไม่ได้ผูกบัญชีผู้ใช้กับรหัสบุคคล (PERSON_ID)
          </h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            บัญชีของคุณ ({currentUser?.username}) ยังไม่มีการผูกรหัสบุคคลของโรงพยาบาลสามชุก ระบบไม่อนุญาตให้อ่านข้อมูลเวลาของผู้อื่น กรุณาติดต่อผู้ดูแลระบบ (ADMIN) เพื่อทำการ Mapping รหัสบุคลากร
          </p>
          <div className="mt-4 inline-block text-xs font-mono bg-white px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900">
            User ID: {currentUser?.id} | Role: {currentUser?.role}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Page Title & Month Selector */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            เวลาปฏิบัติงานของฉัน (My Attendance)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ข้อมูลเวลาเข้า-ออกงานเฉพาะบุคคลของคุณ คำนวณจากเครื่องสแกนและตารางเวร พร้อมจำนวนครั้งที่สแกนนิ้วจริงในแต่ละวัน (คลิกที่แถวเพื่อดูรายละเอียดทุกเหตุการณ์สแกน)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-violet-600" />
            เลือกเดือน:
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 shadow-2xs focus:ring-1 focus:ring-violet-500"
          >
            <option value="2026-11">พฤศจิกายน 2569 (2026-11)</option>
            <option value="2026-10">ตุลาคม 2569 (2026-10)</option>
            <option value="2026-09">กันยายน 2569 (2026-09)</option>
          </select>
        </div>
      </div>

      {/* Profile & KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">
            จำนวนกะการทำงานในเดือน
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-data mt-1">
            {stats.total}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">
              กะ
            </span>
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            เข้างานปกติ
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono-data mt-1">
            {stats.normal}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">
              ครั้ง
            </span>
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            มาสาย (Late)
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono-data mt-1">
            {stats.lateCount}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">
              ครั้ง
            </span>
            {stats.totalLateMinutes > 0 && (
              <span className="text-xs font-medium text-amber-600 ml-2">
                (รวม {stats.totalLateMinutes} นาที)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">
            ไม่พบสแกน (No Scan)
          </div>
          <div className="text-2xl font-bold text-rose-700 font-mono-data mt-1">
            {stats.noScan}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">
              กะ
            </span>
          </div>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            ประวัติการสแกนและการลงเวลา (พนักงาน: {currentUser?.fullName})
          </div>
          <div className="text-xs text-violet-700 font-mono font-bold">
            PERSON_ID: {currentUser?.personId} {myPerson ? `· FINGLE_ID: #${myPerson.fingleId}` : ''}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <SortableHeader
                  label="วันที่ปฏิบัติงาน (Work Date)"
                  sortKey="workDate"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="กะการทำงาน (Shift)"
                  sortKey="shiftName"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="เวลาสแกนเข้า"
                  sortKey="checkInAt"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="เวลาสแกนออก"
                  sortKey="checkOutAt"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-2.5 px-3 text-center font-semibold">
                  จำนวนสแกนดิบในวันนั้น
                </th>
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
                <th className="py-2.5 px-4 font-semibold">หมายเหตุ / เหตุผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลการลงเวลาในเดือนที่เลือก
                  </td>
                </tr>
              ) : (
                pagedRecords.map((rec) => {
                  const rawEventsForDate = myRawScansByDate.get(rec.workDate) || [];
                  return (
                    <tr
                      key={rec.id}
                      onClick={() => setSelectedRecordPopup(rec)}
                      className="hover:bg-violet-50/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3.5 font-mono-data font-bold text-slate-800">
                        {rec.workDate}
                      </td>
                      <td className="py-3 px-3.5 text-slate-700">
                        <div className="font-medium">{rec.shiftName}</div>
                        <div className="text-[11px] text-slate-400 font-mono-data">
                          {rec.shiftStartTime} - {rec.shiftEndTime}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-mono-data font-bold text-slate-900">
                        {rec.checkInAt || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-3 px-3.5 font-mono-data text-slate-600">
                        {rec.checkOutAt || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 font-mono-data font-bold text-[11px]">
                          <Fingerprint className="w-3 h-3 text-violet-600" />
                          {rawEventsForDate.length} ครั้ง
                        </span>
                      </td>
                      <td className="py-3 px-3.5">
                        <StatusBadge status={rec.status} size="sm" />
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono-data">
                        {rec.lateMinutes > 0 ? (
                          <span className="font-semibold text-amber-700">
                            +{rec.lateMinutes} นาที
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {rec.notes ? (
                          <div>
                            <span className="font-medium text-slate-800">
                              {rec.notes.reasonLabel}
                            </span>
                            {rec.notes.note && (
                              <span className="text-slate-500 block text-[11px]">
                                {rec.notes.note}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={attendanceList.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Modal: My Attendance Row Detail Popup + All Raw Scans on that Date */}
      <SharedModal
        isOpen={!!selectedRecordPopup}
        onClose={() => setSelectedRecordPopup(null)}
        title={`รายละเอียดเวลาปฏิบัติงานวันที่ ${selectedRecordPopup?.workDate || ''}`}
        subtitle={`พนักงาน: ${currentUser?.fullName} (PERSON_ID: ${currentUser?.personId})`}
        maxWidth="max-w-lg"
      >
        {selectedRecordPopup && (() => {
          const dayRawEvents = myRawScansByDate.get(selectedRecordPopup.workDate) || [];
          return (
            <div className="space-y-4 text-xs">
              <div className="bg-violet-50/50 border border-violet-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">กะเวลาปฏิบัติงาน:</span>
                  <span className="font-bold text-slate-900">
                    {selectedRecordPopup.shiftName} (
                    {selectedRecordPopup.shiftStartTime} -{' '}
                    {selectedRecordPopup.shiftEndTime})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">เวลาสแกนเข้างาน:</span>
                  <span className="font-mono font-bold text-violet-800">
                    {selectedRecordPopup.checkInAt || 'ไม่พบสแกน'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">เวลาสแกนออกงาน:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {selectedRecordPopup.checkOutAt || '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">สถานะ:</span>
                  <StatusBadge status={selectedRecordPopup.status} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">จำนวนนาทีสาย:</span>
                  <span className="font-mono font-bold text-amber-700">
                    {selectedRecordPopup.lateMinutes} นาที
                  </span>
                </div>
              </div>

              {/* Raw Scan Events for the logged-in user on this date */}
              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3.5 space-y-2">
                <div className="font-bold text-slate-900 flex items-center justify-between">
                  <span>
                    ประวัติเหตุการณ์สแกนดิบทั้งหมดในวันที่ {selectedRecordPopup.workDate}:
                  </span>
                  <span className="font-mono-data text-violet-700">
                    รวม {dayRawEvents.length} ครั้ง
                  </span>
                </div>
                {dayRawEvents.length === 0 ? (
                  <div className="text-slate-400">ไม่มีข้อมูลสแกนนิ้วในวันนี้</div>
                ) : (
                  <div className="space-y-1.5">
                    {dayRawEvents.map((ev, idx) => (
                      <div
                        key={ev.id}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between"
                      >
                        <span className="font-mono-data font-bold text-slate-900">
                          ครั้งที่ {idx + 1}: {ev.scanDateTime}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          เครื่อง #{ev.machineNo} · inOutMode={ev.inOutMode}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </SharedModal>
    </div>
  );
};
