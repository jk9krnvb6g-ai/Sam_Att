import React, { useState } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { Shift, ShiftAssignment } from '../types/attendance';
import {
  CalendarDays,
  Clock,
  Layers,
  CheckCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

export const ShiftsView: React.FC = () => {
  const [shifts] = useState<Shift[]>(() => mockAttendanceService.getShifts());
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [assignments] = useState<ShiftAssignment[]>(() =>
    mockAttendanceService.getShiftAssignments('2026-11-06')
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          จัดการตารางเวร & การหมุนเวียน (Shift Management)
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          กำหนดเวลาเริ่มต้น-สิ้นสุดของกะ ช่วงอนุโลมสาย (Grace Period) และหน้าต่างเวลารับสแกน
        </p>
      </div>

      {/* Priority Rules Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Layers className="w-4 h-4 text-teal-600" />
          ลำดับความสำคัญในการเลือกกะ (Shift Resolution Hierarchy):
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-medium">
          <span className="px-2 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200">
            1. ตารางเวรรายวัน (Daily Assignment)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200">
            2. ตารางเวรประจำรายบุคคล (Recurring)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
            3. ค่ามาตรฐานตามประเภทบุคลากร (Fallback)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
            4. ไม่มีตารางเวร (NO_SCHEDULE)
          </span>
        </div>
        <p className="text-slate-500 text-[11px] pt-1">
          * หากไม่มีตารางเวรอ้างอิง ระบบจะไม่ตัดสินว่า NO_SCAN หรือ LATE โดยเด็ดขาดตามข้อกำหนด MASTER PROMPT §4.4
        </p>
      </div>

      {/* Shift Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {shifts.map((sh) => (
          <div
            key={sh.id}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  {sh.code}
                </span>
                {sh.crossMidnight && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    กะข้ามวัน
                  </span>
                )}
              </div>

              <h2 className="text-sm font-bold text-slate-900 mb-1">{sh.name}</h2>
              <div className="text-xl font-bold font-mono-data text-slate-800 mb-3">
                {sh.startTime} - {sh.endTime}
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs font-mono space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Grace อนุโลมสาย:</span>
                  <span className="font-semibold text-slate-800 font-sans">
                    {sh.graceMinutes} นาที
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">สแกนก่อนเริ่มกะได้:</span>
                  <span className="text-slate-700 font-sans">{sh.earlyScanWindowMinutes} นาที</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">สแกนหลังกะจบได้:</span>
                  <span className="text-slate-700 font-sans">{sh.lateScanWindowMinutes} นาที</span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>สถานะ: ใช้งาน</span>
              <span className="text-teal-700 font-medium">คำนวณตาม Work Date</span>
            </div>
          </div>
        ))}
      </div>

      {/* Shift Assignments for Selected Date */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-800">
            ตารางมอบหมายเวรประจำวัน (Shift Assignments Matrix)
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">วันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono font-medium"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4 font-mono">PERSON_ID</th>
                <th className="py-2.5 px-4">วันที่ปฏิบัติงาน (Work Date)</th>
                <th className="py-2.5 px-4">กะงานที่ได้รับมอบหมาย</th>
                <th className="py-2.5 px-4">ประเภทการจัดเวร</th>
                <th className="py-2.5 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((as) => (
                <tr key={as.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-800 font-bold">
                    {as.personId}
                  </td>
                  <td className="py-3 px-4 font-mono-data text-slate-600">
                    {as.workDate}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">
                    {as.shiftName}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-mono">
                      {as.assignmentType}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      พร้อมคำนวณ
                    </span>
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
