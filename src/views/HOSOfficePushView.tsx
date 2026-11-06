import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { AttendanceRecord, PushHistory } from '../types/attendance';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  Send,
  CheckCircle2,
  AlertTriangle,
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

  // Load records for push
  const records = useMemo(() => {
    return mockAttendanceService.getAttendance({ workDate: selectedDate });
  }, [selectedDate, refreshKey]);

  // Push history
  const historyList = useMemo(() => {
    return mockAttendanceService.getPushHistory();
  }, [refreshKey]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ส่งข้อมูลเวลาไป HOSOffice (HOSOffice Direct Push)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ส่งข้อมูลเวลาปฏิบัติงานและสถานะที่ผ่านการตรวจทานไปยังฐานข้อมูล HOSOffice ของโรงพยาบาลโดยตรง
          </p>
        </div>

        {/* Push Trigger Button */}
        <button
          onClick={handleExecutePush}
          disabled={selectedIds.length === 0}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer ${
            selectedIds.length > 0
              ? 'bg-teal-600 hover:bg-teal-700 text-white'
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
              <span className="font-bold">ส่งข้อมูลไปยัง HOSOffice สำเร็จ {pushToast.count} รายการ</span>
              <p className="text-[11px] text-emerald-800">
                ระบบได้สร้าง Idempotency Key ป้องกันการส่งซ้ำและบันทึกลง Push History เรียบร้อยแล้ว
              </p>
            </div>
          </div>
          <button
            onClick={() => setPushToast(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2 py-1 bg-emerald-100 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Direct Push Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
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
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            เลือกวันที่ปฏิบัติงาน:
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono font-medium text-slate-800"
          />
        </div>

        <div className="text-xs text-slate-500">
          เลือกแล้ว <span className="font-bold text-slate-900 font-mono-data">{selectedIds.length}</span> จาก{' '}
          <span className="font-mono-data">{records.length}</span> รายการ
        </div>
      </div>

      {/* Main Table: Pending / Pushable Records */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            รายการเวลาประจำวันที่พร้อมส่ง ({records.length} รายการ)
          </div>
          <span className="text-xs text-slate-500">เป้าหมาย: HOSOffice_Attend Table</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onChange={handleSelectAll}
                    className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th className="py-2.5 px-3 font-mono">PERSON_ID</th>
                <th className="py-2.5 px-3">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-3">ฝ่าย/งาน</th>
                <th className="py-2.5 px-3">กะงาน</th>
                <th className="py-2.5 px-3">สแกนเข้า</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">หมายเหตุ / เหตุผล</th>
                <th className="py-2.5 px-4 text-center">สถานะการส่ง HOSOffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const isSelected = selectedIds.includes(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-teal-50/50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(r.id)}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 font-bold">
                      {r.personId}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {r.fullName}
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[130px]">
                      {r.department}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      <div>{r.shiftName}</div>
                      <div className="text-[10px] text-slate-400 font-mono-data">
                        {r.shiftStartTime} - {r.shiftEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono-data font-medium text-slate-900">
                      {r.checkInAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-3">
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
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3 mr-1" />
                          ส่งแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          ยังไม่ส่ง
                        </span>
                      )}
                      {r.modifiedAfterPush && (
                        <span className="block text-[10px] text-amber-700 font-medium mt-0.5">
                          ⚠️ มีการแก้ไขหลังส่ง
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Push History Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <History className="w-4 h-4 text-slate-400" />
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
                <th className="py-2.5 px-4">วันเวลาที่ส่ง</th>
                <th className="py-2.5 px-4">ผู้ปฏิบัติการส่ง (Pushed By)</th>
                <th className="py-2.5 px-4 font-mono">PERSON_ID / ชื่อ</th>
                <th className="py-2.5 px-4">วันปฏิบัติงาน</th>
                <th className="py-2.5 px-4">Idempotency Key</th>
                <th className="py-2.5 px-4">ผลการบันทึกใน HOSOffice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyList.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono-data text-slate-600 text-[11px]">
                    {h.pushedAt}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">
                    {h.pushedByName}
                  </td>
                  <td className="py-3 px-4 text-slate-800">
                    <span className="font-mono text-slate-600 mr-1.5">{h.personId}</span>
                    <span>{h.fullName}</span>
                  </td>
                  <td className="py-3 px-4 font-mono-data text-slate-600">
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
      </div>
    </div>
  );
};
