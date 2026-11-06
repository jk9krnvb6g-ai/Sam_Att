import React, { useState, useMemo } from 'react';
import {
  mockAttendanceService,
  CURRENT_SYSTEM_DATE,
} from '../services/mockAttendanceService';
import {
  Personnel,
  AttendanceRecord,
  RawScanEvent,
  ScannerDevice,
} from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  DashboardDetailModal,
  DashboardModalState,
} from '../components/dashboard/DashboardDetailModal';
import {
  Users,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cpu,
  Calendar,
  Building2,
  RefreshCw,
  Zap,
  Database,
  TrendingUp,
  Activity,
  ArrowUpDown,
  AlertTriangle,
  FileWarning,
  BarChart3,
  PieChart,
  Award,
  Layers,
  Filter,
  RotateCcw,
  X,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToReview?: (filter?: { department?: string; status?: string }) => void;
  onNavigateToView?: (viewId: string) => void;
}

type DateFilterMode = 'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

interface CustomDrilldownModalState {
  title: string;
  subtitle: string;
  badgeText?: string;
  records: AttendanceRecord[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToView,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  // =========================================================
  // 1. Global Filters (§3.2: Daily, Monthly, Yearly, Custom + Group, Dept, Type)
  // =========================================================
  const [dateMode, setDateMode] = useState<DateFilterMode>('DAILY');
  const [selectedDate, setSelectedDate] = useState('2026-11-06');
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [customFromDate, setCustomFromDate] = useState('2026-11-03');
  const [customToDate, setCustomToDate] = useState('2026-11-06');

  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [selectedPersonnelType, setSelectedPersonnelType] = useState('ALL');

  // Interactive UI states (Normal Mock / Empty Simulation / Skeleton Loading / Error Simulation)
  const [uiSimMode, setUiSimMode] = useState<'NORMAL' | 'EMPTY' | 'LOADING' | 'ERROR'>('NORMAL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncBannerMsg, setSyncBannerMsg] = useState<string | null>(null);

  // Chart Sorting Controls
  const [deptSortDir, setDeptSortDir] = useState<'DESC' | 'ASC'>('DESC');
  const [topLateSortBy, setTopLateSortBy] = useState<'MINUTES_DESC' | 'COUNT_DESC' | 'MINUTES_ASC'>(
    'MINUTES_DESC'
  );

  // Interactive Modal Popup States
  const [modalState, setModalState] = useState<DashboardModalState | null>(null);
  const [customDrilldown, setCustomDrilldown] = useState<CustomDrilldownModalState | null>(null);

  // Fetch base data from Mock Service
  const allPersonnel = useMemo(() => mockAttendanceService.getPersonnel(), [refreshKey]);
  const scanners = useMemo(() => mockAttendanceService.getScanners(), [refreshKey]);
  const syncRuns = useMemo(() => mockAttendanceService.getSyncRuns(), [refreshKey]);
  const pushHistory = useMemo(() => mockAttendanceService.getPushHistory(), [refreshKey]);

  // Filter Options derived from HOSOffice Mock Personnel
  const groupOptions = useMemo(
    () => Array.from(new Set(allPersonnel.map((p) => p.groupName))),
    [allPersonnel]
  );

  const departmentOptions = useMemo(() => {
    const base =
      selectedGroup === 'ALL'
        ? allPersonnel
        : allPersonnel.filter((p) => p.groupName === selectedGroup);
    return Array.from(new Set(base.map((p) => p.department)));
  }, [allPersonnel, selectedGroup]);

  const personnelTypeOptions = useMemo(
    () => Array.from(new Set(allPersonnel.map((p) => p.personnelType))),
    [allPersonnel]
  );

  // Compute active date range [activeFrom, activeTo] and human-readable label
  const dateScope = useMemo(() => {
    if (dateMode === 'DAILY') {
      return {
        from: selectedDate,
        to: selectedDate,
        label: `รายวัน (${selectedDate})`,
      };
    }
    if (dateMode === 'MONTHLY') {
      return {
        from: `${selectedMonth}-01`,
        to: `${selectedMonth}-31`,
        label: `รายเดือน (${selectedMonth})`,
      };
    }
    if (dateMode === 'YEARLY') {
      return {
        from: `${selectedYear}-01-01`,
        to: `${selectedYear}-12-31`,
        label: `รายปี (${selectedYear})`,
      };
    }
    return {
      from: customFromDate || '2026-11-01',
      to: customToDate || '2026-11-06',
      label: `ช่วงวันที่ (${customFromDate} ถึง ${customToDate})`,
    };
  }, [dateMode, selectedDate, selectedMonth, selectedYear, customFromDate, customToDate]);

  // Personnel matching Organization & Personnel Type Filters
  const scopedPersonnel = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    return allPersonnel.filter((p) => {
      if (!p.active) return false;
      if (selectedGroup !== 'ALL' && p.groupName !== selectedGroup) return false;
      if (selectedDepartment !== 'ALL' && p.department !== selectedDepartment) return false;
      if (selectedPersonnelType !== 'ALL' && p.personnelType !== selectedPersonnelType)
        return false;
      return true;
    });
  }, [allPersonnel, selectedGroup, selectedDepartment, selectedPersonnelType, uiSimMode]);

  const scopedPersonIdSet = useMemo(
    () => new Set(scopedPersonnel.map((p) => p.personId)),
    [scopedPersonnel]
  );

  const personnelByFingle = useMemo(() => {
    const map = new Map<number, Personnel>();
    allPersonnel.forEach((p) => map.set(p.fingleId, p));
    return map;
  }, [allPersonnel]);

  // Attendance records filtered by Date Scope + Organization / Personnel Type
  // Note: Excludes future unreached dates (> CURRENT_SYSTEM_DATE) so unreached shifts are never counted as NO_SCAN (§3.3)
  const scopedAttendance = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    const rangeRecords = mockAttendanceService.getAttendance({
      fromDate: dateScope.from,
      toDate: dateScope.to,
      groupName: selectedGroup === 'ALL' ? undefined : selectedGroup,
      personnelType: selectedPersonnelType === 'ALL' ? undefined : selectedPersonnelType,
    });

