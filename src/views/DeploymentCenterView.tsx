import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiAttendanceAdapter, extractSafeErrorMessage } from '../services/apiAttendanceAdapter';
import { getDemoDeploymentCenterPayload } from '../config/demoModeConfig';
import {
  ApproveDeploymentResponse,
  ChecklistItemStatus,
  DeploymentCenterStatusPayload,
  DeploymentJobStatus,
  DeploymentProgressState,
  PostDeployHealthCheckReport,
  RollbackDeploymentResponse,
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
  KeyRound,
  Archive,
  Play,
  FileCheck2,
  Wrench,
} from 'lucide-react';

export const DeploymentCenterView: React.FC = () => {
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<DeploymentCenterStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<
    'check-updates' | 'preflight' | 'approve-deploy' | 'rollback' | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Latest execution states for Progress & Health Check display
  const [latestProgress, setLatestProgress] = useState<DeploymentProgressState | null>(null);
  const [latestHealthCheck, setLatestHealthCheck] = useState<PostDeployHealthCheckReport | null>(
    null
  );
  const [lastDeployResponse, setLastDeployResponse] = useState<ApproveDeploymentResponse | null>(
    null
  );
  const [lastRollbackResponse, setLastRollbackResponse] =
    useState<RollbackDeploymentResponse | null>(null);

  // Section 6: Approve & Deploy Modal state
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [approvePassword, setApprovePassword] = useState<string>('');
  const [approveModalError, setApproveModalError] = useState<string | null>(null);

  // Section 9: Rollback Modal state
  const [showRollbackModal, setShowRollbackModal] = useState<boolean>(false);
  const [selectedBackupId, setSelectedBackupId] = useState<string>('');
  const [rollbackPassword, setRollbackPassword] = useState<string>('');
  const [confirmRollbackChecked, setConfirmRollbackChecked] = useState<boolean>(false);
  const [rollbackReason, setRollbackReason] = useState<string>('');
  const [rollbackModalError, setRollbackModalError] = useState<string | null>(null);

  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const initialFetchDoneRef = useRef<boolean>(false);

  const loadDeploymentCenterData = useCallback(async () => {
    setErrorMessage(null);

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
      if (res.activeProgress) {
        setLatestProgress(res.activeProgress);
      }
      if (res.availableBackups && res.availableBackups.length > 0 && !selectedBackupId) {
        setSelectedBackupId(res.availableBackups[0].backupId);
      }
    } catch (err) {
      setErrorMessage(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถดึงข้อมูลสถานะ Deployment Center จาก Central API Gateway ได้'
        )
      );
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, selectedBackupId]);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    void loadDeploymentCenterData();
  }, [loadDeploymentCenterData]);

  useEffect(() => {
    if (isDemoMode || (actionLoading !== 'approve-deploy' && actionLoading !== 'rollback')) return;
    let cancelled=false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshProgress=async()=>{
      try {
        const progress=await apiAttendanceAdapter.fetchDeploymentProgress();
        if(!cancelled && progress)setLatestProgress(progress);
      } catch(err) {
        if(!cancelled)setErrorMessage(extractSafeErrorMessage(err,'ไม่สามารถตรวจสอบความคืบหน้าได้ กรุณาตรวจสอบสถานะก่อนสั่งงานซ้ำ'));
      } finally {
        if(!cancelled)timer=setTimeout(refreshProgress,2000);
      }
    };
    void refreshProgress();
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[actionLoading,isDemoMode]);

  const handleManualRefresh = async () => {
    if (loading || actionLoading !== null) return;
    await loadDeploymentCenterData();
  };

  // Section 3: Check for Updates (Strict single request per click, never triggers Preflight automatically)
  const handleCheckForUpdates = async () => {
    if (actionLoading !== null) return;
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
        `ตรวจสอบอัปเดตจาก GitHub API เรียบร้อยแล้ว: ${updated.versionComparison.statusLabel} (เปรียบเทียบ Current SHA: ${updated.versionComparison.currentCommitSha} กับ Latest GitHub SHA: ${updated.versionComparison.latestGitHubCommitSha})`
      );
    } catch (err) {
      setErrorMessage(extractSafeErrorMessage(err, 'การตรวจสอบอัปเดตจาก GitHub ล้มเหลว'));
    } finally {
      setActionLoading(null);
    }
  };

  // Section 4: Preflight Validation (8 items with evidence)
  const handleRunPreflightCheck = async () => {
    if (actionLoading !== null) return;
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
        `ตรวจสอบความพร้อม (Preflight Check 8 รายการ) เสร็จสิ้นตามหลักฐานจริง: PASS ${passedCount} | FAIL ${failedCount} | WARNING ${warningCount} | NOT CHECKED ${notCheckedCount}`
      );
    } catch (err) {
      setErrorMessage(
        extractSafeErrorMessage(err, 'การตรวจสอบความพร้อม (Preflight Check) ล้มเหลว')
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Section 6: Approve & Execute Deployment
  const handleOpenApproveModal = () => {
    setApprovePassword('');

    setApproveModalError(null);
    setShowApproveModal(true);
  };

  const handleConfirmApproveDeployment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading !== null || !payload || !isReadyToDeploy || !payload.deploymentAgent.approveEnabled) {
      setApproveModalError('ระบบยังไม่ผ่าน Preflight หรือ Deployment Agent ไม่พร้อม ไม่สามารถสั่ง Deploy ได้');
      return;
    }

    const targetSha =
      payload.latestGitHubVersion.commitSha !== 'NOT_AVAILABLE'
        ? payload.latestGitHubVersion.commitSha
        : '';

    if (!targetSha || targetSha.length < 7) {
      setApproveModalError('ไม่พบ Target Commit SHA ที่ถูกต้องจาก GitHub กรุณากด Check for Updates ก่อน');
      return;
    }

    if (!approvePassword.trim()) {
      setApproveModalError('กรุณากรอกรหัสผ่านของผู้ดูแลระบบ (ADMIN Re-Authentication)');
      return;
    }

    setApproveModalError(null);
    setErrorMessage(null);
    setActionFeedback(null);
    setActionLoading('approve-deploy');

    try {
      const result = await apiAttendanceAdapter.approveDeployment({
        targetCommitSha: targetSha,
        adminPassword: approvePassword,
      });

      setLastDeployResponse(result);
      if (result.progress) {
        setLatestProgress(result.progress);
      }
      if (result.healthCheck) {
        setLatestHealthCheck(result.healthCheck);
      }

      setShowApproveModal(false);
      setApprovePassword('');

      if (result.success && result.status === 'SUCCESS') {
        setActionFeedback(
          `อัปเดตระบบ Sam_Att V2 ไปยัง Commit ${result.targetCommitSha} สำเร็จ และผ่าน Health Check ครบทั้ง 7 รายการ (Backup ID: ${result.backupId || '-'})`
        );
      } else if (result.status === 'MAINTENANCE_REQUIRED') {
        setActionFeedback(
          `หยุดการทำงานอย่างปลอดภัยที่สถานะ MAINTENANCE_REQUIRED: ${result.message}`
        );
      } else {
        setErrorMessage(result.error || result.message || 'การดำเนินการ Deploy ไม่สำเร็จ');
      }

      await loadDeploymentCenterData();
    } catch (err) {
      const safeErr = extractSafeErrorMessage(
        err,
        'การอนุมัติและดำเนินการ Deploy ล้มเหลว'
      );
      setApproveModalError(safeErr);
      setErrorMessage(safeErr);
    } finally {
      setActionLoading(null);
    }
  };

  // Section 9: Rollback Modal & Execution
  const handleOpenRollbackModal = (presetBackupId?: string) => {
    const backups = payload?.availableBackups || [];
    const defaultBackup =
      presetBackupId ||
      (backups.length > 0 ? backups[0].backupId : payload?.deploymentAgent.latestBackupId || '');
    setSelectedBackupId(defaultBackup);
    setRollbackPassword('');
    setConfirmRollbackChecked(false);
    setRollbackReason('');
    setRollbackModalError(null);
    setShowRollbackModal(true);
  };

  const handleConfirmRollback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading !== null || !payload?.deploymentAgent.rollbackEnabled) {
      setRollbackModalError('Deployment Agent หรือชุดสำรองที่ตรวจสอบแล้วไม่พร้อม ไม่สามารถสั่ง Rollback ได้');
      return;
    }

    if (!selectedBackupId.trim()) {
      setRollbackModalError('กรุณาเลือกหรือระบุ Backup ID ที่ต้องการย้อนกลับ');
      return;
    }
    if (!rollbackPassword.trim()) {
      setRollbackModalError('กรุณากรอกรหัสผ่านของผู้ดูแลระบบ (ADMIN Re-Authentication)');
      return;
    }
    if (!confirmRollbackChecked) {
      setRollbackModalError('กรุณาติ๊กยืนยันการย้อนกลับเวอร์ชัน (Confirm Rollback)');
      return;
    }

    setRollbackModalError(null);
    setErrorMessage(null);
    setActionFeedback(null);
    setActionLoading('rollback');

    try {
      const result = await apiAttendanceAdapter.rollbackDeployment({
        backupId: selectedBackupId.trim(),
        adminPassword: rollbackPassword,
        confirmRollback: confirmRollbackChecked,
        reason: rollbackReason.trim() || 'ADMIN Manual Rollback from Deployment Center',
      });

      setLastRollbackResponse(result);
      if (result.healthCheck) {
        setLatestHealthCheck(result.healthCheck);
      }

      setShowRollbackModal(false);
      setRollbackPassword('');

      if (result.success && result.status === 'ROLLED_BACK') {
        setActionFeedback(
          `ย้อนกลับระบบ (Rollback) ไปยัง Backup ${result.backupId} (Commit: ${result.restoredCommitSha || '-'}) สำเร็จ และผ่านการตรวจสอบ Health Check เรียบร้อยแล้ว`
        );
      } else {
        setErrorMessage(result.error || result.message || 'การดำเนินการ Rollback ไม่สำเร็จ');
      }

      await loadDeploymentCenterData();
    } catch (err) {
      const safeErr = extractSafeErrorMessage(err, 'การสั่งย้อนกลับระบบ (Rollback) ล้มเหลว');
      setRollbackModalError(safeErr);
      setErrorMessage(safeErr);
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

  const renderJobStatusBadge = (status: DeploymentJobStatus) => {
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
      case 'MAINTENANCE_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data bg-purple-100 text-purple-900 border border-purple-300">
            <Wrench className="w-3 h-3" />
            MAINTENANCE_REQUIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono-data bg-violet-50 text-violet-800 border border-violet-200">
            <Clock className="w-3 h-3" />
            {status}
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

  const isCriticalRollbackFailure = Boolean(
    lastRollbackResponse?.status === 'ROLLBACK_FAILED' ||
      lastDeployResponse?.criticalManualRecoveryAdvice
  );

  return (
    <div className="space-y-6">
      {/* CRITICAL ROLLBACK_FAILED Banner (§4 & §3.8) */}
      {isCriticalRollbackFailure && (
        <div
          role="alert"
          className="bg-rose-600 text-white border-2 border-rose-800 rounded-2xl p-5 shadow-md flex items-start gap-3.5"
        >
          <ShieldAlert className="w-7 h-7 text-white shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <div className="text-sm sm:text-base font-extrabold tracking-tight">
              CRITICAL: การย้อนกลับระบบล้มเหลว กรุณาตรวจสอบเซิร์ฟเวอร์และกู้คืนจาก Backup ล่าสุดตามคู่มือผู้ดูแลระบบ
            </div>
            <p className="text-xs text-rose-100 font-mono-data leading-relaxed">
              {lastRollbackResponse?.criticalManualRecoveryAdvice ||
                lastDeployResponse?.criticalManualRecoveryAdvice ||
                'กรุณาตรวจสอบไดเรกทอรี C:\\ProgramData\\SamchukHospital\\Deployments\\Sam_Att\\Backups บน FILESERVER ทันที'}
            </p>
          </div>
        </div>
      )}

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
                <span className="text-[11px] font-mono-data font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Phase 2: Secure Deployment Management
                </span>
                {isDemoPayload && (
                  <span className="text-[11px] font-mono-data font-bold px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                    DEMO DATA (Preview Only)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                บริหารจัดการวงจรอัปเดต Sam_Att V2 จาก GitHub Repository (
                <span className="font-mono-data text-slate-800">
                  https://github.com/jk9krnvb6g-ai/Sam_Att
                </span>
                ) บน FILESERVER โรงพยาบาลสามชุก พร้อมระบบตรวจสอบ Deployment Manifest, Preflight 8 รายการ, Backup อัตโนมัติ, Health Check 7 จุด และ Rollback แบบปลอดภัยโดยไม่กระทบระบบจัดซื้อจัดจ้าง (Procurement)
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
              onClick={() => void handleManualRefresh()}
              disabled={loading || actionLoading !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E9E5F2] bg-white hover:bg-violet-50 text-slate-700 font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className="mt-4 p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-950 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
            <div className="font-medium">{actionFeedback}</div>
          </div>
        )}

        {/* Section 10: Safe Error Details Banner (Sanitized, no raw secrets/stack traces) */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0 flex-1">
              <div className="font-bold">
                10. รายละเอียดข้อผิดพลาดแบบปลอดภัย (Sanitized Error Details)
              </div>
              <div className="font-mono-data text-rose-800 break-words">{errorMessage}</div>
              <div className="text-[11px] text-rose-700">
                หมายเหตุ: ระบบกรองข้อมูลความลับ รหัสผ่าน และเส้นทางภายในเซิร์ฟเวอร์ออกโดยอัตโนมัติตามมาตรการความปลอดภัย
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !payload ? (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-12 flex flex-col items-center justify-center text-slate-600">
          <Loader2 className="w-8 h-8 text-violet-600 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-800">
            กำลังตรวจสอบสถานะระบบและอ่านข้อมูล Deployment Manifest จาก Central API Gateway...
          </p>
        </div>
      ) : payload ? (
        <>
          {/* SECTION 3 & 5: Check for Updates, Deployment Readiness & Actions Bar */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  3 & 5. คำสั่งควบคุมการอัปเดต และความพร้อมของระบบ (Check for Updates & Deployment Readiness)
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono-data font-bold ${
                    payload.deploymentAgent.agentStatus === 'READY'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : payload.deploymentAgent.agentStatus === 'BUSY'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  <Server className="w-3 h-3" />
                  Agent: {payload.deploymentAgent.agentStatus || 'NOT_CONFIGURED'} (
                  {payload.deploymentAgent.mode})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {/* 1. Check for Updates */}
              <button
                type="button"
                onClick={() => void handleCheckForUpdates()}
                disabled={loading || actionLoading !== null}
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
                disabled={loading || actionLoading !== null}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-900 border border-violet-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
              >
                {actionLoading === 'preflight' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-violet-700" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-violet-700" />
                )}
                <span>ตรวจสอบความพร้อม (Preflight 8 ข้อ)</span>
              </button>

              {/* 3. Approve & Deploy */}
              <button
                type="button"
                onClick={handleOpenApproveModal}
                disabled={
                  loading || actionLoading !== null || !isReadyToDeploy || !payload.deploymentAgent.approveEnabled
                }
                title={payload.deploymentAgent.lockReason}
                className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  payload.deploymentAgent.approveEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                {payload.deploymentAgent.approveEnabled ? (
                  <Play className="w-4 h-4 shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 shrink-0" />
                )}
                <span>อนุมัติและอัปเดต (Approve & Deploy)</span>
              </button>

              {/* 4. Deployment History */}
              <button
                type="button"
                onClick={handleScrollToHistory}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-[#E9E5F2] text-xs font-bold transition-all cursor-pointer"
              >
                <History className="w-4 h-4 shrink-0 text-violet-600" />
                <span>ประวัติการอัปเดต (Deployment History)</span>
              </button>

              {/* 5. Rollback */}
              <button
                type="button"
                onClick={() => handleOpenRollbackModal()}
                disabled={
                  loading || actionLoading !== null || !payload.deploymentAgent.rollbackEnabled
                }
                title={payload.deploymentAgent.lockReason}
                className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  payload.deploymentAgent.rollbackEnabled
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-2xs cursor-pointer'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>ย้อนกลับระบบ (Rollback)</span>
              </button>
            </div>

            {/* Section 5: Deployment Readiness Summary */}
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                isReadyToDeploy && payload.deploymentAgent.approveEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : failedCount > 0
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <Info className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div>
                  <span className="font-bold text-slate-900">
                    5. สถานะความพร้อมสำหรับการอัปเดต (Deployment Readiness):
                  </span>{' '}
                  <span>{payload.deploymentReadiness?.readinessMessage}</span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono-data">
                  สถานะปุ่มควบคุม: {payload.deploymentAgent.lockReason}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 1 & 2: Current Server Version & Latest GitHub Version */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  1 & 2. เปรียบเทียบเวอร์ชันเซิร์ฟเวอร์ปัจจุบัน และเวอร์ชันล่าสุดบน GitHub
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono-data ${
                    payload.versionComparison.status === 'UP_TO_DATE'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : payload.versionComparison.status === 'UPDATE_AVAILABLE'
                      ? 'bg-violet-100 text-violet-900 border border-violet-300'
                      : payload.versionComparison.status === 'ERROR'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>สถานะ: {payload.versionComparison.status}</span>
                  <span>({payload.versionComparison.statusLabel})</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 1. Current Server Version */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/60 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E9E5F2] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-violet-700" />
                    <h3 className="text-xs font-bold text-slate-900">
                      1. เวอร์ชันบนเซิร์ฟเวอร์ปัจจุบัน (Current Server Version)
                    </h3>
                  </div>
                  <span
                    className={`text-[10px] font-mono-data font-bold px-2 py-0.5 rounded ${
                      payload.currentVersion.manifestStatus === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : payload.currentVersion.manifestStatus === 'INVALID_MANIFEST'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-slate-200/70 text-slate-700'
                    }`}
                  >
                    Manifest: {payload.currentVersion.manifestStatus || 'NOT_AVAILABLE'}
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">App Version / Package</dt>
                    <dd className="font-mono-data font-bold text-slate-900 mt-0.5 break-all">
                      {payload.currentVersion.version}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Deployed Commit SHA</dt>
                    <dd className="font-mono-data font-bold text-violet-800 mt-0.5 break-all">
                      {payload.currentVersion.commitSha}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Deployed At</dt>
                    <dd className="font-mono-data font-semibold text-slate-800 mt-0.5 break-words">
                      {payload.currentVersion.deploymentDate}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-1 text-[11px] text-slate-600 font-mono-data">
                  <div>แหล่งข้อมูล: {payload.currentVersion.source}</div>
                  {payload.currentVersion.deployedBy && (
                    <div>
                      อนุมัติ Deploy ล่าสุดโดย: {payload.currentVersion.deployedBy} (Backup ID:{' '}
                      {payload.currentVersion.rollbackAvailableFrom || '-'})
                    </div>
                  )}
                  {payload.currentVersion.manifestError && (
                    <div className="text-rose-700 font-semibold">
                      ข้อสังเกต Manifest: {payload.currentVersion.manifestError}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Latest GitHub Version */}
              <div className="p-4 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/60 space-y-3">
                <div className="flex items-center justify-between border-b border-[#E9E5F2] pb-2.5">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-violet-700" />
                    <h3 className="text-xs font-bold text-slate-900">
                      2. เวอร์ชันล่าสุดบน GitHub (Latest GitHub Version)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono-data font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-800">
                    Branch: {payload.latestGitHubVersion.branch}
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Version</dt>
                    <dd className="font-mono-data font-bold text-slate-900 mt-0.5 break-all">
                      {payload.latestGitHubVersion.version}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Latest Commit SHA</dt>
                    <dd className="font-mono-data font-bold text-violet-800 mt-0.5 break-all">
                      {payload.latestGitHubVersion.commitSha}
                    </dd>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-[#E9E5F2]/80">
                    <dt className="text-[11px] text-slate-500">Commit Date</dt>
                    <dd className="font-mono-data font-semibold text-slate-800 mt-0.5 break-words">
                      {payload.latestGitHubVersion.latestCommitDate}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-1 text-[11px] text-slate-700">
                  {payload.latestGitHubVersion.commitMessage && (
                    <div className="font-mono-data bg-white px-2.5 py-1.5 rounded border border-[#E9E5F2]">
                      <span className="font-bold text-slate-900">Commit Message: </span>
                      {payload.latestGitHubVersion.commitMessage}
                    </div>
                  )}
                  <div className="text-slate-500">{payload.latestGitHubVersion.message}</div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-violet-50/70 border border-violet-200/80 text-xs text-violet-950 flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-bold">สรุปผลการเปรียบเทียบเวอร์ชัน: </span>
                <span>{payload.versionComparison.summary}</span>
              </div>
              <a
                href={payload.systemStatus.githubRepositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono-data font-bold text-violet-800 hover:underline"
              >
                <span>เปิดดู GitHub Repository</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* SECTION 4: Preflight Checklist (8 Items with Verified Evidence) */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  4. รายการตรวจสอบความพร้อมก่อนอัปเดต (Preflight Checklist — 8 รายการตามหลักฐานจริง)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-data">
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
                    {item.evidence && (
                      <div className="bg-white/90 px-2 py-1 rounded border border-slate-200/80 text-[10px] font-mono-data text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Commit: {item.evidence.commitSha}</span>
                        <span>Source: {item.evidence.evidenceSource}</span>
                        {item.evidence.artifactSha256 && (
                          <span>
                            SHA256: {item.evidence.artifactSha256.slice(0, 12)}...
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-slate-500 font-mono-data flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>
                        เวลาตรวจสอบ:{' '}
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

          {/* SECTION 7: Deployment Progress (17 Steps) & Post-Deploy Health Check (7 Checks) */}
          {(latestProgress || latestHealthCheck) && (
            <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    7. ความคืบหน้าการอัปเดต (17 ขั้นตอน) และผลตรวจสุขภาพระบบหลังอัปเดต (7 รายการ)
                  </h2>
                </div>
                {latestProgress && renderJobStatusBadge(latestProgress.status)}
              </div>

              {latestProgress && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-700 font-mono-data bg-[#F8F7FC] p-3 rounded-xl border border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
                    <span>Deployment ID: {latestProgress.deploymentId}</span>
                    <span>
                      Commit: {latestProgress.previousCommitSha || payload.currentVersion.commitSha} →{' '}
                      {latestProgress.targetCommitSha}
                    </span>
                    <span>
                      ขั้นตอนที่ {latestProgress.currentStepNumber ?? latestProgress.currentStep} /{' '}
                      {latestProgress.totalSteps}:{' '}
                      {latestProgress.currentStepLabel || latestProgress.stepLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {latestProgress.steps.map((s) => (
                      <div
                        key={s.stepNumber ?? s.step}
                        className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                          s.status === 'COMPLETED'
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                            : s.status === 'FAILED'
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : s.status === 'RUNNING' || s.status === 'IN_PROGRESS'
                            ? 'bg-violet-50 border-violet-300 text-violet-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <span className="font-mono-data font-bold shrink-0">
                          #{s.stepNumber ?? s.step}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{s.label}</div>
                          {s.detail && (
                            <div className="text-[10px] font-mono-data mt-0.5 break-words opacity-85">
                              {s.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latestHealthCheck && (
                <div className="pt-3 border-t border-[#E9E5F2] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-violet-600" />
                      <span>
                        ผลการตรวจสุขภาพระบบหลังอัปเดต (Post-Deploy Health Check 7 จุด)
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-mono-data font-bold ${
                        (latestHealthCheck.overallHealthy ?? latestHealthCheck.allPassed)
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {latestHealthCheck.summary}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {latestHealthCheck.items.map((hc) => {
                      const isOk = Boolean(hc.healthy ?? hc.passed);
                      return (
                        <div
                          key={hc.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                            isOk
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-rose-50/60 border-rose-200'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-900">{hc.label}</div>
                            <div className="text-[11px] font-mono-data text-slate-600 mt-0.5">
                              {hc.detail}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono-data font-bold shrink-0 ${
                              isOk
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isOk ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 8: Deployment History (All 11 Required Columns) */}
          <div
            ref={historySectionRef}
            className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-violet-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  8. ประวัติการอัปเดตและย้อนกลับระบบ (Deployment History)
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">
                แสดงเฉพาะการสั่ง Deploy และ Rollback จริง (ไม่รวมการกด Check for Updates หรือ Preflight)
              </span>
            </div>

            {payload.history.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                ยังไม่มีประวัติการสั่ง Deploy หรือ Rollback ในระบบ (การกด Check for Updates จะบันทึกแยกใน Audit Log โดยไม่แสดงเป็นประวัติการ Deploy)
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-bold whitespace-nowrap">
                      <th className="py-2.5 px-3">1. Deployment ID</th>
                      <th className="py-2.5 px-3">2. Previous SHA</th>
                      <th className="py-2.5 px-3">3. Target SHA</th>
                      <th className="py-2.5 px-3">4. Approved By</th>
                      <th className="py-2.5 px-3">5. Started At</th>
                      <th className="py-2.5 px-3">6. Finished At</th>
                      <th className="py-2.5 px-3">7. Status</th>
                      <th className="py-2.5 px-3">8. Backup ID</th>
                      <th className="py-2.5 px-3">9. Preflight</th>
                      <th className="py-2.5 px-3">10. Health Check</th>
                      <th className="py-2.5 px-3">11. สรุปผล / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E5F2]">
                    {payload.history.map((h) => (
                      <tr key={h.id} className="hover:bg-violet-50/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono-data font-bold text-slate-900 whitespace-nowrap">
                          {h.deploymentId || h.id}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-700 whitespace-nowrap">
                          {h.previousCommitSha || 'NOT_AVAILABLE'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-bold text-violet-800 whitespace-nowrap">
                          {h.targetCommitSha || h.versionOrCommit}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                          {h.approvedBy || h.actorName}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600 whitespace-nowrap">
                          {h.startedAt
                            ? new Date(h.startedAt).toLocaleString('th-TH')
                            : new Date(h.deployedAt).toLocaleString('th-TH')}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600 whitespace-nowrap">
                          {h.finishedAt
                            ? new Date(h.finishedAt).toLocaleString('th-TH')
                            : new Date(h.deployedAt).toLocaleString('th-TH')}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {renderJobStatusBadge(h.status)}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-700 whitespace-nowrap">
                          {h.backupId || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600 whitespace-nowrap">
                          {h.preflightSummary || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600 whitespace-nowrap">
                          {h.healthCheckSummary || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 min-w-[220px]">
                          <div>{h.summary}</div>
                          {h.errorSummary && (
                            <div className="text-[11px] font-mono-data text-rose-700 mt-0.5">
                              {h.errorSummary}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Available Backups & Agent Security Card */}
          <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-2xl p-4 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <Terminal className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-slate-800">
                  สถาปัตยกรรมความปลอดภัย Deployment Agent (Windows Named Pipe IPC — Zero New TCP Ports)
                </div>
                <p className="text-[11px] leading-relaxed">
                  เชื่อมต่อผ่าน Named Pipe{' '}
                  <code className="font-mono-data text-violet-800">
                    \\.\pipe\SamchukSamAttDeploymentAgent_v2
                  </code>{' '}
                  พร้อมการยืนยันตัวตน HMAC-SHA256 และรหัสผ่าน ADMIN ซ้ำทุกครั้ง ห้ามรับคำสั่ง Shell อิสระจากเว็บ และป้องกันการรีสตาร์ท Shared Central API Gateway (:3002) โดยไม่ตั้งใจเพื่อคุ้มครองระบบจัดซื้อจัดจ้าง (Procurement)
                </p>
              </div>
            </div>
            <div className="shrink-0 font-mono-data text-[11px] bg-white px-3 py-2 rounded-xl border border-[#E9E5F2]">
              จำนวน Backup ที่พร้อมย้อนกลับ:{' '}
              <span className="font-bold text-violet-800">
                {payload.availableBackups?.length || 0} รายการ
              </span>
            </div>
          </div>
        </>
      ) : null}

      {/* SECTION 6: Approve & Deploy Modal */}
      {showApproveModal && payload && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E5F2] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#E9E5F2] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Rocket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    6. ยืนยันการอนุมัติอัปเดตระบบ (Approve & Deploy Modal)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    กรุณาตรวจสอบ Commit SHA และยืนยันรหัสผ่านผู้ดูแลระบบ (ADMIN Re-Authentication)
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => void handleConfirmApproveDeployment(e)} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] space-y-1.5 text-xs font-mono-data">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Server SHA:</span>
                  <span className="font-bold text-slate-800">
                    {payload.currentVersion.commitSha}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Target GitHub SHA:</span>
                  <span className="font-bold text-violet-800">
                    {payload.latestGitHubVersion.commitSha}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Preflight Status:</span>
                  <span className={`font-bold ${isReadyToDeploy ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {isReadyToDeploy ? 'PASS' : 'NOT READY'} {passedCount}/{payload.checklist.length} รายการ
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  รหัสผ่านผู้ดูแลระบบ (ADMIN Password Re-Authentication) *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={approvePassword}
                    onChange={(e) => setApprovePassword(e.target.value)}
                    placeholder="กรอกรหัสผ่าน ADMIN เพื่อยืนยันคำสั่ง Deploy"
                    className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-violet-600"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
                ระบบจะติดตั้งเมื่อยืนยันได้ว่าอัปเดตเฉพาะ Sam_Att โดยไม่รีสตาร์ท Gateway เท่านั้น
                หากยังไม่พร้อม ระบบจะหยุดที่ MAINTENANCE_REQUIRED เพื่อให้ผู้ดูแลเตรียมการใน Maintenance Window
              </div>

              {approveModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-mono-data">
                  {approveModalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E5F2]">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(false)}
                  disabled={actionLoading === 'approve-deploy'}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'approve-deploy'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'approve-deploy' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>ยืนยันอนุมัติและเริ่ม Deploy</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 9: Rollback Modal */}
      {showRollbackModal && payload && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E5F2] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#E9E5F2] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    9. ย้อนกลับระบบไปยังเวอร์ชันสำรอง (Rollback Modal)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    กู้คืน Frontend, Backend Artifact และ current.json จากชุดสำรองข้อมูลที่ผ่านการตรวจ SHA-256
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => void handleConfirmRollback(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  เลือกชุดข้อมูลสำรอง (Verified Backup ID) *
                </label>
                {payload.availableBackups && payload.availableBackups.length > 0 ? (
                  <select
                    value={selectedBackupId}
                    onChange={(e) => setSelectedBackupId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono-data rounded-xl border border-slate-300 focus:outline-none focus:border-violet-600"
                  >
                    {payload.availableBackups.map((b) => (
                      <option key={b.backupId} value={b.backupId}>
                        {b.backupId} (Commit: {b.previousCommitSha} |{' '}
                        {new Date(b.createdAt).toLocaleString('th-TH')})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={selectedBackupId}
                      onChange={(e) => setSelectedBackupId(e.target.value)}
                      placeholder="ระบุรหัส Backup ID เช่น BKP-20261112-..."
                      className="w-full px-3 py-2 text-xs font-mono-data rounded-xl border border-slate-300"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  สาเหตุการสั่งย้อนกลับ (Rollback Reason)
                </label>
                <input
                  type="text"
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  placeholder="ระบุเหตุผลในการย้อนกลับเพื่อบันทึกใน Audit Log"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-violet-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  รหัสผ่านผู้ดูแลระบบ (ADMIN Password Re-Authentication) *
                </label>
                <input
                  type="password"
                  value={rollbackPassword}
                  onChange={(e) => setRollbackPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน ADMIN เพื่อยืนยันคำสั่ง Rollback"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-violet-600"
                  required
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmRollbackChecked}
                  onChange={(e) => setConfirmRollbackChecked(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400"
                />
                <span className="font-semibold">
                  ข้าพเจ้ายืนยันการย้อนกลับระบบ (Rollback) ไปยัง Backup ID ที่เลือก และรับทราบว่าระบบจะตรวจสอบ Health Check ซ้ำทันทีหลังกู้คืน
                </span>
              </label>

              {rollbackModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-mono-data">
                  {rollbackModalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E5F2]">
                <button
                  type="button"
                  onClick={() => setShowRollbackModal(false)}
                  disabled={actionLoading === 'rollback'}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'rollback'}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {actionLoading === 'rollback' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>ยืนยันย้อนกลับเวอร์ชัน (Execute Rollback)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
