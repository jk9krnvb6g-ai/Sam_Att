import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiAttendanceAdapter } from '../services/apiAttendanceAdapter';
import { getDemoDeploymentCenterPayload } from '../config/demoModeConfig';
import {
  ChecklistItemStatus,
  DeploymentCenterStatusPayload,
} from '../types/deploymentCenter';
import {
  Rocket,
  Server,
  GitBranch,
  GitCommit,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Lock,
  History,
  RotateCcw,
  Database,
  Activity,
  Terminal,
  ExternalLink,
  Loader2,
  Info,
  HelpCircle,
} from 'lucide-react';

export const DeploymentCenterView: React.FC = () => {
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<DeploymentCenterStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<'check-updates' | 'preflight' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement | null>(null);

  const loadDeploymentCenterData = useCallback(async () => {
    setErrorMessage(null);

    // Never call Production APIs when in Development Preview Demo Mode
    if (isDemoMode && import.meta.env.DEV && !import.meta.env.PROD) {
      const demoData = getDemoDeploymentCenterPayload();
      setPayload(demoData);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiAttendanceAdapter.fetchDeploymentStatus();
      setPayload(res);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถดึงข้อมูลสถานะ Deployment Center จาก Central API Gateway ได้'
      );
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    void loadDeploymentCenterData();
  }, [loadDeploymentCenterData]);

  const handleCheckForUpdates = async () => {
    setErrorMessage(null);
    setActionFeedback(null);
    setActionLoading('check-updates');

    try {
      if (isDemoMode && import.meta.env.DEV && !import.meta.env.PROD) {
        const demoData = getDemoDeploymentCenterPayload();
        if (demoData) {
          setPayload({
            ...demoData,
            checkedAt: new Date().toISOString(),
          });
        }
        setActionFeedback(
          'DEMO DATA: โหมดพรีวิวไม่ส่งคำขอไปยังเซิร์ฟเวอร์จริงและไม่สร้างผลลัพธ์ปลอม (สถานะยังคงเป็น NOT_AVAILABLE / NOT_CHECKED ตามจริง)'
        );
        return;
      }

      const updated = await apiAttendanceAdapter.checkDeploymentUpdates();
      setPayload(updated);
      setActionFeedback(
        `ดำเนินการตรวจสอบอัปเดตจาก GitHub API แล้ว: ${updated.versionComparison.statusLabel} (บันทึก Audit Log เรียบร้อยแล้ว)`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'การตรวจสอบอัปเดตจาก GitHub ล้มเหลว'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunPreflightCheck = async () => {
    setErrorMessage(null);
    setActionFeedback(null);
    setActionLoading('preflight');

    try {
      if (isDemoMode && import.meta.env.DEV && !import.meta.env.PROD) {
        const demoData = getDemoDeploymentCenterPayload();
        if (demoData) {
          setPayload({
            ...demoData,
            checkedAt: new Date().toISOString(),
          });
        }
        setActionFeedback(
          'DEMO DATA: โหมดพรีวิวไม่เรียก Production API และไม่แสดง PASS จำลองเมื่อไม่มีหลักฐานการตรวจสอบจริง'
        );
        return;
      }

      const updated = await apiAttendanceAdapter.runDeploymentPreflight();
      setPayload(updated);
      const passedCount = updated.checklist.filter((c) => c.status === 'PASS').length;
      const failedCount = updated.checklist.filter((c) => c.status === 'FAIL').length;
      const warningCount = updated.checklist.filter((c) => c.status === 'WARNING').length;
      const notCheckedCount = updated.checklist.filter(
        (c) => c.status === 'NOT_CHECKED' || c.status === 'NOT_AVAILABLE'
      ).length;
      setActionFeedback(
        `ตรวจสอบความพร้อม (Preflight Check) เสร็จสิ้นตามหลักฐานจริง: PASS ${passedCount} | FAIL ${failedCount} | WARNING ${warningCount} | NOT CHECKED ${notCheckedCount} (ยังไม่พร้อม Deploy)`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'การตรวจสอบความพร้อม (Preflight Check) ล้มเหลว'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleScrollToHistory = () => {
    historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Defense-in-depth frontend role check: ADMIN only
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center max-w-xl mx-auto my-8 shadow-xs">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">
          จำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (ADMIN Only)
        </h2>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          หน้าศูนย์ควบคุมการอัปเดต (Deployment Center) สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (ADMIN) เท่านั้น
          บัญชีผู้ใช้งานกลุ่ม GENERAL_USER และ RESPONSIBLE_STAFF ไม่สามารถเข้าถึงหรือเรียกใช้งานได้
        </p>
      </div>
    );
  }

  const renderChecklistBadge = (status: ChecklistItemStatus) => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono-data bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            PASS
          </span>
        );
      case 'FAIL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono-data bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            FAIL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono-data bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            WARNING
          </span>
        );
      case 'NOT_AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono-data bg-slate-100 text-slate-700 border border-slate-300">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            NOT AVAILABLE
          </span>
        );
      case 'NOT_CHECKED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold font-mono-data bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            NOT CHECKED
          </span>
        );
    }
  };

  const renderHistoryStatusBadge = (status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK') => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            SUCCESS
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'ROLLED_BACK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data bg-amber-50 text-amber-800 border border-amber-200">
            <RotateCcw className="w-3 h-3" />
            ROLLED_BACK
          </span>
        );
    }
  };

  const isDemoPayload = Boolean(payload?.isDemoData || isDemoMode);
  const passedCount = payload ? payload.checklist.filter((i) => i.status === 'PASS').length : 0;
  const failedCount = payload ? payload.checklist.filter((i) => i.status === 'FAIL').length : 0;
  const warningCount = payload ? payload.checklist.filter((i) => i.status === 'WARNING').length : 0;
  const notCheckedCount = payload
    ? payload.checklist.filter(
        (i) => i.status === 'NOT_CHECKED' || i.status === 'NOT_AVAILABLE'
      ).length
    : 0;
  const isReadyToDeploy = Boolean(
    payload &&
      payload.deploymentReadiness?.readyToDeploy &&
      passedCount === payload.checklist.length &&
      failedCount === 0 &&
      notCheckedCount === 0
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6D28D9] to-[#8B5CF6] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  ศูนย์ควบคุมการอัปเดตระบบ (Deployment Center)
                </h1>
                <span className="text-[11px] font-mono-data font-bold px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200">
                  ADMIN ONLY
                </span>
                <span className="text-[11px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  Phase 1: Read-Only Verification & Preflight
                </span>
                {isDemoPayload && (
                  <span className="text-[11px] font-mono-data font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                    DEMO DATA (Preview Only)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                บริหารจัดการและตรวจสอบความพร้อมในการอัปเดตระบบ Sam_Att V2 จาก GitHub Repository (
                <span className="font-mono-data text-slate-800">
                  https://github.com/jk9krnvb6g-ai/Sam_Att
                </span>
                ) บน FILESERVER ของโรงพยาบาลสามชุก โดยแสดงผลตามหลักฐานการตรวจสอบจริงเท่านั้น (Zero False PASS)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] text-slate-700 font-mono-data">
              เวลาตรวจสอบล่าสุด:{' '}
              <span className="font-semibold text-slate-900">
                {payload?.checkedAt
                  ? new Date(payload.checkedAt).toLocaleString('th-TH')
                  : 'ยังไม่ได้ตรวจสอบ'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadDeploymentCenterData()}
              disabled={loading || actionLoading !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E9E5F2] bg-white hover:bg-violet-50 text-slate-700 font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>
        </div>

        {/* Feedback / Error banners */}
        {actionFeedback && (
          <div className="mt-4 p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-950 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
            <div className="font-medium">{actionFeedback}</div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">เกิดข้อผิดพลาดในการเชื่อมต่อ Deployment Center API</div>
              <div className="mt-0.5 font-mono-data text-rose-800">{errorMessage}</div>
            </div>
          </div>
        )}
      </div>

      {loading && !payload ? (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-12 flex flex-col items-center justify-center text-slate-600">
          <Loader2 className="w-8 h-8 text-violet-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-800">
            กำลังตรวจสอบสถานะระบบและข้อมูลเวอร์ชันจาก Central API Gateway...
          </p>
        </div>
      ) : payload ? (
        <>
          {/* SECTION D: Deployment Actions Bar (5 Required Buttons) */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  D. คำสั่งควบคุมการอัปเดต (Deployment Actions)
                </h2>
              </div>
              {isDemoPayload && (
                <span className="text-[11px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  DEMO DATA — โหมดพรีวิวไม่ส่งคำสั่งไปยังเซิร์ฟเวอร์จริง
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {/* 1. Check for Updates */}
              <button
                type="button"
                onClick={() => void handleCheckForUpdates()}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading === 'check-updates' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <GitBranch className="w-4 h-4 shrink-0" />
                )}
                <span>ตรวจสอบอัปเดต (Check for Updates)</span>
              </button>

              {/* 2. Preflight Check */}
              <button
                type="button"
                onClick={() => void handleRunPreflightCheck()}
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading === 'preflight' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-violet-700" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-violet-700" />
                )}
                <span>ตรวจสอบความพร้อม (Preflight Check)</span>
              </button>

              {/* 3. Approve Deployment (Disabled in Phase 1) */}
              <button
                type="button"
                disabled={!payload.deploymentAgent.approveEnabled}
                title={payload.deploymentAgent.lockReason}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold cursor-not-allowed"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>อนุมัติ Deploy (Approve Deployment)</span>
              </button>

              {/* 4. Deployment History */}
              <button
                type="button"
                onClick={handleScrollToHistory}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-[#E9E5F2] text-xs font-bold transition-all cursor-pointer"
              >
                <History className="w-4 h-4 shrink-0 text-violet-600" />
                <span>ดูประวัติการ Deploy (Deployment History)</span>
              </button>

              {/* 5. Rollback (Disabled in Phase 1) */}
              <button
                type="button"
                disabled={!payload.deploymentAgent.rollbackEnabled}
                title={payload.deploymentAgent.lockReason}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>ย้อนกลับเวอร์ชัน (Rollback)</span>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800">
                  มาตรการความปลอดภัย (Safety Guardrails):
                </span>{' '}
                {payload.deploymentAgent.lockReason}
              </div>
            </div>
          </div>

          {/* SECTION A: System Status */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  A. สถานะระบบปัจจุบัน (System Status)
                </h2>
              </div>
              {isDemoPayload && (
                <span className="text-[11px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  DEMO DATA
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. Sam_Att V2 Status */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    สถานะระบบ Sam_Att V2
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data ${
                      payload.systemStatus.samAttStatus === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {payload.systemStatus.samAttStatus === 'ONLINE' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {payload.systemStatus.samAttStatus}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 font-mono-data">
                  HTTPS :{payload.systemStatus.samAttFrontendPort}
                  {payload.systemStatus.samAttFrontendPath}
                </div>
                <div className="text-[11px] text-slate-500">
                  Frontend Web Application
                </div>
              </div>

              {/* 2. Backend API Status */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    สถานะ Backend API
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data ${
                      payload.systemStatus.backendApiStatus === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {payload.systemStatus.backendApiStatus === 'ONLINE' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {payload.systemStatus.backendApiStatus}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 font-mono-data">
                  Gateway :{payload.systemStatus.backendGatewayPort}
                  {payload.systemStatus.backendGatewayPath}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                  <Database className="w-3 h-3 text-violet-600 shrink-0" />
                  <span className="font-mono-data truncate">
                    DB: {payload.systemStatus.databaseName}
                  </span>
                </div>
              </div>

              {/* 3. GitHub Connection Status */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    การเชื่อมต่อ GitHub
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data ${
                      payload.systemStatus.githubConnectionStatus === 'CONNECTED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <GitBranch className="w-3 h-3" />
                    {payload.systemStatus.githubConnectionStatus}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 font-mono-data truncate">
                  jk9krnvb6g-ai/Sam_Att
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate font-mono-data">
                    {payload.systemStatus.githubRepositoryUrl}
                  </span>
                </div>
              </div>

              {/* 4. Last Deployed Timestamp */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    วันเวลาที่ Deploy ล่าสุด
                  </span>
                  <Clock className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <div className="text-xs font-bold text-slate-900 font-mono-data break-words">
                  {payload.systemStatus.lastDeployedAt}
                </div>
                <div className="text-[11px] text-slate-500">
                  อ้างอิงจาก Build Metadata จริงเท่านั้น
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: Version Comparison */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  B. เปรียบเทียบเวอร์ชัน (Version Comparison)
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isDemoPayload && (
                  <span className="text-[11px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    DEMO DATA
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${
                    payload.versionComparison.status === 'UP_TO_DATE'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : payload.versionComparison.status === 'UPDATE_AVAILABLE'
                      ? 'bg-violet-100 text-violet-900 border border-violet-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>สถานะเปรียบเทียบ:</span>
                  <span>{payload.versionComparison.statusLabel}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Current Server Version */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/60 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E9E5F2] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-violet-700" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Current Server Version (เวอร์ชันบนเซิร์ฟเวอร์ปัจจุบัน)
                    </h3>
                  </div>
                  {isDemoPayload ? (
                    <span className="text-[10px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      DEMO DATA
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                      {payload.currentVersion.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Version</dt>
                    <dd className="font-mono-data font-bold text-slate-900 mt-0.5 break-all">
                      {payload.currentVersion.version}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Git Commit SHA</dt>
                    <dd className="font-mono-data font-bold text-violet-800 mt-0.5 break-all">
                      {payload.currentVersion.commitSha}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Deployment Date</dt>
                    <dd className="font-mono-data font-semibold text-slate-800 mt-0.5 break-words">
                      {payload.currentVersion.deploymentDate}
                    </dd>
                  </div>
                </dl>

                <div className="text-[11px] text-slate-500 font-mono-data">
                  แหล่งข้อมูล: {payload.currentVersion.source}
                </div>
              </div>

              {/* Latest GitHub Version */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/60 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E9E5F2] pb-2.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-violet-700" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Latest GitHub Version (เวอร์ชันล่าสุดบน GitHub)
                    </h3>
                  </div>
                  {isDemoPayload ? (
                    <span className="text-[10px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      DEMO DATA
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-violet-100 text-violet-800">
                      Branch: {payload.latestGitHubVersion.branch}
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Version</dt>
                    <dd className="font-mono-data font-bold text-slate-900 mt-0.5 break-all">
                      {payload.latestGitHubVersion.version}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Git Commit SHA</dt>
                    <dd className="font-mono-data font-bold text-violet-800 mt-0.5 break-all">
                      {payload.latestGitHubVersion.commitSha}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Latest Commit Date</dt>
                    <dd className="font-mono-data font-semibold text-slate-800 mt-0.5 break-words">
                      {payload.latestGitHubVersion.latestCommitDate}
                    </dd>
                  </div>
                </dl>

                <div className="text-[11px] text-slate-600">
                  {payload.latestGitHubVersion.message}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-violet-50/70 border border-violet-200/80 text-xs text-violet-950 flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-bold">สรุปผลการเปรียบเทียบ: </span>
                <span>{payload.versionComparison.summary}</span>
              </div>
            </div>
          </div>

          {/* SECTION C: Pre-Deployment Checklist (8 Required Items — Evidence-Based) */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  C. รายการตรวจสอบความพร้อมก่อนอัปเดต (Pre-Deployment Checklist — 8 รายการ)
                </h2>
              </div>

              {/* Distinct count badges separating PASS, FAIL, WARNING, and NOT_CHECKED (§4) */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-data">
                {isDemoPayload && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    DEMO DATA
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  PASS: {passedCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                  FAIL: {failedCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  WARNING: {warningCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                  NOT CHECKED: {notCheckedCount}
                </span>
              </div>
            </div>

            {/* Readiness Banner: Never claims "พร้อม Deploy" when items are NOT_CHECKED, WARNING, or FAIL (§4) */}
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                failedCount > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : !isReadyToDeploy
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {failedCount > 0 ? (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  สถานะความพร้อมโดยรวม:{' '}
                  {isReadyToDeploy
                    ? 'ผ่านการตรวจสอบครบทุกรายการ'
                    : 'ยังไม่พร้อมสำหรับการ Deploy (Not Ready for Deployment)'}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed">
                  {payload.deploymentReadiness?.readinessMessage ||
                    `พบรายการที่ผ่านการยืนยันหลักฐานจริง ${passedCount}/${payload.checklist.length} รายการ (NOT CHECKED ${notCheckedCount} รายการ, WARNING ${warningCount} รายการ, FAIL ${failedCount} รายการ) — ระบบจะแสดง PASS เฉพาะเมื่อมีหลักฐานการตรวจสอบจริงเท่านั้น`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {payload.checklist.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/50 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-violet-100 text-violet-800 font-mono-data text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {item.stepNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900">{item.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.description}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">{renderChecklistBadge(item.status)}</div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 space-y-1 text-[11px]">
                    <div className="text-slate-700 font-mono-data leading-relaxed">
                      {item.detail}
                    </div>
                    <div className="text-slate-500 font-mono-data flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>
                        เวลาตรวจสอบล่าสุด:{' '}
                        {item.checkedAt
                          ? new Date(item.checkedAt).toLocaleString('th-TH')
                          : 'ยังไม่ได้ตรวจสอบ (NOT CHECKED)'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION E: Deployment History */}
          <div
            ref={historySectionRef}
            className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  E. ประวัติการดำเนินการและอัปเดตระบบ (Deployment History)
                </h2>
              </div>
              {isDemoPayload && (
                <span className="text-[11px] font-mono-data font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                  DEMO DATA
                </span>
              )}
            </div>

            {payload.history.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                ยังไม่มีประวัติการ Deploy หรือการตรวจสอบความพร้อมในระบบ Audit Log
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-bold">
                      <th className="py-2.5 px-3.5">วันเวลาที่ดำเนินการ</th>
                      <th className="py-2.5 px-3.5">เวอร์ชัน / Commit SHA</th>
                      <th className="py-2.5 px-3.5">ผู้ดำเนินการ (ADMIN)</th>
                      <th className="py-2.5 px-3.5">สถานะ</th>
                      <th className="py-2.5 px-3.5">สรุปผล / สาเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E5F2]">
                    {payload.history.map((h) => (
                      <tr key={h.id} className="hover:bg-violet-50/30 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono-data text-slate-700 whitespace-nowrap">
                          {new Date(h.deployedAt).toLocaleString('th-TH')}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono-data font-bold text-violet-800 whitespace-nowrap">
                          {h.versionOrCommit}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-800 whitespace-nowrap">
                          {h.actorName}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {renderHistoryStatusBadge(h.status)}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700">{h.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Phase 2 Deployment Agent Architecture Readiness Card */}
          <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-2xl p-4 text-xs text-slate-600 flex items-start gap-3">
            <Terminal className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-slate-800">
                สถาปัตยกรรมรองรับ Phase 2 (IDeploymentAgent Interface Readiness)
              </div>
              <p className="text-[11px] leading-relaxed">
                ระบบได้เตรียม Interface <code className="font-mono-data text-violet-800">IDeploymentAgent</code>{' '}
                สำหรับเชื่อมต่อกับ Windows Service / Scheduled Task บน FILESERVER ในอนาคต
                โดยไม่เปิด TCP Port เพิ่ม และไม่อนุญาตให้ส่งคำสั่ง Shell หรือ PowerShell
                จากหน้าเว็บโดยเด็ดขาด
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
