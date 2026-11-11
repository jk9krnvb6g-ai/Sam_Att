import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import {
  apiAttendanceAdapter,
  extractSafeErrorMessage,
} from '../services/apiAttendanceAdapter';
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
  AlertCircle,
} from 'lucide-react';

export const ScannerManagementView: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canSyncScanners =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'RESPONSIBLE_STAFF';

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
  const [apiError, setApiError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isLoadingScanners, setIsLoadingScanners] = useState(false);
  const [isSubmittingScanner, setIsSubmittingScanner] = useState(false);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  // Synchronous in-flight & mount guards to prevent duplicate/looping requests even under React StrictMode
  const hasLoadedOnMountRef = useRef(false);
  const isFetchingScannersRef = useRef(false);
  const syncAllInFlightRef = useRef(false);
  const deviceActionInFlightRef = useRef(false);

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

  const reloadData = useCallback(() => {
    setScanners(mockAttendanceService.getScanners());
    setSchedules(mockAttendanceService.getSyncSchedules());
  }, []);

  const reloadScannersFromBackend = useCallback(async () => {
    if (isFetchingScannersRef.current) {
      return;
    }
    isFetchingScannersRef.current = true;
    setIsLoadingScanners(true);
    try {
      const remoteScanners = await apiAttendanceAdapter.fetchScanners();
      mockAttendanceService.setScannersFromApi(remoteScanners);
      setScanners(mockAttendanceService.getScanners());
      setApiError(null);
    } catch (err: unknown) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถโหลดข้อมูลทะเบียนเครื่องสแกนจากฐานข้อมูลได้'
        )
      );
    } finally {
      isFetchingScannersRef.current = false;
      setIsLoadingScanners(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedOnMountRef.current) {
      hasLoadedOnMountRef.current = true;
      void reloadScannersFromBackend();
    }

    const handleHydrated = () => {
      setScanners(mockAttendanceService.getScanners());
      setSchedules(mockAttendanceService.getSyncSchedules());
    };
    window.addEventListener('sam-att-data-hydrated', handleHydrated);
    return () => {
      window.removeEventListener('sam-att-data-hydrated', handleHydrated);
    };
  }, [reloadScannersFromBackend]);

  // Verify persistent registry record & ingested raw scans for this device
  const handleTestConnection = async (
    device: ScannerDevice,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    if (testingId || deviceActionInFlightRef.current) return;
    deviceActionInFlightRef.current = true;
    setTestingId(device.id);
    setTestResult(null);
    setApiError(null);

    try {
      const [registryList, rawScanRes] = await Promise.all([
        apiAttendanceAdapter.fetchScanners(),
        apiAttendanceAdapter.fetchRawScans({
          machineNo: device.machineNo,
          page: 1,
          pageSize: 5,
        }),
      ]);
      mockAttendanceService.setScannersFromApi(registryList);
      setScanners(mockAttendanceService.getScanners());

      const registered = registryList.find((s) => s.id === device.id);
      if (!registered) {
        const msg = `ไม่พบเครื่องสแกน #${device.machineNo} ในตาราง scanner_devices ของฐานข้อมูล`;
        setTestResult({ id: device.id, message: msg, ok: false });
        setApiError(msg);
        return;
      }

      const latestScan =
        rawScanRes.items[0]?.scanDateTime ||
        registered.lastEventAt ||
        'ยังไม่มีรายการสแกนดิบ';
      setTestResult({
        id: device.id,
        message: `ตรวจสอบทะเบียนฐานข้อมูลสำเร็จ: IP ${registered.ip}:${registered.port} (พบสแกนดิบสะสม ${rawScanRes.total} รายการ • ล่าสุด: ${latestScan}) — การดึงข้อมูล TCP :4370 ดำเนินการโดย Scanner Reader EXE บน Host Server`,
        ok: true,
      });
    } catch (err: unknown) {
      const message = extractSafeErrorMessage(
        err,
        'ตรวจสอบสถานะเครื่องสแกนจากฐานข้อมูลไม่สำเร็จ'
      );
      setTestResult({ id: device.id, message, ok: false });
      setApiError(message);
    } finally {
      deviceActionInFlightRef.current = false;
      setTestingId(null);
    }
  };

  // Refresh single device's real ingested scans and registry status from backend (Manual action only)
  const handleSyncDevice = async (
    device: ScannerDevice,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    if (!canSyncScanners || pendingDeviceId || isRefreshingAll || deviceActionInFlightRef.current) {
      return;
    }
    deviceActionInFlightRef.current = true;
    setPendingDeviceId(device.id);
    setApiError(null);
    setToastMsg(null);

    try {
      await mockAttendanceService.hydrateFromRealApi(currentUser?.role);
      const hydrateErr = mockAttendanceService.getLastApiError();
      if (hydrateErr) {
        setApiError(hydrateErr);
        return;
      }
      setScanners(mockAttendanceService.getScanners());
      const machineScansCount = mockAttendanceService
        .getRawScans()
        .filter((r) => r.machineNo === device.machineNo).length;
      setToastMsg(
        `รีเฟรชข้อมูลจริงจากฐานข้อมูลสำหรับเครื่อง #${device.machineNo} (${device.name}) สำเร็จ: พบข้อมูลสแกนดิบของเครื่องนี้ ${machineScansCount} รายการ`
      );
    } catch (err: unknown) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถรีเฟรชข้อมูลเครื่องสแกนจากฐานข้อมูลได้'
        )
      );
    } finally {
      deviceActionInFlightRef.current = false;
      setPendingDeviceId(null);
    }
  };

  // Manual Sync All button handler — strictly user-initiated, never auto-triggered on mount
  const handleManualSyncAll = async () => {
    if (
      !canSyncScanners ||
      isRefreshingAll ||
      isLoadingScanners ||
      syncAllInFlightRef.current
    ) {
      return;
    }
    syncAllInFlightRef.current = true;
    setIsRefreshingAll(true);
    setApiError(null);
    setToastMsg(null);
    try {
      await mockAttendanceService.hydrateFromRealApi(currentUser?.role);
      const hydrateErr = mockAttendanceService.getLastApiError();
      if (hydrateErr) {
        setApiError(hydrateErr);
        return;
      }
      const latestScanners = mockAttendanceService.getScanners();
      setScanners(latestScanners);
      const rawScansCount = mockAttendanceService.getRawScans().length;
      setToastMsg(
        `รีเฟรชทะเบียนเครื่องสแกน (${latestScanners.length} เครื่อง) และข้อมูลสแกนดิบในระบบ (${rawScansCount} รายการ) จากฐานข้อมูลจริงเสร็จสิ้น`
      );
    } catch (err: unknown) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถรีเฟรชข้อมูลเครื่องสแกนและสแกนดิบจากฐานข้อมูลได้'
        )
      );
    } finally {
      syncAllInFlightRef.current = false;
      setIsRefreshingAll(false);
    }
  };

  // Save Scanner (Add or Edit via real Backend API)
  const handleSaveScanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScanner || isSubmittingScanner) return;

    setIsSubmittingScanner(true);
    setModalError(null);
    setApiError(null);
    setToastMsg(null);

    const payload = {
      machineNo: Number(editingScanner.machineNo),
      name: editingScanner.name.trim(),
      ip: editingScanner.ip.trim(),
      port: Number(editingScanner.port) || 4370,
      location: editingScanner.location.trim(),
      enabled: Boolean(editingScanner.enabled),
      autoSyncEnabled: Boolean(editingScanner.autoSyncEnabled),
    };

    try {
      if (isNewScanner) {
        await apiAttendanceAdapter.createScanner(payload);
      } else {
        await apiAttendanceAdapter.updateScanner(editingScanner.id, payload);
      }
      await reloadScannersFromBackend();
      setEditingScanner(null);
      setToastMsg(
        `${isNewScanner ? 'เพิ่ม' : 'แก้ไข'}เครื่องสแกน #${payload.machineNo} (${payload.name}) ลงฐานข้อมูลเรียบร้อยแล้ว`
      );
    } catch (err: unknown) {
      const message = extractSafeErrorMessage(
        err,
        'ไม่สามารถบันทึกข้อมูลเครื่องสแกนลงฐานข้อมูลได้'
      );
      setModalError(message);
      setApiError(message);
    } finally {
      setIsSubmittingScanner(false);
    }
  };

  // Toggle Scanner Enabled via real Backend API (`PATCH /api/Sam_Att/scanners/:id/enabled`)
  const handleToggleScannerEnabled = async (
    device: ScannerDevice,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!isAdmin || pendingDeviceId || deviceActionInFlightRef.current) return;
    deviceActionInFlightRef.current = true;
    setPendingDeviceId(device.id);
    setApiError(null);
    setToastMsg(null);

    try {
      const updated = await apiAttendanceAdapter.setScannerEnabled(
        device.id,
        !device.enabled
      );
      await reloadScannersFromBackend();
      setToastMsg(
        `${updated.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}เครื่องสแกน #${updated.machineNo} (${updated.name}) ในฐานข้อมูลเรียบร้อยแล้ว`
      );
    } catch (err: unknown) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถเปลี่ยนสถานะเครื่องสแกนในฐานข้อมูลได้'
        )
      );
    } finally {
      deviceActionInFlightRef.current = false;
      setPendingDeviceId(null);
    }
  };

  // Delete Scanner via real Backend API (`DELETE /api/Sam_Att/scanners/:id`)
  const handleDeleteScanner = async (
    device: ScannerDevice,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!isAdmin || pendingDeviceId || deviceActionInFlightRef.current) return;
    deviceActionInFlightRef.current = true;
    setPendingDeviceId(device.id);
    setApiError(null);
    setToastMsg(null);

    try {
      await apiAttendanceAdapter.deleteScanner(device.id);
      await reloadScannersFromBackend();
      setToastMsg(
        `ลบเครื่องสแกน #${device.machineNo} (${device.name}) ออกจากทะเบียนฐานข้อมูลแล้ว (คงข้อมูลสแกนดิบและเวลาปฏิบัติงานเดิมไว้ทั้งหมด)`
      );
    } catch (err: unknown) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถลบเครื่องสแกนออกจากฐานข้อมูลได้'
        )
      );
    } finally {
      deviceActionInFlightRef.current = false;
      setPendingDeviceId(null);
    }
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
            กำหนดค่าเครื่องสแกนลงฐานข้อมูล MySQL (`scanner_devices`) ตรวจสอบสถานะ และตั้งเวลารอบการดึงสแกนอัตโนมัติ (คลิกที่การ์ดเครื่องสแกนเพื่อดูรายละเอียด Popup)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                const nextNo =
                  scanners.length > 0
                    ? Math.max(...scanners.map((s) => s.machineNo)) + 1
                    : 1;
                setIsNewScanner(true);
                setModalError(null);
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
              disabled={isSubmittingScanner || isLoadingScanners}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มเครื่องสแกน</span>
            </button>
          )}

          {canSyncScanners && (
            <button
              type="button"
              onClick={() => void handleManualSyncAll()}
              disabled={isRefreshingAll || isLoadingScanners}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>
                {isRefreshingAll
                  ? 'กำลังรีเฟรชข้อมูล...'
                  : 'รีเฟรชข้อมูลสแกนทุกเครื่อง (Sync All)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={() => setApiError(null)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 px-2.5 py-1 bg-white border border-rose-200 rounded-lg cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

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
            รายการเครื่องสแกนถูกจัดเก็บอย่างถาวรในฐานข้อมูล <strong>samchuk_attendance_v2 (ตาราง scanner_devices)</strong> ไม่สูญหายเมื่อรีเฟรชหรือยังไม่มีข้อมูลสแกน
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
      {scanners.length === 0 ? (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-8 text-center shadow-xs">
          <Cpu className="w-8 h-8 text-violet-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">
            {isLoadingScanners
              ? 'กำลังโหลดทะเบียนเครื่องสแกนจากฐานข้อมูล...'
              : 'ยังไม่มีเครื่องสแกนลงทะเบียนในฐานข้อมูล'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isAdmin
              ? 'คลิกปุ่ม "เพิ่มเครื่องสแกน" ด้านบนเพื่อบันทึกเครื่องสแกนนิ้วลงตาราง scanner_devices'
              : 'กรุณาติดต่อผู้ดูแลระบบ (ADMIN) เพื่อเพิ่มเครื่องสแกนนิ้วในระบบ'}
          </p>
        </div>
      ) : (
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
                      {sc.lastSyncAt?.split(' ')[1] || sc.lastSyncAt || 'ยังไม่มี'}
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
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] ${
                      testResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleTestConnection(sc, e)}
                    disabled={testingId === sc.id}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-center disabled:opacity-50"
                  >
                    {testingId === sc.id ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะ'}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleSyncDevice(sc, e)}
                    disabled={pendingDeviceId === sc.id || isRefreshingAll}
                    className="px-2.5 py-1.5 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg transition-colors cursor-pointer text-center disabled:opacity-50"
                  >
                    {pendingDeviceId === sc.id ? 'กำลังรีเฟรช...' : 'รีเฟรชสแกนเครื่องนี้'}
                  </button>
                </div>

                {isAdmin && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[11px]">
                    <button
                      type="button"
                      onClick={(e) => handleToggleScannerEnabled(sc, e)}
                      disabled={pendingDeviceId === sc.id || isSubmittingScanner}
                      className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-violet-700 cursor-pointer disabled:opacity-50"
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
                          setModalError(null);
                          setEditingScanner({ ...sc });
                        }}
                        disabled={pendingDeviceId === sc.id || isSubmittingScanner}
                        className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900 cursor-pointer disabled:opacity-50"
                      >
                        <Edit3 className="w-3 h-3" />
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteScanner(sc, e)}
                        disabled={pendingDeviceId === sc.id || isSubmittingScanner}
                        className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 cursor-pointer disabled:opacity-50"
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
      )}

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
                disabled={testingId === selectedScannerPopup.id}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
              >
                ตรวจสอบสถานะทะเบียน
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSyncDevice(selectedScannerPopup);
                  setSelectedScannerPopup(null);
                }}
                disabled={pendingDeviceId === selectedScannerPopup.id}
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold cursor-pointer disabled:opacity-50"
              >
                รีเฟรชข้อมูลเครื่องนี้
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      {/* Modal 2: Add / Edit Scanner Modal */}
      <SharedModal
        open={!!editingScanner}
        onClose={() => {
          if (!isSubmittingScanner) {
            setEditingScanner(null);
            setModalError(null);
          }
        }}
        title={
          isNewScanner
            ? 'เพิ่มเครื่องสแกนลายนิ้วมือใหม่ (Add Scanner Device)'
            : `แก้ไขการตั้งค่าเครื่องสแกน #${editingScanner?.machineNo}`
        }
        subtitle="กำหนดค่า IP Address, Port และสถานะการดึงข้อมูลอัตโนมัติลงฐานข้อมูล MySQL (เฉพาะ ADMIN)"
        maxWidthClass="max-w-lg"
      >
        {editingScanner && (
          <form onSubmit={handleSaveScanner} className="space-y-4 text-xs">
            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  หมายเลขเครื่อง (machineNo):
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={9999}
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
                  min={1}
                  max={65535}
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
                disabled={isSubmittingScanner}
                onClick={() => {
                  setEditingScanner(null);
                  setModalError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSubmittingScanner}
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingScanner ? 'กำลังบันทึก...' : 'บันทึกเครื่องสแกน'}
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
