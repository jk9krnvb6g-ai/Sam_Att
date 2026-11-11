import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  apiAttendanceAdapter,
  DashboardSummaryResponse,
  extractSafeErrorMessage,
} from '../services/apiAttendanceAdapter';
import {
  AttendanceRecord,
  AuditLogEntry,
  HosOfficePushBatch,
  Personnel,
  RawScanEvent,
} from '../types/attendance';
import { AttendanceStatusBadge, RoleBadge } from '../components/common/StatusBadge';
import { NavItemKey } from '../components/layout/Sidebar';
import {
  DashboardDetailModal,
  DashboardModalPayload,
  GroupExecutiveRow,
  PersonnelRankRow,
  ScannerUsageStat,
} from '../components/dashboard/DashboardDetailModal';
import {
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Send,
  Activity,
  ArrowRight,
  Fingerprint,
  Database,
  RefreshCw,
  Award,
  Search,
  ChevronRight,
  ArrowUpDown,
  BarChart3,
  Layers,
  ShieldCheck,
  FileSearch,
  Sparkles,
  Calendar,
  Building2,
  XCircle,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (key: NavItemKey) => void;
}

type DateScopeMode = 'TODAY' | 'MONTH' | 'YEAR' | 'CUSTOM';
type PersonnelRankTab = 'ON_TIME' | 'LATE_FREQ' | 'LATE_MINS' | 'INCOMPLETE';
type PageSizeOption = 10 | 25 | 50 | 100 | 'ALL';

function getTodayBangkokDateStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const todayStr = useMemo(() => getTodayBangkokDateStr(), []);

  // 1. Date & Filter Controls
  const [dateMode, setDateMode] = useState<DateScopeMode>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(todayStr.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState<string>(todayStr.slice(0, 4));
  const [customFrom, setCustomFrom] = useState<string>(`${todayStr.slice(0, 8)}01`);
  const [customTo, setCustomTo] = useState<string>(todayStr);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');

  // 2. Real API State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryResponse | null>(null);
  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([]);
  const [rawAttendance, setRawAttendance] = useState<AttendanceRecord[]>([]);
  const [rawScansList, setRawScansList] = useState<RawScanEvent[]>([]);
  const [pushHistory, setPushHistory] = useState<HosOfficePushBatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // 3. Drill-Down Modal State
  const [activeModal, setActiveModal] = useState<DashboardModalPayload | null>(null);

  // 4. Personnel Ranking Section State
  const [rankTab, setRankTab] = useState<PersonnelRankTab>('ON_TIME');
  const [rankSearch, setRankSearch] = useState<string>('');
  const [rankSortField, setRankSortField] = useState<'primary' | 'name' | 'workDays'>('primary');
  const [rankSortDir, setRankSortDir] = useState<'asc' | 'desc'>('desc');
  const [rankPageSize, setRankPageSize] = useState<PageSizeOption>(10);
  const [rankPage, setRankPage] = useState<number>(1);

  // 5. Group Summary Table State
  const [groupSearch, setGroupSearch] = useState<string>('');
  const [groupSortField, setGroupSortField] = useState<
    'groupName' | 'headcount' | 'onTimePct' | 'lateCount' | 'lateMins' | 'incompleteCount'
  >('onTimePct');
  const [groupSortDir, setGroupSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupPageSize, setGroupPageSize] = useState<PageSizeOption>(10);

  // 6. Recent Activity Log Filter State
  const [logSearch, setLogSearch] = useState<string>('');
  const [logPageSize, setLogPageSize] = useState<PageSizeOption>(10);

  // Compute effective [fromDate, toDate] and Thai label
  const dateScope = useMemo(() => {
    if (dateMode === 'TODAY') {
      return {
        from: selectedDate,
        to: selectedDate,
        label: `รายวัน (${selectedDate})`,
      };
    }
    if (dateMode === 'MONTH') {
      return {
        from: `${selectedMonth}-01`,
        to: `${selectedMonth}-31`,
        label: `รายเดือน (${selectedMonth})`,
      };
    }
    if (dateMode === 'YEAR') {
      return {
        from: `${selectedYear}-01-01`,
        to: `${selectedYear}-12-31`,
        label: `รายปี (${selectedYear})`,
      };
    }
    return {
      from: customFrom,
      to: customTo,
      label: `ช่วงวันที่ (${customFrom} ถึง ${customTo})`,
    };
  }, [dateMode, selectedDate, selectedMonth, selectedYear, customFrom, customTo]);

  // Load real data from Backend API endpoints (§8)
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);

    try {
      const summaryWorkDate = dateMode === 'TODAY' ? selectedDate : dateScope.to;
      const [
        summaryRes,
        personnelList,
        attendanceList,
        scansList,
        pushRes,
        logsRes,
      ] = await Promise.all([
        apiAttendanceAdapter.fetchDashboardSummary(summaryWorkDate),
        apiAttendanceAdapter.fetchAllPersonnel(),
        apiAttendanceAdapter.fetchAllAttendance({
          fromDate: dateScope.from,
          toDate: dateScope.to,
        }),
        apiAttendanceAdapter.fetchAllRawScans({
          fromDate: dateScope.from,
          toDate: dateScope.to,
        }),
        apiAttendanceAdapter.fetchPushHistory(),
        apiAttendanceAdapter.fetchSystemLogs(100),
      ]);

      setDashboardSummary(summaryRes);
      setAllPersonnel(personnelList || []);
      setRawAttendance(attendanceList || []);
      setRawScansList(scansList || []);
      setPushHistory(pushRes || []);
      setAuditLogs(logsRes || []);
      setLastUpdatedAt(
        new Date().toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err) {
      setApiError(
        extractSafeErrorMessage(
          err,
          'ไม่สามารถดึงข้อมูลจาก Central API Gateway (/api/Sam_Att/*) ได้'
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [dateMode, selectedDate, dateScope.from, dateScope.to]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // Distinct Hospital Groups (กลุ่มงาน)
  const hospitalGroups = useMemo(() => {
    return Array.from(new Set(allPersonnel.map((p) => p.groupName)));
  }, [allPersonnel]);

  // Filtered Personnel & Attendance by Group
  const scopedPersonnel = useMemo(() => {
    const active = allPersonnel.filter((p) => p.active);
    if (selectedGroupFilter === 'ALL') return active;
    return active.filter((p) => p.groupName === selectedGroupFilter);
  }, [allPersonnel, selectedGroupFilter]);

  const scopedAttendance = useMemo(() => {
    if (selectedGroupFilter === 'ALL') return rawAttendance;
    return rawAttendance.filter((a) => a.groupName === selectedGroupFilter);
  }, [rawAttendance, selectedGroupFilter]);

  // Derived Records for KPI Cards (uses authoritative /dashboard/summary when viewing hospital-wide TODAY)
  const kpiBuckets = useMemo(() => {
    const normalRecs = scopedAttendance.filter((a) => a.status === 'NORMAL');
    const lateRecs = scopedAttendance.filter((a) => a.status === 'LATE');
    const missingCheckoutRecs = scopedAttendance.filter(
      (a) => a.status === 'MISSING_CHECKOUT' || a.hasMissingCheckout
    );
    const noScanRecs = scopedAttendance.filter((a) => a.status === 'NO_SCAN');
    const unmappedRecs = scopedAttendance.filter(
      (a) => a.status === 'PENDING_MAPPING' || a.status === 'NO_SCHEDULE'
    );
    const pushedRecs = scopedAttendance.filter((a) => a.isPushedToHosOffice);
    const pendingPushRecs = scopedAttendance.filter((a) => !a.isPushedToHosOffice);

    const useBackendSummary =
      dateMode === 'TODAY' &&
      selectedGroupFilter === 'ALL' &&
      dashboardSummary?.workDate === selectedDate;

    const totalPersonnel = useBackendSummary
      ? dashboardSummary.totalPersonnel
      : scopedPersonnel.length;
    const totalShifts = useBackendSummary
      ? dashboardSummary.totalShiftsToday
      : scopedAttendance.length;
    const totalLateMinutes = useBackendSummary
      ? dashboardSummary.totalLateMinutes
      : lateRecs.reduce((sum, r) => sum + r.lateMinutes, 0);

    const pct = (count: number) =>
      totalShifts > 0 ? Math.round((count / totalShifts) * 1000) / 10 : 0;

    return {
      totalPersonnel,
      totalShifts,
      normalRecs,
      normalPct: pct(normalRecs.length),
      lateRecs,
      latePct: pct(lateRecs.length),
      totalLateMinutes,
      missingCheckoutRecs,
      missingCheckoutPct: pct(missingCheckoutRecs.length),
      noScanRecs,
      noScanPct: pct(noScanRecs.length),
      unmappedRecs,
      pushedRecs,
      pendingPushRecs,
    };
  }, [scopedPersonnel, scopedAttendance, dateMode, selectedGroupFilter, dashboardSummary, selectedDate]);

  // Scanner Device Usage Stats derived strictly from real rawScansList
  const scannerStats: ScannerUsageStat[] = useMemo(() => {
    const fingleMap = new Map<number, Personnel>();
    allPersonnel.forEach((p) => {
      if (p.fingleId > 0) fingleMap.set(p.fingleId, p);
    });

    const totalScans = rawScansList.length;
    const distinctMachines = Array.from(
      new Set(rawScansList.map((s) => s.machineNo))
    ).sort((a, b) => a - b);

    return distinctMachines.map((machineNo) => {
      const devScans = rawScansList.filter((s) => s.machineNo === machineNo);
      const inCount = devScans.filter((s) => s.inOutMode === 0).length;
      const outCount = devScans.filter((s) => s.inOutMode !== 0).length;
      const mappedCount = devScans.filter((s) => fingleMap.has(s.enrollNumber)).length;
      const unmappedCount = devScans.length - mappedCount;
      const sharePct = totalScans > 0 ? Math.round((devScans.length / totalScans) * 1000) / 10 : 0;

      return {
        machineNo,
        name: `เครื่องสแกนหมายเลข #${machineNo}`,
        ip: '-',
        totalScans: devScans.length,
        inCount,
        outCount,
        mappedCount,
        unmappedCount,
        sharePct,
        scans: devScans,
      };
    });
  }, [rawScansList, allPersonnel]);

  // Latest Sync telemetry derived from real system logs and personnel sync timestamps
  const syncTelemetry = useMemo(() => {
    const latestScannerAudit = auditLogs.find((l) => l.action === 'INGEST_RAW_SCANS');
    const latestHosAudit = auditLogs.find((l) => l.action === 'SYNC_HOSOFFICE_PERSONNEL');
    const latestPersonnelSync = allPersonnel
      .map((p) => p.lastHosOfficeSync)
      .filter(Boolean)
      .sort()
      .reverse()[0];

    return {
      scannerSyncTimestamp:
        latestScannerAudit?.timestamp ||
        (rawScansList[0]?.importedAt ? rawScansList[0].importedAt : 'ยังไม่มีประวัติการดึงสแกน'),
      scannerSyncSummary:
        latestScannerAudit?.summary ||
        `ข้อมูลสแกนดิบในระบบ ${rawScansList.length.toLocaleString()} รายการ`,
      hosOfficeSyncTimestamp:
        latestHosAudit?.timestamp ||
        latestPersonnelSync ||
        'ยังไม่มีประวัติการซิงค์ HOSOffice',
      hosOfficeSyncSummary:
        latestHosAudit?.summary ||
        `บุคลากรที่เปิดใช้งานในฐานข้อมูล ${allPersonnel.filter((p) => p.active).length} ราย`,
    };
  }, [auditLogs, rawScansList, allPersonnel]);

  // Personnel Ranking Rows (Aggregated per Person over scopedAttendance)
  const allPersonnelRankRows: PersonnelRankRow[] = useMemo(() => {
    const map = new Map<string, PersonnelRankRow>();

    scopedPersonnel.forEach((p) => {
      map.set(p.personId, {
        personId: p.personId,
        fingleId: p.fingleId,
        fullName: `${p.prefix}${p.firstName} ${p.lastName}`,
        position: p.position,
        department: p.department,
        groupName: p.groupName,
        personnelType: p.personnelType,
        totalWorkDays: 0,
        normalCount: 0,
        lateCount: 0,
        totalLateMinutes: 0,
        incompleteCount: 0,
        onTimeRatePct: 0,
        records: [],
      });
    });

    scopedAttendance.forEach((rec) => {
      let row = map.get(rec.personId);
      if (!row && rec.personId !== 'UNMAPPED') {
        row = {
          personId: rec.personId,
          fingleId: rec.fingleId,
          fullName: rec.fullName,
          position: 'บุคลากรโรงพยาบาล',
          department: rec.department,
          groupName: rec.groupName,
          personnelType: rec.personnelType,
          totalWorkDays: 0,
          normalCount: 0,
          lateCount: 0,
          totalLateMinutes: 0,
          incompleteCount: 0,
          onTimeRatePct: 0,
          records: [],
        };
        map.set(rec.personId, row);
      }
      if (!row) return;

      row.totalWorkDays += 1;
      row.records.push(rec);

      if (rec.status === 'NORMAL') {
        row.normalCount += 1;
      } else if (rec.status === 'LATE') {
        row.lateCount += 1;
        row.totalLateMinutes += rec.lateMinutes;
      }

      if (
        rec.status === 'MISSING_CHECKOUT' ||
        rec.status === 'NO_SCAN' ||
        rec.hasMissingCheckout
      ) {
        row.incompleteCount += 1;
      }
    });

    map.forEach((row) => {
      row.onTimeRatePct =
        row.totalWorkDays > 0
          ? Math.round((row.normalCount / row.totalWorkDays) * 1000) / 10
          : 0;
    });

    return Array.from(map.values()).filter((r) => r.totalWorkDays > 0);
  }, [scopedPersonnel, scopedAttendance]);

  // Filtered & Sorted Ranking Rows based on active tab
  const displayedRankRows = useMemo(() => {
    const q = rankSearch.trim().toLowerCase();
    let list = allPersonnelRankRows.filter((r) => {
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.groupName.toLowerCase().includes(q) ||
        r.personId.toLowerCase().includes(q) ||
        String(r.fingleId).includes(q)
      );
    });

    if (rankTab === 'LATE_FREQ' || rankTab === 'LATE_MINS') {
      list = list.filter((r) => r.lateCount > 0);
    } else if (rankTab === 'INCOMPLETE') {
      list = list.filter((r) => r.incompleteCount > 0);
    }

    list.sort((a, b) => {
      const dir = rankSortDir === 'desc' ? -1 : 1;
      if (rankSortField === 'name') {
        return a.fullName.localeCompare(b.fullName, 'th') * dir;
      }
      if (rankSortField === 'workDays') {
        return (a.totalWorkDays - b.totalWorkDays) * dir;
      }

      if (rankTab === 'ON_TIME') {
        if (a.onTimeRatePct !== b.onTimeRatePct) {
          return (a.onTimeRatePct - b.onTimeRatePct) * dir;
        }
        if (a.normalCount !== b.normalCount) {
          return (a.normalCount - b.normalCount) * dir;
        }
        return (b.totalLateMinutes - a.totalLateMinutes) * dir;
      }
      if (rankTab === 'LATE_FREQ') {
        if (a.lateCount !== b.lateCount) {
          return (a.lateCount - b.lateCount) * dir;
        }
        return (a.totalLateMinutes - b.totalLateMinutes) * dir;
      }
      if (rankTab === 'LATE_MINS') {
        if (a.totalLateMinutes !== b.totalLateMinutes) {
          return (a.totalLateMinutes - b.totalLateMinutes) * dir;
        }
        return (a.lateCount - b.lateCount) * dir;
      }
      if (a.incompleteCount !== b.incompleteCount) {
        return (a.incompleteCount - b.incompleteCount) * dir;
      }
      return (a.lateCount - b.lateCount) * dir;
    });

    return list;
  }, [allPersonnelRankRows, rankTab, rankSearch, rankSortField, rankSortDir]);

  const paginatedRankRows = useMemo(() => {
    if (rankPageSize === 'ALL') return displayedRankRows;
    const start = (rankPage - 1) * rankPageSize;
    return displayedRankRows.slice(start, start + rankPageSize);
  }, [displayedRankRows, rankPage, rankPageSize]);

  // Executive Group Summary Rows (สรุปภาพรวมรายกลุ่มงาน)
  const groupSummaryRows: GroupExecutiveRow[] = useMemo(() => {
    const groupsToSummarize =
      selectedGroupFilter === 'ALL' ? hospitalGroups : [selectedGroupFilter];

    const rows: GroupExecutiveRow[] = groupsToSummarize.map((gName) => {
      const gPersonnel = allPersonnel.filter((p) => p.active && p.groupName === gName);
      const gRecords = rawAttendance.filter((a) => a.groupName === gName);
      const normalCount = gRecords.filter((a) => a.status === 'NORMAL').length;
      const lateRecs = gRecords.filter((a) => a.status === 'LATE');
      const lateCount = lateRecs.length;
      const totalLateMinutes = lateRecs.reduce((s, r) => s + r.lateMinutes, 0);
      const incompleteCount = gRecords.filter(
        (a) =>
          a.status === 'MISSING_CHECKOUT' ||
          a.status === 'NO_SCAN' ||
          a.hasMissingCheckout
      ).length;
      const totalShifts = gRecords.length;
      const onTimePct =
        totalShifts > 0 ? Math.round((normalCount / totalShifts) * 1000) / 10 : 0;

      return {
        groupName: gName,
        headcount: gPersonnel.length,
        totalShifts,
        normalCount,
        onTimePct,
        lateCount,
        totalLateMinutes,
        incompleteCount,
        records: gRecords,
      };
    });

    const q = groupSearch.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || r.groupName.toLowerCase().includes(q));

    filtered.sort((a, b) => {
      const dir = groupSortDir === 'desc' ? -1 : 1;
      if (groupSortField === 'groupName') {
        return a.groupName.localeCompare(b.groupName, 'th') * dir;
      }
      if (groupSortField === 'headcount') return (a.headcount - b.headcount) * dir;
      if (groupSortField === 'onTimePct') return (a.onTimePct - b.onTimePct) * dir;
      if (groupSortField === 'lateCount') return (a.lateCount - b.lateCount) * dir;
      if (groupSortField === 'lateMins') {
        return (a.totalLateMinutes - b.totalLateMinutes) * dir;
      }
      return (a.incompleteCount - b.incompleteCount) * dir;
    });

    return groupPageSize === 'ALL' ? filtered : filtered.slice(0, groupPageSize);
  }, [
    selectedGroupFilter,
    hospitalGroups,
    allPersonnel,
    rawAttendance,
    groupSearch,
    groupSortField,
    groupSortDir,
    groupPageSize,
  ]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    const list = auditLogs.filter(
      (l) =>
        !q ||
        l.summary.toLowerCase().includes(q) ||
        (l.actor || l.actorName).toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
    );
    return logPageSize === 'ALL' ? list : list.slice(0, logPageSize);
  }, [auditLogs, logSearch, logPageSize]);

  // Toggle sort helpers
  const toggleRankSort = (field: 'primary' | 'name' | 'workDays') => {
    if (rankSortField === field) {
      setRankSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setRankSortField(field);
      setRankSortDir('desc');
    }
    setRankPage(1);
  };

  const toggleGroupSort = (
    field:
      | 'groupName'
      | 'headcount'
      | 'onTimePct'
      | 'lateCount'
      | 'lateMins'
      | 'incompleteCount'
  ) => {
    if (groupSortField === field) {
      setGroupSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setGroupSortField(field);
      setGroupSortDir('desc');
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* =====================================================================
          SECTION 1: EXECUTIVE HEADER & GLOBAL DATE / GROUP SCOPE BAR
      ===================================================================== */}
      <div className="bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E9E5F2]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                Executive Attendance Command Center
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono-data">
                <ShieldCheck className="w-3.5 h-3.5" />
                Real Database API (`/api/Sam_Att/*`)
              </span>
              {lastUpdatedAt && (
                <span className="text-[11px] font-mono-data text-slate-500">
                  อัปเดตล่าสุด: {lastUpdatedAt} น.
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
              ภาพรวมการปฏิบัติงานบุคลากรโรงพยาบาลสามชุก (Sam_Att V2 Dashboard)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              คลิกที่การ์ดสรุปตัวเลข แถบสถานะ รายชื่อบุคลากร หรือกลุ่มงาน เพื่อเปิดหน้าต่างตรวจสอบรายการจริงระดับแถวข้อมูล (Interactive Drill-Down)
            </p>
          </div>

          {/* Right Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void loadDashboardData();
              }}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              รีเฟรชข้อมูลจริง
            </button>

            <button
              onClick={() => onNavigate('attendance-review')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <FileSearch className="w-3.5 h-3.5 text-purple-700" />
              หน้าตรวจสอบและ Reprocess
            </button>
          </div>
        </div>

        {/* Filter Bar: Date Scope + Group Scope */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Date Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 mr-1">
              <Calendar className="w-4 h-4 text-purple-600" />
              ช่วงเวลาที่แสดงผล:
            </div>
            <div className="inline-flex rounded-xl bg-[#F8F7FC] p-1 border border-[#E9E5F2]">
              {(
                [
                  { id: 'TODAY', label: 'รายวัน (วันนี้)' },
                  { id: 'MONTH', label: 'รายเดือน' },
                  { id: 'YEAR', label: 'รายปี' },
                  { id: 'CUSTOM', label: 'กำหนดช่วงวันที่' },
                ] as { id: DateScopeMode; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateMode(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    dateMode === tab.id
                      ? 'bg-purple-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-purple-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dynamic Date Input */}
            {dateMode === 'TODAY' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono-data rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800 focus:outline-hidden focus:border-purple-500"
              />
            )}
            {dateMode === 'MONTH' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono-data rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800 focus:outline-hidden focus:border-purple-500"
              />
            )}
            {dateMode === 'YEAR' && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono-data rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800 focus:outline-hidden focus:border-purple-500"
              >
                <option value="2026">ปี พ.ศ. 2569 (2026)</option>
                <option value="2025">ปี พ.ศ. 2568 (2025)</option>
              </select>
            )}
            {dateMode === 'CUSTOM' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono-data rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800"
                />
                <span className="text-xs text-slate-400">ถึง</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono-data rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800"
                />
              </div>
            )}
          </div>

          {/* Hospital Group Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
              <Building2 className="w-4 h-4 text-purple-600" />
              กรองตามกลุ่มงาน:
            </div>
            <select
              value={selectedGroupFilter}
              onChange={(e) => {
                setSelectedGroupFilter(e.target.value);
                setRankPage(1);
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-slate-800 focus:outline-hidden focus:border-purple-500"
            >
              <option value="ALL">ทุกกลุ่มงานในโรงพยาบาล ({allPersonnel.length} คน)</option>
              {hospitalGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* =====================================================================
          STATE HANDLING: LOADING / ERROR / EMPTY / NORMAL
      ===================================================================== */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-[#E9E5F2] p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">
              กำลังโหลดข้อมูลเวลาปฏิบัติงานและสถิติเครื่องสแกนจากฐานข้อมูล...
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              กำลังดึงข้อมูลจาก `/api/Sam_Att/dashboard/summary`, `/api/Sam_Att/attendance` และ `/api/Sam_Att/raw-scans`
            </p>
          </div>
        </div>
      )}

      {!isLoading && apiError && (
        <div className="bg-rose-50 rounded-2xl border border-rose-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-rose-900">
            ไม่สามารถดึงข้อมูลจาก Central API Gateway (:3002/api/Sam_Att/)
          </h3>
          <p className="text-xs text-rose-700 max-w-lg mx-auto">
            {apiError}
          </p>
          <button
            onClick={() => {
              void loadDashboardData();
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
          >
            ลองเชื่อมต่อใหม่อีกครั้ง (Retry)
          </button>
        </div>
      )}

      {!isLoading && !apiError && kpiBuckets.totalShifts === 0 && (
        <div className="bg-white rounded-2xl border border-[#E9E5F2] p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            ไม่พบรายการประเมินเวลาปฏิบัติงานในช่วงเวลา {dateScope.label}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            บุคลากรที่ลงทะเบียนในระบบ: {dashboardSummary?.totalActivePersonnel ?? allPersonnel.length} คน · สแกนดิบในฐานข้อมูล: {dashboardSummary?.rawScansTotalCount ?? rawScansList.length} รายการ
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => onNavigate('attendance-review')}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer"
            >
              ไปที่หน้าตรวจสอบบันทึกเวลา / Reprocess
            </button>
          </div>
        </div>
      )}

      {!isLoading && !apiError && kpiBuckets.totalShifts > 0 && (
        <>
          {/* =================================================================
              SECTION 2: 6 INTERACTIVE KPI SUMMARY CARDS (CLICK FOR MODAL)
          ================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Card 1: Total Personnel & Shifts */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'KPI_RECORDS',
                  title: 'รายการปฏิบัติงานทั้งหมดในช่วงเวลาที่เลือก',
                  subtitle: `${dateScope.label} · จำนวน ${kpiBuckets.totalPersonnel} บุคลากร (${kpiBuckets.totalShifts} กะการทำงาน)`,
                  badgeColor: 'purple',
                  records: scopedAttendance,
                })
              }
              className="group bg-white rounded-2xl border border-[#E9E5F2] hover:border-purple-400 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    บุคลากร / กะทั้งหมด
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono-data text-slate-900">
                    {kpiBuckets.totalPersonnel}
                  </span>
                  <span className="text-xs text-slate-500">คน</span>
                  <span className="text-xs font-mono-data text-purple-700 font-semibold ml-1">
                    ({kpiBuckets.totalShifts} กะ)
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-purple-700 font-semibold">
                <span>คลิกดูรายชื่อทั้งหมด</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 2: Normal / On-Time */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'KPI_RECORDS',
                  title: 'บุคลากรที่เข้าปฏิบัติงานตรงเวลา (NORMAL)',
                  subtitle: `${dateScope.label} · คิดเป็น ${kpiBuckets.normalPct}% ของกะทั้งหมด`,
                  badgeColor: 'emerald',
                  records: kpiBuckets.normalRecs,
                })
              }
              className="group bg-white rounded-2xl border border-[#E9E5F2] hover:border-emerald-400 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    มาตรงเวลา (NORMAL)
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono-data text-emerald-700">
                    {kpiBuckets.normalRecs.length}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono-data text-xs font-bold">
                    {kpiBuckets.normalPct}%
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-700 font-semibold">
                <span>สแกนภายใน Grace Period</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 3: Late */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'KPI_RECORDS',
                  title: 'รายการเข้าปฏิบัติงานสาย (LATE)',
                  subtitle: `${dateScope.label} · รวมเวลามาสายทั้งสิ้น ${kpiBuckets.totalLateMinutes.toLocaleString()} นาที`,
                  badgeColor: 'amber',
                  records: kpiBuckets.lateRecs,
                })
              }
              className="group bg-white rounded-2xl border border-[#E9E5F2] hover:border-amber-400 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    มาสาย (LATE)
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono-data text-amber-700">
                    {kpiBuckets.lateRecs.length}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 font-mono-data text-xs font-bold">
                    {kpiBuckets.latePct}%
                  </span>
                  <span className="text-[11px] font-mono-data text-amber-700">
                    ({kpiBuckets.totalLateMinutes} นาที)
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-amber-700 font-semibold">
                <span>คลิกดูรายชื่อและนาทีสาย</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 4: Missing Checkout */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'KPI_RECORDS',
                  title: 'รายการสแกนไม่ครบ / ไม่พบเวลาออก (MISSING_CHECKOUT)',
                  subtitle: `${dateScope.label} · มีเวลาเข้างานแต่ยังไม่มีสแกนออกเมื่อจบกะ`,
                  badgeColor: 'orange',
                  records: kpiBuckets.missingCheckoutRecs,
                })
              }
              className="group bg-white rounded-2xl border border-[#E9E5F2] hover:border-orange-400 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    ไม่สแกนออก (MISSING_OUT)
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono-data text-orange-700">
                    {kpiBuckets.missingCheckoutRecs.length}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-800 font-mono-data text-xs font-bold">
                    {kpiBuckets.missingCheckoutPct}%
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-orange-700 font-semibold">
                <span>รอสแกนออก / บันทึกหมายเหตุ</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 5: No Scan */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'KPI_RECORDS',
                  title: 'รายการไม่พบข้อมูลสแกนในกะที่ได้รับมอบหมาย (NO_SCAN)',
                  subtitle: `${dateScope.label} · มีตารางเวรแต่ไม่พบสแกนทั้งเข้าและออก`,
                  badgeColor: 'rose',
                  records: kpiBuckets.noScanRecs,
                })
              }
              className="group bg-white rounded-2xl border border-[#E9E5F2] hover:border-rose-400 p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    ไม่พบสแกน (NO_SCAN)
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 group-hover:scale-105 transition-transform">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono-data text-rose-700">
                    {kpiBuckets.noScanRecs.length}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-800 font-mono-data text-xs font-bold">
                    {kpiBuckets.noScanPct}%
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-rose-700 font-semibold">
                <span>ตรวจสอบใบลา / ไปราชการ</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Card 6: HOSOffice Push Status */}
            <div
              onClick={() =>
                setActiveModal({
                  type: 'HOSOFFICE_PUSH',
                  title: 'สถานะการเตรียมส่งข้อมูลเข้า HOSOffice (Push Readiness)',
                  subtitle: `${dateScope.label} · พร้อมส่ง ${kpiBuckets.pendingPushRecs.length} รายการ, ส่งแล้ว ${kpiBuckets.pushedRecs.length} รายการ`,
                  pushedRecords: kpiBuckets.pushedRecs,
                  pendingRecords: kpiBuckets.pendingPushRecs,
                  batches: pushHistory,
                })
              }
              className="group bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] rounded-2xl p-4 text-white shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-purple-100">
                    พร้อมส่ง HOSOffice
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                    <Send className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono-data text-white">
                    {kpiBuckets.pendingPushRecs.length}
                  </span>
                  <span className="text-xs text-purple-100">
                    รอส่ง / {kpiBuckets.pushedRecs.length} ส่งแล้ว
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-[11px] text-purple-100 font-semibold">
                <span>คลิกดูสถานะ & ประวัติ Push</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* =================================================================
              SECTION 3: VISUAL CHARTS & SCANNER UTILIZATION BREAKDOWN
          ================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Attendance Proportion Stacked Bar + Clickable Breakdown */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs p-5 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      สัดส่วนผลการลงเวลาปฏิบัติงาน (Attendance Distribution)
                    </h2>
                  </div>
                  <span className="text-xs font-mono-data text-slate-500">
                    ฐานข้อมูลคำนวณ: {kpiBuckets.totalShifts} กะการทำงาน ({dateScope.label})
                  </span>
                </div>

                {/* Stacked Progress Bar */}
                <div className="mt-4 h-5 w-full rounded-xl bg-slate-100 overflow-hidden flex p-0.5 gap-0.5 border border-slate-200">
                  {kpiBuckets.normalPct > 0 && (
                    <div
                      style={{ width: `${kpiBuckets.normalPct}%` }}
                      onClick={() =>
                        setActiveModal({
                          type: 'KPI_RECORDS',
                          title: 'บุคลากรที่เข้าปฏิบัติงานตรงเวลา (NORMAL)',
                          subtitle: dateScope.label,
                          badgeColor: 'emerald',
                          records: kpiBuckets.normalRecs,
                        })
                      }
                      title={`ตรงเวลา: ${kpiBuckets.normalRecs.length} รายการ (${kpiBuckets.normalPct}%)`}
                      className="bg-emerald-500 hover:bg-emerald-600 h-full first:rounded-l-lg last:rounded-r-lg transition-all cursor-pointer"
                    />
                  )}
                  {kpiBuckets.latePct > 0 && (
                    <div
                      style={{ width: `${kpiBuckets.latePct}%` }}
                      onClick={() =>
                        setActiveModal({
                          type: 'KPI_RECORDS',
                          title: 'รายการเข้าปฏิบัติงานสาย (LATE)',
                          subtitle: dateScope.label,
                          badgeColor: 'amber',
                          records: kpiBuckets.lateRecs,
                        })
                      }
                      title={`มาสาย: ${kpiBuckets.lateRecs.length} รายการ (${kpiBuckets.latePct}%)`}
                      className="bg-amber-500 hover:bg-amber-600 h-full first:rounded-l-lg last:rounded-r-lg transition-all cursor-pointer"
                    />
                  )}
                  {kpiBuckets.missingCheckoutPct > 0 && (
                    <div
                      style={{ width: `${kpiBuckets.missingCheckoutPct}%` }}
                      onClick={() =>
                        setActiveModal({
                          type: 'KPI_RECORDS',
                          title: 'รายการสแกนไม่ครบ / ไม่สแกนออก (MISSING_CHECKOUT)',
                          subtitle: dateScope.label,
                          badgeColor: 'orange',
                          records: kpiBuckets.missingCheckoutRecs,
                        })
                      }
                      title={`ไม่สแกนออก: ${kpiBuckets.missingCheckoutRecs.length} รายการ (${kpiBuckets.missingCheckoutPct}%)`}
                      className="bg-orange-500 hover:bg-orange-600 h-full first:rounded-l-lg last:rounded-r-lg transition-all cursor-pointer"
                    />
                  )}
                  {kpiBuckets.noScanPct > 0 && (
                    <div
                      style={{ width: `${kpiBuckets.noScanPct}%` }}
                      onClick={() =>
                        setActiveModal({
                          type: 'KPI_RECORDS',
                          title: 'รายการไม่พบข้อมูลสแกน (NO_SCAN)',
                          subtitle: dateScope.label,
                          badgeColor: 'rose',
                          records: kpiBuckets.noScanRecs,
                        })
                      }
                      title={`ไม่พบสแกน: ${kpiBuckets.noScanRecs.length} รายการ (${kpiBuckets.noScanPct}%)`}
                      className="bg-rose-500 hover:bg-rose-600 h-full first:rounded-l-lg last:rounded-r-lg transition-all cursor-pointer"
                    />
                  )}
                </div>

                {/* Interactive Legend Rows */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      label: 'ตรงเวลา (NORMAL)',
                      desc: 'สแกนเข้าไม่เกินเวลาเริ่มกะ + Grace Period และมีสแกนออกครบ',
                      count: kpiBuckets.normalRecs.length,
                      pct: kpiBuckets.normalPct,
                      dot: 'bg-emerald-500',
                      bg: 'hover:bg-emerald-50/60 border-[#E9E5F2]',
                      badgeColor: 'emerald' as const,
                      recs: kpiBuckets.normalRecs,
                    },
                    {
                      label: 'มาสาย (LATE)',
                      desc: `สแกนเข้าหลัง Grace Period (รวมสาย ${kpiBuckets.totalLateMinutes} นาที)`,
                      count: kpiBuckets.lateRecs.length,
                      pct: kpiBuckets.latePct,
                      dot: 'bg-amber-500',
                      bg: 'hover:bg-amber-50/60 border-[#E9E5F2]',
                      badgeColor: 'amber' as const,
                      recs: kpiBuckets.lateRecs,
                    },
                    {
                      label: 'สแกนไม่ครบ (MISSING_CHECKOUT)',
                      desc: 'พบสแกนเข้างาน แต่ยังไม่มีบันทึกสแกนออกหลังจบกะ',
                      count: kpiBuckets.missingCheckoutRecs.length,
                      pct: kpiBuckets.missingCheckoutPct,
                      dot: 'bg-orange-500',
                      bg: 'hover:bg-orange-50/60 border-[#E9E5F2]',
                      badgeColor: 'orange' as const,
                      recs: kpiBuckets.missingCheckoutRecs,
                    },
                    {
                      label: 'ไม่พบข้อมูลสแกน (NO_SCAN)',
                      desc: 'มีตารางกะปฏิบัติงาน แต่ไม่พบข้อมูลจากเครื่องสแกนทั้งเข้า-ออก',
                      count: kpiBuckets.noScanRecs.length,
                      pct: kpiBuckets.noScanPct,
                      dot: 'bg-rose-500',
                      bg: 'hover:bg-rose-50/60 border-[#E9E5F2]',
                      badgeColor: 'rose' as const,
                      recs: kpiBuckets.noScanRecs,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      onClick={() =>
                        setActiveModal({
                          type: 'KPI_RECORDS',
                          title: item.label,
                          subtitle: `${dateScope.label} · ${item.desc}`,
                          badgeColor: item.badgeColor,
                          records: item.recs,
                        })
                      }
                      className={`p-3 rounded-xl border ${item.bg} transition-all cursor-pointer flex items-center justify-between gap-3`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} />
                          <span className="text-xs font-bold text-slate-800">
                            {item.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.desc}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold font-mono-data text-slate-900">
                          {item.count} กะ
                        </div>
                        <div className="text-[11px] font-mono-data text-purple-700 font-semibold">
                          {item.pct}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Sync & Architecture Telemetry Footer */}
              <div className="pt-4 border-t border-[#E9E5F2] grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] flex items-center gap-2.5">
                  <Fingerprint className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">ซิงค์เครื่องสแกนล่าสุด</div>
                    <div className="text-xs font-bold font-mono-data text-slate-800 truncate">
                      {syncTelemetry.scannerSyncTimestamp}
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">ซิงค์ HOSOffice.hr_person</div>
                    <div className="text-xs font-bold font-mono-data text-slate-800 truncate">
                      {syncTelemetry.hosOfficeSyncTimestamp}
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500">Gateway & DB Isolation</div>
                    <div className="text-xs font-bold font-mono-data text-emerald-700 truncate">
                      :3002 · samchuk_attendance
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 cols: Scanner Usage Proportion by Machine (Click for Raw Scans Modal) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-purple-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      สัดส่วนการสแกนแยกตามจุดติดตั้งเครื่องสแกน
                    </h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-mono-data text-xs font-semibold">
                    รวม {rawScansList.length.toLocaleString()} สแกนดิบ
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  คลิกที่แต่ละเครื่องสแกนเพื่อตรวจสอบ Raw Scan Events (6 ฟิลด์มาตรฐาน) ของจุดสแกนนั้น
                </p>

                <div className="mt-4 space-y-2.5">
                  {scannerStats.map((st) => (
                    <div
                      key={st.machineNo}
                      onClick={() =>
                        setActiveModal({
                          type: 'SCANNER_DETAIL',
                          stat: st,
                        })
                      }
                      className="p-3 rounded-xl border border-[#E9E5F2] hover:border-purple-400 bg-[#F8F7FC]/60 hover:bg-purple-50/40 transition-all cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-purple-700 text-white font-mono-data text-[10px] font-bold">
                              M#{st.machineNo}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {st.name}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <span className="text-xs font-bold font-mono-data text-purple-800">
                            {st.totalScans} ครั้ง ({st.sharePct}%)
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          style={{ width: `${Math.max(st.sharePct, 4)}%` }}
                          className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] rounded-full"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono-data">
                        <span>IP: {st.ip}</span>
                        <span>
                          เข้า: <strong className="text-emerald-700">{st.inCount}</strong> · ออก:{' '}
                          <strong className="text-purple-700">{st.outCount}</strong>
                          {st.unmappedCount > 0 && (
                            <span className="text-rose-600 ml-1.5 font-semibold">
                              · รอผูก ID: {st.unmappedCount}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[#E9E5F2] flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  รักษาข้อมูลดิบ 6 ฟิลด์จาก Scanner Reader EXE 100%
                </span>
                <button
                  onClick={() => onNavigate('raw-scans')}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  ดูข้อมูลสแกนดิบทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* =================================================================
              SECTION 4: PERSONNEL PUNCTUALITY & LATENESS RANKING
          ================================================================= */}
          <div className="bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E9E5F2] space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      จัดอันดับความตรงต่อเวลาและสถิติการมาสายของบุคลากร (Personnel Punctuality & Lateness Ranking)
                    </h2>
                    <p className="text-xs text-slate-500">
                      คำนวณจากข้อมูลช่วง {dateScope.label} · คลิกที่แถวรายชื่อบุคลากรเพื่อดูประวัติการสแกนเข้า-ออกรายวันแบบละเอียด
                    </p>
                  </div>
                </div>

                {/* Ranking Category Tabs */}
                <div className="flex flex-wrap gap-1.5 bg-[#F8F7FC] p-1.5 rounded-xl border border-[#E9E5F2]">
                  {(
                    [
                      {
                        id: 'ON_TIME',
                        label: 'ตรงเวลาสูงสุด (%)',
                        activeClass: 'bg-emerald-600 text-white',
                      },
                      {
                        id: 'LATE_FREQ',
                        label: 'มาสายบ่อยที่สุด (ครั้ง)',
                        activeClass: 'bg-amber-600 text-white',
                      },
                      {
                        id: 'LATE_MINS',
                        label: 'เวลามาสายสะสมสูงสุด (นาที)',
                        activeClass: 'bg-rose-600 text-white',
                      },
                      {
                        id: 'INCOMPLETE',
                        label: 'สแกนไม่ครบ / ไม่พบสแกน',
                        activeClass: 'bg-orange-600 text-white',
                      },
                    ] as { id: PersonnelRankTab; label: string; activeClass: string }[]
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setRankTab(t.id);
                        setRankSortField('primary');
                        setRankSortDir('desc');
                        setRankPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        rankTab === t.id
                          ? `${t.activeClass} shadow-2xs`
                          : 'text-slate-600 hover:text-purple-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search + Sort + Page Size Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    value={rankSearch}
                    onChange={(e) => {
                      setRankSearch(e.target.value);
                      setRankPage(1);
                    }}
                    placeholder="ค้นหาชื่อ-สกุล, แผนก, กลุ่มงาน, PERSON_ID หรือ FINGLE_ID..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden focus:border-purple-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    พบ <strong className="text-slate-800">{displayedRankRows.length}</strong> รายชื่อ
                  </span>
                  <span className="text-slate-300">|</span>
                  <label className="text-slate-600 font-medium">แสดงหน้าละ:</label>
                  <select
                    value={rankPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRankPageSize(val === 'ALL' ? 'ALL' : (Number(val) as PageSizeOption));
                      setRankPage(1);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-[#E9E5F2] bg-[#F8F7FC] font-mono-data text-xs font-semibold text-slate-800"
                  >
                    <option value={10}>10 รายการ</option>
                    <option value={25}>25 รายการ</option>
                    <option value={50}>50 รายการ</option>
                    <option value={100}>100 รายการ</option>
                    <option value="ALL">ทั้งหมด (All)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Ranking Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4 w-16 text-center">อันดับ</th>
                    <th className="py-3 px-4">
                      <button
                        onClick={() => toggleRankSort('name')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        บุคลากร (PERSON_ID / FINGLE_ID)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4">หน่วยงาน / กลุ่มงาน</th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleRankSort('workDays')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        จำนวนกะทั้งหมด
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">มาตรงเวลา</th>
                    <th className="py-3 px-4 text-center">มาสาย (ครั้ง)</th>
                    <th className="py-3 px-4 text-center">นาทีสายสะสม</th>
                    <th className="py-3 px-4 text-center">สแกนไม่ครบ/ขาด</th>
                    <th className="py-3 px-4 text-right">
                      <button
                        onClick={() => toggleRankSort('primary')}
                        className="inline-flex items-center gap-1 text-purple-700 font-bold cursor-pointer"
                      >
                        {rankTab === 'ON_TIME' && 'อัตราตรงเวลา (%)'}
                        {rankTab === 'LATE_FREQ' && 'ความถี่มาสาย'}
                        {rankTab === 'LATE_MINS' && 'นาทีสายรวม'}
                        {rankTab === 'INCOMPLETE' && 'รายการไม่สมบูรณ์'}
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2] text-xs">
                  {paginatedRankRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        ไม่พบข้อมูลบุคลากรในหมวดหมู่การจัดอันดับนี้
                      </td>
                    </tr>
                  ) : (
                    paginatedRankRows.map((row, idx) => {
                      const rankNum =
                        rankPageSize === 'ALL'
                          ? idx + 1
                          : (rankPage - 1) * rankPageSize + idx + 1;

                      return (
                        <tr
                          key={row.personId}
                          onClick={() =>
                            setActiveModal({
                              type: 'PERSON_HISTORY',
                              person: row,
                            })
                          }
                          className="hover:bg-purple-50/50 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-mono-data text-xs font-bold ${
                                rankNum === 1
                                  ? 'bg-purple-700 text-white'
                                  : rankNum <= 3
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {rankNum}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 hover:text-purple-700">
                              {row.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-data">
                              ID: {row.personId} · FINGLE: #{row.fingleId} · {row.position}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800">{row.department}</div>
                            <div className="text-[11px] text-purple-700">{row.groupName}</div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono-data font-semibold text-slate-700">
                            {row.totalWorkDays}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-data font-semibold text-emerald-700">
                            {row.normalCount}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-data">
                            {row.lateCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                                {row.lateCount} ครั้ง
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-data">
                            {row.totalLateMinutes > 0 ? (
                              <span className="font-bold text-rose-600">
                                {row.totalLateMinutes} น.
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono-data">
                            {row.incompleteCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 font-bold">
                                {row.incompleteCount} กะ
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-data">
                            {rankTab === 'ON_TIME' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                                {row.onTimeRatePct}%
                              </span>
                            )}
                            {rankTab === 'LATE_FREQ' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-bold">
                                {row.lateCount} ครั้ง ({row.totalLateMinutes} น.)
                              </span>
                            )}
                            {rankTab === 'LATE_MINS' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                                {row.totalLateMinutes} นาที
                              </span>
                            )}
                            {rankTab === 'INCOMPLETE' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 font-bold">
                                {row.incompleteCount} รายการ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* =================================================================
              SECTION 5: EXECUTIVE GROUP SUMMARY TABLE (สรุปภาพรวมรายกลุ่มงาน)
          ================================================================= */}
          <div className="bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E9E5F2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    ตารางสรุปผลการปฏิบัติงานระดับผู้บริหาร แยกตามกลุ่มงาน (Executive Group Summary)
                  </h2>
                  <p className="text-xs text-slate-500">
                    คลิกที่แถวกลุ่มงานเพื่อเจาะลึก (Drill-Down) ดูรายชื่อบุคลากรและสถานะการสแกนภายในกลุ่มงานนั้น
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="ค้นหากลุ่มงาน..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden"
                  />
                </div>
                <select
                  value={groupPageSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupPageSize(val === 'ALL' ? 'ALL' : (Number(val) as PageSizeOption));
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] font-mono-data text-xs font-semibold text-slate-800"
                >
                  <option value={10}>แสดง 10 กลุ่มงาน</option>
                  <option value={25}>แสดง 25 กลุ่มงาน</option>
                  <option value={50}>แสดง 50 กลุ่มงาน</option>
                  <option value={100}>แสดง 100 กลุ่มงาน</option>
                  <option value="ALL">แสดงทั้งหมด</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">
                      <button
                        onClick={() => toggleGroupSort('groupName')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        กลุ่มงาน (Hospital Group)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleGroupSort('headcount')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        จำนวนบุคลากร
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">จำนวนกะทั้งหมด</th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleGroupSort('onTimePct')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        ตรงเวลา (%)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleGroupSort('lateCount')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        มาสาย (ครั้ง)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleGroupSort('lateMins')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        นาทีสายรวม
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleGroupSort('incompleteCount')}
                        className="inline-flex items-center gap-1 hover:text-purple-700 cursor-pointer"
                      >
                        สแกนไม่ครบ / NO_SCAN
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-4 text-right">ตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2] text-xs">
                  {groupSummaryRows.map((g) => (
                    <tr
                      key={g.groupName}
                      onClick={() =>
                        setActiveModal({
                          type: 'GROUP_DETAIL',
                          group: g,
                        })
                      }
                      className="hover:bg-purple-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">{g.groupName}</td>
                      <td className="py-3.5 px-4 text-center font-mono-data font-semibold text-slate-700">
                        {g.headcount} คน
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono-data text-slate-700">
                        {g.totalShifts} กะ
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-200 overflow-hidden hidden sm:block">
                            <div
                              style={{ width: `${g.onTimePct}%` }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                          <span className="font-mono-data font-bold text-emerald-700">
                            {g.onTimePct}% ({g.normalCount})
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono-data">
                        {g.lateCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                            {g.lateCount} ครั้ง
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono-data">
                        {g.totalLateMinutes > 0 ? (
                          <span className="font-bold text-rose-600">
                            {g.totalLateMinutes} นาที
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono-data">
                        {g.incompleteCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 font-bold">
                            {g.incompleteCount} รายการ
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-purple-700 font-semibold">
                          ดูรายชื่อ <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* =================================================================
              SECTION 6: EXCEPTION WATCHLIST & SYSTEM ACTIVITY LOG
          ================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Priority Watchlist (Late / Missing Checkout / No Scan) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-5 border-b border-[#E9E5F2] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        รายการเฝ้าระวังที่ต้องตรวจสอบเร่งด่วน (Exception Watchlist)
                      </h2>
                      <p className="text-xs text-slate-500">
                        คลิกที่รายการเพื่อดูรายละเอียด หรือเปิดหน้าบันทึกหมายเหตุ (ป่วย / ลา / ไปราชการ)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('attendance-review')}
                    className="text-xs font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    จัดการทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-4">วันที่ / กะ</th>
                        <th className="py-2.5 px-4">บุคลากร</th>
                        <th className="py-2.5 px-4">เวลาเข้า - ออก</th>
                        <th className="py-2.5 px-4">สถานะ</th>
                        <th className="py-2.5 px-4">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9E5F2] text-xs">
                      {scopedAttendance
                        .filter((a) => a.status !== 'NORMAL')
                        .slice(0, 8)
                        .map((item) => (
                          <tr
                            key={item.id}
                            onClick={() =>
                              setActiveModal({
                                type: 'KPI_RECORDS',
                                title: `รายละเอียดรายการเฝ้าระวัง — ${item.fullName}`,
                                subtitle: `วันที่ ${item.workDate} · ${item.shiftName}`,
                                badgeColor: 'amber',
                                records: [item],
                              })
                            }
                            className="hover:bg-purple-50/40 transition-colors cursor-pointer"
                          >
                            <td className="py-2.5 px-4 font-mono-data">
                              <div className="font-semibold text-slate-800">{item.workDate}</div>
                              <div className="text-[11px] text-slate-500">{item.shiftName}</div>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">{item.fullName}</div>
                              <div className="text-[11px] text-slate-500 font-mono-data">
                                ID: {item.personId} · #{item.fingleId}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 font-mono-data">
                              <span className="text-emerald-700 font-semibold">
                                {item.checkInAt || '--:--'}
                              </span>
                              <span className="text-slate-300 mx-1">→</span>
                              <span className="text-purple-700 font-semibold">
                                {item.checkOutAt || '--:--'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <AttendanceStatusBadge
                                status={item.status}
                                lateMinutes={item.lateMinutes}
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              {item.notes ? (
                                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-medium">
                                  {item.notes.reasonLabel}
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-700 font-medium">
                                  รอตรวจสอบ
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right 5 cols: Recent System & Audit Activity Log */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E9E5F2] shadow-2xs p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E9E5F2]">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      บันทึกกิจกรรมระบบล่าสุด (Audit Trail)
                    </h2>
                  </div>
                  <select
                    value={logPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLogPageSize(val === 'ALL' ? 'ALL' : (Number(val) as PageSizeOption));
                    }}
                    className="px-2 py-1 rounded-lg border border-[#E9E5F2] bg-[#F8F7FC] font-mono-data text-[11px] font-semibold text-slate-700"
                  >
                    <option value={10}>10 รายการ</option>
                    <option value={25}>25 รายการ</option>
                    <option value={50}>50 รายการ</option>
                    <option value={100}>100 รายการ</option>
                    <option value="ALL">ทั้งหมด</option>
                  </select>
                </div>

                <div className="mt-3 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="ค้นหาประวัติการทำงาน / ผู้ดำเนินการ..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {filteredAuditLogs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      ยังไม่มีบันทึกกิจกรรมในฐานข้อมูล
                    </div>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-data text-[11px] font-semibold text-purple-700">
                            {log.action}
                          </span>
                          <span className="font-mono-data text-[11px] text-slate-400">
                            {log.timestamp}
                          </span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{log.summary}</p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-500">โดย: {log.actor || log.actorName}</span>
                          <RoleBadge role={log.role || log.actorRole} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-[#E9E5F2] flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  บันทึกทุกธุรกรรมใน `samchuk_attendance`
                </span>
                <button
                  onClick={() => onNavigate('system-logs')}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  ดู Audit Logs ทั้งหมด <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          INTERACTIVE DRILL-DOWN MODAL
      ===================================================================== */}
      <DashboardDetailModal
        payload={activeModal}
        onClose={() => setActiveModal(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
};
