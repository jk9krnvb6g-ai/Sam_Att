import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiAttendanceAdapter, ConnectionSettingsResponse } from '../services/apiAttendanceAdapter';
import { UserAccount, PageSizeOption } from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
} from '../components/common/TablePaginationBar';
import { Database, Server, Lock, ShieldCheck, RefreshCw } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [connSettings, setConnSettings] = useState<ConnectionSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dbTestResult, setDbTestResult] = useState<string | null>(null);
  const [hosTestResult, setHosTestResult] = useState<string | null>(null);

  // Sorting & Pagination for User Accounts table
  const [sortKey, setSortKey] = useState<string>('id');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // User Detail Popup
  const [selectedUserPopup, setSelectedUserPopup] =
    useState<UserAccount | null>(null);

  const loadSettingsData = async () => {
    setIsLoading(true);
    try {
      const fetchedConnections = await apiAttendanceAdapter
        .fetchConnectionSettings()
        .catch(() => null);
      if (fetchedConnections) {
        setConnSettings(fetchedConnections);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettingsData();
  }, []);

  const sortedUsers = useMemo(() => {
    const list = currentUser ? [currentUser] : [];
    list.sort((a, b) => {
      const strA = String((a as unknown as Record<string, unknown>)[sortKey] ?? '');
      const strB = String((b as unknown as Record<string, unknown>)[sortKey] ?? '');
      return sortDirection === 'ASC'
        ? strA.localeCompare(strB, 'th')
        : strB.localeCompare(strA, 'th');
    });
    return list;
  }, [currentUser, sortKey, sortDirection]);

  const pagedUsers = useMemo(() => {
    if (pageSize === 'ALL') return sortedUsers;
    const start = (currentPage - 1) * pageSize;
    return sortedUsers.slice(start, start + pageSize);
  }, [sortedUsers, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDirection('ASC');
    }
    setCurrentPage(1);
  };

  const handleTestDb = async () => {
    setDbTestResult('กำลังตรวจสอบการเชื่อมต่อฐานข้อมูล...');
    try {
      const health = await apiAttendanceAdapter.checkHealth();
      if (health.ok) {
        setDbTestResult(
          `เชื่อมต่อฐานข้อมูล ${health.database} สำเร็จ (${health.engine}): สถานะ ${health.status}`
        );
      } else {
        setDbTestResult(
          `การเชื่อมต่อฐานข้อมูล ${health.database} ขัดข้อง: ${health.error || health.status}`
        );
      }
    } catch (err) {
      setDbTestResult(
        `ไม่สามารถติดต่อ API ตรวจสอบฐานข้อมูลได้: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const handleTestHosOffice = async () => {
    setHosTestResult('กำลังตรวจสอบสถานะการเชื่อมต่อ HOSOffice...');
    try {
      const [health, settings] = await Promise.all([
        apiAttendanceAdapter.checkHealth(),
        apiAttendanceAdapter.fetchConnectionSettings(),
      ]);
      setConnSettings(settings);
      if (health.hosofficeDb) {
        setHosTestResult(health.hosofficeDb.message);
      } else {
        setHosTestResult(settings.hosofficeDb.statusMessage);
      }
    } catch (err) {
      setHosTestResult(
        `ไม่สามารถตรวจสอบการตั้งค่า HOSOffice ได้: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const samchukHostPort = connSettings
    ? `${connSettings.samchukDb.host}:${connSettings.samchukDb.port}`
    : 'ยังไม่ได้ตั้งค่า';
  const samchukDbName = connSettings?.samchukDb.database || 'samchuk_attendance_v2';

  const hosHostPort = connSettings
    ? `${connSettings.hosofficeDb.host}:${connSettings.hosofficeDb.port}`
    : 'ยังไม่ได้ตั้งค่า (AWAITING_CONFIGURATION)';
  const hosDbName = connSettings?.hosofficeDb.database || 'hosoffice';

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-[11px] font-bold text-violet-700 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMINISTRATION • SYSTEM SETTINGS & ROLE ACCESS
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ตั้งค่าระบบและสิทธิ์ผู้ใช้งาน (System Settings)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            เฉพาะผู้ดูแลระบบ (ADMIN): จัดการฐานข้อมูลแยก, การเชื่อมต่อ HOSOffice, และบัญชีผู้ใช้งาน 3 ระดับ
          </p>
        </div>
        <button
          type="button"
          onClick={loadSettingsData}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 text-xs font-bold text-violet-800 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Gateway Integration Card */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Server className="w-4 h-4 text-violet-600" />
          สถาปัตยกรรม Central API Gateway (Production Architecture)
        </div>
        <p className="text-xs text-slate-500">
          ระบบ Sam_Att V2 ทำงานร่วมกับ Central API Gateway เดิมของโรงพยาบาลสามชุก โดยไม่มีการเปิดพอร์ตใหม่
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-3.5">
            <span className="text-[11px] text-violet-700 font-bold uppercase">
              Frontend Web
            </span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              HTTPS Port {connSettings?.gateway.frontendPort || 3001}
            </div>
            <div className="text-[11px] text-violet-700 font-mono mt-0.5">
              URL Base: {connSettings?.gateway.frontendBase || '/Sam_Att/'}
            </div>
          </div>

          <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-3.5">
            <span className="text-[11px] text-violet-700 font-bold uppercase">
              Central API Gateway
            </span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              Port {connSettings?.gateway.apiGatewayPort || 3002} (Shared Listener)
            </div>
            <div className="text-[11px] text-violet-700 font-mono mt-0.5">
              Mount: {connSettings?.gateway.apiMount || '/api/Sam_Att/'}
            </div>
          </div>

          <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-3.5">
            <span className="text-[11px] text-violet-700 font-bold uppercase">
              Database Name
            </span>
            <div className="text-xs font-mono font-bold text-slate-900 mt-1">
              {samchukDbName}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              แยกอิสระจาก Procurement & Cash
            </div>
          </div>
        </div>
      </div>

      {/* Database Connection Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* samchuk_attendance DB */}
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="w-4 h-4 text-violet-600" />
              ฐานข้อมูล Sam_Att ({samchukDbName})
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-semibold">
              Isolate DB
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Host & Port:</label>
              <input
                type="text"
                disabled
                value={samchukHostPort}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-700"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">
                Database Name:
              </label>
              <input
                type="text"
                disabled
                value={samchukDbName}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1">Engine Mode:</label>
                <input
                  type="text"
                  disabled
                  value={connSettings?.samchukDb.engine || 'MYSQL'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Credentials:</label>
                <div className="relative">
                  <input
                    type="password"
                    disabled
                    value="••••••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {dbTestResult && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                {dbTestResult}
              </div>
            )}

            <button
              onClick={handleTestDb}
              className="w-full py-2 px-3 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              ทดสอบการเชื่อมต่อฐานข้อมูล (Check Database Health)
            </button>
          </div>
        </div>

        {/* HOSOffice Connection */}
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Database className="w-4 h-4 text-indigo-600" />
              การเชื่อมต่อ HOSOffice (Authoritative)
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono font-semibold">
              {connSettings?.hosofficeDb.mode || 'READ_ONLY_PERSONNEL_LIVE_SYNC'}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Host & Port:</label>
              <input
                type="text"
                disabled
                value={hosHostPort}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-700"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">
                Database Name:
              </label>
              <input
                type="text"
                disabled
                value={hosDbName}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1">Push Mode:</label>
                <input
                  type="text"
                  disabled
                  value={connSettings?.hosofficeDb.pushEnabled ? 'Enabled' : 'Preview Only (Safe)'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Credentials:</label>
                <div className="relative">
                  <input
                    type="password"
                    disabled
                    value="••••••••••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {hosTestResult && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                {hosTestResult}
              </div>
            )}

            <button
              onClick={handleTestHosOffice}
              className="w-full py-2 px-3 text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
            >
              ตรวจสอบสถานะการเชื่อมต่อ HOSOffice
            </button>
          </div>
        </div>
      </div>

      {/* User Accounts & PERSON_ID Mapping */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              การจัดการผู้ใช้งาน & ผูกรหัสบุคคล (Users & Role Management)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              3 บทบาทตามข้อกำหนด: ADMIN, RESPONSIBLE_STAFF, GENERAL_USER (คลิกที่แถวเพื่อดูรายละเอียด)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <SortableHeader
                  label="User ID"
                  sortKey="id"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ชื่อผู้ใช้ (Username)"
                  sortKey="username"
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
                  label="บทบาท (Role)"
                  sortKey="role"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="PERSON_ID ที่ผูก"
                  sortKey="personId"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-2.5 px-4">ตำแหน่ง / ฝ่าย</th>
                <th className="py-2.5 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedUsers.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUserPopup(u)}
                  className="hover:bg-violet-50/40 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-3.5 font-mono text-slate-600">
                    {u.id}
                  </td>
                  <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                    {u.username}
                  </td>
                  <td className="py-3 px-3.5 font-semibold text-slate-800">
                    {u.fullName}
                  </td>
                  <td className="py-3 px-3.5">
                    <span
                      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                        u.role === 'ADMIN'
                          ? 'bg-violet-100 text-violet-800 border-violet-300'
                          : u.role === 'RESPONSIBLE_STAFF'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 font-mono text-slate-700">
                    {u.personId ? (
                      <span className="font-bold text-violet-800 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200">
                        {u.personId}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">
                        ไม่ได้ผูก (Admin)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div>{u.position}</div>
                    <div className="text-[11px] text-slate-400">
                      {u.department}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ใช้งานปกติ
                    </span>
                  </td>
                </tr>
              ))}
              {pagedUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {isLoading ? 'กำลังโหลดข้อมูลผู้ใช้งานจากฐานข้อมูล...' : 'ไม่พบข้อมูลบัญชีผู้ใช้งาน'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={sortedUsers.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Modal: User Detail Popup */}
      <SharedModal
        isOpen={!!selectedUserPopup}
        onClose={() => setSelectedUserPopup(null)}
        title={`ข้อมูลบัญชีผู้ใช้: ${selectedUserPopup?.fullName || ''}`}
        subtitle={`Username: ${selectedUserPopup?.username} • Role: ${selectedUserPopup?.role}`}
        maxWidth="max-w-md"
      >
        {selectedUserPopup && (
          <div className="space-y-3 text-xs">
            <div className="bg-violet-50/50 border border-violet-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">รหัสผู้ใช้งาน (User ID):</span>
                <span className="font-mono font-bold text-slate-900">
                  {selectedUserPopup.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ชื่อผู้ใช้ (Username):</span>
                <span className="font-mono font-bold text-violet-800">
                  {selectedUserPopup.username}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ระดับสิทธิ์ (Role):</span>
                <span className="font-bold text-slate-900">
                  {selectedUserPopup.role}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">รหัสบุคคลที่ผูก (PERSON_ID):</span>
                <span className="font-mono font-bold text-violet-700">
                  {selectedUserPopup.personId || 'ไม่ได้ผูก'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ตำแหน่ง / หน่วยงาน:</span>
                <span className="font-medium text-slate-800">
                  {selectedUserPopup.position} ({selectedUserPopup.department})
                </span>
              </div>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
