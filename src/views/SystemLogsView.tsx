import React, { useState, useMemo, useEffect } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import {
  apiAttendanceAdapter,
  ConnectionSettingsResponse,
  extractSafeErrorMessage,
} from '../services/apiAttendanceAdapter';
import { SyncRunLog, AuditLogEntry } from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  Server,
  ShieldCheck,
  Search,
  History,
  FileText,
  Lock,
  X,
} from 'lucide-react';

export const SystemLogsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dual_db' | 'sync_logs' | 'audit_logs'>('dual_db');
  const [refreshKey, setRefreshKey] = useState(0);
  const [connSettings, setConnSettings] = useState<ConnectionSettingsResponse | null>(null);

  // =========================================================
  // Tab 1: Dual Database Hub Connection States
  // =========================================================
  const [samchukDbStatus, setSamchukDbStatus] = useState<string>(
    'พร้อมตรวจสอบสถานะการเชื่อมต่อฐานข้อมูล'
  );
  const [hosofficeDbStatus, setHosofficeDbStatus] = useState<string>(
    'พร้อมตรวจสอบสถานะการเชื่อมต่อฐานข้อมูล'
  );
  const [testingDb, setTestingDb] = useState<'NONE' | 'BOTH' | 'SAMCHUK' | 'HOSOFFICE'>('NONE');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // =========================================================
  // Tab 2 & 3: Sync Logs & Audit Logs Search, Sort & Pagination
  // =========================================================
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const [syncSortKey, setSyncSortKey] = useState('startedAt');
  const [syncSortDir, setSyncSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [syncPage, setSyncPage] = useState(1);
  const [syncPageSize, setSyncPageSize] = useState<PageSizeOption>(10);

  const [auditSortKey, setAuditSortKey] = useState('timestamp');
  const [auditSortDir, setAuditSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState<PageSizeOption>(10);

  // Detail Modals
  const [selectedSyncLog, setSelectedSyncLog] = useState<SyncRunLog | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    apiAttendanceAdapter
      .fetchConnectionSettings()
      .then((settings) => {
        setConnSettings(settings);
        setSamchukDbStatus(
          settings.samchukDb.configured
            ? `ตั้งค่าแล้ว (${settings.samchukDb.database} · ${settings.samchukDb.engine} — ${settings.samchukDb.status})`
            : `ยังไม่ได้ตั้งค่า (${settings.samchukDb.database} — ${settings.samchukDb.status})`
        );
        setHosofficeDbStatus(
          settings.hosofficeDb.configured
            ? `ตั้งค่าแล้ว (${settings.hosofficeDb.mode} — Push: ${
                settings.hosofficeDb.pushEnabled ? 'Enabled' : 'Preview Safe Mode'
              })`
            : settings.hosofficeDb.statusMessage || 'AWAITING_CONFIGURATION: ยังไม่ได้กำหนดค่าการเชื่อมต่อฐานข้อมูล HOSOffice'
        );
      })
      .catch(() => {
        // Ignore initial error if not admin
      });
  }, [refreshKey]);

  const syncRuns = useMemo(() => mockAttendanceService.getSyncRuns(), [refreshKey]);
  const auditLogs = useMemo(() => mockAttendanceService.getAuditLogs(), [refreshKey]);

  const handleTestSamchukDb = async () => {
    setTestingDb('SAMCHUK');
    try {
      const health = await apiAttendanceAdapter.checkHealth();
      if (health.ok) {
        setSamchukDbStatus(
          `เชื่อมต่อฐานข้อมูล ${health.database} สำเร็จ (${health.engine} — สถานะ ${health.status})`
        );
        setStatusFeedback(`ตรวจสอบฐานข้อมูล ${health.database} สำเร็จ (${health.engine})`);
      } else {
        setSamchukDbStatus(`การเชื่อมต่อขัดข้อง: ${health.error || health.status}`);
      }
      await mockAttendanceService.hydrateFromRealApi('ADMIN');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSamchukDbStatus(
        `ไม่สามารถตรวจสอบฐานข้อมูลได้: ${extractSafeErrorMessage(err, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')}`
      );
    } finally {
      setTestingDb('NONE');
    }
  };

  const handleTestHosofficeDb = async () => {
    setTestingDb('HOSOFFICE');
    try {
      const [health, settings] = await Promise.all([
        apiAttendanceAdapter.checkHealth(),
        apiAttendanceAdapter.fetchConnectionSettings(),
      ]);
      setConnSettings(settings);
      const hosHealth = health.hosofficeDb;
      if (hosHealth) {
        setHosofficeDbStatus(hosHealth.message);
        setStatusFeedback(hosHealth.message);
      } else if (!settings.hosofficeDb.configured) {
        setHosofficeDbStatus(settings.hosofficeDb.statusMessage);
        setStatusFeedback(settings.hosofficeDb.statusMessage);
      } else {
        setHosofficeDbStatus(
          `ตั้งค่า ${settings.hosofficeDb.database} (${settings.hosofficeDb.host}:${settings.hosofficeDb.port}) — โหมด ${settings.hosofficeDb.mode}`
        );
        setStatusFeedback(`ตรวจสอบการตั้งค่าฐานข้อมูล ${settings.hosofficeDb.database} สำเร็จ`);
      }
      await mockAttendanceService.hydrateFromRealApi('ADMIN');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setHosofficeDbStatus(
        `ไม่สามารถตรวจสอบการตั้งค่า HOSOffice ได้: ${extractSafeErrorMessage(err, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')}`
      );
    } finally {
      setTestingDb('NONE');
    }
  };

  const handleTestBothDbs = async () => {
    setTestingDb('BOTH');
    try {
      const [health, settings] = await Promise.all([
        apiAttendanceAdapter.checkHealth(),
        apiAttendanceAdapter.fetchConnectionSettings(),
      ]);
      setConnSettings(settings);
      setSamchukDbStatus(
        health.ok
          ? `เชื่อมต่อฐานข้อมูล ${health.database} สำเร็จ (${health.engine} — ${health.status})`
          : `การเชื่อมต่อขัดข้อง: ${health.error || health.status}`
      );
      if (health.hosofficeDb) {
        setHosofficeDbStatus(health.hosofficeDb.message);
      } else {
        setHosofficeDbStatus(settings.hosofficeDb.statusMessage);
      }
      setStatusFeedback(
        `ตรวจสอบสถานะทั้ง 2 ฐานข้อมูล (${health.database} & ${settings.hosofficeDb.database}) เรียบร้อยแล้ว`
      );
      await mockAttendanceService.hydrateFromRealApi('ADMIN');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setStatusFeedback(
        `เกิดข้อผิดพลาดในการตรวจสอบฐานข้อมูล: ${extractSafeErrorMessage(err, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')}`
      );
    } finally {
      setTestingDb('NONE');
    }
  };

  // Filtered & Sorted Sync Logs
  const filteredSyncLogs = useMemo(() => {
    const q = logSearchQuery.toLowerCase().trim();
    const list = syncRuns.filter((r) => {
      if (!q) return true;
      return (
        r.deviceName.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.mode.toLowerCase().includes(q) ||
        r.startedAt.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const dir = syncSortDir === 'ASC' ? 1 : -1;
      if (syncSortKey === 'deviceName') return a.deviceName.localeCompare(b.deviceName) * dir;
      if (syncSortKey === 'totalRead') return (a.totalRead - b.totalRead) * dir;
      if (syncSortKey === 'newScans') return (a.newScans - b.newScans) * dir;
      return a.startedAt.localeCompare(b.startedAt) * dir;
    });
  }, [syncRuns, logSearchQuery, syncSortKey, syncSortDir]);

  const pagedSyncLogs = useMemo(() => {
    if (syncPageSize === 'ALL') return filteredSyncLogs;
    const start = (syncPage - 1) * syncPageSize;
    return filteredSyncLogs.slice(start, start + syncPageSize);
  }, [filteredSyncLogs, syncPage, syncPageSize]);

  // Filtered & Sorted Audit Logs
  const filteredAuditLogs = useMemo(() => {
    const q = logSearchQuery.toLowerCase().trim();
    const list = auditLogs.filter((a) => {
      if (actionFilter !== 'ALL' && a.action !== actionFilter) return false;
      if (!q) return true;
      return (
        a.summary.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.entityId.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const dir = auditSortDir === 'ASC' ? 1 : -1;
      if (auditSortKey === 'actorName') return a.actorName.localeCompare(b.actorName) * dir;
      if (auditSortKey === 'action') return a.action.localeCompare(b.action) * dir;
      return a.timestamp.localeCompare(b.timestamp) * dir;
    });
  }, [auditLogs, logSearchQuery, actionFilter, auditSortKey, auditSortDir]);

  const pagedAuditLogs = useMemo(() => {
    if (auditPageSize === 'ALL') return filteredAuditLogs;
    const start = (auditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, auditPage, auditPageSize]);

  const dbHost = connSettings?.samchukDb.host || 'ยังไม่ได้ตั้งค่า';
  const dbPort = connSettings?.samchukDb.port || 3306;
  const samchukDbName = connSettings?.samchukDb.database || 'samchuk_attendance_v2';

  return (
    <div className="space-y-5 pb-8">
      {/* =================================================================
          1. TOP HEADER & 3 MAIN TABS
         ================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              ศูนย์เชื่อมต่อฐานข้อมูล สถาปัตยกรรม และประวัติการทำงาน (System & Logs)
            </h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-violet-100 text-violet-800 border border-violet-200">
              {dbHost} (Database Hub)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ตรวจสอบสถานะการเชื่อมต่อทั้ง 2 ฐานข้อมูล ({samchukDbName} & {connSettings?.hosofficeDb.database || 'hosoffice'}), สถาปัตยกรรม Central API Gateway, Sync Logs และ Audit Logs
          </p>
        </div>

        {/* 3 Main Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E9E5F2] rounded-2xl shadow-2xs text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('dual_db')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
              activeTab === 'dual_db'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>1. จัดการ 2 ฐานข้อมูล (:201)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sync_logs')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
              activeTab === 'sync_logs'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>2. Sync Logs ({syncRuns.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit_logs')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer ${
              activeTab === 'audit_logs'
                ? 'bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>3. Audit Logs ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* =================================================================
          TAB 1: DUAL DATABASE HUB & SYSTEM ARCHITECTURE
         ================================================================= */}
      {activeTab === 'dual_db' && (
        <div className="space-y-5">
          {/* Dark Hero Banner */}
          <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-slate-900 rounded-2xl p-6 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md bg-violet-500/20 border border-violet-400/30 text-violet-200 font-mono font-semibold">
                  Database Host: {dbHost}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-semibold">
                  Production API & Database Mode
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                ศูนย์ตรวจสอบการเชื่อมต่อและจัดการฐานข้อมูล 2 ฐาน (Dual Database Hub)
              </h2>
              <p className="text-xs text-violet-200">
                เชื่อมต่อฐานข้อมูล MySQL บน{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-white">
                  {dbHost}:{dbPort}
                </code>{' '}
                โดยแยกฐานข้อมูลของระบบลงเวลาออกจากฐานข้อมูล HOSOffice อย่างชัดเจน (ไม่แสดงรหัสผ่านหรือ Secret จริงบนหน้าเว็บ)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleTestBothDbs}
                disabled={testingDb !== 'NONE'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${testingDb === 'BOTH' ? 'animate-spin' : ''}`} />
                <span>ตรวจสอบการเชื่อมต่อทั้ง 2 ฐานข้อมูล</span>
              </button>
            </div>
          </div>

          {statusFeedback && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 text-xs text-violet-950 flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
                <span>{statusFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusFeedback(null)}
                className="p-1 text-violet-700 hover:text-violet-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Two Database Cards Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Database 1: Sam_Att V2 Isolated DB */}
            <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        ฐานข้อมูลที่ 1: {samchukDbName}
                      </h3>
                      <p className="text-xs text-slate-500">
                        ระบบบันทึกเวลา, ตารางกะ, ผังเวร, ข้อมูลสแกนดิบ (แยกอิสระจากระบบอื่น)
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 font-mono text-xs font-bold">
                    {dbHost}
                  </span>
                </div>

                <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">ชื่อฐานข้อมูล (Schema):</span>
                    <span className="font-mono font-bold text-slate-900">
                      {samchukDbName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Host / Port:</span>
                    <span className="font-mono text-slate-700">
                      {dbHost} : {dbPort}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">การจัดการข้อมูลความลับ:</span>
                    <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                      <Lock className="w-3 h-3 text-violet-600" />
                      ซ่อนรหัสผ่านฝั่ง Server (.env)
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#E9E5F2] flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">สถานะการเชื่อมต่อ:</span>
                    <span className="font-semibold text-violet-800 text-right">
                      {samchukDbStatus}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestSamchukDb}
                disabled={testingDb !== 'NONE'}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${testingDb === 'SAMCHUK' ? 'animate-spin' : ''}`}
                />
                <span>ตรวจสอบการเชื่อมต่อ {samchukDbName}</span>
              </button>
            </div>

            {/* Database 2: hosoffice */}
            <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        ฐานข้อมูลที่ 2: {connSettings?.hosofficeDb.database || 'hosoffice'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        ระบบงานบุคลากรโรงพยาบาลสามชุก, hr_person (Authoritative), fingle_scan
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 font-mono text-xs font-bold">
                    {connSettings?.hosofficeDb.host || dbHost}
                  </span>
                </div>

                <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">ชื่อฐานข้อมูล (Schema):</span>
                    <span className="font-mono font-bold text-slate-900">
                      {connSettings?.hosofficeDb.database || 'hosoffice'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Host / Port:</span>
                    <span className="font-mono text-slate-700">
                      {connSettings?.hosofficeDb.host || dbHost} : {connSettings?.hosofficeDb.port || dbPort}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">สิทธิ์และการป้องกันข้อมูล:</span>
                    <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                      {connSettings?.hosofficeDb.mode || 'READ_ONLY_PERSONNEL_LIVE_SYNC'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#E9E5F2] flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">สถานะการเชื่อมต่อ:</span>
                    <span className="font-semibold text-purple-800 text-right">
                      {hosofficeDbStatus}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestHosofficeDb}
                disabled={testingDb !== 'NONE'}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${testingDb === 'HOSOFFICE' ? 'animate-spin' : ''}`}
                />
                <span>ตรวจสอบการเชื่อมต่อ hosoffice</span>
              </button>
            </div>
          </div>

          {/* Central API Gateway Architecture Summary Card */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Server className="w-4 h-4 text-violet-600" />
              <span>สถาปัตยกรรมระบบ (System Architecture)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4">
                <div className="text-[11px] font-bold text-violet-700 uppercase">
                  1. Frontend Web Server
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-1">
                  HTTPS Port {connSettings?.gateway.frontendPort || 3001} — {connSettings?.gateway.frontendBase || '/Sam_Att/'}
                </div>
                <p className="text-slate-500 mt-1">
                  เสิร์ฟผ่าน Web Server เดิมของโรงพยาบาล รองรับทั้ง Desktop และ Mobile
                </p>
              </div>

              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4">
                <div className="text-[11px] font-bold text-violet-700 uppercase">
                  2. Central API Gateway
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-1">
                  Port {connSettings?.gateway.apiGatewayPort || 3002} — {connSettings?.gateway.apiMount || '/api/Sam_Att/'}
                </div>
                <p className="text-slate-500 mt-1">
                  Mount Express Router เข้ากับ Central API Gateway เดิมโดยไม่เปิดพอร์ตใหม่
                </p>
              </div>

              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4">
                <div className="text-[11px] font-bold text-violet-700 uppercase">
                  3. Legacy Scanner Reader EXE
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-1">
                  6-Field JSON Contract
                </div>
                <p className="text-slate-500 mt-1">
                  เรียกใช้ EXE เดิมฝั่ง Server ตามตารางเวลา 00:00 และ 08:00 น. (Asia/Bangkok)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          TAB 2: SYNC LOGS
         ================================================================= */}
      {activeTab === 'sync_logs' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                ประวัติการดึงข้อมูลจากเครื่องสแกน (Sync Logs)
              </h2>
              <p className="text-xs text-slate-500">
                คลิกที่แถวเพื่อเปิดดูรายละเอียดการอ่านข้อมูลสแกนในแต่ละรอบ
              </p>
            </div>

            <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs min-w-[250px]">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => {
                  setLogSearchQuery(e.target.value);
                  setSyncPage(1);
                }}
                placeholder="ค้นหาชื่อเครื่อง, โหมด, เวลา..."
                className="w-full bg-transparent focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                  <th className="py-2.5 px-4 font-mono">Sync ID</th>
                  <SortableHeader
                    label="เครื่องสแกน"
                    sortKey="deviceName"
                    currentSortKey={syncSortKey}
                    currentSortDir={syncSortDir}
                    onSort={(k) => {
                      setSyncSortKey(k);
                      setSyncSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                  />
                  <th className="py-2.5 px-4">โหมด</th>
                  <SortableHeader
                    label="เวลาเริ่ม - สิ้นสุด"
                    sortKey="startedAt"
                    currentSortKey={syncSortKey}
                    currentSortDir={syncSortDir}
                    onSort={(k) => {
                      setSyncSortKey(k);
                      setSyncSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                  />
                  <SortableHeader
                    label="อ่านได้ทั้งหมด"
                    sortKey="totalRead"
                    currentSortKey={syncSortKey}
                    currentSortDir={syncSortDir}
                    onSort={(k) => {
                      setSyncSortKey(k);
                      setSyncSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                    align="right"
                  />
                  <SortableHeader
                    label="รายการใหม่"
                    sortKey="newScans"
                    currentSortKey={syncSortKey}
                    currentSortDir={syncSortDir}
                    onSort={(k) => {
                      setSyncSortKey(k);
                      setSyncSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                    align="right"
                  />
                  <th className="py-2.5 px-4 text-right">ซ้ำ (ข้าม)</th>
                  <th className="py-2.5 px-4 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E5F2]">
                {pagedSyncLogs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedSyncLog(run)}
                    className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-violet-700">{run.id}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{run.deviceName}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-mono text-[11px] font-semibold">
                        {run.mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-data text-slate-600">
                      {run.startedAt} → {run.finishedAt.split(' ')[1] || run.finishedAt}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data font-bold text-slate-900">
                      {run.totalRead}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data font-bold text-emerald-700">
                      +{run.newScans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-slate-500">
                      {run.duplicateScans}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePaginationBar
            totalItems={filteredSyncLogs.length}
            currentPage={syncPage}
            pageSize={syncPageSize}
            onPageChange={setSyncPage}
            onPageSizeChange={setSyncPageSize}
          />
        </div>
      )}

      {/* =================================================================
          TAB 3: AUDIT LOGS
         ================================================================= */}
      {activeTab === 'audit_logs' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                ประวัติการปฏิบัติงานและแก้ไขข้อมูลในระบบ (Audit Logs)
              </h2>
              <p className="text-xs text-slate-500">
                บันทึกผู้กระทำ, เวลา, ประเภทคำสั่ง และข้อมูล JSON ประกอบ (คลิกที่แถวเพื่อดูรายละเอียด)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setAuditPage(1);
                }}
                className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <option value="ALL">ทุกประเภทกิจกรรม (All Actions)</option>
                <option value="SYNC_SCANNERS">SYNC_SCANNERS</option>
                <option value="SYNC_HOSOFFICE_HR">SYNC_HOSOFFICE_HR</option>
                <option value="REPROCESS_ATTENDANCE">REPROCESS_ATTENDANCE</option>
                <option value="PUSH_HOSOFFICE">PUSH_HOSOFFICE</option>
                <option value="SET_NO_SCAN_NOTE">SET_NO_SCAN_NOTE</option>
                <option value="MANAGE_SHIFT_MATRIX">MANAGE_SHIFT_MATRIX</option>
                <option value="ASSIGN_SHIFT">ASSIGN_SHIFT</option>
                <option value="MANAGE_SCANNER">MANAGE_SCANNER</option>
                <option value="TEST_DB_CONNECTION">TEST_DB_CONNECTION</option>
              </select>

              <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => {
                    setLogSearchQuery(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="ค้นหาผู้ใช้งาน, กิจกรรม..."
                  className="w-full bg-transparent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                  <SortableHeader
                    label="วันเวลา (Timestamp)"
                    sortKey="timestamp"
                    currentSortKey={auditSortKey}
                    currentSortDir={auditSortDir}
                    onSort={(k) => {
                      setAuditSortKey(k);
                      setAuditSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                  />
                  <SortableHeader
                    label="ผู้ดำเนินการ (Actor)"
                    sortKey="actorName"
                    currentSortKey={auditSortKey}
                    currentSortDir={auditSortDir}
                    onSort={(k) => {
                      setAuditSortKey(k);
                      setAuditSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                  />
                  <SortableHeader
                    label="ประเภทคำสั่ง (Action)"
                    sortKey="action"
                    currentSortKey={auditSortKey}
                    currentSortDir={auditSortDir}
                    onSort={(k) => {
                      setAuditSortKey(k);
                      setAuditSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    }}
                  />
                  <th className="py-2.5 px-3">เป้าหมาย (Entity)</th>
                  <th className="py-2.5 px-3">สรุปรายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E5F2]">
                {pagedAuditLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedAuditLog(log)}
                    className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 font-mono-data text-slate-700 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{log.actorName}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {log.actorUsername} ({log.actorRole})
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-mono text-[11px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                      {log.entityType}: {log.entityId}
                    </td>
                    <td className="py-3 px-3 text-slate-800 font-medium">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePaginationBar
            totalItems={filteredAuditLogs.length}
            currentPage={auditPage}
            pageSize={auditPageSize}
            onPageChange={setAuditPage}
            onPageSizeChange={setAuditPageSize}
          />
        </div>
      )}

      {/* Sync Log Detail Modal */}
      <SharedModal
        open={!!selectedSyncLog}
        onClose={() => setSelectedSyncLog(null)}
        title={selectedSyncLog ? `รายละเอียด Sync Log (${selectedSyncLog.id})` : ''}
        subtitle={selectedSyncLog?.deviceName}
        badgeText={selectedSyncLog?.status}
        maxWidthClass="max-w-xl"
      >
        {selectedSyncLog && (
          <div className="space-y-3">
            <pre className="bg-slate-900 text-violet-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
              {JSON.stringify(selectedSyncLog, null, 2)}
            </pre>
          </div>
        )}
      </SharedModal>

      {/* Audit Log Detail Modal */}
      <SharedModal
        open={!!selectedAuditLog}
        onClose={() => setSelectedAuditLog(null)}
        title={selectedAuditLog ? `รายละเอียด Audit Log (${selectedAuditLog.id})` : ''}
        subtitle={selectedAuditLog ? `${selectedAuditLog.actorName} · ${selectedAuditLog.timestamp}` : ''}
        badgeText={selectedAuditLog?.action}
        maxWidthClass="max-w-2xl"
      >
        {selectedAuditLog && (
          <div className="space-y-4">
            <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4 space-y-2">
              <div className="font-bold text-slate-900">{selectedAuditLog.summary}</div>
              <div className="text-xs text-slate-600">
                ผู้กระทำ: <strong>{selectedAuditLog.actorName}</strong> ({selectedAuditLog.actorRole}) | เป้าหมาย:{' '}
                <code className="font-mono text-violet-700">
                  {selectedAuditLog.entityType} ({selectedAuditLog.entityId})
                </code>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 mb-1.5">
                ข้อมูล Metadata (JSON Payload):
              </div>
              <pre className="bg-slate-900 text-violet-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
                {selectedAuditLog.metadataJson}
              </pre>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
