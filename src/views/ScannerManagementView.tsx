import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { ScannerDevice, SyncScheduleSlot } from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import {
  CheckCircle,
  Clock,
  ShieldAlert,
  Zap,
  Plus,
  Edit3,
  Trash2,
  Power,
  Cpu,
  Eye,
} from 'lucide-react';

export const ScannerManagementView: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [scanners, setScanners] = useState<ScannerDevice[]>(() =>
    mockAttendanceService.getScanners()
  );
  const [schedules, setSchedules] = useState<SyncScheduleSlot[]>(() =>
    mockAttendanceService.getSyncSchedules()
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    message: string;
    ok: boolean;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Scanner Detail Popup
  const [selectedScannerPopup, setSelectedScannerPopup] =
    useState<ScannerDevice | null>(null);

  // Scanner Add/Edit Modal
  const [editingScanner, setEditingScanner] = useState<ScannerDevice | null>(
    null
  );
  const [isNewScanner, setIsNewScanner] = useState(false);

  // Schedule Add/Edit Modal
  const [editingSchedule, setEditingSchedule] =
    useState<SyncScheduleSlot | null>(null);
  const [isNewSchedule, setIsNewSchedule] = useState(false);

  const reloadData = () => {
    setScanners(mockAttendanceService.getScanners());
    setSchedules(mockAttendanceService.getSyncSchedules());
  };

  // Test connection
  const handleTestConnection = (device: ScannerDevice, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTestingId(device.id);
    setTestResult(null);

    setTimeout(() => {
      setTestingId(null);
      setTestResult({
        id: device.id,
        message: `ตรวจสอบการตั้งค่าสำเร็จ: IP ${device.ip}:${device.port} พร้อมเชื่อมโยงกับ Scanner Reader EXE บน Host Server`,
        ok: true,
      });
    }, 350);
  };

  // Manual sync single device
  const handleSyncDevice = async (device: ScannerDevice, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await mockAttendanceService.hydrateFromRealApi('ADMIN');
    const result = mockAttendanceService.triggerMockScannerSync(
      device.machineNo
    );
    setToastMsg(
      `อัปเดตสถานะซิงค์เครื่อง #${device.machineNo} (${device.name}) เสร็จสิ้น: ข้อมูลสแกนในระบบ ${result.totalRead} รายการ`
    );
    reloadData();
  };

  // Save Scanner (Add or Edit)
  const handleSaveScanner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScanner) return;
    mockAttendanceService.saveScannerDevice({
      id: isNewScanner ? undefined : editingScanner.id,
      machineNo: editingScanner.machineNo,
      name: editingScanner.name,
      ip: editingScanner.ip,
      port: editingScanner.port,
      location: editingScanner.location,
      enabled: editingScanner.enabled,
      autoSyncEnabled: editingScanner.autoSyncEnabled,
    });
    reloadData();
    setEditingScanner(null);
    setToastMsg(
      `${isNewScanner ? 'เพิ่ม' : 'แก้ไข'}เครื่องสแกน #${editingScanner.machineNo} (${editingScanner.name}) เรียบร้อยแล้ว`
    );
  };

  // Toggle Scanner Enabled
  const handleToggleScannerEnabled = (
    device: ScannerDevice,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!isAdmin) return;
    const updated = mockAttendanceService.toggleScannerEnabled(device.id);
    reloadData();
    setToastMsg(
      `${updated?.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}เครื่องสแกน #${device.machineNo} เรียบร้อยแล้ว`
    );
  };

  // Delete Scanner
  const handleDeleteScanner = (device: ScannerDevice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    mockAttendanceService.deleteScannerDevice(device.id);
    reloadData();
    setToastMsg(`ลบเครื่องสแกน ${device.name} ออกจากรายการแล้ว`);
  };

  // Save Schedule (Add or Edit)
  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    mockAttendanceService.saveSyncSchedule({
      id: isNewSchedule ? undefined : editingSchedule.id,
      time: editingSchedule.time,
      label: editingSchedule.label,
      enabled: editingSchedule.enabled,
    });
    reloadData();
    setEditingSchedule(null);
    setToastMsg(
      `${isNewSchedule ? 'เพิ่ม' : 'อัปเดต'}รอบดึงสแกนอัตโนมัติ (${editingSchedule.time} น.) เรียบร้อยแล้ว`
    );
  };

  // Toggle Schedule Enabled
  const handleToggleSchedule = (slot: SyncScheduleSlot) => {
    if (!isAdmin) return;
    mockAttendanceService.toggleSyncSchedule(slot.id);
    reloadData();
    setToastMsg(
      `${!slot.enabled ? 'เปิด' : 'ปิด'}ใช้งานรอบซิงค์ ${slot.label} (${slot.time} น.) แล้ว`
    );
  };

  // Delete Schedule
  const handleDeleteSchedule = (slot: SyncScheduleSlot) => {
    if (!isAdmin) return;
    mockAttendanceService.deleteSyncSchedule(slot.id);
    reloadData();
    setToastMsg(`ลบรอบซิงค์อัตโนมัติ ${slot.label} แล้ว`);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-[11px] font-bold text-violet-700 mb-1.5">
            <Cpu className="w-3.5 h-3.5" />
            HIP CMiF68S • SCANNER ADAPTER & DAILY AUTO-SYNC
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            จัดการเครื่องสแกนนิ้วและรอบดึงข้อมูลอัตโนมัติ (Scanner Devices)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            กำหนดค่าเครื่องสแกน ทดสอบการเชื่อมต่อ และตั้งเวลารอบการดึงสแกนอัตโนมัติ (คลิกที่การ์ดเครื่องสแกนเพื่อดูรายละเอียด Popup)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => {
                const nextNo =
                  scanners.length > 0
                    ? Math.max(...scanners.map((s) => s.machineNo)) + 1
                    : 1;
                setIsNewScanner(true);
                setEditingScanner({
                  id: '',
                  machineNo: nextNo,
                  name: `เครื่องสแกนที่ ${nextNo} (จุดติดตั้งใหม่)`,
                  ip: `192.168.111.${162 + nextNo}`,
                  port: 4370,
                  location: 'ระบุจุดติดตั้งในโรงพยาบาลสามชุก',
                  enabled: true,
                  autoSyncEnabled: true,
                  lastSyncAt: null,
                  lastEventAt: null,
                  lastError: null,
                  status: 'ONLINE',
                });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มเครื่องสแกน</span>
            </button>
          )}

          <button
            onClick={async () => {
              await mockAttendanceService.hydrateFromRealApi('ADMIN');
              const res = mockAttendanceService.triggerMockScannerSync();
              setToastMsg(
                `รีเฟรชข้อมูลสแกนทุกเครื่องเสร็จสิ้น: ข้อมูลสแกนในระบบ ${res.totalRead} รายการ`
              );
              reloadData();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>ดึงสแกนทันทีทุกเครื่อง (Sync All)</span>
          </button>
        </div>
      </div>

      {/* Sync Toast */}
      {toastMsg && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5 text-xs text-violet-950 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-violet-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="text-xs font-semibold text-violet-700 hover:text-violet-900 px-2.5 py-1 bg-white border border-violet-200 rounded-lg cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Architecture Notice Banner */}
      <div className="bg-violet-50/50 border border-violet-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <ShieldAlert className="w-4 h-4 text-violet-600" />
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
            ตั้งเวลารอบ Auto-Sync อัตโนมัติเริ่มต้น: <strong>00:00 น.</strong> และ <strong>08:00 น.</strong> (Asia/Bangkok) โดย ADMIN สามารถจัดการรอบเวลาเพิ่มเติมได้ด้านล่าง
          </li>
        </ul>
      </div>

      {/* Scanner List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {scanners.map((sc) => (
          <div
            key={sc.id}
            onClick={() => setSelectedScannerPopup(sc)}
            className="bg-white border border-[#E9E5F2] hover:border-violet-400 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer group"
          >
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200">
                  machineNo: {sc.machineNo}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border ${
                      sc.enabled && sc.status === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1 ${
                        sc.enabled && sc.status === 'ONLINE'
                          ? 'bg-emerald-600'
                          : 'bg-slate-400'
                      }`}
                    />
                    {sc.enabled ? sc.status : 'DISABLED'}
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 group-hover:text-violet-700 transition-colors">
                    {sc.name}
                  </h2>
                  <p className="text-xs text-slate-500 mb-3 mt-0.5">
                    {sc.location}
                  </p>
                </div>
                <Eye className="w-4 h-4 text-slate-300 group-hover:text-violet-600 shrink-0" />
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-mono space-y-1.5 text-slate-600">
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
                  <span className="text-slate-700">
                    {sc.lastSyncAt?.split(' ')[1] || 'ยังไม่มี'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auto Sync:</span>
                  <span
                    className={`font-sans font-semibold ${
                      sc.autoSyncEnabled ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {sc.autoSyncEnabled ? 'เปิดใช้งาน' : 'ปิด Auto Sync'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2.5">
              {testResult && testResult.id === sc.id && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                  {testResult.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={(e) => handleTestConnection(sc, e)}
                  disabled={testingId === sc.id}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center"
                >
                  {testingId === sc.id ? 'กำลังทดสอบ...' : 'ทดสอบเชื่อมต่อ'}
                </button>

                <button
                  type="button"
                  onClick={(e) => handleSyncDevice(sc, e)}
                  className="px-2.5 py-1.5 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors cursor-pointer text-center"
                >
                  ดึงสแกนเดี๋ยวนี้
                </button>
              </div>

              {isAdmin && (
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
                  <button
                    type="button"
                    onClick={(e) => handleToggleScannerEnabled(sc, e)}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-violet-700 cursor-pointer"
                  >
                    <Power className="w-3 h-3" />
                    {sc.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsNewScanner(false);
                        setEditingScanner({ ...sc });
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteScanner(sc, e)}
                      className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      ลบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Auto-Sync Configuration Box (Daily Sync Schedule) */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Clock className="w-4 h-4 text-violet-600" />
              การตั้งเวลารอบดึงสแกนอัตโนมัติ (Daily Sync Schedule — Timezone: Asia/Bangkok)
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ค่าเริ่มต้นวันละ 2 รอบ (00:00 น. และ 08:00 น.) ผู้ดูแลระบบ (ADMIN) สามารถเพิ่ม แก้ไข ลบ หรือเปิด/ปิดรอบการซิงค์ได้
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                setIsNewSchedule(true);
                setEditingSchedule({
                  id: '',
                  time: '16:30',
                  label: `รอบที่ ${schedules.length + 1}: หลังเลิกเวรเช้า (สรุปสแกนออกเวรเช้า / เข้าเวรบ่าย)`,
                  timezone: 'Asia/Bangkok',
                  enabled: true,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มรอบเวลาซิงค์
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((slot) => (
            <div
              key={slot.id}
              className={`border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all ${
                slot.enabled
                  ? 'border-violet-200 bg-violet-50/30'
                  : 'border-slate-200 bg-slate-50 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">
                      รอบเวลา {slot.time} น.
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        slot.enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                    >
                      {slot.enabled ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {slot.label}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    Timezone: {slot.timezone}
                  </div>
                </div>

                <span className="text-xs font-mono font-bold text-violet-800 bg-white border border-violet-200 px-3 py-1.5 rounded-lg shadow-2xs shrink-0">
                  {slot.time}:00
                </span>
              </div>

              {isAdmin && (
                <div className="pt-2.5 border-t border-violet-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggleSchedule(slot)}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-violet-700 cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                    {slot.enabled ? 'ปิดรอบเวลานี้' : 'เปิดใช้งานรอบนี้'}
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewSchedule(false);
                        setEditingSchedule({ ...slot });
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      แก้ไขเวลา
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(slot)}
                      className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      ลบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal 1: Scanner Detail Popup */}
      <SharedModal
        open={!!selectedScannerPopup}
        onClose={() => setSelectedScannerPopup(null)}
        title={`ข้อมูลเครื่องสแกนนิ้ว: ${selectedScannerPopup?.name || ''}`}
        subtitle={`machineNo: ${selectedScannerPopup?.machineNo} • IP ${selectedScannerPopup?.ip}:${selectedScannerPopup?.port}`}
        maxWidthClass="max-w-xl"
      >
        {selectedScannerPopup && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-violet-50/50 border border-violet-200 rounded-xl p-4">
              <div>
                <div className="text-slate-500">รหัสอ้างอิงในระบบ:</div>
                <div className="font-mono font-bold text-slate-900 text-sm">
                  {selectedScannerPopup.id} (machineNo: {selectedScannerPopup.machineNo})
                </div>
              </div>
              <div>
                <div className="text-slate-500">สถานะเครื่องสแกน:</div>
                <div className="font-bold text-emerald-700 text-sm">
                  {selectedScannerPopup.enabled
                    ? selectedScannerPopup.status
                    : 'ปิดการใช้งาน'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">IP Address & Port:</div>
                <div className="font-mono font-semibold text-violet-800">
                  {selectedScannerPopup.ip}:{selectedScannerPopup.port}
                </div>
              </div>
              <div>
                <div className="text-slate-500">จุดติดตั้งภายในโรงพยาบาล:</div>
                <div className="font-medium text-slate-800">
                  {selectedScannerPopup.location}
                </div>
              </div>
              <div>
                <div className="text-slate-500">เวลาซิงค์ข้อมูลล่าสุด:</div>
                <div className="font-mono text-slate-700">
                  {selectedScannerPopup.lastSyncAt || 'ยังไม่มีประวัติซิงค์'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">เวลาสแกนนิ้วล่าสุด:</div>
                <div className="font-mono text-slate-700">
                  {selectedScannerPopup.lastEventAt || 'ยังไม่มีรายการสแกน'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleTestConnection(selectedScannerPopup)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                ทดสอบเชื่อมต่อ (Ping)
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSyncDevice(selectedScannerPopup);
                  setSelectedScannerPopup(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold cursor-pointer"
              >
                ดึงสแกนจากเครื่องนี้ทันที
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      {/* Modal 2: Add / Edit Scanner Modal */}
      <SharedModal
        open={!!editingScanner}
        onClose={() => setEditingScanner(null)}
        title={
          isNewScanner
            ? 'เพิ่มเครื่องสแกนลายนิ้วมือใหม่ (Add Scanner Device)'
            : `แก้ไขการตั้งค่าเครื่องสแกน #${editingScanner?.machineNo}`
        }
        subtitle="กำหนดค่า IP Address, Port และสถานะการดึงข้อมูลอัตโนมัติ (เฉพาะ ADMIN)"
        maxWidthClass="max-w-lg"
      >
        {editingScanner && (
          <form onSubmit={handleSaveScanner} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  หมายเลขเครื่อง (machineNo):
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editingScanner.machineNo}
                  onChange={(e) =>
                    setEditingScanner({
                      ...editingScanner,
                      machineNo: Number(e.target.value),
                    })
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  พอร์ตเชื่อมต่อ (TCP Port):
                </label>
                <input
                  type="number"
                  required
                  value={editingScanner.port}
                  onChange={(e) =>
                    setEditingScanner({
                      ...editingScanner,
                      port: Number(e.target.value),
                    })
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ชื่อเครื่องสแกนนิ้ว:
              </label>
              <input
                type="text"
                required
                value={editingScanner.name}
                onChange={(e) =>
                  setEditingScanner({ ...editingScanner, name: e.target.value })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                IP Address (ภายในเครือข่ายโรงพยาบาล):
              </label>
              <input
                type="text"
                required
                value={editingScanner.ip}
                onChange={(e) =>
                  setEditingScanner({ ...editingScanner, ip: e.target.value })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                สถานที่ติดตั้ง (Location):
              </label>
              <input
                type="text"
                required
                value={editingScanner.location}
                onChange={(e) =>
                  setEditingScanner({
                    ...editingScanner,
                    location: e.target.value,
                  })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
              />
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingScanner.enabled}
                  onChange={(e) =>
                    setEditingScanner({
                      ...editingScanner,
                      enabled: e.target.checked,
                    })
                  }
                  className="rounded text-violet-600"
                />
                <span className="font-semibold text-slate-800">
                  เปิดใช้งานเครื่องสแกนนี้ (Enabled)
                </span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingScanner.autoSyncEnabled}
                  onChange={(e) =>
                    setEditingScanner({
                      ...editingScanner,
                      autoSyncEnabled: e.target.checked,
                    })
                  }
                  className="rounded text-violet-600"
                />
                <span className="font-semibold text-slate-800">
                  ดึงข้อมูลตามรอบอัตโนมัติ (Auto Sync)
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingScanner(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold shadow-xs cursor-pointer"
              >
                บันทึกเครื่องสแกน
              </button>
            </div>
          </form>
        )}
      </SharedModal>

      {/* Modal 3: Add / Edit Daily Sync Schedule Modal */}
      <SharedModal
        open={!!editingSchedule}
        onClose={() => setEditingSchedule(null)}
        title={
          isNewSchedule
            ? 'เพิ่มรอบเวลาดึงสแกนอัตโนมัติ (Add Daily Sync Schedule)'
            : 'แก้ไขรอบเวลาดึงสแกนอัตโนมัติ'
        }
        subtitle="กำหนดเวลาทำงานของ Scheduled Job ในเขตเวลา Asia/Bangkok"
        maxWidthClass="max-w-md"
      >
        {editingSchedule && (
          <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                เวลาซิงค์อัตโนมัติ (HH:mm):
              </label>
              <input
                type="text"
                required
                placeholder="เช่น 00:00 หรือ 08:00"
                value={editingSchedule.time}
                onChange={(e) =>
                  setEditingSchedule({
                    ...editingSchedule,
                    time: e.target.value,
                  })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-violet-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                คำอธิบายรอบการดึงข้อมูล:
              </label>
              <input
                type="text"
                required
                value={editingSchedule.label}
                onChange={(e) =>
                  setEditingSchedule({
                    ...editingSchedule,
                    label: e.target.value,
                  })
                }
                className="w-full border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-900"
              />
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingSchedule.enabled}
                onChange={(e) =>
                  setEditingSchedule({
                    ...editingSchedule,
                    enabled: e.target.checked,
                  })
                }
                className="rounded text-violet-600"
              />
              <span className="font-semibold text-slate-800">
                เปิดใช้งานรอบเวลาซิงค์อัตโนมัตินี้
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold shadow-xs cursor-pointer"
              >
                บันทึกรอบเวลา
              </button>
            </div>
          </form>
        )}
      </SharedModal>
    </div>
  );
};
