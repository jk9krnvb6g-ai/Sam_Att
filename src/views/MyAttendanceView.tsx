import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Fingerprint,
  UserCheck,
  Building2,
  ShieldCheck,
  FileCode2,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  FileText,
  Sparkles,
  CalendarClock,
  CalendarOff,
  Clock3,
  Eye,
  Info,
  RotateCcw,
  Layers,
  UserX,
  ArrowUpRight,
} from 'lucide-react';
import {
  mockAttendanceService,
  CURRENT_SYSTEM_DATE,
} from '../services/mockAttendanceService';
import {
  AttendanceRecord,
  AttendanceStatus,
  RawScanEvent,
  Shift,
  ShiftAssignment,
  ShiftVisualCategory,
  UserAccount,
} from '../types/attendance';
import { useAuth } from '../context/AuthContext';
import {
  TablePaginationBar,
  SortableHeader,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import { SharedModal } from '../components/common/SharedModal';
import {
  ShiftCategoryIcon,
  resolveShiftCategory,
  getShiftIconButtonClasses,
} from './PersonnelView';

interface MyAttendanceViewProps {
  currentUser?: UserAccount | null;
}

type ReportPeriodMode = 'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM_RANGE';

type KpiDrilldownType =
  | 'WORKING_DAYS'
  | 'ASSIGNED_SHIFTS'
  | 'LATE_COUNT'
  | 'LATE_MINUTES'
  | 'MISSING_CHECKOUT'
  | 'NO_SCAN_DAYS'
  | null;

export type ResolvedShiftEvaluationStatus =
  | AttendanceStatus
  | 'PENDING_EVALUATION'
  | 'UPCOMING_SHIFT';

export interface MyResolvedShiftEntry {
  key: string;
  workDate: string;
  endDate: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  shortLabel: string;
  startTime: string;
  endTime: string;
  crossMidnight: boolean;
  graceMinutes: number;
  category: ShiftVisualCategory;
  assignment?: ShiftAssignment;
  attendance?: AttendanceRecord;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  evaluationStatus: ResolvedShiftEvaluationStatus;
  noteLabel: string | null;
  noteDetail: string | null;
}

const THAI_MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_WEEKDAYS_FULL = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getThaiDateFullLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const weekday = THAI_WEEKDAYS_FULL[dt.getDay()] || '';
  const monthName = THAI_MONTH_NAMES[m - 1] || '';
  const buddhistYear = y + 543;
  return `${weekday}ที่ ${d} ${monthName} ${buddhistYear} (${dateStr})`;
}

function getShortShiftCategoryLabel(
  category: ShiftVisualCategory,
  fallbackName: string
): string {
  switch (category) {
    case 'MORNING':
      return 'กะเช้า';
    case 'AFTERNOON':
      return 'กะบ่าย';
    case 'NIGHT':
      return 'กะดึก';
    case 'MORNING_AFTERNOON':
      return 'ควบเช้า–บ่าย';
    case 'AFTERNOON_NIGHT':
      return 'ควบบ่าย–ดึก';
    case 'ALL_DAY':
      return 'กะทั้งวัน';
    case 'OFFICIAL':
      return 'เวลาราชการ';
    default: {
      const clean = fallbackName.split('(')[0].trim();
      return clean.length > 14 ? `${clean.slice(0, 14)}…` : clean;
    }
  }
}