    return rangeRecords.filter((rec) => {
      // Do not evaluate future dates that haven't occurred yet as NO_SCAN
      if (rec.workDate > CURRENT_SYSTEM_DATE && rec.status === 'NO_SCAN') {
        return false;
      }
      if (selectedDepartment !== 'ALL' && rec.department !== selectedDepartment) {
        return false;
      }
      if (!scopedPersonIdSet.has(rec.personId)) {
        return false;
      }
      return true;
    });
  }, [
    dateScope,
    selectedGroup,
    selectedDepartment,
    selectedPersonnelType,
    scopedPersonIdSet,
    refreshKey,
    uiSimMode,
  ]);

  // Raw Scans filtered by Date Scope + Organization / Personnel Type
  const allRawScans = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    return mockAttendanceService.getRawScans();
  }, [refreshKey, uiSimMode]);

  const scopedRawScans = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    const hasOrgFilter =
      selectedGroup !== 'ALL' ||
      selectedDepartment !== 'ALL' ||
      selectedPersonnelType !== 'ALL';

    return allRawScans.filter((s) => {
      const scanDate = s.scanDateTime.slice(0, 10);
      if (scanDate < dateScope.from || scanDate > dateScope.to) return false;

      if (!hasOrgFilter) return true;
      const person = personnelByFingle.get(s.enrollNumber);
      if (!person) return false;
      return scopedPersonIdSet.has(person.personId);
    });
  }, [
    allRawScans,
    dateScope,
    selectedGroup,
    selectedDepartment,
    selectedPersonnelType,
    personnelByFingle,
    scopedPersonIdSet,
    uiSimMode,
  ]);

  // =========================================================
  // Mutually Exclusive Attendance Classification Helper (§3.6 Chart 3 & §3.3 KPIs)
  // Every evaluated shift belongs to exactly 1 of 5 buckets so Breakdown sums to 100%:
  // 1. ON_TIME_COMPLETE (ตรงเวลาและสแกนครบ)
  // 2. LATE_COMPLETE (มาสายและสแกนครบ)
  // 3. MISSING_CHECKOUT (มาปฏิบัติงานแต่สแกนไม่ครบ / ลืมสแกนออก)
  // 4. NO_SCAN_EXCUSED (ไม่พบสแกน — มีหมายเหตุลา/ไปราชการ/อบรม)
  // 5. NO_SCAN_UNVERIFIED (ไม่พบสแกน — รอตรวจสอบ)
  // =========================================================
  const classifyExclusiveBucket = (
    rec: AttendanceRecord
  ):
    | 'ON_TIME_COMPLETE'
    | 'LATE_COMPLETE'
    | 'MISSING_CHECKOUT'
    | 'NO_SCAN_EXCUSED'
    | 'NO_SCAN_UNVERIFIED' => {
    if (rec.status === 'NO_SCAN') {
      return rec.notes ? 'NO_SCAN_EXCUSED' : 'NO_SCAN_UNVERIFIED';
    }
    const isMissingOut =
      rec.status === 'MISSING_CHECKOUT' || (Boolean(rec.checkInAt) && !rec.checkOutAt);
    if (isMissingOut) {
      return 'MISSING_CHECKOUT';
    }
    if (rec.status === 'LATE' || rec.lateMinutes > 0) {
      return 'LATE_COMPLETE';
    }
    return 'ON_TIME_COMPLETE';
  };

  // =========================================================
  // 2. Eight Cohesive KPI Metrics (§3.3)
  // =========================================================
  const kpiMetrics = useMemo(() => {
    const totalPersonnelCount = scopedPersonnel.length;
    const totalEvaluatedShifts = scopedAttendance.length;

    // Present shifts = all shifts where the person checked in (NORMAL, LATE, EARLY_LEAVE, MISSING_CHECKOUT)
    const presentShiftRecords = scopedAttendance.filter((r) => r.status !== 'NO_SCAN');
    const distinctPresentPeople = new Set(presentShiftRecords.map((r) => r.personId)).size;

    // On-time shift records (lateMinutes === 0 and checked in)
    const onTimeShiftRecords = presentShiftRecords.filter(
      (r) => r.status === 'NORMAL' || (r.lateMinutes === 0 && r.status !== 'LATE')
    );

    // Late shift records (status === 'LATE' or lateMinutes > 0)
    const lateShiftRecords = presentShiftRecords.filter(
      (r) => r.status === 'LATE' || r.lateMinutes > 0
    );
    const distinctLatePeople = new Set(lateShiftRecords.map((r) => r.personId)).size;
    const totalLateMinutes = lateShiftRecords.reduce((sum, r) => sum + r.lateMinutes, 0);

    // Missing checkout shift records
    const missingCheckoutRecords = presentShiftRecords.filter(
      (r) => r.status === 'MISSING_CHECKOUT' || (Boolean(r.checkInAt) && !r.checkOutAt)
    );
    const distinctMissingCheckoutPeople = new Set(
      missingCheckoutRecords.map((r) => r.personId)
    ).size;

    // NO_SCAN shift records
    const noScanRecords = scopedAttendance.filter((r) => r.status === 'NO_SCAN');
    const noScanExcusedRecords = noScanRecords.filter((r) => Boolean(r.notes));
    const noScanUnverifiedRecords = noScanRecords.filter((r) => !r.notes);

    // Attendance Rate % using evaluated shifts as denominator
    const attendanceRatePct =
      totalEvaluatedShifts > 0
        ? ((presentShiftRecords.length / totalEvaluatedShifts) * 100).toFixed(1)
        : '0.0';

    const onTimeRateOfPresentPct =
      presentShiftRecords.length > 0
        ? ((onTimeShiftRecords.length / presentShiftRecords.length) * 100).toFixed(1)
        : '0.0';

    return {
      totalPersonnelCount,
      totalEvaluatedShifts,
      presentShiftRecords,
      distinctPresentPeople,
      onTimeShiftRecords,
      lateShiftRecords,
      distinctLatePeople,
      totalLateMinutes,
      missingCheckoutRecords,
      distinctMissingCheckoutPeople,
      noScanRecords,
      noScanExcusedRecords,
      noScanUnverifiedRecords,
      attendanceRatePct,
      onTimeRateOfPresentPct,
    };
  }, [scopedPersonnel, scopedAttendance]);

  // =========================================================
  // Chart 1: Attendance & Lateness Trend (Adaptive Time Axis)
  // - DAILY mode: Hourly buckets (06:00 - 20:00)
  // - MONTHLY / CUSTOM mode: Daily buckets
  // - YEARLY mode: Monthly buckets
  // =========================================================
  const attendanceTrendSeries = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];

    if (dateMode === 'DAILY') {
      const hours = [6, 7, 8, 9, 10, 12, 14, 16, 17, 20];
      return hours.map((hr) => {
        const hrStr = String(hr).padStart(2, '0');
        const recordsInHour = scopedAttendance.filter((r) => {
          if (!r.checkInAt) return false;
          const timePart = r.checkInAt.split(' ')[1] || '';
          return timePart.startsWith(`${hrStr}:`);
        });
        const onTime = recordsInHour.filter((r) => r.lateMinutes === 0).length;
        const late = recordsInHour.filter((r) => r.lateMinutes > 0).length;
        const rawEventsInHour = scopedRawScans.filter((s) => {
          const timePart = s.scanDateTime.split(' ')[1] || '';
          return timePart.startsWith(`${hrStr}:`);
        }).length;

        return {
          key: `${hrStr}:00`,
          label: `${hrStr}:00`,
          fullLabel: `เวลา ${hrStr}:00–${hrStr}:59 น.`,
          onTimeCount: onTime,
          lateCount: late,
          rawEventsCount: rawEventsInHour,
          totalPresent: onTime + late,
          records: recordsInHour,
        };
      });
    }

    if (dateMode === 'YEARLY') {
      const monthKeys = Array.from(
        new Set(scopedAttendance.map((r) => r.workDate.slice(0, 7)))
      ).sort();
      return monthKeys.map((mKey) => {
        const recs = scopedAttendance.filter((r) => r.workDate.startsWith(mKey));
        const onTime = recs.filter((r) => r.status !== 'NO_SCAN' && r.lateMinutes === 0).length;
        const late = recs.filter((r) => r.status === 'LATE' || r.lateMinutes > 0).length;
        const rawCount = scopedRawScans.filter((s) => s.scanDateTime.startsWith(mKey)).length;
        return {
          key: mKey,
          label: mKey,
          fullLabel: `เดือน ${mKey}`,
          onTimeCount: onTime,
          lateCount: late,
          rawEventsCount: rawCount,
          totalPresent: onTime + late,
          records: recs,
        };
      });
    }

    // MONTHLY or CUSTOM RANGE -> Group by workDate
    const dateKeys = Array.from(new Set(scopedAttendance.map((r) => r.workDate))).sort();
    return dateKeys.map((dKey) => {
      const recs = scopedAttendance.filter((r) => r.workDate === dKey);
      const onTime = recs.filter((r) => r.status !== 'NO_SCAN' && r.lateMinutes === 0).length;
      const late = recs.filter((r) => r.status === 'LATE' || r.lateMinutes > 0).length;
      const rawCount = scopedRawScans.filter((s) => s.scanDateTime.startsWith(dKey)).length;
      return {
        key: dKey,
        label: dKey.slice(5), // MM-DD
        fullLabel: `วันที่ ${dKey}`,
        onTimeCount: onTime,
        lateCount: late,
        rawEventsCount: rawCount,
        totalPresent: onTime + late,
        records: recs,
      };
    });
  }, [dateMode, scopedAttendance, scopedRawScans, uiSimMode]);

  const maxTrendValue = useMemo(() => {
    return Math.max(
      4,
      ...attendanceTrendSeries.map((item) =>
        Math.max(item.totalPresent, item.rawEventsCount)
      )
    );
  }, [attendanceTrendSeries]);

  // =========================================================
  // Chart 3: Attendance Status Breakdown (100% Mutually Exclusive)
  // =========================================================
  const statusBreakdown = useMemo(() => {
    const total = scopedAttendance.length;
    const buckets = {
      ON_TIME_COMPLETE: [] as AttendanceRecord[],
      LATE_COMPLETE: [] as AttendanceRecord[],
      MISSING_CHECKOUT: [] as AttendanceRecord[],
      NO_SCAN_EXCUSED: [] as AttendanceRecord[],
      NO_SCAN_UNVERIFIED: [] as AttendanceRecord[],
    };

    scopedAttendance.forEach((rec) => {
      const key = classifyExclusiveBucket(rec);
      buckets[key].push(rec);
    });

    const toPct = (count: number) =>
      total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

    return {
      total,
      items: [
        {
          id: 'ON_TIME_COMPLETE',
          label: 'ตรงเวลา (สแกนครบ)',
          count: buckets.ON_TIME_COMPLETE.length,
          pct: toPct(buckets.ON_TIME_COMPLETE.length),
          colorClass: 'bg-emerald-500',
          badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
          records: buckets.ON_TIME_COMPLETE,
        },
        {
          id: 'LATE_COMPLETE',
          label: 'มาสาย (สแกนครบ)',
          count: buckets.LATE_COMPLETE.length,
          pct: toPct(buckets.LATE_COMPLETE.length),
          colorClass: 'bg-amber-500',
          badgeClass: 'bg-amber-50 border-amber-200 text-amber-900',
          records: buckets.LATE_COMPLETE,
        },
        {
          id: 'MISSING_CHECKOUT',
          label: 'สแกนไม่ครบ (MISSING_CHECKOUT)',
          count: buckets.MISSING_CHECKOUT.length,
          pct: toPct(buckets.MISSING_CHECKOUT.length),
          colorClass: 'bg-orange-500',
          badgeClass: 'bg-orange-50 border-orange-200 text-orange-900',
          records: buckets.MISSING_CHECKOUT,
        },
        {
          id: 'NO_SCAN_EXCUSED',
          label: 'NO_SCAN (มีหมายเหตุลา/ราชการ)',
          count: buckets.NO_SCAN_EXCUSED.length,
          pct: toPct(buckets.NO_SCAN_EXCUSED.length),
          colorClass: 'bg-violet-500',
          badgeClass: 'bg-violet-50 border-violet-200 text-violet-900',
          records: buckets.NO_SCAN_EXCUSED,
        },
        {
          id: 'NO_SCAN_UNVERIFIED',
          label: 'NO_SCAN (รอตรวจสอบ)',
          count: buckets.NO_SCAN_UNVERIFIED.length,
          pct: toPct(buckets.NO_SCAN_UNVERIFIED.length),
          colorClass: 'bg-rose-500',
          badgeClass: 'bg-rose-50 border-rose-200 text-rose-900',
          records: buckets.NO_SCAN_UNVERIFIED,
        },
      ],
    };
  }, [scopedAttendance]);

  // =========================================================
  // Chart 2: Department Lateness Comparison (Sortable DESC/ASC)
  // =========================================================
  const departmentComparison = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    const map = new Map<
      string,
      {
        department: string;
        groupName: string;
        evaluatedShifts: number;
        presentShifts: number;
        lateEvents: number;
        lateMinutes: number;
        missingCheckoutCount: number;
        noScanCount: number;
        records: AttendanceRecord[];
      }
    >();

    scopedAttendance.forEach((rec) => {
      const key = rec.department;
      if (!map.has(key)) {
        map.set(key, {
          department: rec.department,
          groupName: rec.groupName,
          evaluatedShifts: 0,
          presentShifts: 0,
          lateEvents: 0,
          lateMinutes: 0,
          missingCheckoutCount: 0,
          noScanCount: 0,
          records: [],
        });
      }
      const entry = map.get(key)!;
      entry.evaluatedShifts++;
      entry.records.push(rec);
      if (rec.status !== 'NO_SCAN') {
        entry.presentShifts++;
      } else {
        entry.noScanCount++;
      }
      if (rec.status === 'LATE' || rec.lateMinutes > 0) {
        entry.lateEvents++;
        entry.lateMinutes += rec.lateMinutes;
      }
      if (rec.status === 'MISSING_CHECKOUT' || (rec.checkInAt && !rec.checkOutAt)) {
        entry.missingCheckoutCount++;
      }
    });

    const list = Array.from(map.values()).map((d) => ({
      ...d,
      lateRatePct:
        d.evaluatedShifts > 0
          ? Number(((d.lateEvents / d.evaluatedShifts) * 100).toFixed(1))
          : 0,
    }));

    return list.sort((a, b) => {
      const dir = deptSortDir === 'DESC' ? -1 : 1;
      if (a.lateEvents !== b.lateEvents) return (a.lateEvents - b.lateEvents) * dir;
      return (a.lateMinutes - b.lateMinutes) * dir;
    });
  }, [scopedAttendance, deptSortDir, uiSimMode]);

  // =========================================================
  // Chart 4: Missing Checkout & NO_SCAN Trend
  // =========================================================
  const missingAndNoScanTrend = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    const dateKeys = Array.from(new Set(scopedAttendance.map((r) => r.workDate))).sort();

    return dateKeys.map((dKey) => {
      const recs = scopedAttendance.filter((r) => r.workDate === dKey);
      const missingOut = recs.filter(
        (r) => r.status === 'MISSING_CHECKOUT' || (Boolean(r.checkInAt) && !r.checkOutAt)
      );
      const noScanExcused = recs.filter((r) => r.status === 'NO_SCAN' && Boolean(r.notes));
      const noScanUnverified = recs.filter((r) => r.status === 'NO_SCAN' && !r.notes);

      return {
        workDate: dKey,
        shortDate: dKey.slice(5),
        missingOutCount: missingOut.length,
        noScanExcusedCount: noScanExcused.length,
        noScanUnverifiedCount: noScanUnverified.length,
        totalAnomaly:
          missingOut.length + noScanExcused.length + noScanUnverified.length,
        records: [...missingOut, ...noScanExcused, ...noScanUnverified],
      };
    });
  }, [scopedAttendance, uiSimMode]);

  // =========================================================
  // Chart 5: Scanner Usage Comparison (Counts Raw Scan Events per Scanner)
  // =========================================================
  const scannerUsageStats = useMemo(() => {
    const totalEvents = scopedRawScans.length;
    return scanners.map((sc) => {
      const eventsForScanner = scopedRawScans.filter((s) => s.machineNo === sc.machineNo);
      const sharePct =
        totalEvents > 0
          ? Number(((eventsForScanner.length / totalEvents) * 100).toFixed(1))
          : 0;
      return {
        scanner: sc,
        eventCount: eventsForScanner.length,
        sharePct,
      };
    });
  }, [scanners, scopedRawScans]);

  // =========================================================
  // Chart 6: Lateness Ranking Top 10 (Sortable DESC/ASC)
  // =========================================================
  const latenessTop10 = useMemo(() => {
    if (uiSimMode === 'EMPTY') return [];
    const personMap = new Map<
      string,
      {
        personId: string;
        fingleId: number;
        fullName: string;
        department: string;
        groupName: string;
        personnelType: string;
        evaluatedShifts: number;
        lateOccurrences: number;
        totalLateMinutes: number;
        lateRecords: AttendanceRecord[];
      }
    >();

    scopedAttendance.forEach((rec) => {
      if (!personMap.has(rec.personId)) {
        personMap.set(rec.personId, {
          personId: rec.personId,
          fingleId: rec.fingleId,
          fullName: rec.fullName,
          department: rec.department,
          groupName: rec.groupName,
          personnelType: rec.personnelType,
          evaluatedShifts: 0,
          lateOccurrences: 0,
          totalLateMinutes: 0,
          lateRecords: [],
        });
      }
      const pEntry = personMap.get(rec.personId)!;
      pEntry.evaluatedShifts++;
      if (rec.status === 'LATE' || rec.lateMinutes > 0) {
        pEntry.lateOccurrences++;
        pEntry.totalLateMinutes += rec.lateMinutes;
        pEntry.lateRecords.push(rec);
      }
    });

    const onlyLatePeople = Array.from(personMap.values()).filter(
      (p) => p.lateOccurrences > 0
    );

    onlyLatePeople.sort((a, b) => {
      if (topLateSortBy === 'MINUTES_ASC') {
        return a.totalLateMinutes - b.totalLateMinutes || a.lateOccurrences - b.lateOccurrences;
      }
      if (topLateSortBy === 'COUNT_DESC') {
        return b.lateOccurrences - a.lateOccurrences || b.totalLateMinutes - a.totalLateMinutes;
      }
      return b.totalLateMinutes - a.totalLateMinutes || b.lateOccurrences - a.lateOccurrences;
    });

    return onlyLatePeople.slice(0, 10);
  }, [scopedAttendance, topLateSortBy, uiSimMode]);

  // Trigger Mock Scanner Sync
  const handleSyncScans = () => {
    setIsSyncing(true);
    setSyncBannerMsg(null);
    setTimeout(() => {
      const res = mockAttendanceService.triggerMockScannerSync();
      setIsSyncing(false);
      if (uiSimMode === 'EMPTY') setUiSimMode('NORMAL');
      setRefreshKey((k) => k + 1);
      setSyncBannerMsg(
        `ซิงค์ข้อมูลสแกนจำลองสำเร็จ: อ่านจากเครื่องสแกน ${res.totalRead} เหตุการณ์ (เหตุการณ์ใหม่ +${res.newScans}, ข้ามรายการซ้ำ ${res.duplicateScans}, รวมในระบบ ${res.totalEventsAfterSync} เหตุการณ์)`
      );
    }, 350);
  };

  const handleResetFilters = () => {
    setDateMode('DAILY');
    setSelectedDate('2026-11-06');
    setSelectedGroup('ALL');
    setSelectedDepartment('ALL');
    setSelectedPersonnelType('ALL');
  };

  const latestSyncTime = syncRuns[0]?.finishedAt || '2026-11-06 08:00:30';

  return (
    <div className="space-y-5 pb-8">
      {/* =================================================================
          SECTION 1: HEADER + GLOBAL FILTERS (§3.2 & §3.8 Order #1)
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left Title & Identity */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="bg-violet-50 border border-violet-200 text-violet-800 px-3 py-0.5 rounded-lg font-bold">
                โรงพยาบาลสามชุก จ.สุพรรณบุรี
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-600 font-medium">
                HR & Executive Attendance Dashboard
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5 text-violet-700 font-semibold bg-violet-50/80 px-2.5 py-0.5 rounded-full border border-violet-200">
                <span className="w-2 h-2 rounded-full bg-violet-600" />
                Mock Data Mode ({dateScope.label})
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              แดชบอร์ดผู้บริหารและ HR — ภาพรวมการลงเวลาและเครื่องสแกน
            </h1>
            <p className="text-xs text-slate-500">
              วิเคราะห์สถิติการปฏิบัติงาน อัตราตรงเวลา/มาสาย รายงานสแกนไม่ครบ (MISSING_CHECKOUT) และปริมาณการใช้งานเครื่องสแกนทั้ง 3 จุดจากชุดข้อมูลเดียวกัน
            </p>
          </div>

          {/* Right Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-violet-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-violet-600" />
              <span>รีเซ็ตตัวกรอง</span>
            </button>

            <button
              type="button"
              onClick={handleSyncScans}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{isSyncing ? 'กำลังดึงข้อมูล...' : 'จำลองดึงสแกน (Sync Mock)'}</span>
            </button>
          </div>
        </div>

        {/* Global Filters Bar: Date Mode + Organization / Personnel Type Filters */}
        <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Date Mode Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-violet-600" />
                ช่วงเวลา:
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#E9E5F2] rounded-xl text-xs">
                {(
                  [
                    { id: 'DAILY', label: 'รายวัน' },
                    { id: 'MONTHLY', label: 'รายเดือน' },
                    { id: 'YEARLY', label: 'รายปี' },
                    { id: 'CUSTOM', label: 'กำหนดเอง' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDateMode(m.id)}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      dateMode === m.id
                        ? 'bg-violet-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-violet-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Date Picker Control based on Mode */}
              {dateMode === 'DAILY' && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value || '2026-11-06')}
                  className="bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs font-mono-data font-bold text-violet-900 focus:outline-none cursor-pointer"
                />
              )}

              {dateMode === 'MONTHLY' && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs font-bold text-violet-900 focus:outline-none cursor-pointer"
                >
                  <option value="2026-11">พฤศจิกายน 2569 (2026-11)</option>
                  <option value="2026-10">ตุลาคม 2569 (2026-10)</option>
                </select>
              )}

              {dateMode === 'YEARLY' && (
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs font-bold text-violet-900 focus:outline-none cursor-pointer"
                >
                  <option value="2026">ปี พ.ศ. 2569 (2026)</option>
                  <option value="2025">ปี พ.ศ. 2568 (2025)</option>
                </select>
              )}

              {dateMode === 'CUSTOM' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="bg-white border border-[#E9E5F2] rounded-xl px-2.5 py-1.5 font-mono-data font-bold text-slate-800"
                  />
                  <span className="text-slate-400">ถึง</span>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="bg-white border border-[#E9E5F2] rounded-xl px-2.5 py-1.5 font-mono-data font-bold text-slate-800"
                  />
                </div>
              )}
            </div>

            {/* UX State Simulator Switcher */}
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-slate-500 font-medium mr-1">โหมดทดสอบ UI:</span>
              {(
                [
                  { id: 'NORMAL', label: 'ปกติ (Mock)' },
                  { id: 'EMPTY', label: 'ว่างเปล่า (0)' },
                  { id: 'LOADING', label: 'กำลังโหลด' },
                  { id: 'ERROR', label: 'ข้อผิดพลาด' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setUiSimMode(st.id)}
                  className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                    uiSimMode === st.id
                      ? st.id === 'ERROR'
                        ? 'bg-rose-600 text-white'
                        : 'bg-violet-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Organization / Personnel Type Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-[#E9E5F2]">
            {/* 1. กลุ่มงาน */}
            <div className="flex items-center gap-2 bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs">
              <Building2 className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-slate-500 shrink-0">กลุ่มงาน:</span>
              <select
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  setSelectedDepartment('ALL');
                }}
                className="w-full font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="ALL">ทุกกลุ่มงาน / ทั้งโรงพยาบาล</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. ฝ่าย / แผนก */}
            <div className="flex items-center gap-2 bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs">
              <Filter className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-slate-500 shrink-0">ฝ่าย/แผนก:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="ALL">ทุกฝ่าย / แผนก</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. ประเภทบุคลากร */}
            <div className="flex items-center gap-2 bg-white border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs">
              <Users className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-slate-500 shrink-0">ประเภทบุคลากร:</span>
              <select
                value={selectedPersonnelType}
                onChange={(e) => setSelectedPersonnelType(e.target.value)}
                className="w-full font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="ALL">ทุกประเภทบุคลากร</option>
                {personnelTypeOptions.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Toast Feedback */}
      {syncBannerMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-xs text-emerald-950 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncBannerMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncBannerMsg(null)}
            className="p-1 text-emerald-700 hover:text-emerald-900 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Simulation State */}
      {uiSimMode === 'ERROR' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-rose-950">
                จำลองสถานะข้อผิดพลาดในการโหลดข้อมูลแดชบอร์ด (Error Simulation)
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                กดปุ่ม &ldquo;กลับสู่โหมดปกติ&rdquo; เพื่อแสดงข้อมูลจำลองของโรงพยาบาลสามชุกตามปกติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUiSimMode('NORMAL')}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            กลับสู่โหมดปกติ
          </button>
        </div>
      )}

      {/* Loading Skeleton State */}
      {uiSimMode === 'LOADING' ? (
        <div className="space-y-5 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-2xl p-4 h-28 flex flex-col justify-between"
              >
                <div className="h-3.5 w-28 bg-slate-200 rounded" />
                <div className="h-7 w-20 bg-slate-200 rounded" />
                <div className="h-3 w-36 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 h-64" />
        </div>
      ) : (
        <>
          {/* =================================================================
              SECTION 2: EIGHT KPI SUMMARY CARDS (§3.3 & §3.8 Order #2)
              Explicit units (คน, วัน, กะ, ครั้ง, นาที) and explicit numerator/denominator
             ================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* KPI 1: จำนวนบุคลากรทั้งหมด */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setModalState({
                  type: 'ALL_PERSONNEL',
                  title: 'รายชื่อบุคลากรทั้งหมดในขอบเขตตัวกรอง',
                  subtitle: `กลุ่มงาน/แผนกที่เลือก (${dateScope.label})`,
                })
              }
              className="bg-white border border-[#E9E5F2] hover:border-violet-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>1. จำนวนบุคลากรทั้งหมด</span>
                <Users className="w-4 h-4 text-violet-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-slate-900">
                  {kpiMetrics.totalPersonnelCount}
                </span>
                <span className="text-xs font-semibold text-slate-500">คน</span>
              </div>
              <div className="text-[11px] text-violet-700 font-medium">
                มีตารางกะที่ประเมินรวม {kpiMetrics.totalEvaluatedShifts} กะ
              </div>
            </div>

            {/* KPI 2: จำนวนบุคลากรที่มาปฏิบัติงาน */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายการที่มาปฏิบัติงาน (Present Shifts)',
                  subtitle: `รวมผู้สแกนเข้างานทั้งตรงเวลา มาสาย และสแกนไม่ครบ (${dateScope.label})`,
                  badgeText: `${kpiMetrics.presentShiftRecords.length} กะ`,
                  records: kpiMetrics.presentShiftRecords,
                })
              }
              className="bg-white border border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>2. มาปฏิบัติงาน</span>
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-emerald-700">
                  {kpiMetrics.distinctPresentPeople}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  คน ({kpiMetrics.presentShiftRecords.length} กะ)
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 font-medium">
                จากบุคลากรในขอบเขต {kpiMetrics.totalPersonnelCount} คน
              </div>
            </div>

            {/* KPI 3: จำนวนรายการปฏิบัติงานตรงเวลา */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายการปฏิบัติงานตรงเวลา (On-Time Shifts)',
                  subtitle: `สแกนเข้างานภายในเวลาเริ่มกะ + Grace Period (${dateScope.label})`,
                  badgeText: `${kpiMetrics.onTimeShiftRecords.length} กะ`,
                  records: kpiMetrics.onTimeShiftRecords,
                })
              }
              className="bg-white border border-emerald-200 hover:border-emerald-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>3. ปฏิบัติงานตรงเวลา</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-slate-900">
                  {kpiMetrics.onTimeShiftRecords.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">กะ (ครั้ง)</span>
              </div>
              <div className="text-[11px] text-slate-600">
                คิดเป็น {kpiMetrics.onTimeRateOfPresentPct}% ของกะที่มาปฏิบัติงาน ({kpiMetrics.onTimeShiftRecords.length}/{kpiMetrics.presentShiftRecords.length} กะ)
              </div>
            </div>

            {/* KPI 4: จำนวนเหตุการณ์มาสาย */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายการเหตุการณ์มาสาย (Late Events)',
                  subtitle: `แยกจำนวนครั้งที่มาสาย (${kpiMetrics.lateShiftRecords.length} ครั้ง) และจำนวนผู้มาสายไม่ซ้ำคน (${kpiMetrics.distinctLatePeople} คน)`,
                  badgeText: `${kpiMetrics.lateShiftRecords.length} ครั้ง`,
                  records: kpiMetrics.lateShiftRecords,
                })
              }
              className="bg-amber-50/40 border-2 border-amber-300 hover:border-amber-500 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                <span>4. เหตุการณ์มาสาย</span>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-amber-800">
                  {kpiMetrics.lateShiftRecords.length}
                </span>
                <span className="text-xs font-semibold text-amber-900">
                  ครั้ง ({kpiMetrics.distinctLatePeople} คน)
                </span>
              </div>
              <div className="text-[11px] font-semibold text-amber-800">
                จากกะที่ประเมินทั้งหมด {kpiMetrics.totalEvaluatedShifts} กะ
              </div>
            </div>

            {/* KPI 5: จำนวนนาทีมาสายรวม */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายละเอียดจำนวนนาทีมาสายรวม (Total Late Minutes)',
                  subtitle: `รวมเวลาสาย ${kpiMetrics.totalLateMinutes} นาที จาก ${kpiMetrics.lateShiftRecords.length} ครั้ง (${kpiMetrics.distinctLatePeople} คน)`,
                  badgeText: `${kpiMetrics.totalLateMinutes} นาที`,
                  records: kpiMetrics.lateShiftRecords,
                })
              }
              className="bg-white border border-amber-200 hover:border-amber-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>5. นาทีมาสายรวม</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-slate-900">
                  {kpiMetrics.totalLateMinutes}
                </span>
                <span className="text-xs font-semibold text-slate-500">นาที</span>
              </div>
              <div className="text-[11px] text-slate-600">
                เฉลี่ย{' '}
                {kpiMetrics.lateShiftRecords.length > 0
                  ? Math.round(kpiMetrics.totalLateMinutes / kpiMetrics.lateShiftRecords.length)
                  : 0}{' '}
                นาที/ครั้ง ({kpiMetrics.totalLateMinutes} ÷ {kpiMetrics.lateShiftRecords.length || 1} ครั้ง)
              </div>
            </div>

            {/* KPI 6: จำนวน MISSING_CHECKOUT */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายการสแกนไม่ครบ / ลืมสแกนออก (MISSING_CHECKOUT)',
                  subtitle: `พบการสแกนเข้าแต่ไม่พบเวลาสแกนออกเมื่อสิ้นสุดกะ (${dateScope.label})`,
                  badgeText: `${kpiMetrics.missingCheckoutRecords.length} กะ`,
                  records: kpiMetrics.missingCheckoutRecords,
                })
              }
              className="bg-white border border-orange-200 hover:border-orange-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>6. ลืมสแกนออก (MISSING_CHECKOUT)</span>
                <FileWarning className="w-4 h-4 text-orange-500" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-orange-700">
                  {kpiMetrics.missingCheckoutRecords.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  กะ ({kpiMetrics.distinctMissingCheckoutPeople} คน)
                </span>
              </div>
              <div className="text-[11px] text-orange-800">
                มีสแกนเข้าแต่ขาดสแกนออกหลังจบกะ
              </div>
            </div>

            {/* KPI 7: จำนวน NO_SCAN */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายการไม่พบข้อมูลสแกนในกะที่ถึงกำหนด (NO_SCAN)',
                  subtitle: `แยกเป็นผู้มีหมายเหตุลา/ไปราชการ ${kpiMetrics.noScanExcusedRecords.length} กะ และรอตรวจสอบ ${kpiMetrics.noScanUnverifiedRecords.length} กะ (ไม่นับวันหยุดหรือกะที่ยังไม่ถึงกำหนด)`,
                  badgeText: `${kpiMetrics.noScanRecords.length} กะ`,
                  records: kpiMetrics.noScanRecords,
                })
              }
              className="bg-white border border-rose-200 hover:border-rose-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>7. ไม่พบสแกน (NO_SCAN)</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-rose-700">
                  {kpiMetrics.noScanRecords.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">กะ</span>
              </div>
              <div className="text-[11px] text-slate-600">
                มีหมายเหตุลา/ราชการ {kpiMetrics.noScanExcusedRecords.length} กะ · รอตรวจสอบ{' '}
                {kpiMetrics.noScanUnverifiedRecords.length} กะ
              </div>
            </div>

            {/* KPI 8: อัตราการมาปฏิบัติงาน */}
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                setCustomDrilldown({
                  title: 'รายละเอียดการคำนวณอัตราการมาปฏิบัติงาน (Attendance Rate)',
                  subtitle: `คำนวณจากจำนวนกะที่มาปฏิบัติงานจริง (${kpiMetrics.presentShiftRecords.length} กะ) หารด้วยจำนวนกะที่ถึงกำหนดประเมินทั้งหมด (${kpiMetrics.totalEvaluatedShifts} กะ)`,
                  badgeText: `${kpiMetrics.attendanceRatePct}%`,
                  records: scopedAttendance,
                })
              }
              className="bg-violet-50/50 border border-violet-200 hover:border-violet-400 rounded-2xl p-4 shadow-2xs transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-xs font-bold text-violet-950">
                <span>8. อัตราการมาปฏิบัติงาน</span>
                <TrendingUp className="w-4 h-4 text-violet-600" />
              </div>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-mono-data text-violet-800">
                  {kpiMetrics.attendanceRatePct}%
                </span>
              </div>
              <div className="text-[11px] font-semibold text-violet-800">
                ตัวตั้ง {kpiMetrics.presentShiftRecords.length} กะที่มา ÷ ตัวหาร{' '}
                {kpiMetrics.totalEvaluatedShifts} กะที่ประเมิน
              </div>
            </div>
          </div>

          {/* =================================================================
              SECTION 3: CHART 1 — ATTENDANCE & LATENESS TREND (§3.6 #1 & §3.8 Order #3)
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <BarChart3 className="w-4 h-4 text-violet-600" />
                  <span>
                    กราฟที่ 1: แนวโน้มการมาปฏิบัติงานและการมาสาย (Attendance & Lateness Trend)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  แกนเวลาปรับตามตัวกรองอัตโนมัติ ({dateMode === 'DAILY' ? 'รายชั่วโมง' : dateMode === 'YEARLY' ? 'รายเดือน' : 'รายวัน'}) — คลิกที่แท่งกราฟเพื่อดูรายชื่อบุคลากรในช่วงเวลานั้น
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  ตรงเวลา (กะ)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  มาสาย (กะ)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  เหตุการณ์สแกนดิบ (ครั้ง)
                </span>
              </div>
            </div>

            {attendanceTrendSeries.length === 0 ? (
              <div className="h-44 rounded-xl bg-[#F8F7FC] border border-dashed border-[#E9E5F2] flex items-center justify-center text-xs text-slate-400">
                ไม่พบข้อมูลแนวโน้มในช่วงเวลาที่เลือก
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 pt-2">
                {attendanceTrendSeries.map((bucket) => {
                  const onTimePct = Math.round((bucket.onTimeCount / maxTrendValue) * 100);
                  const latePct = Math.round((bucket.lateCount / maxTrendValue) * 100);

                  return (
                    <button
                      key={bucket.key}
                      type="button"
                      onClick={() =>
                        setCustomDrilldown({
                          title: `รายละเอียดการลงเวลา — ${bucket.fullLabel}`,
                          subtitle: `ตรงเวลา ${bucket.onTimeCount} กะ · มาสาย ${bucket.lateCount} กะ · เหตุการณ์ Raw Scan ${bucket.rawEventsCount} ครั้ง`,
                          badgeText: bucket.label,
                          records: bucket.records,
                        })
                      }
                      title={`${bucket.fullLabel}: ตรงเวลา ${bucket.onTimeCount} กะ, มาสาย ${bucket.lateCount} กะ, สแกนดิบ ${bucket.rawEventsCount} ครั้ง`}
                      className="bg-[#F8F7FC] hover:bg-violet-50/70 border border-[#E9E5F2] hover:border-violet-300 rounded-xl p-2.5 flex flex-col justify-between transition-all cursor-pointer text-left group"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-data text-slate-500 mb-2">
                        <span className="font-bold text-slate-700 group-hover:text-violet-800">
                          {bucket.label}
                        </span>
                        <span className="text-violet-700 font-semibold">
                          {bucket.rawEventsCount} สแกน
                        </span>
                      </div>

                      {/* Vertical Stacked Bar representation */}
                      <div className="h-24 w-full bg-white border border-slate-200/80 rounded-lg p-1.5 flex items-end justify-center gap-1.5">
                        <div
                          style={{ height: `${Math.max(8, onTimePct)}%` }}
                          className="w-3 bg-emerald-500 rounded-t transition-all"
                          title={`ตรงเวลา: ${bucket.onTimeCount} กะ`}
                        />
                        <div
                          style={{ height: `${Math.max(8, latePct)}%` }}
                          className="w-3 bg-amber-500 rounded-t transition-all"
                          title={`มาสาย: ${bucket.lateCount} กะ`}
                        />
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[10px] font-mono-data">
                        <span className="text-emerald-700 font-bold">
                          ปกติ {bucket.onTimeCount}
                        </span>
                        <span className="text-amber-700 font-bold">
                          สาย {bucket.lateCount}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* =================================================================
              SECTION 4: CHART 3 — ATTENDANCE STATUS BREAKDOWN (§3.6 #3 & §3.8 Order #4)
              100% Mutually Exclusive Breakdown
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <PieChart className="w-4 h-4 text-violet-600" />
                  <span>
                    กราฟที่ 3: สัดส่วนสถานะการลงเวลาแบบไม่ซ้ำหมวดหมู่ (Attendance Status Breakdown — 100%)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  แบ่งทุกกะที่ประเมิน ({statusBreakdown.total} กะ) ออกเป็น 5 หมวดหมู่แบบไม่ซ้อนทับกัน (Mutually Exclusive) รวมสัดส่วนได้ 100% พอดี
                </p>
              </div>
              <span className="text-xs font-mono-data font-bold text-violet-800 bg-violet-50 border border-violet-200 px-3 py-1 rounded-xl">
                ฐานการคำนวณรวม: {statusBreakdown.total} กะ (100%)
              </span>
            </div>

            {/* 100% Stacked Progress Bar */}
            <div className="h-5 w-full rounded-xl bg-slate-100 overflow-hidden flex border border-[#E9E5F2]">
              {statusBreakdown.items.map((item) =>
                item.count > 0 ? (
                  <div
                    key={item.id}
                    style={{ width: `${Math.max(3, item.pct)}%` }}
                    className={`${item.colorClass} h-full transition-all border-r border-white last:border-r-0`}
                    title={`${item.label}: ${item.count} กะ (${item.pct}%)`}
                  />
                ) : null
              )}
            </div>

            {/* 5 Clickable Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {statusBreakdown.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setCustomDrilldown({
                      title: `หมวดหมู่: ${item.label}`,
                      subtitle: `จำนวน ${item.count} กะ คิดเป็น ${item.pct}% จากทั้งหมด ${statusBreakdown.total} กะ`,
                      badgeText: `${item.pct}%`,
                      records: item.records,
                    })
                  }
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer hover:shadow-xs ${item.badgeClass}`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="truncate">{item.label}</span>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.colorClass}`} />
                  </div>
                  <div className="my-1.5 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono-data">
                      {item.count}{' '}
                      <span className="text-xs font-sans font-normal opacity-80">กะ</span>
                    </span>
                    <span className="text-xs font-mono-data font-bold">{item.pct}%</span>
                  </div>
                  <div className="text-[10px] opacity-80">
                    สัดส่วน {item.count}/{statusBreakdown.total} กะ (คลิกดูรายชื่อ)
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* =================================================================
              SECTION 5: CHART 2 — DEPARTMENT LATENESS COMPARISON (§3.6 #2 & §3.8 Order #5)
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Building2 className="w-4 h-4 text-violet-600" />
                  <span>
                    กราฟที่ 2: เปรียบเทียบการมาสายแยกตามฝ่าย / แผนก (Department Lateness Comparison)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  แสดงจำนวนเหตุการณ์มาสาย (ครั้ง), นาทีสายรวม, จำนวนกะทั้งหมดของแผนก และอัตราการมาสาย (%)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDeptSortDir((d) => (d === 'DESC' ? 'ASC' : 'DESC'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8F7FC] hover:bg-violet-50 border border-[#E9E5F2] text-xs font-bold text-slate-700 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-violet-600" />
                <span>
                  เรียงลำดับ: {deptSortDir === 'DESC' ? 'สายมากไปน้อย (DESC)' : 'สายน้อยไปมาก (ASC)'}
                </span>
              </button>
            </div>

            {departmentComparison.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                ไม่พบข้อมูลแผนกในขอบเขตที่เลือก
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {departmentComparison.map((dept) => (
                  <button
                    key={dept.department}
                    type="button"
                    onClick={() =>
                      setCustomDrilldown({
                        title: `ข้อมูลการลงเวลาแผนก — ${dept.department}`,
                        subtitle: `${dept.groupName} · ประเมิน ${dept.evaluatedShifts} กะ · มาสาย ${dept.lateEvents} ครั้ง (รวม ${dept.lateMinutes} นาที)`,
                        badgeText: `สาย ${dept.lateRatePct}%`,
                        records: dept.records,
                      })
                    }
                    className="bg-[#F8F7FC] hover:bg-violet-50/50 border border-[#E9E5F2] hover:border-violet-300 rounded-xl p-3.5 text-left transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{dept.department}</div>
                        <div className="text-[11px] text-slate-500">{dept.groupName}</div>
                      </div>
                      <div className="text-right font-mono-data">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                            dept.lateEvents > 0
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          สาย {dept.lateEvents} ครั้ง ({dept.lateRatePct}%)
                        </span>
                      </div>
                    </div>

                    {/* Horizontal Bar */}
                    <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                      <div
                        style={{ width: `${Math.min(100, dept.lateRatePct)}%` }}
                        className="bg-amber-500 h-full"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 font-mono-data">
                      <span>กะที่ประเมิน: {dept.evaluatedShifts} กะ</span>
                      <span>นาทีสายรวม: {dept.lateMinutes} นาที</span>
                      <span>ลืมสแกนออก: {dept.missingCheckoutCount} กะ</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* =================================================================
              SECTION 6: CHART 4 — MISSING CHECKOUT & NO_SCAN TREND (§3.6 #4 & §3.8 Order #6)
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <FileWarning className="w-4 h-4 text-orange-500" />
                  <span>
                    กราฟที่ 4: แนวโน้มการลืมสแกนออกและไม่พบสแกน (Missing Checkout & NO_SCAN Trend)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  แยกแสดงรายการลืมสแกนออก (MISSING_CHECKOUT), รายการที่มีหมายเหตุลา/ไปราชการ/อบรม และรายการ NO_SCAN ที่ยังไม่ได้ตรวจสอบ
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 text-orange-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  MISSING_CHECKOUT
                </span>
                <span className="inline-flex items-center gap-1.5 text-violet-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                  NO_SCAN (มีหมายเหตุลา/ราชการ)
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  NO_SCAN (รอตรวจสอบ)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {missingAndNoScanTrend.map((dayItem) => (
                <button
                  key={dayItem.workDate}
                  type="button"
                  onClick={() =>
                    setCustomDrilldown({
                      title: `รายการความผิดปกติการสแกน — วันที่ ${dayItem.workDate}`,
                      subtitle: `ลืมสแกนออก ${dayItem.missingOutCount} กะ · ลา/ไปราชการ ${dayItem.noScanExcusedCount} กะ · รอตรวจสอบ ${dayItem.noScanUnverifiedCount} กะ`,
                      badgeText: dayItem.workDate,
                      records: dayItem.records,
                    })
                  }
                  className="bg-[#F8F7FC] hover:bg-violet-50/50 border border-[#E9E5F2] hover:border-violet-300 rounded-xl p-3.5 text-left transition-all cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono-data font-bold text-xs text-slate-900">
                      วันที่ {dayItem.workDate}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono-data font-bold text-[11px] text-slate-700">
                      รวม {dayItem.totalAnomaly} กะ
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-orange-800">
                      <span>• ลืมสแกนออก (MISSING_CHECKOUT):</span>
                      <strong className="font-mono-data">{dayItem.missingOutCount} กะ</strong>
                    </div>
                    <div className="flex items-center justify-between text-violet-800">
                      <span>• NO_SCAN มีหมายเหตุลา/ราชการ:</span>
                      <strong className="font-mono-data">{dayItem.noScanExcusedCount} กะ</strong>
                    </div>
                    <div className="flex items-center justify-between text-rose-700">
                      <span>• NO_SCAN รอตรวจสอบ:</span>
                      <strong className="font-mono-data">{dayItem.noScanUnverifiedCount} กะ</strong>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* =================================================================
              SECTION 7: CHART 5 — SCANNER USAGE COMPARISON (§3.6 #5 & §3.8 Order #7)
              Counts Raw Scan Events per Scanner (NOT personnel count)
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Activity className="w-4 h-4 text-violet-600" />
                  <span>
                    กราฟที่ 5: เปรียบเทียบปริมาณการใช้งานเครื่องสแกนทั้ง 3 จุด (Scanner Usage Comparison)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  นับจากจำนวนเหตุการณ์สแกนดิบ (Raw Scan Events) ของแต่ละเครื่องในช่วงเวลาที่เลือก (ไม่ใช่นับจำนวนบุคลากร)
                </p>
              </div>

              <span className="px-3 py-1 rounded-xl bg-violet-50 border border-violet-200 text-violet-800 font-mono-data font-bold text-xs">
                รวมทั้งหมด {scopedRawScans.length} เหตุการณ์สแกน (ครั้ง)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {scannerUsageStats.map(({ scanner, eventCount, sharePct }) => (
                <button
                  key={scanner.id}
                  type="button"
                  onClick={() =>
                    setModalState({
                      type: 'SCANNER_DEVICE_DETAIL',
                      scannerDevice: scanner,
                      title: `ประวัติและรายการสแกนดิบ — ${scanner.name}`,
                      subtitle: `IP: ${scanner.ip}:${scanner.port} · จำนวนเหตุการณ์ในช่วงที่เลือก ${eventCount} ครั้ง (${sharePct}%)`,
                    })
                  }
                  className="bg-[#F8F7FC] hover:bg-violet-50/50 border border-[#E9E5F2] hover:border-violet-300 rounded-xl p-4 text-left transition-all cursor-pointer space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-violet-800">
                      Scanner #{scanner.machineNo}
                    </span>
                    <span className="font-mono-data text-xs font-bold text-slate-700">
                      สัดส่วน {sharePct}%
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900 truncate">{scanner.name}</div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold font-mono-data text-slate-900">
                      {eventCount}
                    </span>
                    <span className="text-xs text-slate-500">เหตุการณ์สแกน (ครั้ง)</span>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(4, sharePct)}%` }}
                      className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9]"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* =================================================================
              SECTION 8: COMPACT SCANNER TELEMETRY CARDS (§3.5 & §3.8 Order #8)
              No excessive height, no mt-auto / justify-between bottom gap
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-600 shrink-0" />
                <h2 className="text-sm font-bold text-slate-900">
                  สถานะและปริมาณการใช้งานเครื่องสแกน 3 จุด (HIP CMiF68S Telemetry)
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold">
                  Sync Socket: Port 5005 Active (Mock)
                </span>
                <span className="text-slate-400 font-mono-data">
                  ซิงค์ล่าสุด: {latestSyncTime}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {scannerUsageStats.map(({ scanner, eventCount }) => (
                <div
                  key={scanner.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setModalState({
                      type: 'SCANNER_DEVICE_DETAIL',
                      scannerDevice: scanner,
                      title: `รายละเอียดเครื่องสแกน — ${scanner.name}`,
                      subtitle: `IP Address: ${scanner.ip}:${scanner.port} · โมเดล HIP CMiF68S (Mock Status)`,
                    })
                  }
                  className="bg-[#F8F7FC] hover:bg-violet-50/60 border border-[#E9E5F2] hover:border-violet-300 rounded-xl p-3.5 transition-all cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {scanner.name}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      Online (Mock)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[#E9E5F2]">
                    <div>
                      <span className="text-slate-500 block">จำนวนสแกนในช่วงที่เลือก:</span>
                      <strong className="font-mono-data text-violet-800 text-xs">
                        {eventCount} เหตุการณ์
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ซิงค์ล่าสุด:</span>
                      <strong className="font-mono-data text-slate-800 text-[11px]">
                        {scanner.lastSyncAt ? scanner.lastSyncAt.split(' ')[1] : '08:00:12'} น.
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* =================================================================
              SECTION 9: CHART 6 — LATENESS RANKING TOP 10 (§3.6 #6 & §3.8 Order #9)
             ================================================================= */}
          <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Award className="w-4 h-4 text-amber-600" />
                  <span>
                    กราฟที่ 6: อันดับบุคลากรที่มาสายสูงสุด Top 10 (Lateness Ranking Top 10)
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  แสดงทั้งจำนวนครั้งที่มาสาย ({kpiMetrics.lateShiftRecords.length} ครั้งรวม) และจำนวนคนที่มาสายไม่ซ้ำคน ({kpiMetrics.distinctLatePeople} คน) พร้อมจำนวนกะที่ประเมิน
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTopLateSortBy('MINUTES_DESC')}
                  className={`px-3 py-1.5 rounded-xl font-bold border cursor-pointer ${
                    topLateSortBy === 'MINUTES_DESC'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-[#F8F7FC] text-slate-700 border-[#E9E5F2]'
                  }`}
                >
                  นาทีสาย มาก → น้อย
                </button>
                <button
                  type="button"
                  onClick={() => setTopLateSortBy('COUNT_DESC')}
                  className={`px-3 py-1.5 rounded-xl font-bold border cursor-pointer ${
                    topLateSortBy === 'COUNT_DESC'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-[#F8F7FC] text-slate-700 border-[#E9E5F2]'
                  }`}
                >
                  จำนวนครั้ง มาก → น้อย
                </button>
                <button
                  type="button"
                  onClick={() => setTopLateSortBy('MINUTES_ASC')}
                  className={`px-3 py-1.5 rounded-xl font-bold border cursor-pointer ${
                    topLateSortBy === 'MINUTES_ASC'
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-[#F8F7FC] text-slate-700 border-[#E9E5F2]'
                  }`}
                >
                  นาทีสาย น้อย → มาก
                </button>
              </div>
            </div>

            {latenessTop10.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-[#F8F7FC] rounded-xl border border-dashed border-[#E9E5F2]">
                ไม่มีบุคลากรที่มาสายในช่วงเวลาและตัวกรองที่เลือก
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#E9E5F2] rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                      <th className="py-2.5 px-3 text-center w-14">อันดับ</th>
                      <th className="py-2.5 px-3">รหัส / ชื่อ - นามสกุล</th>
                      <th className="py-2.5 px-3">ฝ่าย / กลุ่มงาน</th>
                      <th className="py-2.5 px-3">ประเภทบุคลากร</th>
                      <th className="py-2.5 px-3 text-center">จำนวนกะที่ประเมิน</th>
                      <th className="py-2.5 px-3 text-center">จำนวนครั้งที่มาสาย</th>
                      <th className="py-2.5 px-3 text-right">นาทีมาสายรวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E5F2]">
                    {latenessTop10.map((item, idx) => (
                      <tr
                        key={item.personId}
                        onClick={() =>
                          setCustomDrilldown({
                            title: `ประวัติการมาสาย — ${item.fullName} (${item.personId})`,
                            subtitle: `${item.department} · มาสาย ${item.lateOccurrences} ครั้ง จาก ${item.evaluatedShifts} กะ (รวม ${item.totalLateMinutes} นาที)`,
                            badgeText: `รวม ${item.totalLateMinutes} นาที`,
                            records: item.lateRecords,
                          })
                        }
                        className="hover:bg-amber-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 text-center font-mono-data font-bold text-amber-800">
                          #{idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.fullName}</div>
                          <div className="text-[11px] font-mono text-violet-700">
                            {item.personId} · FID #{item.fingleId}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div className="font-semibold text-slate-800">{item.department}</div>
                          <div className="text-[11px] text-slate-400">{item.groupName}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-200 text-[11px] font-semibold">
                            {item.personnelType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono-data font-semibold text-slate-700">
                          {item.evaluatedShifts} กะ
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono-data font-bold">
                            {item.lateOccurrences} ครั้ง
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-data font-bold text-rose-700">
                          +{item.totalLateMinutes} นาที
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* =================================================================
          MODAL A: EXISTING DASHBOARD DETAIL MODAL (For Personnel & Scanners)
         ================================================================= */}
      <DashboardDetailModal
        modalState={modalState}
        onClose={() => setModalState(null)}
        selectedDate={dateScope.to}
        selectedGroup={selectedGroup}
        personnelList={scopedPersonnel}
        attendanceList={scopedAttendance}
        rawScansList={scopedRawScans}
        scannersList={scanners}
        syncRunsList={syncRuns}
        pushHistoryList={pushHistory}
        onNavigateToView={onNavigateToView}
      />

      {/* =================================================================
          MODAL B: CUSTOM DRILLDOWN MODAL FOR KPI CARDS & CHARTS 1-6
         ================================================================= */}
      <SharedModal
        open={!!customDrilldown}
        onClose={() => setCustomDrilldown(null)}
        title={customDrilldown?.title || ''}
        subtitle={customDrilldown?.subtitle}
        badgeText={customDrilldown?.badgeText}
        maxWidthClass="max-w-4xl"
      >
        {customDrilldown && (
          <div className="space-y-4 text-xs">
            <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span>
                  จำนวนกะ/รายการ:{' '}
                  <strong className="font-mono-data text-violet-800">
                    {customDrilldown.records.length} กะ
                  </strong>
                </span>
                <span>|</span>
                <span>
                  จำนวนบุคลากร (ไม่ซ้ำคน):{' '}
                  <strong className="font-mono-data text-slate-900">
                    {new Set(customDrilldown.records.map((r) => r.personId)).size} คน
                  </strong>
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                ขอบเขตข้อมูล: {dateScope.label}
              </span>
            </div>

            <div className="overflow-x-auto border border-[#E9E5F2] rounded-xl max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">วันที่</th>
                    <th className="py-2.5 px-3">รหัส / ชื่อ - สกุล</th>
                    <th className="py-2.5 px-3">ฝ่าย / แผนก</th>
                    <th className="py-2.5 px-3">กะเวลา</th>
                    <th className="py-2.5 px-3">สแกนเข้า</th>
                    <th className="py-2.5 px-3">สแกนออก</th>
                    <th className="py-2.5 px-3">สถานะ</th>
                    <th className="py-2.5 px-3 text-right">นาทีสาย / หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2]">
                  {customDrilldown.records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        ไม่มีรายการในหมวดหมู่นี้
                      </td>
                    </tr>
                  ) : (
                    customDrilldown.records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-violet-50/40">
                        <td className="py-2.5 px-3 font-mono-data font-bold text-slate-800">
                          {rec.workDate}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{rec.fullName}</div>
                          <div className="text-[10px] font-mono text-violet-700">
                            {rec.personId} · FID #{rec.fingleId}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{rec.department}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">{rec.shiftName}</div>
                          <div className="font-mono-data text-[10px] text-slate-500">
                            {rec.shiftStartTime}–{rec.shiftEndTime}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-semibold text-slate-900">
                          {rec.checkInAt ? rec.checkInAt.split(' ')[1] : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600">
                          {rec.checkOutAt ? (
                            rec.checkOutAt.split(' ')[1]
                          ) : rec.checkInAt ? (
                            <span className="text-orange-700 font-bold">ไม่พบสแกนออก</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={rec.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {rec.lateMinutes > 0 && (
                            <span className="font-mono-data font-bold text-amber-800">
                              +{rec.lateMinutes} นาที
                            </span>
                          )}
                          {rec.notes && (
                            <div className="text-[11px] text-violet-800 font-semibold">
                              {rec.notes.reasonLabel}: {rec.notes.note}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
