import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { StatusBadge } from '../components/common/StatusBadge';
import { AttendanceRecord } from '../types/attendance';
import { Clock, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';

export const MyAttendanceView: React.FC = () => {
  const { currentUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState('2026-11');

  // If user has no bound personId (e.g. admin without hospital staff mapping)
  const isUnmapped = !currentUser?.personId;

  // Retrieve records for current user
  const attendanceList = useMemo(() => {
    if (!currentUser?.personId) return [];
    return mockAttendanceService.getMyAttendance(
      currentUser.personId,
      `${selectedMonth}-01`,
      `${selectedMonth}-31`
    );
  }, [currentUser?.personId, selectedMonth]);

  // Monthly stats
  const stats = useMemo(() => {
    const total = attendanceList.length;
    const normal = attendanceList.filter((a) => a.status === 'NORMAL').length;
    const lateRecords = attendanceList.filter((a) => a.status === 'LATE');
    const lateCount = lateRecords.length;
    const totalLateMinutes = lateRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    const noScan = attendanceList.filter((a) => a.status === 'NO_SCAN').length;

    return { total, normal, lateCount, totalLateMinutes, noScan };
  }, [attendanceList]);

  if (isUnmapped) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-amber-900 mb-1">
            ยังไม่ได้ผูกบัญชีผู้ใช้กับรหัสบุคคล (PERSON_ID)
          </h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            บัญชีของคุณ ({currentUser?.username}) ยังไม่มีการผูกรหัสบุคคลของโรงพยาบาลสามชุก
            ระบบไม่อนุญาตให้อ่านข้อมูลเวลาของผู้อื่น กรุณาติดต่อผู้ดูแลระบบ (ADMIN) เพื่อทำการ Mapping รหัสบุคลากร
          </p>
          <div className="mt-4 inline-block text-xs font-mono bg-white px-3 py-1.5 rounded border border-amber-300 text-amber-900">
            User ID: {currentUser?.id} | Role: {currentUser?.role}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            เวลาปฏิบัติงานของฉัน (My Attendance)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ข้อมูลเวลาเข้า-ออกงานเฉพาะบุคคลของคุณ คำนวณจากเครื่องสแกนและตารางเวร
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            เลือกเดือน:
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 shadow-xs focus:ring-1 focus:ring-teal-500"
          >
            <option value="2026-11">พฤศจิกายน 2569 (2026-11)</option>
            <option value="2026-10">ตุลาคม 2569 (2026-10)</option>
            <option value="2026-09">กันยายน 2569 (2026-09)</option>
          </select>
        </div>
      </div>

      {/* Profile & KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">จำนวนกะการทำงานในเดือน</div>
          <div className="text-2xl font-bold text-slate-900 font-mono-data mt-1">
            {stats.total}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">กะ</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            เข้างานปกติ
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono-data mt-1">
            {stats.normal}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">ครั้ง</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            มาสาย (Late)
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono-data mt-1">
            {stats.lateCount}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">ครั้ง</span>
            {stats.totalLateMinutes > 0 && (
              <span className="text-xs font-medium text-amber-600 ml-2">
                (รวม {stats.totalLateMinutes} นาที)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">ไม่พบสแกน (No Scan)</div>
          <div className="text-2xl font-bold text-rose-700 font-mono-data mt-1">
            {stats.noScan}{' '}
            <span className="text-xs font-normal text-slate-500 font-sans">วัน</span>
          </div>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            ประวัติการสแกนและการลงเวลา (พนักงาน: {currentUser?.fullName})
          </div>
          <div className="text-xs text-slate-500 font-mono">
            PERSON_ID: {currentUser?.personId}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">วันที่ปฏิบัติงาน (Work Date)</th>
                <th className="py-2.5 px-4 font-semibold">กะการทำงาน (Shift)</th>
                <th className="py-2.5 px-4 font-semibold">เวลาสแกนเข้า</th>
                <th className="py-2.5 px-4 font-semibold">เวลาสแกนออก</th>
                <th className="py-2.5 px-4 font-semibold">สถานะ</th>
                <th className="py-2.5 px-4 font-semibold text-right">นาทีสาย</th>
                <th className="py-2.5 px-4 font-semibold">หมายเหตุ / เหตุผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลการลงเวลาในเดือนที่เลือก
                  </td>
                </tr>
              ) : (
                attendanceList.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono-data font-medium text-slate-800">
                      {rec.workDate}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div className="font-medium">{rec.shiftName}</div>
                      <div className="text-[11px] text-slate-400 font-mono-data">
                        {rec.shiftStartTime} - {rec.shiftEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-data font-medium text-slate-900">
                      {rec.checkInAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-4 font-mono-data text-slate-600">
                      {rec.checkOutAt || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={rec.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