export const MyAttendanceView: React.FC<MyAttendanceViewProps> = ({
  currentUser: propCurrentUser,
}) => {
  const { currentUser: authUser } = useAuth();
  const currentUser = propCurrentUser ?? authUser;

  // Calendar month/year state (defaults to CURRENT_SYSTEM_DATE's month: 2026-11)
  const [calendarYear, setCalendarYear] = useState<number>(2026);
  const [calendarMonth, setCalendarMonth] = useState<number>(11); // 1-12

  // Selected day for Calendar Daily Detail Modal (§5.3)
  const [selectedDayModalDate, setSelectedDayModalDate] = useState<
    string | null
  >(null);

  // KPI Drilldown Modal (§4)
  const [activeKpiModal, setActiveKpiModal] =
    useState<KpiDrilldownType>(null);

  // Selected Raw Scan Event for 6-field JSON inspection (§6)
  const [selectedRawScanJson, setSelectedRawScanJson] =
    useState<RawScanEvent | null>(null);

  // Raw Scan History table controls (§6)
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [rawDateFilter, setRawDateFilter] = useState('');
  const [rawMachineFilter, setRawMachineFilter] = useState<string>('ALL');
  const [rawSortKey, setRawSortKey] = useState<string>('scanDateTime');
  const [rawSortDir, setRawSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [rawPage, setRawPage] = useState<number>(1);
  const [rawPageSize, setRawPageSize] = useState<PageSizeOption>(10);

  // My Attendance Report controls (§7)
  const [reportMode, setReportMode] = useState<ReportPeriodMode>('MONTHLY');
  const [reportDailyDate, setReportDailyDate] =
    useState<string>(CURRENT_SYSTEM_DATE);
  const [reportMonthStr, setReportMonthStr] = useState<string>('2026-11');
  const [reportYearStr, setReportYearStr] = useState<string>('2026');
  const [reportFromDate, setReportFromDate] = useState<string>('2026-11-01');
  const [reportToDate, setReportToDate] = useState<string>('2026-11-30');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('ALL');
  const [reportSortKey, setReportSortKey] = useState<string>('workDate');
  const [reportSortDir, setReportSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [reportPage, setReportPage] = useState<number>(1);
  const [reportPageSize, setReportPageSize] = useState<PageSizeOption>(10);

  const allPersonnel = mockAttendanceService.getPersonnel();
  const allShifts = mockAttendanceService.getShifts();
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    allShifts.forEach((s) => map.set(s.id, s));
    return map;
  }, [allShifts]);

  // Strict RBAC & Self-Service Binding (§2 & §9):
  // Never allow viewing or selecting another person's PERSON_ID.
  const myPerson = useMemo(() => {
    if (!currentUser?.personId) return null;
    return (
      allPersonnel.find((p) => p.personId === currentUser.personId) || null
    );
  }, [allPersonnel, currentUser?.personId]);

  // All shift assignments for the logged-in user
  const myAssignments = useMemo(() => {
    if (!myPerson) return [];
    return mockAttendanceService.getPersonShiftAssignments(myPerson.personId);
  }, [myPerson]);

  // All attendance records for the logged-in user
  const myAttendanceRecords = useMemo(() => {
    if (!myPerson) return [];
    return mockAttendanceService.getMyAttendance(myPerson.personId);
  }, [myPerson]);

  // All raw scan events for the logged-in user (strictly filtered by enrollNumber === myPerson.fingleId)
  const myRawScans = useMemo(() => {
    if (!myPerson) return [];
    return mockAttendanceService
      .getRawScans()
      .filter((r) => r.enrollNumber === myPerson.fingleId);
  }, [myPerson]);

  // Group raw scans by YYYY-MM-DD for quick lookup in Calendar and Today status
  const myRawScansByDate = useMemo(() => {
    const map = new Map<string, RawScanEvent[]>();
    myRawScans.forEach((scan) => {
      const datePart = scan.scanDateTime.slice(0, 10);
      if (!map.has(datePart)) map.set(datePart, []);
      map.get(datePart)!.push(scan);
    });
    map.forEach((list) =>
      list.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime))
    );
    return map;
  }, [myRawScans]);

  /**
   * Build unified shift entries for a person across all dates where either a ShiftAssignment
   * or an AttendanceRecord exists.
   * Enforces §3 & §4 rules:
   * - Future dates (workDate > CURRENT_SYSTEM_DATE) -> 'UPCOMING_SHIFT' (never NO_SCAN or MISSING_CHECKOUT)
   * - Today (workDate === CURRENT_SYSTEM_DATE): if shift hasn't concluded yet (e.g. SH09 20:30–23:30),
   *   shows 'PENDING_EVALUATION' (รอประเมิน / กำลังปฏิบัติงาน) and NEVER 'MISSING_CHECKOUT'.
   */
  const allResolvedShiftEntries = useMemo<MyResolvedShiftEntry[]>(() => {
    if (!myPerson) return [];

    const entries: MyResolvedShiftEntry[] = [];
    const matchedAttendanceIds = new Set<string>();

    // First, process all ShiftAssignments
    myAssignments.forEach((asgn) => {
      const shiftObj = shiftMap.get(asgn.shiftId);
      const matchingAtt = myAttendanceRecords.find(
        (att) =>
          att.workDate === asgn.workDate &&
          (att.shiftId === asgn.shiftId ||
            att.shiftStartTime === (asgn.shiftStartTime || shiftObj?.startTime))
      );

      if (matchingAtt) {
        matchedAttendanceIds.add(matchingAtt.id);
      }

      const startTime =
        asgn.shiftStartTime ||
        matchingAtt?.shiftStartTime ||
        shiftObj?.startTime ||
        '08:00';
      const endTime =
        asgn.shiftEndTime ||
        matchingAtt?.shiftEndTime ||
        shiftObj?.endTime ||
        '16:00';
      const crossMidnight =
        asgn.crossMidnight ??
        shiftObj?.crossMidnight ??
        endTime < startTime;
      const graceMinutes =
        asgn.graceMinutes ?? shiftObj?.graceMinutes ?? 15;
      const category = resolveShiftCategory(
        shiftObj,
        asgn.shiftCategory
      ).category;
      const shiftName =
        asgn.shiftName ||
        matchingAtt?.shiftName ||
        shiftObj?.name ||
        'กะปฏิบัติงาน';
      const shiftCode = shiftObj?.code || asgn.shiftId;
      const endDate = crossMidnight
        ? addOneDay(asgn.workDate)
        : asgn.workDate;

      // Determine evaluation status
      let evaluationStatus: ResolvedShiftEvaluationStatus = 'UPCOMING_SHIFT';
      let checkInAt: string | null = matchingAtt?.checkInAt || null;
      let checkOutAt: string | null = matchingAtt?.checkOutAt || null;
      const lateMinutes = matchingAtt?.lateMinutes || 0;

      if (asgn.workDate > CURRENT_SYSTEM_DATE) {
        evaluationStatus = 'UPCOMING_SHIFT';
      } else if (asgn.workDate === CURRENT_SYSTEM_DATE) {
        if (matchingAtt) {
          if (
            matchingAtt.status === 'MISSING_CHECKOUT' &&
            endTime > '20:35'
          ) {
            evaluationStatus = 'PENDING_EVALUATION';
          } else {
            evaluationStatus = matchingAtt.status;
          }
        } else {
          // Check if there is a raw scan near startTime today (e.g., SH09 20:30-23:30 has scan at 20:32:10)
          const dayScans = myRawScansByDate.get(asgn.workDate) || [];
          const matchingInScan = dayScans.find((s) => {
            const t = s.scanDateTime.slice(11, 16);
            return t >= startTime;
          });
          if (matchingInScan) {
            checkInAt = matchingInScan.scanDateTime.slice(11, 19);
          }
          // Since this shift on CURRENT_SYSTEM_DATE hasn't reached its evaluation cutoff yet:
          evaluationStatus = 'PENDING_EVALUATION';
        }
      } else {
        // Past date (workDate < CURRENT_SYSTEM_DATE)
        if (matchingAtt) {
          evaluationStatus = matchingAtt.status;
        } else {
          evaluationStatus = 'NO_SCAN';
        }
      }

      entries.push({
        key: `${asgn.workDate}_${asgn.shiftId}_${asgn.id}`,
        workDate: asgn.workDate,
        endDate,
        shiftId: asgn.shiftId,
        shiftCode,
        shiftName,
        shortLabel: getShortShiftCategoryLabel(category, shiftName),
        startTime,
        endTime,
        crossMidnight,
        graceMinutes,
        category,
        assignment: asgn,
        attendance: matchingAtt,
        checkInAt,
        checkOutAt,
        lateMinutes,
        evaluationStatus,
        noteLabel: matchingAtt?.notes?.reasonLabel || null,
        noteDetail: matchingAtt?.notes?.note || null,
      });
    });

    // Second, include any historical AttendanceRecord that didn't have an explicit ShiftAssignment row
    myAttendanceRecords.forEach((att) => {
      if (matchedAttendanceIds.has(att.id)) return;
      const shiftObj = shiftMap.get(att.shiftId);
      const startTime = att.shiftStartTime || shiftObj?.startTime || '08:00';
      const endTime = att.shiftEndTime || shiftObj?.endTime || '16:00';
      const crossMidnight =
        shiftObj?.crossMidnight ??
        (endTime === '00:00' || endTime < startTime);
      const category = resolveShiftCategory(
        shiftObj,
        shiftObj?.category
      ).category;

      entries.push({
        key: `${att.workDate}_${att.shiftId}_${att.id}`,
        workDate: att.workDate,
        endDate: crossMidnight ? addOneDay(att.workDate) : att.workDate,
        shiftId: att.shiftId,
        shiftCode: shiftObj?.code || att.shiftId,
        shiftName: att.shiftName,
        shortLabel: getShortShiftCategoryLabel(category, att.shiftName),
        startTime,
        endTime,
        crossMidnight,
        graceMinutes: shiftObj?.graceMinutes ?? 15,
        category,
        attendance: att,
        checkInAt: att.checkInAt,
        checkOutAt: att.checkOutAt,
        lateMinutes: att.lateMinutes,
        evaluationStatus:
          att.workDate > CURRENT_SYSTEM_DATE ? 'UPCOMING_SHIFT' : att.status,
        noteLabel: att.notes?.reasonLabel || null,
        noteDetail: att.notes?.note || null,
      });
    });

    return entries.sort(
      (a, b) =>
        b.workDate.localeCompare(a.workDate) ||
        a.startTime.localeCompare(b.startTime)
    );
  }, [myPerson, myAssignments, myAttendanceRecords, shiftMap, myRawScansByDate]);

  // Group resolved shift entries by workDate for Calendar & Today view
  const entriesByDate = useMemo(() => {
    const map = new Map<string, MyResolvedShiftEntry[]>();
    allResolvedShiftEntries.forEach((entry) => {
      if (!map.has(entry.workDate)) map.set(entry.workDate, []);
      map.get(entry.workDate)!.push(entry);
    });
    map.forEach((list) =>
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    );
    return map;
  }, [allResolvedShiftEntries]);

  // Today's resolved shift entries (§3)
  const todayShiftEntries = useMemo(() => {
    return entriesByDate.get(CURRENT_SYSTEM_DATE) || [];
  }, [entriesByDate]);

  const todayRawScans = useMemo(() => {
    return myRawScansByDate.get(CURRENT_SYSTEM_DATE) || [];
  }, [myRawScansByDate]);

  // Selected Month string (YYYY-MM) from calendarYear & calendarMonth
  const activeCalendarMonthPrefix = useMemo(() => {
    return `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
  }, [calendarYear, calendarMonth]);

  // Entries in the selected calendar month (used by KPI Summary Cards & Calendar)
  const monthShiftEntries = useMemo(() => {
    return allResolvedShiftEntries.filter((e) =>
      e.workDate.startsWith(activeCalendarMonthPrefix)
    );
  }, [allResolvedShiftEntries, activeCalendarMonthPrefix]);

  // KPI Summary Calculation (§4 — 6 KPIs from the same shared data source)
  const kpiMetrics = useMemo(() => {
    // 1. จำนวนวันที่มาปฏิบัติงาน (Distinct days with actual check-in or NORMAL/LATE/MISSING_CHECKOUT/PENDING_EVALUATION with checkIn)
    const workingDayDates = new Set<string>();
    const workingDayEntries: MyResolvedShiftEntry[] = [];

    // 2. จำนวนกะที่ได้รับมอบหมาย (All assigned shifts in the month)
    const assignedShiftEntries = [...monthShiftEntries];

    // 3. จำนวนครั้งที่มาสาย & 4. จำนวนนาทีมาสายรวม
    const lateEntries: MyResolvedShiftEntry[] = [];
    let totalLateMinutes = 0;

    // 5. จำนวนครั้งที่ MISSING_CHECKOUT (Only concluded shifts, never ongoing/future)
    const missingCheckoutEntries: MyResolvedShiftEntry[] = [];

    // 6. จำนวนวันที่ NO_SCAN (Distinct days with NO_SCAN on concluded shifts, excluding day-offs and future shifts)
    const noScanDates = new Set<string>();
    const noScanEntries: MyResolvedShiftEntry[] = [];

    monthShiftEntries.forEach((entry) => {
      const hasWorked =
        entry.checkInAt !== null ||
        entry.evaluationStatus === 'NORMAL' ||
        entry.evaluationStatus === 'LATE' ||
        entry.evaluationStatus === 'MISSING_CHECKOUT';

      if (hasWorked) {
        workingDayDates.add(entry.workDate);
        workingDayEntries.push(entry);
      }

      if (entry.evaluationStatus === 'LATE') {
        lateEntries.push(entry);
        totalLateMinutes += entry.lateMinutes;
      }

      if (entry.evaluationStatus === 'MISSING_CHECKOUT') {
        missingCheckoutEntries.push(entry);
      }

      if (entry.evaluationStatus === 'NO_SCAN') {
        noScanDates.add(entry.workDate);
        noScanEntries.push(entry);
      }
    });

    return {
      workingDaysCount: workingDayDates.size,
      workingDayEntries,
      assignedShiftsCount: assignedShiftEntries.length,
      assignedShiftEntries,
      lateCount: lateEntries.length,
      lateEntries,
      totalLateMinutes,
      missingCheckoutCount: missingCheckoutEntries.length,
      missingCheckoutEntries,
      noScanDaysCount: noScanDates.size,
      noScanEntries,
    };
  }, [monthShiftEntries]);

  // Build 7-column calendar cells for calendarYear & calendarMonth (§5)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth - 1, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();

    const cells: Array<{
      dateStr: string | null;
      dayNumber: number | null;
      isToday: boolean;
      isPast: boolean;
      isFuture: boolean;
      entries: MyResolvedShiftEntry[];
      rawScans: RawScanEvent[];
      noShiftInfo: ReturnType<typeof mockAttendanceService.getNoShiftStatus> | null;
    }> = [];

    // Leading empty cells
    for (let i = 0; i < startWeekday; i++) {
      cells.push({
        dateStr: null,
        dayNumber: null,
        isToday: false,
        isPast: false,
        isFuture: false,
        entries: [],
        rawScans: [],
        noShiftInfo: null,
      });
    }

    // Actual days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(
        2,
        '0'
      )}-${String(day).padStart(2, '0')}`;
      const entries = entriesByDate.get(dateStr) || [];
      const rawScans = myRawScansByDate.get(dateStr) || [];
      const noShiftInfo =
        myPerson && entries.length === 0
          ? mockAttendanceService.getNoShiftStatus(myPerson.personId, dateStr)
          : null;

      cells.push({
        dateStr,
        dayNumber: day,
        isToday: dateStr === CURRENT_SYSTEM_DATE,
        isPast: dateStr < CURRENT_SYSTEM_DATE,
        isFuture: dateStr > CURRENT_SYSTEM_DATE,
        entries,
        rawScans,
        noShiftInfo,
      });
    }

    // Trailing empty cells to complete 7-column rows
    while (cells.length % 7 !== 0) {
      cells.push({
        dateStr: null,
        dayNumber: null,
        isToday: false,
        isPast: false,
        isFuture: false,
        entries: [],
        rawScans: [],
        noShiftInfo: null,
      });
    }

    return cells;
  }, [
    calendarYear,
    calendarMonth,
    entriesByDate,
    myRawScansByDate,
    myPerson,
  ]);

  // Calendar navigation handlers (§5.4)
  const handlePrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(12);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const [y, m] = CURRENT_SYSTEM_DATE.split('-').map(Number);
    setCalendarYear(y);
    setCalendarMonth(m);
    setReportMonthStr(CURRENT_SYSTEM_DATE.slice(0, 7));
  };

  // Filtered & sorted Raw Scans for Section 5 (§6)
  const filteredRawScans = useMemo(() => {
    let list = [...myRawScans];
    if (rawDateFilter) {
      list = list.filter((r) => r.scanDateTime.startsWith(rawDateFilter));
    }
    if (rawMachineFilter !== 'ALL') {
      list = list.filter((r) => String(r.machineNo) === rawMachineFilter);
    }
    if (rawSearchQuery.trim()) {
      const q = rawSearchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.scanDateTime.toLowerCase().includes(q) ||
          String(r.machineNo).includes(q) ||
          String(r.enrollNumber).includes(q) ||
          String(r.inOutMode).includes(q) ||
          String(r.verifyMode).includes(q)
      );
    }

    return list.sort((a, b) => {
      let cmp = 0;
      if (rawSortKey === 'scanDateTime') {
        cmp = a.scanDateTime.localeCompare(b.scanDateTime);
      } else if (rawSortKey === 'machineNo') {
        cmp = a.machineNo - b.machineNo;
      } else if (rawSortKey === 'inOutMode') {
        cmp = a.inOutMode - b.inOutMode;
      }
      return rawSortDir === 'ASC' ? cmp : -cmp;
    });
  }, [
    myRawScans,
    rawDateFilter,
    rawMachineFilter,
    rawSearchQuery,
    rawSortKey,
    rawSortDir,
  ]);

  const paginatedRawScans = useMemo(() => {
    if (rawPageSize === 'ALL') return filteredRawScans;
    const start = (rawPage - 1) * rawPageSize;
    return filteredRawScans.slice(start, start + rawPageSize);
  }, [filteredRawScans, rawPage, rawPageSize]);

  // Filtered & sorted Report rows for Section 6 (§7)
  const filteredReportEntries = useMemo(() => {
    let list = [...allResolvedShiftEntries];

    if (reportMode === 'DAILY') {
      list = list.filter((e) => e.workDate === reportDailyDate);
    } else if (reportMode === 'MONTHLY') {
      list = list.filter((e) => e.workDate.startsWith(reportMonthStr));
    } else if (reportMode === 'YEARLY') {
      list = list.filter((e) => e.workDate.startsWith(reportYearStr));
    } else if (reportMode === 'CUSTOM_RANGE') {
      if (reportFromDate) {
        list = list.filter((e) => e.workDate >= reportFromDate);
      }
      if (reportToDate) {
        list = list.filter((e) => e.workDate <= reportToDate);
      }
    }

    if (reportStatusFilter !== 'ALL') {
      list = list.filter((e) => e.evaluationStatus === reportStatusFilter);
    }

    return list.sort((a, b) => {
      let cmp = 0;
      if (reportSortKey === 'workDate') {
        cmp =
          a.workDate.localeCompare(b.workDate) ||
          a.startTime.localeCompare(b.startTime);
      } else if (reportSortKey === 'shiftName') {
        cmp = a.shiftName.localeCompare(b.shiftName, 'th');
      } else if (reportSortKey === 'checkInAt') {
        cmp = (a.checkInAt || '99:99').localeCompare(b.checkInAt || '99:99');
      } else if (reportSortKey === 'status') {
        cmp = a.evaluationStatus.localeCompare(b.evaluationStatus);
      } else if (reportSortKey === 'lateMinutes') {
        cmp = a.lateMinutes - b.lateMinutes;
      }
      return reportSortDir === 'ASC' ? cmp : -cmp;
    });
  }, [
    allResolvedShiftEntries,
    reportMode,
    reportDailyDate,
    reportMonthStr,
    reportYearStr,
    reportFromDate,
    reportToDate,
    reportStatusFilter,
    reportSortKey,
    reportSortDir,
  ]);

  const paginatedReportEntries = useMemo(() => {
    if (reportPageSize === 'ALL') return filteredReportEntries;
    const start = (reportPage - 1) * reportPageSize;
    return filteredReportEntries.slice(start, start + reportPageSize);
  }, [filteredReportEntries, reportPage, reportPageSize]);

  // Export CSV strictly for the logged-in user (§7 & §9)
  const handleExportMyCsv = () => {
    if (!myPerson) return;
    const headers = [
      'PERSON_ID',
      'FINGLE_ID',
      'ชื่อ-นามสกุล',
      'วันที่ปฏิบัติงาน',
      'วันที่สิ้นสุดกะ',
      'รหัสกะ',
      'กะที่ได้รับมอบหมาย',
      'เวลาเริ่มกะ',
      'เวลาสิ้นสุดกะ',
      'เวลาสแกนเข้า',
      'เวลาสแกนออก',
      'สถานะการลงเวลา',
      'นาทีมาสาย',
      'หมายเหตุ',
    ];

    const statusThaiMap: Record<ResolvedShiftEvaluationStatus, string> = {
      NORMAL: 'ตรงเวลา',
      LATE: 'มาสาย',
      EARLY_CHECKOUT: 'ออกก่อนเวลา',
      MISSING_CHECKOUT: 'MISSING_CHECKOUT (สแกนไม่ครบ)',
      NO_SCAN: 'NO_SCAN (ไม่พบสแกน)',
      NO_SCHEDULE: 'ไม่มีตารางกะ',
      PENDING_MAPPING: 'รอผูก FINGLE_ID',
      PENDING_EVALUATION: 'รอประเมิน (กำลังปฏิบัติงาน)',
      UPCOMING_SHIFT: 'ยังไม่ถึงเวลาปฏิบัติงาน',
    };

    const rows = filteredReportEntries.map((e) => [
      myPerson.personId,
      String(myPerson.fingleId),
      `${myPerson.prefix}${myPerson.firstName} ${myPerson.lastName}`,
      e.workDate,
      e.endDate,
      e.shiftCode,
      e.shiftName,
      e.startTime,
      e.endTime,
      e.checkInAt || '-',
      e.checkOutAt || '-',
      statusThaiMap[e.evaluationStatus] || e.evaluationStatus,
      String(e.lateMinutes),
      e.noteLabel
        ? `${e.noteLabel}${e.noteDetail ? ` (${e.noteDetail})` : ''}`
        : '-',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Sam_Att_MyAttendance_${myPerson.personId}_${reportMode}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintMyReport = () => {
    window.print();
  };

  // Render evaluation status badge (Color + Icon + Text — strictly separated from shift icon per §5.2 & §10)
  const renderEvaluationStatusBadge = (
    entry: MyResolvedShiftEntry,
    compact = false
  ) => {
    const { evaluationStatus, lateMinutes, noteLabel } = entry;

    if (evaluationStatus === 'NORMAL') {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
          }`}
        >
          <CheckCircle2 className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          <span>ตรงเวลา</span>
        </span>
      );
    }

    if (evaluationStatus === 'LATE') {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
          }`}
        >
          <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          <span>
            มาสาย {lateMinutes > 0 ? `+${lateMinutes}น.` : ''}
          </span>
        </span>
      );
    }

    if (evaluationStatus === 'MISSING_CHECKOUT') {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200/80 font-semibold ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
          }`}
        >
          <AlertCircle className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          <span>{compact ? 'MISSING_OUT' : 'MISSING_CHECKOUT'}</span>
        </span>
      );
    }

    if (evaluationStatus === 'NO_SCAN') {
      if (noteLabel) {
        return (
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200/80 font-semibold ${
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
            }`}
          >
            <FileText className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
            <span className="truncate max-w-[110px]">
              {compact ? noteLabel.split(' ')[0] : `NO_SCAN (${noteLabel})`}
            </span>
          </span>
        );
      }
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 font-semibold ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
          }`}
        >
          <AlertTriangle className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          <span>NO_SCAN</span>
        </span>
      );
    }

    if (evaluationStatus === 'PENDING_EVALUATION') {
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200/80 font-semibold ${
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
          }`}
        >
          <Clock3 className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          <span>{compact ? 'รอประเมิน' : 'รอประเมิน (กำลังปฏิบัติงาน)'}</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200/80 font-semibold ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
        }`}
      >
        <CalendarClock className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
        <span>{compact ? 'กะอนาคต' : 'ยังไม่ถึงเวลาปฏิบัติงาน'}</span>
      </span>
    );
  };

  // ============================================================================
  // EMPTY STATE: When currentUser has no linked PERSON_ID (e.g., USR001 Admin)
  // Per §2 & §9: Show "ยังไม่เชื่อมโยงข้อมูลบุคลากร" and NEVER display another person's data.
  // ============================================================================
  if (!currentUser?.personId || !myPerson) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-[#E9E5F2] shadow-sm p-8 text-center max-w-2xl mx-auto my-8">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto mb-4 text-purple-700">
            <UserX className="w-8 h-8" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Account Mapping Required
          </span>
          <h2 className="text-xl font-bold text-slate-900">
            ยังไม่เชื่อมโยงข้อมูลบุคลากร
          </h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            บัญชีผู้ใช้งานปัจจุบัน{' '}
            <span className="font-semibold text-slate-900">
              {currentUser?.fullName || 'ผู้ใช้งาน'} (@
              {currentUser?.username || 'unmapped'})
            </span>{' '}
            ยังไม่ได้ผูกกับรหัสบุคลากร (
            <span className="font-mono font-semibold text-purple-700">
              PERSON_ID
            </span>
            ) ในฐานข้อมูล{' '}
            <span className="font-mono font-semibold text-slate-800">
              HOSOffice.hr_person
            </span>
          </p>
          <div className="mt-5 p-4 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] text-left text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              กติกาความปลอดภัยข้อมูลส่วนบุคคล (RBAC & Self-Service Isolation):
            </div>
            <p>
              • หน้า “เวลาปฏิบัติงานของฉัน” อนุญาตให้แสดงเฉพาะข้อมูลที่ผูกกับ{' '}
              <span className="font-mono font-semibold">
                currentUser.personId
              </span>{' '}
              เท่านั้น และไม่อนุญาตให้นำข้อมูลของบุคลากรท่านอื่นมาแสดงแทน
            </p>
            <p>
              • ท่านสามารถทดลองสลับบัญชีผู้ใช้งานที่มุมขวาบนเป็น{' '}
              <span className="font-semibold text-purple-700">
                พญ.สุดารัตน์ (P001)
              </span>
              ,{' '}
              <span className="font-semibold text-purple-700">
                นายวิชัย (P002)
              </span>{' '}
              หรือ{' '}
              <span className="font-semibold text-purple-700">
                นางสาวพัชรี (P010)
              </span>{' '}
              เพื่อตรวจสอบแดชบอร์ดเวลาปฏิบัติงานส่วนบุคคลแบบครบถ้วน
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Modal data for selected calendar date (§5.3)
  const selectedDayEntries = selectedDayModalDate
    ? entriesByDate.get(selectedDayModalDate) || []
    : [];
  const selectedDayRawScans = selectedDayModalDate
    ? myRawScansByDate.get(selectedDayModalDate) || []
    : [];
  const selectedDayNoShift =
    selectedDayModalDate && selectedDayEntries.length === 0
      ? mockAttendanceService.getNoShiftStatus(
          myPerson.personId,
          selectedDayModalDate
        )
      : null;

  // KPI Drilldown Modal data (§4)
  const kpiModalConfig = useMemo(() => {
    if (!activeKpiModal) return null;
    switch (activeKpiModal) {
      case 'WORKING_DAYS':
        return {
          title: 'รายละเอียดจำนวนวันที่มาปฏิบัติงาน',
          subtitle: `รายการกะที่มีการสแกนเข้าปฏิบัติงานจริงในเดือน ${
            THAI_MONTH_NAMES[calendarMonth - 1]
          } ${calendarYear + 543} (${kpiMetrics.workingDaysCount} วัน)`,
          entries: kpiMetrics.workingDayEntries,
        };
      case 'ASSIGNED_SHIFTS':
        return {
          title: 'รายละเอียดจำนวนกะที่ได้รับมอบหมายทั้งหมด',
          subtitle: `กะปฏิบัติงานทั้งหมดที่ได้รับมอบหมายในเดือน ${
            THAI_MONTH_NAMES[calendarMonth - 1]
          } ${calendarYear + 543} (${kpiMetrics.assignedShiftsCount} กะ)`,
          entries: kpiMetrics.assignedShiftEntries,
        };
      case 'LATE_COUNT':
      case 'LATE_MINUTES':
        return {
          title: 'รายละเอียดการมาสายและนาทีมาสายรวม',
          subtitle: `รายการกะที่มาสายในเดือน ${
            THAI_MONTH_NAMES[calendarMonth - 1]
          } ${calendarYear + 543} (${kpiMetrics.lateCount} ครั้ง · รวม ${
            kpiMetrics.totalLateMinutes
          } นาที)`,
          entries: kpiMetrics.lateEntries,
        };
      case 'MISSING_CHECKOUT':
        return {
          title: 'รายละเอียดรายการสแกนไม่ครบ (MISSING_CHECKOUT)',
          subtitle: `เฉพาะกะที่สิ้นสุดเวลาประเมินแล้วแต่ไม่พบเวลาสแกนออก (${kpiMetrics.missingCheckoutCount} ครั้ง)`,
          entries: kpiMetrics.missingCheckoutEntries,
        };
      case 'NO_SCAN_DAYS':
        return {
          title: 'รายละเอียดวันที่ไม่พบการสแกน (NO_SCAN)',
          subtitle: `เฉพาะวันที่มีกะมอบหมายในอดีตแต่ไม่พบการสแกน (${kpiMetrics.noScanDaysCount} วัน · ไม่นับวันหยุดและกะในอนาคต)`,
          entries: kpiMetrics.noScanEntries,
        };
      default:
        return null;
    }
  }, [activeKpiModal, calendarMonth, calendarYear, kpiMetrics]);

  return (
    <div className="space-y-6 pb-8">
      {/* =====================================================================
          SECTION 1: ข้อมูลบุคลากรของฉัน (My Personnel Profile — §2)
         ===================================================================== */}
      <section className="bg-gradient-to-r from-[#5B21B6] via-[#6D28D9] to-[#7C3AED] rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25 text-2xl font-bold shrink-0 shadow-inner">
              {myPerson.firstName.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/15 text-purple-100 border border-white/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  1. ข้อมูลบุคลากรของฉัน (HOSOffice.hr_person Read-Only)
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-400/20 text-emerald-100 border border-emerald-300/30">
                  <UserCheck className="w-3 h-3" />
                  Self-Service Scoped
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mt-1.5 tracking-tight">
                {myPerson.prefix}
                {myPerson.firstName} {myPerson.lastName}
              </h2>
              <p className="text-purple-100 text-xs sm:text-sm flex flex-wrap items-center gap-2 mt-1">
                <span>{myPerson.position}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {myPerson.groupName} ({myPerson.department})
                </span>
              </p>
            </div>
          </div>

          {/* Authoritative Identity Badges (PERSON_ID, FINGLE_ID, Position, Group, Personnel Type) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/15">
            <div className="px-2.5 py-1.5 rounded-lg bg-white/10">
              <div className="text-[10px] text-purple-200 uppercase font-semibold">
                PERSON_ID
              </div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                {myPerson.personId}
              </div>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/10">
              <div className="text-[10px] text-purple-200 uppercase font-semibold">
                FINGLE_ID (Enroll)
              </div>
              <div className="text-sm font-mono font-bold text-amber-200 mt-0.5 flex items-center gap-1">
                <Fingerprint className="w-3.5 h-3.5" />#{myPerson.fingleId}
              </div>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/10">
              <div className="text-[10px] text-purple-200 uppercase font-semibold">
                ประเภทบุคลากร
              </div>
              <div className="text-xs font-bold text-white mt-0.5 truncate">
                {myPerson.personnelType}
              </div>
            </div>
            <div className="px-2.5 py-1.5 rounded-lg bg-white/10">
              <div className="text-[10px] text-purple-200 uppercase font-semibold">
                กลุ่มงาน / แผนก
              </div>
              <div
                className="text-xs font-bold text-white mt-0.5 truncate"
                title={`${myPerson.groupName} · ${myPerson.department}`}
              >
                {myPerson.department}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: สถานะการทำงานวันนี้ (Today Attendance Summary — §3)
         ===================================================================== */}
      <section className="bg-white rounded-2xl border border-[#E9E5F2] shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-700 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  2. สถานะการทำงานวันนี้ (Today Attendance Summary)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
                  วันนี้: {CURRENT_SYSTEM_DATE}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {getThaiDateFullLabel(CURRENT_SYSTEM_DATE)} • รองรับหลายกะในวันเดียวกันและกะข้ามเที่ยงคืน (ไม่ขึ้น MISSING_CHECKOUT ก่อนถึงเวลาตัดรอบประเมิน)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-purple-600" />
              สแกนดิบวันนี้: <strong className="text-purple-700">{todayRawScans.length}</strong> เหตุการณ์
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayModalDate(CURRENT_SYSTEM_DATE)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              ดูรายละเอียดวันนี้
            </button>
          </div>
        </div>

        {todayShiftEntries.length === 0 ? (
          <div className="mt-4 p-5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarOff className="w-6 h-6 text-slate-400" />
              <div>
                <div className="text-sm font-bold text-slate-800">
                  วันนี้ไม่มีกะที่ได้รับมอบหมาย ({CURRENT_SYSTEM_DATE})
                </div>
                <div className="text-xs text-slate-500">
                  {
                    mockAttendanceService.getNoShiftStatus(
                      myPerson.personId,
                      CURRENT_SYSTEM_DATE
                    ).detail
                  }
                </div>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-200/70 text-slate-700">
              {
                mockAttendanceService.getNoShiftStatus(
                  myPerson.personId,
                  CURRENT_SYSTEM_DATE
                ).label
              }
            </span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {todayShiftEntries.map((entry, idx) => (
              <div
                key={entry.key}
                onClick={() => setSelectedDayModalDate(CURRENT_SYSTEM_DATE)}
                className="rounded-xl border border-[#E9E5F2] bg-[#F8F7FC]/60 hover:bg-purple-50/40 hover:border-purple-300 transition p-4 cursor-pointer flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                        entry.category
                      )}`}
                    >
                      <ShiftCategoryIcon
                        category={entry.category}
                        className="w-4 h-4"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
                          กะที่ {idx + 1}/{todayShiftEntries.length}
                        </span>
                        <span className="text-xs font-mono font-semibold text-slate-500">
                          {entry.shiftCode}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {entry.shiftName}
                      </h4>
                    </div>
                  </div>
                  {renderEvaluationStatusBadge(entry)}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 text-xs">
                  <div className="bg-white rounded-lg p-2 border border-slate-200/60">
                    <div className="text-[10px] text-slate-400 font-medium">
                      เวลากะจริง
                    </div>
                    <div className="font-mono font-bold text-slate-800 mt-0.5">
                      {entry.startTime}–{entry.endTime}
                    </div>
                    {entry.crossMidnight && (
                      <div className="text-[10px] text-indigo-600 font-semibold">
                        สิ้นสุด +1 วัน ({entry.endDate.slice(5)})
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-slate-200/60">
                    <div className="text-[10px] text-slate-400 font-medium">
                      เวลาสแกนเข้า
                    </div>
                    <div className="font-mono font-bold text-emerald-700 mt-0.5">
                      {entry.checkInAt || 'รอสแกนเข้า'}
                    </div>
                    {entry.lateMinutes > 0 && (
                      <div className="text-[10px] text-amber-700 font-semibold">
                        สาย +{entry.lateMinutes} นาที
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-slate-200/60">
                    <div className="text-[10px] text-slate-400 font-medium">
                      เวลาสแกนออก
                    </div>
                    <div className="font-mono font-bold text-purple-700 mt-0.5">
                      {entry.checkOutAt ||
                        (entry.evaluationStatus === 'PENDING_EVALUATION'
                          ? 'รอเลิกกะ'
                          : '-')}
                    </div>
                    {entry.evaluationStatus === 'PENDING_EVALUATION' && (
                      <div className="text-[10px] text-violet-600 font-semibold">
                        ตัดรอบหลัง {entry.endTime} น.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =====================================================================
          SECTION 3: KPI SUMMARY CARDS (6 Clickable KPI Cards — §4)
         ===================================================================== */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              3. สรุปสถิติการปฏิบัติงานของฉัน (KPI Summary ประจำเดือน{' '}
              {THAI_MONTH_NAMES[calendarMonth - 1]} {calendarYear + 543})
            </h3>
            <span className="text-[11px] text-slate-500">
              • คลิกที่การ์ดแต่ละใบเพื่อดูรายการกะ/วันที่ที่เป็นที่มาของตัวเลข
            </span>
          </div>
          <span className="text-xs font-mono text-purple-700 bg-purple-50 border border-purple-200/70 px-2.5 py-0.5 rounded-lg">
            เดือนที่เลือก: {activeCalendarMonthPrefix}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* KPI 1: จำนวนวันที่มาปฏิบัติงาน */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('WORKING_DAYS')}
            className="bg-white hover:bg-emerald-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-emerald-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>วันที่มาปฏิบัติงาน</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-emerald-700">
                {kpiMetrics.workingDaysCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">วัน</span>
            </div>
            <div className="mt-1.5 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              <span>ดูรายการวันมาทำงาน</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>

          {/* KPI 2: จำนวนกะที่ได้รับมอบหมาย */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('ASSIGNED_SHIFTS')}
            className="bg-white hover:bg-purple-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-purple-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>กะที่ได้รับมอบหมาย</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-purple-700">
                {kpiMetrics.assignedShiftsCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">กะ</span>
            </div>
            <div className="mt-1.5 text-[11px] text-purple-700 font-medium flex items-center gap-1">
              <span>รวมกะอดีต วันนี้ และอนาคต</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>

          {/* KPI 3: จำนวนครั้งที่มาสาย */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('LATE_COUNT')}
            className="bg-white hover:bg-amber-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-amber-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>จำนวนครั้งที่มาสาย</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-600">
                {kpiMetrics.lateCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">ครั้ง</span>
            </div>
            <div className="mt-1.5 text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <span>คลิกดูวันที่มาสาย</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>

          {/* KPI 4: จำนวนนาทีมาสายรวม */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('LATE_MINUTES')}
            className="bg-white hover:bg-amber-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-amber-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>นาทีมาสายรวม</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition">
                <Clock3 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-amber-700">
                {kpiMetrics.totalLateMinutes}
              </span>
              <span className="text-xs text-slate-500 font-medium">นาที</span>
            </div>
            <div className="mt-1.5 text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <span>คิดตาม Grace Period กะ</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>

          {/* KPI 5: จำนวนครั้งที่ MISSING_CHECKOUT */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('MISSING_CHECKOUT')}
            className="bg-white hover:bg-orange-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-orange-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>MISSING_CHECKOUT</span>
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-105 transition">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-orange-600">
                {kpiMetrics.missingCheckoutCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">ครั้ง</span>
            </div>
            <div className="mt-1.5 text-[11px] text-orange-700 font-medium flex items-center gap-1">
              <span>สแกนออกไม่ครบ (จบกะแล้ว)</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>

          {/* KPI 6: จำนวนวันที่ NO_SCAN */}
          <button
            type="button"
            onClick={() => setActiveKpiModal('NO_SCAN_DAYS')}
            className="bg-white hover:bg-rose-50/40 rounded-2xl p-4 border border-[#E9E5F2] hover:border-rose-300 shadow-xs text-left transition group cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>จำนวนวันที่ NO_SCAN</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-rose-600">
                {kpiMetrics.noScanDaysCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">วัน</span>
            </div>
            <div className="mt-1.5 text-[11px] text-rose-700 font-medium flex items-center gap-1">
              <span>ไม่นับวันหยุด/กะอนาคต</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: ปฏิทินกะและการเข้างานของฉัน (Monthly Shift & Attendance Calendar — §5)
         ===================================================================== */}
      <section className="bg-white rounded-2xl border border-[#E9E5F2] shadow-sm overflow-hidden">
        {/* Calendar Header & Month Navigation (§5.4) */}
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                4. ปฏิทินกะและการเข้างานของฉัน (Monthly Shift & Attendance Calendar)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                คลิกที่ช่องวันที่ใดก็ได้เพื่อเปิดดูเวลาเริ่ม–เลิกกะจริง เวลาสแกนเข้า–ออก และรายการ Raw Scan Events ทั้งหมดในวันนั้น
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-purple-50 text-slate-700 transition cursor-pointer"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {THAI_MONTH_NAMES.map((mName, idx) => (
                <option key={mName} value={idx + 1}>
                  {mName}
                </option>
              ))}
            </select>

            <select
              value={calendarYear}
              onChange={(e) => setCalendarYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {[2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>
                  พ.ศ. {yr + 543} ({yr})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-purple-50 text-slate-700 transition cursor-pointer"
              title="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleJumpToToday}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              กลับมาวันปัจจุบัน (วันนี้)
            </button>
          </div>
        </div>

        {/* Icon & Status Legend Bar (§5.2) */}
        <div className="px-5 py-3 bg-[#F8F7FC] border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-700">ไอคอนประเภทกะ:</span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="MORNING"
                className="w-3.5 h-3.5 text-amber-600"
              />
              กะเช้า
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="AFTERNOON"
                className="w-3.5 h-3.5 text-orange-600"
              />
              กะบ่าย
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="NIGHT"
                className="w-3.5 h-3.5 text-indigo-600"
              />
              กะดึก
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="MORNING_AFTERNOON"
                className="w-3.5 h-3.5 text-amber-600"
              />
              กะควบเช้า–บ่าย
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="AFTERNOON_NIGHT"
                className="w-3.5 h-3.5 text-indigo-600"
              />
              กะควบบ่าย–ดึก
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="ALL_DAY"
                className="w-3.5 h-3.5 text-teal-600"
              />
              กะทั้งวัน
            </span>
            <span className="inline-flex items-center gap-1">
              <ShiftCategoryIcon
                category="OFFICIAL"
                className="w-3.5 h-3.5 text-purple-600"
              />
              เวลาราชการ
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarOff className="w-3.5 h-3.5 text-slate-500" />
              วันหยุดตามตาราง
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700">สถานะการลงเวลา (แยกจากไอคอนกะ):</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              ตรงเวลา
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
              มาสาย
            </span>
            <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200 font-semibold">
              MISSING_CHECKOUT
            </span>
            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
              NO_SCAN
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
              กะอนาคต
            </span>
          </div>
        </div>

        {/* 7-Column Calendar Grid */}
        <div className="p-4 overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {THAI_WEEKDAYS_SHORT.map((dayLabel, idx) => (
                <div
                  key={dayLabel}
                  className={`text-center py-2 rounded-xl text-xs font-bold ${
                    idx === 0 || idx === 6
                      ? 'bg-purple-50/70 text-purple-800'
                      : 'bg-slate-100/80 text-slate-700'
                  }`}
                >
                  {dayLabel}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarCells.map((cell, idx) => {
                if (!cell.dateStr || cell.dayNumber === null) {
                  return (
                    <div
                      key={`empty_${idx}`}
                      className="min-h-[122px] rounded-xl bg-slate-50/40 border border-dashed border-slate-200/50"
                    />
                  );
                }

                const isScheduledDayOff =
                  cell.entries.length === 0 &&
                  cell.noShiftInfo?.status === 'SCHEDULED_DAY_OFF';
                const visibleEntries = cell.entries.slice(0, 2);
                const extraCount = Math.max(0, cell.entries.length - 2);

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDayModalDate(cell.dateStr)}
                    className={`min-h-[122px] rounded-xl p-2.5 border transition cursor-pointer flex flex-col justify-between ${
                      cell.isToday
                        ? 'bg-purple-50/50 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                        : cell.entries.length > 0
                        ? 'bg-white hover:bg-purple-50/30 border-[#E9E5F2] hover:border-purple-300'
                        : isScheduledDayOff
                        ? 'bg-slate-50/80 hover:bg-slate-100/70 border-slate-200'
                        : 'bg-white/70 hover:bg-slate-50 border-slate-200/70'
                    }`}
                  >
                    {/* Top row: Day Number + Today Badge + Raw Scan count */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                            cell.isToday
                              ? 'bg-purple-600 text-white'
                              : 'text-slate-800 bg-slate-100'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {cell.isToday && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white text-[9px] font-bold">
                            วันนี้
                          </span>
                        )}
                      </div>

                      {cell.rawScans.length > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-purple-100/80 text-purple-800 text-[10px] font-mono font-semibold"
                          title={`มีข้อมูลสแกนดิบ ${cell.rawScans.length} ครั้ง`}
                        >
                          <Fingerprint className="w-2.5 h-2.5" />
                          {cell.rawScans.length}
                        </span>
                      )}
                    </div>

                    {/* Middle row: Shift Icon(s) + Short Shift Label AND Separate Status Badge */}
                    <div className="my-1.5 space-y-1.5">
                      {cell.entries.length > 0 ? (
                        <>
                          {visibleEntries.map((entry) => (
                            <div
                              key={entry.key}
                              className="p-1.5 rounded-lg bg-[#F8F7FC] border border-[#E9E5F2] space-y-1"
                            >
                              {/* Shift Icon + Short Name + Time */}
                              <div className="flex items-center justify-between gap-1">
                                <div className="inline-flex items-center gap-1 min-w-0">
                                  <ShiftCategoryIcon
                                    category={entry.category}
                                    className="w-3.5 h-3.5 text-purple-700 shrink-0"
                                  />
                                  <span className="text-[11px] font-bold text-slate-800 truncate">
                                    {entry.shortLabel}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                  {entry.startTime}
                                </span>
                              </div>
                              {/* Separate Attendance Status Pill */}
                              <div className="flex items-center justify-between gap-1">
                                {renderEvaluationStatusBadge(entry, true)}
                                {entry.crossMidnight && (
                                  <span className="text-[9px] font-semibold text-indigo-600">
                                    +1วัน
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {extraCount > 0 && (
                            <div className="text-center py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">
                              +{extraCount} กะ (รวม {cell.entries.length} กะ)
                            </div>
                          )}
                        </>
                      ) : isScheduledDayOff ? (
                        <div className="p-2 rounded-lg bg-slate-100/90 border border-slate-200/80 text-center space-y-1">
                          <CalendarOff className="w-4 h-4 text-slate-500 mx-auto" />
                          <div className="text-[11px] font-bold text-slate-700">
                            วันหยุดตามตาราง
                          </div>
                          <div className="text-[9px] text-slate-500 line-clamp-1">
                            {cell.noShiftInfo?.detail}
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 text-center text-[11px] text-slate-400">
                          ไม่มีกะมอบหมาย
                        </div>
                      )}
                    </div>

                    {/* Footer hint */}
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                      <span>{cell.isFuture ? 'ตารางล่วงหน้า' : 'ดูรายละเอียด'}</span>
                      <Eye className="w-3 h-3 text-slate-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: ประวัติ Raw Scan ของฉัน (My Raw Scan History — §6)
         ===================================================================== */}
      <section className="bg-white rounded-2xl border border-[#E9E5F2] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  5. ประวัติ Raw Scan ของฉัน (My Raw Scan Events)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-purple-100 text-purple-800">
                  enrollNumber: #{myPerson.fingleId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                แสดง 1 แถวต่อ 1 เหตุการณ์การสแกน (Read-Only & Immutable) • คลิกที่แถวเพื่อดู JSON ต้นฉบับ 6 ฟิลด์จากเครื่องสแกน
              </p>
            </div>
          </div>

          {/* Search & Filters for My Raw Scans */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rawSearchQuery}
                onChange={(e) => {
                  setRawSearchQuery(e.target.value);
                  setRawPage(1);
                }}
                placeholder="ค้นหาวันเวลา, เครื่องสแกน..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <input
              type="date"
              value={rawDateFilter}
              onChange={(e) => {
                setRawDateFilter(e.target.value);
                setRawPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            <select
              value={rawMachineFilter}
              onChange={(e) => {
                setRawMachineFilter(e.target.value);
                setRawPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">ทุกเครื่องสแกน (1, 2, 3)</option>
              <option value="1">เครื่องสแกน #1 (OPD)</option>
              <option value="2">เครื่องสแกน #2 (ER)</option>
              <option value="3">เครื่องสแกน #3 (อาคารบริหาร)</option>
            </select>

            {(rawSearchQuery || rawDateFilter || rawMachineFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setRawSearchQuery('');
                  setRawDateFilter('');
                  setRawMachineFilter('ALL');
                  setRawPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-purple-700 hover:bg-purple-50 cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>

        {/* Mandatory Notice on inOutMode & Immutability (§6) */}
        <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/70 flex items-center gap-2 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>หมายเหตุสำคัญ:</strong> ค่า{' '}
            <code className="font-mono font-bold">inOutMode</code> เป็นข้อมูลดิบจากเครื่องสแกนนิ้ว HIP CMiF68S เท่านั้น ระบบจะไม่ใช้ตัดสินเวลาเข้า/ออกโดยไม่เทียบกับตารางกะที่ยืนยันแล้ว และไม่อนุญาตให้แก้ไขหรือลบข้อมูลสแกนดิบ
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600 uppercase">
                <SortableHeader
                  label="วัน–เวลาสแกน (scanDateTime)"
                  sortKey="scanDateTime"
                  currentSortKey={rawSortKey}
                  currentSortDir={rawSortDir}
                  onSort={(k) => {
                    if (rawSortKey === k) {
                      setRawSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setRawSortKey(k);
                      setRawSortDir('DESC');
                    }
                  }}
                />
                <SortableHeader
                  label="เครื่องสแกน (machineNo)"
                  sortKey="machineNo"
                  currentSortKey={rawSortKey}
                  currentSortDir={rawSortDir}
                  onSort={(k) => {
                    if (rawSortKey === k) {
                      setRawSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setRawSortKey(k);
                      setRawSortDir('ASC');
                    }
                  }}
                />
                <th className="py-3 px-4">enrollNumber</th>
                <th className="py-3 px-4">verifyMode</th>
                <SortableHeader
                  label="inOutMode (ค่าดิบ)"
                  sortKey="inOutMode"
                  currentSortKey={rawSortKey}
                  currentSortDir={rawSortDir}
                  onSort={(k) => {
                    if (rawSortKey === k) {
                      setRawSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setRawSortKey(k);
                      setRawSortDir('ASC');
                    }
                  }}
                />
                <th className="py-3 px-4">workCode</th>
                <th className="py-3 px-4 text-right">JSON 6 ฟิลด์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedRawScans.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-slate-400 text-xs"
                  >
                    ไม่พบประวัติ Raw Scan ตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                paginatedRawScans.map((raw) => (
                  <tr
                    key={raw.id}
                    onClick={() => setSelectedRawScanJson(raw)}
                    className="hover:bg-purple-50/40 transition cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {raw.scanDateTime}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60 font-semibold">
                        เครื่องที่ #{raw.machineNo}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                      {raw.enrollNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {raw.verifyMode}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        {raw.inOutMode} (Raw)
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {raw.workCode === null ? 'null' : raw.workCode}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRawScanJson(raw);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F8F7FC] hover:bg-purple-100 text-purple-700 border border-[#E9E5F2] font-semibold text-[11px] cursor-pointer"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        ดู JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={filteredRawScans.length}
          currentPage={rawPage}
          pageSize={rawPageSize}
          onPageChange={setRawPage}
          onPageSizeChange={(sz) => {
            setRawPageSize(sz);
            setRawPage(1);
          }}
        />
      </section>

      {/* =====================================================================
          SECTION 6: รายงานเวลาปฏิบัติงานของฉัน (My Attendance Report — §7)
         ===================================================================== */}
      <section className="bg-white rounded-2xl border border-[#E9E5F2] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                6. รายงานเวลาปฏิบัติงานของฉัน (My Attendance Report)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ออกรายงานเฉพาะข้อมูลของ {myPerson.prefix}
                {myPerson.firstName} {myPerson.lastName} ({myPerson.personId}) • รองรับรายวัน รายเดือน รายปี และช่วงวันที่กำหนดเอง
              </p>
            </div>
          </div>

          {/* Export CSV & Print Buttons (§7) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportMyCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV (ของฉัน)
            </button>
            <button
              type="button"
              onClick={handlePrintMyReport}
              className="px-3.5 py-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-purple-50 text-slate-700 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์รายงาน (Print)
            </button>
          </div>
        </div>

        {/* Report Mode Switcher & Date Filters */}
        <div className="px-5 py-3.5 bg-[#F8F7FC] border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-[#E9E5F2]">
            {(
              [
                { id: 'DAILY', label: '1. รายวัน (Daily)' },
                { id: 'MONTHLY', label: '2. รายเดือน (Monthly)' },
                { id: 'YEARLY', label: '3. รายปี (Yearly)' },
                { id: 'CUSTOM_RANGE', label: '4. ช่วงวันที่กำหนดเอง' },
              ] as Array<{ id: ReportPeriodMode; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setReportMode(tab.id);
                  setReportPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  reportMode === tab.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-purple-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {reportMode === 'DAILY' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-600">
                  เลือกวันที่:
                </span>
                <input
                  type="date"
                  value={reportDailyDate}
                  onChange={(e) => {
                    setReportDailyDate(e.target.value);
                    setReportPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-mono text-slate-800"
                />
              </div>
            )}

            {reportMode === 'MONTHLY' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-600">
                  ประจำเดือน:
                </span>
                <input
                  type="month"
                  value={reportMonthStr}
                  onChange={(e) => {
                    setReportMonthStr(e.target.value);
                    setReportPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-mono text-slate-800"
                />
              </div>
            )}

            {reportMode === 'YEARLY' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-600">
                  ประจำปี:
                </span>
                <select
                  value={reportYearStr}
                  onChange={(e) => {
                    setReportYearStr(e.target.value);
                    setReportPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-bold text-slate-800"
                >
                  <option value="2026">พ.ศ. 2569 (2026)</option>
                  <option value="2025">พ.ศ. 2568 (2025)</option>
                </select>
              </div>
            )}

            {reportMode === 'CUSTOM_RANGE' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-600">
                  ตั้งแต่:
                </span>
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => {
                    setReportFromDate(e.target.value);
                    setReportPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-mono text-slate-800"
                />
                <span className="text-xs font-semibold text-slate-600">ถึง:</span>
                <input
                  type="date"
                  value={reportToDate}
                  onChange={(e) => {
                    setReportToDate(e.target.value);
                    setReportPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-mono text-slate-800"
                />
              </div>
            )}

            <select
              value={reportStatusFilter}
              onChange={(e) => {
                setReportStatusFilter(e.target.value);
                setReportPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-white text-xs font-semibold text-slate-800"
            >
              <option value="ALL">ทุกสถานะการลงเวลา</option>
              <option value="NORMAL">ตรงเวลา (NORMAL)</option>
              <option value="LATE">มาสาย (LATE)</option>
              <option value="MISSING_CHECKOUT">MISSING_CHECKOUT</option>
              <option value="NO_SCAN">NO_SCAN</option>
              <option value="PENDING_EVALUATION">รอประเมิน (วันนี้)</option>
              <option value="UPCOMING_SHIFT">กะในอนาคต</option>
            </select>
          </div>
        </div>

        {/* Report Table (§7 Columns: วันที่, กะที่ได้รับมอบหมาย, สแกนเข้า, สแกนออก, สถานะ, นาทีมาสาย, หมายเหตุ) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600 uppercase">
                <SortableHeader
                  label="วันที่ปฏิบัติงาน"
                  sortKey="workDate"
                  currentSortKey={reportSortKey}
                  currentSortDir={reportSortDir}
                  onSort={(k) => {
                    if (reportSortKey === k) {
                      setReportSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setReportSortKey(k);
                      setReportSortDir('DESC');
                    }
                  }}
                />
                <SortableHeader
                  label="กะที่ได้รับมอบหมาย"
                  sortKey="shiftName"
                  currentSortKey={reportSortKey}
                  currentSortDir={reportSortDir}
                  onSort={(k) => {
                    if (reportSortKey === k) {
                      setReportSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setReportSortKey(k);
                      setReportSortDir('ASC');
                    }
                  }}
                />
                <SortableHeader
                  label="สแกนเข้า"
                  sortKey="checkInAt"
                  currentSortKey={reportSortKey}
                  currentSortDir={reportSortDir}
                  onSort={(k) => {
                    if (reportSortKey === k) {
                      setReportSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setReportSortKey(k);
                      setReportSortDir('ASC');
                    }
                  }}
                />
                <th className="py-3 px-4">สแกนออก</th>
                <SortableHeader
                  label="สถานะ"
                  sortKey="status"
                  currentSortKey={reportSortKey}
                  currentSortDir={reportSortDir}
                  onSort={(k) => {
                    if (reportSortKey === k) {
                      setReportSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setReportSortKey(k);
                      setReportSortDir('ASC');
                    }
                  }}
                />
                <SortableHeader
                  label="นาทีมาสาย"
                  sortKey="lateMinutes"
                  currentSortKey={reportSortKey}
                  currentSortDir={reportSortDir}
                  onSort={(k) => {
                    if (reportSortKey === k) {
                      setReportSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                    } else {
                      setReportSortKey(k);
                      setReportSortDir('DESC');
                    }
                  }}
                />
                <th className="py-3 px-4">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedReportEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-slate-400 text-xs"
                  >
                    ไม่พบรายการปฏิบัติงานในช่วงเวลาที่เลือก
                  </td>
                </tr>
              ) : (
                paginatedReportEntries.map((entry) => (
                  <tr
                    key={entry.key}
                    onClick={() => setSelectedDayModalDate(entry.workDate)}
                    className="hover:bg-purple-50/40 transition cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">
                        {entry.workDate}
                      </div>
                      {entry.crossMidnight && (
                        <div className="text-[10px] text-indigo-600 font-semibold">
                          เลิกกะ {entry.endDate} (+1 วัน)
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                            entry.category
                          )}`}
                        >
                          <ShiftCategoryIcon
                            category={entry.category}
                            className="w-4 h-4"
                          />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">
                            {entry.shiftName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {entry.startTime} – {entry.endTime} น. (Grace{' '}
                            {entry.graceMinutes}น.)
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      {entry.checkInAt || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-purple-700">
                      {entry.checkOutAt || '-'}
                    </td>
                    <td className="py-3 px-4">
                      {renderEvaluationStatusBadge(entry)}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {entry.lateMinutes > 0 ? (
                        <span className="font-bold text-amber-700">
                          +{entry.lateMinutes} นาที
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {entry.noteLabel ? (
                        <div>
                          <span className="font-bold text-purple-800">
                            {entry.noteLabel}
                          </span>
                          {entry.noteDetail && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">
                              {entry.noteDetail}
                            </p>
                          )}
                        </div>
                      ) : entry.evaluationStatus === 'PENDING_EVALUATION' ? (
                        <span className="text-violet-700 font-medium">
                          รอประเมินหลังสิ้นสุดเวลากะ ({entry.endTime} น.)
                        </span>
                      ) : entry.evaluationStatus === 'UPCOMING_SHIFT' ? (
                        <span className="text-sky-700 font-medium">
                          ตารางกะล่วงหน้า
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={filteredReportEntries.length}
          currentPage={reportPage}
          pageSize={reportPageSize}
          onPageChange={setReportPage}
          onPageSizeChange={(sz) => {
            setReportPageSize(sz);
            setReportPage(1);
          }}
        />
      </section>

      {/* =====================================================================
          MODAL 1: รายละเอียดรายวันเมื่อคลิกวันที่ในปฏิทิน (§5.3)
         ===================================================================== */}
      <SharedModal
        open={Boolean(selectedDayModalDate)}
        onClose={() => setSelectedDayModalDate(null)}
        title={
          selectedDayModalDate
            ? `รายละเอียดกะและการลงเวลารายวัน — ${selectedDayModalDate}`
            : 'รายละเอียดรายวัน'
        }
        subtitle={
          selectedDayModalDate
            ? `${getThaiDateFullLabel(selectedDayModalDate)} • ${myPerson.prefix}${myPerson.firstName} ${myPerson.lastName} (${myPerson.personId})`
            : ''
        }
        badgeText="Daily Shift & Raw Scan Inspector"
        maxWidthClass="max-w-4xl"
      >
        {selectedDayModalDate && (
          <div className="space-y-6">
            {/* Part A: Assigned Shifts on Selected Date */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-purple-600" />
                  1. กะปฏิบัติงานที่ได้รับมอบหมายในวันนี้ ({selectedDayEntries.length}{' '}
                  กะ)
                </h4>
                {selectedDayModalDate === CURRENT_SYSTEM_DATE && (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold">
                    วันปัจจุบันของระบบ
                  </span>
                )}
              </div>

              {selectedDayEntries.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CalendarOff className="w-5 h-5 text-slate-500" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        {selectedDayNoShift?.label || 'ไม่มีกะที่ได้รับมอบหมาย'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedDayNoShift?.detail ||
                          'ไม่มีตารางเวรในวันนี้ (ไม่นับเป็น NO_SCAN)'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEntries.map((entry, idx) => (
                    <div
                      key={entry.key}
                      className="p-4 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                              entry.category
                            )}`}
                          >
                            <ShiftCategoryIcon
                              category={entry.category}
                              className="w-4 h-4"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-purple-700">
                                กะที่ {idx + 1}
                              </span>
                              <span className="text-sm font-bold text-slate-900">
                                {entry.shiftName}
                              </span>
                              <span className="text-xs font-mono text-slate-500">
                                ({entry.shiftCode})
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>
                                เวลาเริ่ม–สิ้นสุดจริง:{' '}
                                <strong className="font-mono text-slate-900">
                                  {entry.startTime} – {entry.endTime} น.
                                </strong>
                              </span>
                              <span>•</span>
                              <span>
                                วันที่สิ้นสุดกะ:{' '}
                                <strong className="font-mono text-indigo-700">
                                  {entry.endDate}
                                  {entry.crossMidnight ? ' (ข้ามเที่ยงคืน +1 วัน)' : ''}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {renderEvaluationStatusBadge(entry)}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
                          <div className="text-[10px] text-slate-400">
                            เวลาสแกนเข้า (ประมวลผลแล้ว)
                          </div>
                          <div className="font-mono font-bold text-emerald-700 mt-0.5">
                            {entry.checkInAt || '-'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
                          <div className="text-[10px] text-slate-400">
                            เวลาสแกนออก (ประมวลผลแล้ว)
                          </div>
                          <div className="font-mono font-bold text-purple-700 mt-0.5">
                            {entry.checkOutAt || '-'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
                          <div className="text-[10px] text-slate-400">
                            นาทีมาสาย (Grace {entry.graceMinutes}น.)
                          </div>
                          <div className="font-mono font-bold text-amber-700 mt-0.5">
                            {entry.lateMinutes > 0
                              ? `+${entry.lateMinutes} นาที`
                              : '0 นาที'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200/70">
                          <div className="text-[10px] text-slate-400">
                            หมายเหตุ / สาเหตุ
                          </div>
                          <div className="font-semibold text-slate-800 mt-0.5 truncate">
                            {entry.noteLabel ||
                              (entry.evaluationStatus === 'PENDING_EVALUATION'
                                ? 'รอประเมินหลังจบกะ'
                                : '-')}
                          </div>
                        </div>
                      </div>

                      {entry.noteDetail && (
                        <div className="px-3 py-2 rounded-lg bg-purple-50 border border-purple-200/70 text-xs text-purple-900">
                          <strong>รายละเอียดหมายเหตุ HR:</strong> {entry.noteDetail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Part B: All Raw Scan Events on Selected Date (§5.3 — must show ALL scans, never collapsed) */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-purple-600" />
                  2. รายการสแกนดิบทั้งหมดของฉันในวันนี้ (Raw Scan Events —{' '}
                  {selectedDayRawScans.length} เหตุการณ์)
                </h4>
                <span className="text-[11px] text-slate-500">
                  แสดงครบทุกครั้งที่แตะนิ้วโดยไม่ยุบรวม
                </span>
              </div>

              {selectedDayRawScans.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                  ไม่พบเหตุการณ์สแกนนิ้ว (Raw Scan Event) ในวันที่{' '}
                  {selectedDayModalDate}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600">
                        <th className="py-2.5 px-3">ลำดับ</th>
                        <th className="py-2.5 px-3">scanDateTime</th>
                        <th className="py-2.5 px-3">machineNo</th>
                        <th className="py-2.5 px-3">enrollNumber</th>
                        <th className="py-2.5 px-3">inOutMode (Raw)</th>
                        <th className="py-2.5 px-3 text-right">JSON</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDayRawScans.map((scan, i) => (
                        <tr key={scan.id} className="hover:bg-purple-50/40">
                          <td className="py-2 px-3 font-mono font-bold text-purple-700">
                            #{i + 1}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {scan.scanDateTime}
                          </td>
                          <td className="py-2 px-3">
                            เครื่องสแกน #{scan.machineNo}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            {scan.enrollNumber}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            inOutMode: {scan.inOutMode}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRawScanJson(scan)}
                              className="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-[11px] cursor-pointer"
                            >
                              ดู JSON
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </SharedModal>

      {/* =====================================================================
          MODAL 2: KPI DRILLDOWN MODAL (§4)
         ===================================================================== */}
      <SharedModal
        open={Boolean(kpiModalConfig)}
        onClose={() => setActiveKpiModal(null)}
        title={kpiModalConfig?.title || 'รายละเอียด KPI'}
        subtitle={kpiModalConfig?.subtitle || ''}
        badgeText="KPI Drilldown"
        maxWidthClass="max-w-3xl"
      >
        {kpiModalConfig && (
          <div className="space-y-3">
            {kpiModalConfig.entries.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                ไม่มีรายการในหมวดหมู่นี้ประจำเดือนที่เลือก
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600">
                      <th className="py-2.5 px-3">วันที่</th>
                      <th className="py-2.5 px-3">กะปฏิบัติงาน</th>
                      <th className="py-2.5 px-3">สแกนเข้า</th>
                      <th className="py-2.5 px-3">สแกนออก</th>
                      <th className="py-2.5 px-3">สถานะ</th>
                      <th className="py-2.5 px-3 text-right">ดูรายวัน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kpiModalConfig.entries.map((entry) => (
                      <tr key={entry.key} className="hover:bg-purple-50/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {entry.workDate}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <ShiftCategoryIcon
                              category={entry.category}
                              className="w-3.5 h-3.5 text-purple-700"
                            />
                            <span className="font-bold text-slate-800">
                              {entry.shiftName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              ({entry.startTime}–{entry.endTime})
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-700 font-bold">
                          {entry.checkInAt || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-purple-700 font-bold">
                          {entry.checkOutAt || '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          {renderEvaluationStatusBadge(entry, true)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveKpiModal(null);
                              setSelectedDayModalDate(entry.workDate);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-[11px] cursor-pointer"
                          >
                            เปิดดูวันนั้น
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </SharedModal>

      {/* =====================================================================
          MODAL 3: 6-FIELD RAW SCAN JSON INSPECTOR (§6)
         ===================================================================== */}
      <SharedModal
        open={Boolean(selectedRawScanJson)}
        onClose={() => setSelectedRawScanJson(null)}
        title="ข้อมูลดิบจากเครื่องสแกนนิ้ว (6-Field Raw Scan JSON Contract)"
        subtitle={
          selectedRawScanJson
            ? `Event ID: ${selectedRawScanJson.id} • Dedupe Key: ${selectedRawScanJson.dedupeKey}`
            : ''
        }
        badgeText="Immutable Raw Event"
        maxWidthClass="max-w-xl"
      >
        {selectedRawScanJson && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              ข้อมูลชุดนี้นำเข้าจากโปรแกรมดึงสแกนนิ้ว (Scanner Export JSON 6 ฟิลด์) แบบ Read-Only ห้ามแก้ไขหรือลบเพื่อให้สามารถตรวจสอบย้อนหลัง (Audit Trail) ได้เสมอ
            </div>
            <pre className="p-4 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed">
              {JSON.stringify(
                {
                  machineNo: selectedRawScanJson.machineNo,
                  enrollNumber: selectedRawScanJson.enrollNumber,
                  scanDateTime: selectedRawScanJson.scanDateTime,
                  verifyMode: selectedRawScanJson.verifyMode,
                  inOutMode: selectedRawScanJson.inOutMode,
                  workCode: selectedRawScanJson.workCode,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
