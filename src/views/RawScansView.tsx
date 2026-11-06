import React, { useState, useMemo } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { RawScanEvent, SyncRunLog } from '../types/attendance';
import {
  Fingerprint,
  RefreshCw,
  Copy,
  Check,
  Code,
  FileDown,
  Layers,
  History,
} from 'lucide-react';

export const RawScansView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scans' | 'runs' | 'contract'>('scans');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedContract, setCopiedContract] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    totalRead: number;
    newScans: number;
    duplicateScans: number;
    unmappedScans: number;
  } | null>(null);

  // Raw scans & sync runs
  const rawScans = useMemo(() => mockAttendanceService.getRawScans(), [refreshKey]);
  const syncRuns = useMemo(() => mockAttendanceService.getSyncRuns(), [refreshKey]);

  // Handle Mock Scanner Sync
  const handleTriggerSync = () => {
    const result = mockAttendanceService.triggerMockScannerSync();
    setSyncToast(result);
    setRefreshKey((k) => k + 1);
  };

  const sampleJsonContract = `{
  "success": true,
  "totalRead": 1,
  "machines": [
    { "machineNo": 1, "ip": "192.168.111.163", "read": 1, "status": "OK" }
  ],
  "scans": [
    {
      "machineNo": 1,
      "enrollNumber": 54,
      "scanDateTime": "2026-11-06 07:45:00",
      "verifyMode": 268435456,
      "inOutMode": 1,
      "workCode": null
    }
  ]
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sampleJsonContract);
    setCopiedContract(true);
    setTimeout(() => setCopiedContract(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ข้อมูลสแกนดิบและประวัติการ Sync (Raw Scans & Sync Runs)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            สัญญาข้อมูลดิบ 6 ฟิลด์จากเครื่องสแกนตัวเดิม ไม่แก้ไขหรือดัดแปลงค่า และตรวจสอบข้อมูลซ้ำ (Deduplication)
          </p>
        </div>

        {/* Sync Trigger Simulator */}
        <button
          onClick={handleTriggerSync}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>จำลองการดึงสแกน (Sync Scanners Mock)</span>
        </button>
      </div>

      {/* Sync Toast Result */}
      {syncToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              การ Sync ข้อมูลสแกนดิบจำลองเสร็จสิ้น
            </div>
            <div className="text-[11px] text-emerald-800">
              อ่านได้ทั้งหมด: <span className="font-mono font-semibold">{syncToast.totalRead}</span> รายการ |
              นำเข้าใหม่: <span className="font-mono font-semibold text-emerald-700">+{syncToast.newScans}</span> |
              รายการซ้ำ (Deduplicated): <span className="font-mono font-semibold text-slate-600">{syncToast.duplicateScans}</span> |
              ยังไม่พบรหัสบุคลากร: <span className="font-mono font-semibold text-amber-600">{syncToast.unmappedScans}</span>
            </div>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 px-2 py-1 bg-emerald-100 rounded"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit text-xs font-medium">
        <button
          onClick={() => setActiveTab('scans')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'scans' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5" />
          <span>รายการ Raw Scan ({rawScans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'runs' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>ประวัติรอบการ Sync ({syncRuns.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('contract')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'contract' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>สัญญา JSON (6 Fields Contract)</span>
        </button>
      </div>

      {/* Tab 1: Raw Scans Table */}
      {activeTab === 'scans' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800">
              ตารางบันทึกเหตุการณ์สแกนดิบ (Immutable Raw Events)
            </div>
            <div className="text-xs text-slate-500">
              สถานะ: <span className="text-emerald-700 font-medium">Read-Only</span> ไม่มีการแก้ไขค่าเดิม
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 font-mono">machineNo</th>
                  <th className="py-2.5 px-3 font-mono">enrollNumber</th>
                  <th className="py-2.5 px-3 font-mono">scanDateTime</th>
                  <th className="py-2.5 px-3 font-mono">verifyMode</th>
                  <th className="py-2.5 px-3 font-mono">inOutMode</th>
                  <th className="py-2.5 px-3 font-mono">workCode</th>
                  <th className="py-2.5 px-3">เวลาที่นำเข้า (importedAt)</th>
                  <th className="py-2.5 px-3">Deduplication Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {rawScans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 text-slate-800 font-bold">
                      เครื่อง #{scan.machineNo}
                    </td>
                    <td className="py-2.5 px-3 text-teal-700 font-bold">
                      {scan.enrollNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 font-medium whitespace-nowrap">
                      {scan.scanDateTime}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {scan.verifyMode}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {scan.inOutMode} {scan.inOutMode === 1 ? '(In)' : '(Out)'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {scan.workCode === null ? 'null' : scan.workCode}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-sans text-[11px] whitespace-nowrap">
                      {scan.importedAt}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-[140px] text-[10px]">
                      {scan.dedupeKey}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Sync Runs History */}
      {activeTab === 'runs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800">
              ประวัติรอบการดึงสแกน (Sync Runs Log)
            </div>
            <span className="text-xs text-slate-500 font-mono">
              ตั้งเวลารายวัน: 00:00, 08:00 (Asia/Bangkok)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">เครื่องสแกน</th>
                  <th className="py-2.5 px-4">โหมดการ Sync</th>
                  <th className="py-2.5 px-4">เวลาเริ่มต้น - สิ้นสุด</th>
                  <th className="py-2.5 px-4 text-center">สถานะ</th>
                  <th className="py-2.5 px-4 text-right">จำนวนที่อ่านได้</th>
                  <th className="py-2.5 px-4 text-right">รายการใหม่</th>
                  <th className="py-2.5 px-4 text-right">รายการซ้ำ (ข้าม)</th>
                  <th className="py-2.5 px-4 text-right">ยังไม่ผูกคน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {run.deviceName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                        {run.mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono-data text-[11px]">
                      {run.startedAt} → {run.finishedAt.split(' ')[1]}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data font-medium text-slate-800">
                      {run.totalRead}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-emerald-700 font-semibold">
                      +{run.newScans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-slate-500">
                      {run.duplicateScans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-amber-700">
                      {run.unmappedScans}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Contract Specifications */}
      {activeTab === 'contract' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                ข้อกำหนดสัญญาข้อมูลดิบเครื่องสแกน (Scanner Raw JSON Contract)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ยึดตาม MASTER DEVELOPMENT PROMPT §14 (Updated Scanner JSON Contract)
              </p>
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {copiedContract ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedContract ? 'คัดลอกแล้ว' : 'คัดลอก JSON'}</span>
            </button>
          </div>

          <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
            <pre>{sampleJsonContract}</pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <span className="font-bold text-slate-900 block mb-1">กฎและข้อห้ามตาม Master Prompt:</span>
              <p>• <strong>ห้ามเปลี่ยน enrollNumber เป็น fingleId</strong> ในสัญญา JSON ของ EXE เดิม</p>
              <p>• <strong>scanDateTime</strong> ตัวอย่างจริงเป็น yyyy-MM-dd HH:mm:ss ไม่บังคับให้เป็น ISO timestamp</p>
              <p>• <strong>verifyMode และ inOutMode</strong> เป็นค่าตัวเลขดิบจากเครื่อง ห้ามสมมติความหมาย</p>
              <p>• <strong>workCode</strong> รองรับค่า null</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <span className="font-bold text-slate-900 block mb-1">การจัดการใน Sam_Att Backend:</span>
              <p>• Backend ตรวจซ้ำด้วย DB Unique Fingerprint: machineNo + enrollNumber + scanDateTime</p>
              <p>• เก็บ Raw Scan เดิมลงตาราง raw_scans โดยไม่แก้ไขค่า (Immutable)</p>
              <p>• จับคู่ enrollNumber กับ FINGLE_ID จาก HOSOffice ตามช่วงเวลาที่มีผลบังคับใช้</p>
              <p>• รหัสที่ยังไม่พบผู้ใช้งานจะบันทึกเป็น PENDING_MAPPING และรอการกด Reprocess</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
