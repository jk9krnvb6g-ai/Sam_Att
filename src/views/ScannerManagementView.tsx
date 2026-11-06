import React, { useState } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { ScannerDevice } from '../types/attendance';
import {
  Radio,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  ShieldAlert,
  Server,
  Zap,
} from 'lucide-react';

export const ScannerManagementView: React.FC = () => {
  const [scanners, setScanners] = useState<ScannerDevice[]>(() =>
    mockAttendanceService.getScanners()
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; message: string; ok: boolean } | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Test connection mock
  const handleTestConnection = (device: ScannerDevice) => {
    setTestingId(device.id);
    setTestResult(null);

    setTimeout(() => {
      setTestingId(null);
      setTestResult({
        id: device.id,
        message: `เชื่อมต่อสำเร็จ (Mock Response): Ping IP ${device.ip}:${device.port} ตอบสนองใน 42ms (รอเชื่อมโยงกับ EXE เดิมบน Host Server)`,
        ok: true,
      });
    }, 600);
  };

  // Manual sync single device
  const handleSyncDevice = (device: ScannerDevice) => {
    const result = mockAttendanceService.triggerMockScannerSync(device.machineNo);
    setSyncToast(
      `Sync เครื่อง #${device.machineNo} (${device.name}) เสร็จสิ้น: อ่าน ${result.totalRead} รายการ (ใหม่ +${result.newScans}, ซ้ำ ${result.duplicateScans})`
    );
    setScanners(mockAttendanceService.getScanners());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            จัดการเครื่องสแกนนิ้ว (Scanner Devices)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            กำหนดค่าเครื่องสแกน ทดสอบการเชื่อมต่อ และตั้งเวลารอบการดึงสแกนอัตโนมัติ
          </p>
        </div>

        {/* Sync All Button */}
        <button
          onClick={() => {
            const res = mockAttendanceService.triggerMockScannerSync();
            setSyncToast(
              `Sync ทุกเครื่องเสร็จสิ้น: อ่าน ${res.totalRead} รายการ (ใหม่ +${res.newScans}, ซ้ำ ${res.duplicateScans})`
            );
            setScanners(mockAttendanceService.getScanners());
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>ดึงสแกนทันทีทุกเครื่อง (Sync All)</span>
        </button>
      </div>

      {/* Sync Toast */}
      {syncToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncToast}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2 py-0.5 bg-emerald-100 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Architecture Notice Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <ShieldAlert className="w-4 h-4 text-teal-600" />
          หลักการ Scanner Integration (ตาม MASTER DEVELOPMENT PROMPT §4.5 & §9):
        </div>
        <ul className="list-disc list-inside space-y-1 text-slate-600 ml-1">
          <li>
            <strong>ใช้ Scanner Reader EXE ตัวเดิมที่โรงพยาบาลมีอยู่</strong> ห้ามสร้าง แก้ไข หรือเปลี่ยน EXE
          </li>
          <li>
            Backend adapter ทำงานฝั่ง Server ด้วย Fixed Executable Path และ Arguments ที่ปลอดภัย
          </li>
          <li>
            ไม่เปิด HTTP Listener ใหม่สำหรับเครื่องสแกน และไม่ให้ Frontend ส่ง Arbitrary shell command
          </li>
          <li>
            ตั้งเวลารอบ Auto-Sync อัตโนมัติ: <strong>00:00 น.</strong> และ <strong>08:00 น.</strong> (Asia/Bangkok)
          </li>
        </ul>
      </div>

      {/* Scanner List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {scanners.map((sc) => (
          <div
            key={sc.id}
            className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                  machineNo: {sc.machineNo}
                </span>
                <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1" />
                  {sc.status} (Mock)
                </span>
              </div>

              <h2 className="text-sm font-bold text-slate-900 mb-1">{sc.name}</h2>
              <p className="text-xs text-slate-500 mb-3">{sc.location}</p>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs font-mono space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">IP Address:</span>
                  <span className="font-semibold text-slate-800">{sc.ip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Device Port:</span>
                  <span className="text-slate-800">{sc.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sync ล่าสุด:</span>
                  <span className="text-slate-700">{sc.lastSyncAt?.split(' ')[1] || 'ยังไม่มี'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auto Sync:</span>
                  <span className="text-emerald-700 font-sans font-medium">เปิดใช้งาน (00:00, 08:00)</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              {testResult && testResult.id === sc.id && (
                <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                  {testResult.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTestConnection(sc)}
                  disabled={testingId === sc.id}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                >
                  {testingId === sc.id ? 'กำลังทดสอบ...' : 'ทดสอบเชื่อมต่อ'}
                </button>

                <button
                  onClick={() => handleSyncDevice(sc)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer text-center"
                >
                  ดึงสแกนเดี๋ยวนี้
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-Sync Configuration Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Clock className="w-4 h-4 text-slate-400" />
          การตั้งเวลารอบดึงสแกนอัตโนมัติ (Daily Sync Schedule)
        </div>
        <p className="text-xs text-slate-500">
          ระบบ Sam_Att V2 ตั้งรอบการอ่านข้อมูลดิบวันละ 2 ครั้งเพื่อลดภาระของอุปกรณ์และครอบคลุมกะการทำงาน
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-slate-900">รอบที่ 1: เที่ยงคืน (00:00 น.)</div>
              <div className="text-[11px] text-slate-500">สำหรับสรุปเวรบ่ายและเริ่มต้นเวรดึก</div>
            </div>
            <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded">
              00:00:00
            </span>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-slate-900">รอบที่ 2: แปดโมงเช้า (08:00 น.)</div>
              <div className="text-[11px] text-slate-500">สำหรับสรุปเวรดึกและเริ่มต้นเวรเช้า/ราชการ</div>
            </div>
            <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded">
              08:00:00
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
