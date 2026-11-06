import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  mockAttendanceService,
  CURRENT_SYSTEM_DATE,
} from '../services/mockAttendanceService';
import {
  AttendanceRecord,
  AttendanceStatus,
  HRReviewStatus,
  NoScanReasonCode,
  PageSizeOption,
  Personnel,
  RawScanEvent,
  Shift,
  ShiftAssignment,
  ShiftVisualCategory,
} from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
} from '../components/common/TablePaginationBar';
import {
  ShiftCategoryIcon,
  resolveShiftCategory,
  getShiftIconButtonClasses,
} from './PersonnelView';
import {
  Search,
  RefreshCw,
  FileEdit,
  Info,
  Calendar,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Eye,
  X,
  Clock,
  Clock3,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  FileCode2,
  CalendarClock,
  CalendarOff,
  Building2,
  History,
  RotateCcw,
  UserCheck,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';

type ReviewPeriodMode = 'DAILY' | 'MONTHLY' | 'YEARLY' | 'RANGE';

type HRStatusTab =
  | 'NEEDS_REVIEW'
  | 'ALL'
  | 'LATE'
  | 'MISSING_CHECKOUT'
  | 'NO_SCAN'
  | 'REVIEWED'
  | 'SPECIAL_CASES';

type ShiftCategoryFilter =
  | 'ALL'
  | 'MORNING'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'OFFICIAL'
  | 'COMBINED'
  | 'OTHER';

export type ReviewRowEvaluationStatus =
  | AttendanceStatus
  | 'PENDING_EVALUATION'
  | 'UPCOMING_SHIFT';

export interface AttendanceReviewItem {
  key: string;
  attendanceId: string;
  personId: string;
  fingleId: number;
  fullName: string;
  position: string;
  department: string;
  groupName: string;
  personnelType: string;
  workDate: string;
  endDate: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  crossMidnight: boolean;
  graceMinutes: number;
  shiftCategory: ShiftVisualCategory;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  evaluationStatus: ReviewRowEvaluationStatus;
  hasMissingCheckout: boolean;
  isEvaluable: boolean;
  hrReviewStatus: HRReviewStatus;
  attendanceRecord?: AttendanceRecord;
  assignment?: ShiftAssignment;
  relatedRawScans: RawScanEvent[];
}

const REASON_LABELS: Record<NoScanReasonCode, string> = {
  SICK_LEAVE: 'ลาป่วย (มีใบรับรองแพทย์/แจ้งการลา)',
  BUSINESS_LEAVE: 'ลากิจส่วนตัว',
  VACATION_LEAVE: 'ลาพักผ่อนประจำปี',
  OFFICIAL_DUTY: 'ไปราชการ / ประชุมภายนอก',
  TRAINING: 'อบรม / สัมมนาทางวิชาการ',
  DAY_OFF: 'วันหยุดตามเวร / วันหยุดนักขัตฤกษ์',
  FORGOT_CHECKOUT: 'ลืมสแกนออก แต่ยืนยันว่ามาปฏิบัติงาน',
  LATE_EXPLANATION: 'ชี้แจงเหตุผลการมาสาย',
  SCANNER_ISSUE: 'เครื่องสแกนขัดข้อง / ลายนิ้วมืออ่านไม่ติด',
  OTHER: 'เหตุผลอื่น ๆ',
};

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export const AttendanceReviewView: React.FC = () => {
  const { currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 1. Period Mode & Date Selectors (§2 — 4 modes like HR Attendance Report)
  const [periodMode, setPeriodMode] = useState<ReviewPeriodMode>('DAILY');
  const [selectedDailyDate, setSelectedDailyDate] =
    useState<string>(CURRENT_SYSTEM_DATE);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [rangeFrom, setRangeFrom] = useState<string>('2026-11-01');
  const [rangeTo, setRangeTo] = useState<string>('2026-11-06');

  // 2. Status Tab (§4 — Default recommended: "ต้องตรวจสอบ" / NEEDS_REVIEW)
  const [activeTab, setActiveTab] = useState<HRStatusTab>('NEEDS_REVIEW');

  // 3. Global Filters (§2)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedPersonnelType, setSelectedPersonnelType] =
    useState<string>('ALL');
  const [selectedShiftCategory, setSelectedShiftCategory] =
    useState<ShiftCategoryFilter>('ALL');
  const [selectedAttendanceStatus, setSelectedAttendanceStatus] =
    useState<string>('ALL');
  const [selectedHRReviewFilter, setSelectedHRReviewFilter] =
    useState<string>('ALL');

  // 4. Sorting & Pagination (§5)
  const [sortKey, setSortKey] = useState<string>('workDate');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // 5. Modals (§6, §7, §8)
  const [selectedDetailItemKey, setSelectedDetailItemKey] = useState<
    string | null
  >(null);
  const [selectedRawScanJson, setSelectedRawScanJson] =
    useState<RawScanEvent | null>(null);
  const [rosterSchedulePerson, setRosterSchedulePerson] =
    useState<Personnel | null>(null);

  // HR Note Form inside Detail Modal or Quick Action Modal
  const [noteModalItemKey, setNoteModalItemKey] = useState<string | null>(null);
  const [formReasonCode, setFormReasonCode] =
    useState<NoScanReasonCode>('SICK_LEAVE');
  const [formNoteText, setFormNoteText] = useState<string>('');
  const [formHRReviewStatus, setFormHRReviewStatus] =
    useState<HRReviewStatus>('REVIEWED');

  // Reprocess Modal State (§7)
  const [isReprocessOpen, setIsReprocessOpen] = useState<boolean>(false);
  const [reprocessFrom, setReprocessFrom] =
    useState<string>(CURRENT_SYSTEM_DATE);
  const [reprocessTo, setReprocessTo] = useState<string>(CURRENT_SYSTEM_DATE);
  const [reprocessGroup, setReprocessGroup] = useState<string>('ALL');
  const [reprocessPersonId, setReprocessPersonId] = useState<string>('ALL');
  const [reprocessResult, setReprocessResult] = useState<ReturnType<
    typeof mockAttendanceService.reprocessAttendance
  > | null>(null);

  // Compute effective date window from periodMode (§2)
  const { effectiveFrom, effectiveTo, periodLabel } = useMemo(() => {
    if (periodMode === 'DAILY') {
      return {
        effectiveFrom: selectedDailyDate,
        effectiveTo: selectedDailyDate,
        periodLabel: `รายวัน (${selectedDailyDate})`,
      };
    }
    if (periodMode === 'MONTHLY') {
      return {
        effectiveFrom: `${selectedMonth}-01`,
        effectiveTo: `${selectedMonth}-31`,
        periodLabel: `รายเดือน (${selectedMonth})`,
      };
    }
    if (periodMode === 'YEARLY') {
      return {
        effectiveFrom: `${selectedYear}-01-01`,
        effectiveTo: `${selectedYear}-12-31`,
        periodLabel: `รายปี พ.ศ. ${Number(selectedYear) + 543} (${selectedYear})`,
      };
    }
    return {
      effectiveFrom: rangeFrom,
      effectiveTo: rangeTo,
      periodLabel: `ช่วงวันที่ ${rangeFrom} ถึง ${rangeTo}`,
    };
  }, [
    periodMode,
    selectedDailyDate,
    selectedMonth,
    selectedYear,
    rangeFrom,
    rangeTo,
  ]);

  // Load shared data from mockAttendanceService
  const allPersonnel = useMemo(
    () => mockAttendanceService.getPersonnel(),
    [refreshKey]
  );
  const allShifts = useMemo(
    () => mockAttendanceService.getShifts(),
    [refreshKey]
  );
  const allAssignments = useMemo(
    () => mockAttendanceService.getShiftAssignments(),
    [refreshKey]
  );
  const allAttendanceRecords = useMemo(
    () => mockAttendanceService.getAttendance(),
    [refreshKey]
  );
  const allRawScans = useMemo(
    () => mockAttendanceService.getRawScans(),
    [refreshKey]
  );

  const personnelMap = useMemo(() => {
    const map = new Map<string, Personnel>();
    allPersonnel.forEach((p) => map.set(p.personId, p));
    return map;
  }, [allPersonnel]);

  const fingleToPersonMap = useMemo(() => {
    const map = new Map<number, Personnel>();
    allPersonnel.forEach((p) => map.set(p.fingleId, p));
    return map;
  }, [allPersonnel]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    allShifts.forEach((s) => map.set(s.id, s));
    return map;
  }, [allShifts]);

  // Group raw scans by enrollNumber + date
  const rawScansByEnrollAndDate = useMemo(() => {
    const map = new Map<string, RawScanEvent[]>();
    allRawScans.forEach((raw) => {
      const dateStr = raw.scanDateTime.slice(0, 10);
      const k = `${raw.enrollNumber}_${dateStr}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(raw);
    });
    map.forEach((list) =>
      list.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime))
    );
    return map;
  }, [allRawScans]);

  // Dropdown options
  const departmentAndGroupOptions = useMemo(() => {
    const groups = Array.from(new Set(allPersonnel.map((p) => p.groupName)));
    const depts = Array.from(new Set(allPersonnel.map((p) => p.department)));
    return { groups, depts };
  }, [allPersonnel]);

  const personnelTypeOptions = useMemo(
    () => Array.from(new Set(allPersonnel.map((p) => p.personnelType))),
    [allPersonnel]
  );

  /**
   * Build unified Shift-level Review Items (§3, §5, §8, §9)
   * - 1 row per Shift Assignment or AttendanceRecord
   * - Supports multiple shifts per person on the same day
   * - Supports cross-midnight shifts (+1 day)
   * - Never marks future shifts (> CURRENT_SYSTEM_DATE) as NO_SCAN
   * - Never marks ongoing shifts (like SH09 20:30–23:30 on 2026-11-06) as MISSING_CHECKOUT before shift end
   * - Includes UNASSIGNED / NO_SCHEDULE and PENDING_MAPPING cases separately from NO_SCAN
   */
  const allReviewItemsInPeriod = useMemo<AttendanceReviewItem[]>(() => {
    const items: AttendanceReviewItem[] = [];
    const matchedAttendanceIds = new Set<string>();

    // 1. Process all ShiftAssignments in [effectiveFrom, effectiveTo]
    const assignmentsInRange = allAssignments.filter(
      (a) => a.workDate >= effectiveFrom && a.workDate <= effectiveTo
    );

    assignmentsInRange.forEach((asgn) => {
      const person = personnelMap.get(asgn.personId);
      if (!person) return;

      const shiftObj = shiftMap.get(asgn.shiftId);
      const matchingAtt = allAttendanceRecords.find(
        (att) =>
          att.personId === asgn.personId &&
          att.workDate === asgn.workDate &&
          (att.shiftId === asgn.shiftId ||
            att.shiftStartTime ===
              (asgn.shiftStartTime || shiftObj?.startTime))
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
        matchingAtt?.crossMidnight ??
        shiftObj?.crossMidnight ??
        (endTime === '00:00' || endTime < startTime);
      const graceMinutes =
        asgn.graceMinutes ??
        matchingAtt?.graceMinutes ??
        shiftObj?.graceMinutes ??
        15;
      const shiftCategory = resolveShiftCategory(
        shiftObj,
        asgn.shiftCategory || matchingAtt?.shiftCategory
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

      // Related raw scans (include next-day early morning scans if crossMidnight)
      const sameDayScans =
        rawScansByEnrollAndDate.get(`${person.fingleId}_${asgn.workDate}`) ||
        [];
      const nextDayScans = crossMidnight
        ? (
            rawScansByEnrollAndDate.get(`${person.fingleId}_${endDate}`) || []
          ).filter((s) => s.scanDateTime.slice(11, 16) <= '09:00')
        : [];
      const relatedRawScans = [...sameDayScans, ...nextDayScans];

      let evaluationStatus: ReviewRowEvaluationStatus = 'NORMAL';
      let isEvaluable = true;
      let checkInAt: string | null = matchingAtt?.checkInAt || null;
      let checkOutAt: string | null = matchingAtt?.checkOutAt || null;
      let lateMinutes = matchingAtt?.lateMinutes || 0;
      let hasMissingCheckout = Boolean(matchingAtt?.hasMissingCheckout);

      if (asgn.workDate > CURRENT_SYSTEM_DATE) {
        evaluationStatus = 'UPCOMING_SHIFT';
        isEvaluable = false;
      } else if (asgn.workDate === CURRENT_SYSTEM_DATE && !matchingAtt) {
        // E.g. P001's 3rd shift SH09 (20:30 - 23:30) on 2026-11-06: shift has not concluded yet
        const matchingIn = sameDayScans.find(
          (s) => s.scanDateTime.slice(11, 16) >= startTime
        );
        if (matchingIn) {
          checkInAt = matchingIn.scanDateTime.slice(11, 19);
        }
        evaluationStatus = 'PENDING_EVALUATION';
        isEvaluable = false;
      } else if (matchingAtt) {
        evaluationStatus = matchingAtt.status;
        if (matchingAtt.status === 'MISSING_CHECKOUT') {
          hasMissingCheckout = true;
        }
      } else {
        evaluationStatus = 'NO_SCAN';
      }

      // Resolve HR Review Status (strictly separated from AttendanceStatus per §4)
      let hrReviewStatus: HRReviewStatus = 'NOT_REQUIRED';
      if (!isEvaluable) {
        hrReviewStatus = 'NOT_REQUIRED';
      } else if (matchingAtt?.hrReviewStatus) {
        hrReviewStatus = matchingAtt.hrReviewStatus;
      } else if (matchingAtt?.notes) {
        hrReviewStatus = 'REVIEWED';
      } else if (
        evaluationStatus === 'LATE' ||
        evaluationStatus === 'MISSING_CHECKOUT' ||
        evaluationStatus === 'NO_SCAN' ||
        hasMissingCheckout
      ) {
        hrReviewStatus = 'PENDING_REVIEW';
      } else {
        hrReviewStatus = 'NOT_REQUIRED';
      }

      const attendanceId = matchingAtt?.id || `ATT_ASGN_${asgn.id}`;

      items.push({
        key: `${asgn.workDate}_${person.personId}_${asgn.shiftId}_${asgn.id}`,
        attendanceId,
        personId: person.personId,
        fingleId: person.fingleId,
        fullName: `${person.prefix}${person.firstName} ${person.lastName}`,
        position: person.position,
        department: person.department,
        groupName: person.groupName,
        personnelType: person.personnelType,
        workDate: asgn.workDate,
        endDate,
        shiftId: asgn.shiftId,
        shiftCode,
        shiftName,
        shiftStartTime: startTime,
        shiftEndTime: endTime,
        crossMidnight,
        graceMinutes,
        shiftCategory,
        checkInAt,
        checkOutAt,
        lateMinutes,
        evaluationStatus,
        hasMissingCheckout,
        isEvaluable,
        hrReviewStatus,
        attendanceRecord: matchingAtt,
        assignment: asgn,
        relatedRawScans,
      });
    });

    // 2. Process any AttendanceRecord in [effectiveFrom, effectiveTo] that had no explicit ShiftAssignment row
    allAttendanceRecords.forEach((att) => {
      if (matchedAttendanceIds.has(att.id)) return;
      if (att.workDate < effectiveFrom || att.workDate > effectiveTo) return;

      const person = personnelMap.get(att.personId);
      const shiftObj = shiftMap.get(att.shiftId);
      const startTime = att.shiftStartTime || shiftObj?.startTime || '08:30';
      const endTime = att.shiftEndTime || shiftObj?.endTime || '16:30';
      const crossMidnight =
        att.crossMidnight ??
        shiftObj?.crossMidnight ??
        (endTime === '00:00' || endTime < startTime);
      const graceMinutes = att.graceMinutes ?? shiftObj?.graceMinutes ?? 15;
      const shiftCategory = resolveShiftCategory(
        shiftObj,
        att.shiftCategory || shiftObj?.category
      ).category;
      const endDate = crossMidnight ? addOneDay(att.workDate) : att.workDate;

      const sameDayScans =
        rawScansByEnrollAndDate.get(`${att.fingleId}_${att.workDate}`) || [];
      const nextDayScans = crossMidnight
        ? (
            rawScansByEnrollAndDate.get(`${att.fingleId}_${endDate}`) || []
          ).filter((s) => s.scanDateTime.slice(11, 16) <= '09:00')
        : [];
      const relatedRawScans = [...sameDayScans, ...nextDayScans];

      const isEvaluable = att.workDate <= CURRENT_SYSTEM_DATE;
      const evaluationStatus: ReviewRowEvaluationStatus = isEvaluable
        ? att.status
        : 'UPCOMING_SHIFT';
      const hasMissingCheckout =
        Boolean(att.hasMissingCheckout) || att.status === 'MISSING_CHECKOUT';

      let hrReviewStatus: HRReviewStatus = 'NOT_REQUIRED';
      if (att.hrReviewStatus) {
        hrReviewStatus = att.hrReviewStatus;
      } else if (att.notes) {
        hrReviewStatus = 'REVIEWED';
      } else if (
        evaluationStatus === 'LATE' ||
        evaluationStatus === 'MISSING_CHECKOUT' ||
        evaluationStatus === 'NO_SCAN' ||
        hasMissingCheckout
      ) {
        hrReviewStatus = 'PENDING_REVIEW';
      }

      items.push({
        key: `${att.workDate}_${att.personId}_${att.shiftId}_${att.id}`,
        attendanceId: att.id,
        personId: att.personId,
        fingleId: att.fingleId,
        fullName: att.fullName,
        position: person?.position || 'เจ้าหน้าที่โรงพยาบาล',
        department: att.department,
        groupName: att.groupName,
        personnelType: att.personnelType,
        workDate: att.workDate,
        endDate,
        shiftId: att.shiftId,
        shiftCode: shiftObj?.code || att.shiftId,
        shiftName: att.shiftName,
        shiftStartTime: startTime,
        shiftEndTime: endTime,
        crossMidnight,
        graceMinutes,
        shiftCategory,
        checkInAt: att.checkInAt,
        checkOutAt: att.checkOutAt,
        lateMinutes: att.lateMinutes,
        evaluationStatus,
        hasMissingCheckout,
        isEvaluable,
        hrReviewStatus,
        attendanceRecord: att,
        relatedRawScans,
      });
    });

    // 3. Include Unmapped FINGLE_ID Raw Scans (PENDING_MAPPING) & Unassigned Personnel (NO_SCHEDULE) per §8 & §9
    // Check raw scans in range where enrollNumber is not mapped to any active personnel
    const unmappedGroups = new Map<string, RawScanEvent[]>();
    allRawScans.forEach((raw) => {
      const d = raw.scanDateTime.slice(0, 10);
      if (d < effectiveFrom || d > effectiveTo) return;
      if (!fingleToPersonMap.has(raw.enrollNumber)) {
        const k = `${raw.enrollNumber}_${d}`;
        if (!unmappedGroups.has(k)) unmappedGroups.set(k, []);
        unmappedGroups.get(k)!.push(raw);
      }
    });

    unmappedGroups.forEach((scans, k) => {
      const [enrollStr, workDate] = k.split('_');
      const enrollNum = Number(enrollStr);
      scans.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));
      const firstIn = scans[0]?.scanDateTime.slice(11, 19) || null;
      const lastOut =
        scans.length > 1
          ? scans[scans.length - 1].scanDateTime.slice(11, 19)
          : null;

      items.push({
        key: `UNMAPPED_${workDate}_${enrollNum}`,
        attendanceId: `ATT_UNMAPPED_${workDate}_${enrollNum}`,
        personId: 'UNMAPPED',
        fingleId: enrollNum,
        fullName: `ยังไม่พบ FINGLE_ID Mapping (#${enrollNum})`,
        position: 'รอผูกข้อมูลจาก HOSOffice.hr_person',
        department: 'ยังไม่ระบุหน่วยงาน',
        groupName: 'รอตรวจสอบ Mapping',
        personnelType: 'รอตรวจสอบ',
        workDate,
        endDate: workDate,
        shiftId: 'UNMAPPED',
        shiftCode: 'N/A',
        shiftName: 'รอยืนยัน FINGLE_ID Mapping',
        shiftStartTime: '-',
        shiftEndTime: '-',
        crossMidnight: false,
        graceMinutes: 0,
        shiftCategory: 'OTHER',
        checkInAt: firstIn,
        checkOutAt: lastOut,
        lateMinutes: 0,
        evaluationStatus: 'PENDING_MAPPING',
        hasMissingCheckout: false,
        isEvaluable: false,
        hrReviewStatus: 'PENDING_REVIEW',
        relatedRawScans: scans,
      });
    });

    return items.sort(
      (a, b) =>
        b.workDate.localeCompare(a.workDate) ||
        a.personId.localeCompare(b.personId) ||
        a.shiftStartTime.localeCompare(b.shiftStartTime)
    );
  }, [
    allAssignments,
    allAttendanceRecords,
    allRawScans,
    effectiveFrom,
    effectiveTo,
    personnelMap,
    fingleToPersonMap,
    shiftMap,
    rawScansByEnrollAndDate,
  ]);

  // Apply Top-Level Dimension Filters (Search, Group/Dept, PersonnelType, ShiftCategory)
  // Both KPI Cards and Table share this filtered base so KPIs & Table are 100% synchronized (§2, §3, §9)!
  const dimensionFilteredItems = useMemo(() => {
    return allReviewItemsInPeriod.filter((item) => {
      if (selectedGroup !== 'ALL') {
        if (
          item.groupName !== selectedGroup &&
          item.department !== selectedGroup
        ) {
          return false;
        }
      }
      if (selectedPersonnelType !== 'ALL') {
        if (item.personnelType !== selectedPersonnelType) {
          return false;
        }
      }
      if (selectedShiftCategory !== 'ALL') {
        if (selectedShiftCategory === 'MORNING' && item.shiftCategory !== 'MORNING')
          return false;
        if (
          selectedShiftCategory === 'AFTERNOON' &&
          item.shiftCategory !== 'AFTERNOON'
        )
          return false;
        if (selectedShiftCategory === 'NIGHT' && item.shiftCategory !== 'NIGHT')
          return false;
        if (
          selectedShiftCategory === 'OFFICIAL' &&
          item.shiftCategory !== 'OFFICIAL'
        )
          return false;
        if (
          selectedShiftCategory === 'COMBINED' &&
          !['MORNING_AFTERNOON', 'AFTERNOON_NIGHT', 'ALL_DAY'].includes(
            item.shiftCategory
          )
        )
          return false;
        if (selectedShiftCategory === 'OTHER' && item.shiftCategory !== 'OTHER')
          return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          item.fullName.toLowerCase().includes(q) ||
          item.personId.toLowerCase().includes(q) ||
          String(item.fingleId).includes(q) ||
          item.department.toLowerCase().includes(q) ||
          item.groupName.toLowerCase().includes(q) ||
          item.shiftName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    allReviewItemsInPeriod,
    selectedGroup,
    selectedPersonnelType,
    selectedShiftCategory,
    searchQuery,
  ]);

  /**
   * Compute the 6 KPI Summary Cards from dimensionFilteredItems (§3)
   * Rules enforced:
   * - Counts evaluable shifts (excludes future shifts > CURRENT_SYSTEM_DATE and ongoing shifts not yet concluded)
   * - Separates shift/event counts (กะ/ครั้ง) from distinct people counts (คน)
   * - Never uses total hospital personnel count as denominator for multi-day shift events
   * - A single shift with multiple issues (e.g. P008 who is both LATE and MISSING_CHECKOUT) is counted in both event KPIs
   * - "ต้องตรวจสอบ" counts only unresolved items (`hrReviewStatus === 'PENDING_REVIEW'`), NOT the sum of all anomaly cards!
   */
  const kpiStats = useMemo(() => {
    const evaluableItems = dimensionFilteredItems.filter((i) => i.isEvaluable);
    const evaluablePeople = new Set(evaluableItems.map((i) => i.personId));

    const normalItems = evaluableItems.filter(
      (i) => i.evaluationStatus === 'NORMAL' && !i.hasMissingCheckout
    );
    const normalPeople = new Set(normalItems.map((i) => i.personId));

    const lateItems = evaluableItems.filter(
      (i) => i.evaluationStatus === 'LATE' || i.lateMinutes > 0
    );
    const latePeople = new Set(lateItems.map((i) => i.personId));
    const totalLateMinutes = lateItems.reduce((s, i) => s + i.lateMinutes, 0);

    const noScanItems = evaluableItems.filter(
      (i) => i.evaluationStatus === 'NO_SCAN'
    );
    const noScanPeople = new Set(noScanItems.map((i) => i.personId));

    const missingCheckoutItems = evaluableItems.filter(
      (i) =>
        i.evaluationStatus === 'MISSING_CHECKOUT' || i.hasMissingCheckout
    );
    const missingCheckoutPeople = new Set(
      missingCheckoutItems.map((i) => i.personId)
    );

    const needsReviewItems = dimensionFilteredItems.filter(
      (i) => i.hrReviewStatus === 'PENDING_REVIEW'
    );
    const needsReviewPeople = new Set(needsReviewItems.map((i) => i.personId));

    const reviewedItems = dimensionFilteredItems.filter(
      (i) => i.hrReviewStatus === 'REVIEWED'
    );

    const specialCaseItems = dimensionFilteredItems.filter(
      (i) => !i.isEvaluable
    );

    const onTimeShiftPercent =
      evaluableItems.length > 0
        ? Math.round((normalItems.length / evaluableItems.length) * 100)
        : 0;

    return {
      evaluableCount: evaluableItems.length,
      evaluablePeopleCount: evaluablePeople.size,
      normalCount: normalItems.length,
      normalPeopleCount: normalPeople.size,
      onTimeShiftPercent,
      lateCount: lateItems.length,
      latePeopleCount: latePeople.size,
      totalLateMinutes,
      noScanCount: noScanItems.length,
      noScanPeopleCount: noScanPeople.size,
      missingCheckoutCount: missingCheckoutItems.length,
      missingCheckoutPeopleCount: missingCheckoutPeople.size,
      needsReviewCount: needsReviewItems.length,
      needsReviewPeopleCount: needsReviewPeople.size,
      reviewedCount: reviewedItems.length,
      specialCasesCount: specialCaseItems.length,
    };
  }, [dimensionFilteredItems]);

  // Apply Status Tab + Explicit Attendance/HR dropdown filters + Sorting for the Table (§4 & §5)
  const filteredAndSortedItems = useMemo(() => {
    const list = dimensionFilteredItems.filter((item) => {
      // Tab filter
      if (activeTab === 'NEEDS_REVIEW') {
        if (item.hrReviewStatus !== 'PENDING_REVIEW') return false;
      } else if (activeTab === 'LATE') {
        if (
          !item.isEvaluable ||
          (item.evaluationStatus !== 'LATE' && item.lateMinutes <= 0)
        )
          return false;
      } else if (activeTab === 'MISSING_CHECKOUT') {
        if (
          !item.isEvaluable ||
          (item.evaluationStatus !== 'MISSING_CHECKOUT' &&
            !item.hasMissingCheckout)
        )
          return false;
      } else if (activeTab === 'NO_SCAN') {
        if (!item.isEvaluable || item.evaluationStatus !== 'NO_SCAN')
          return false;
      } else if (activeTab === 'REVIEWED') {
        if (item.hrReviewStatus !== 'REVIEWED') return false;
      } else if (activeTab === 'SPECIAL_CASES') {
        if (item.isEvaluable) return false;
      }

      // Explicit Attendance Status dropdown filter
      if (selectedAttendanceStatus !== 'ALL') {
        if (selectedAttendanceStatus === 'MISSING_CHECKOUT') {
          if (
            item.evaluationStatus !== 'MISSING_CHECKOUT' &&
            !item.hasMissingCheckout
          )
            return false;
        } else if (item.evaluationStatus !== selectedAttendanceStatus) {
          return false;
        }
      }

      // Explicit HR Review Status dropdown filter
      if (selectedHRReviewFilter !== 'ALL') {
        if (item.hrReviewStatus !== selectedHRReviewFilter) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      const dir = sortDirection === 'ASC' ? 1 : -1;
      switch (sortKey) {
        case 'workDate':
          return (
            (a.workDate.localeCompare(b.workDate) ||
              a.shiftStartTime.localeCompare(b.shiftStartTime)) * dir
          );
        case 'personId':
          return a.personId.localeCompare(b.personId) * dir;
        case 'fullName':
          return a.fullName.localeCompare(b.fullName, 'th') * dir;
        case 'department':
          return a.department.localeCompare(b.department, 'th') * dir;
        case 'shiftName':
          return a.shiftStartTime.localeCompare(b.shiftStartTime) * dir;
        case 'checkInAt':
          return (
            (a.checkInAt || '99:99').localeCompare(b.checkInAt || '99:99') * dir
          );
        case 'checkOutAt':
          return (
            (a.checkOutAt || '99:99').localeCompare(b.checkOutAt || '99:99') *
            dir
          );
        case 'status':
          return a.evaluationStatus.localeCompare(b.evaluationStatus) * dir;
        case 'lateMinutes':
          return (a.lateMinutes - b.lateMinutes) * dir;
        case 'hrReviewStatus':
          return a.hrReviewStatus.localeCompare(b.hrReviewStatus) * dir;
        default:
          return 0;
      }
    });
  }, [
    dimensionFilteredItems,
    activeTab,
    selectedAttendanceStatus,
    selectedHRReviewFilter,
    sortKey,
    sortDirection,
  ]);

  const pagedItems = useMemo(() => {
    if (pageSize === 'ALL') return filteredAndSortedItems;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedItems.slice(start, start + pageSize);
  }, [filteredAndSortedItems, currentPage, pageSize]);

  // Active item for Detail Modal (§6)
  const selectedDetailItem = useMemo(() => {
    if (!selectedDetailItemKey) return null;
    return (
      allReviewItemsInPeriod.find((i) => i.key === selectedDetailItemKey) ||
      null
    );
  }, [allReviewItemsInPeriod, selectedDetailItemKey]);

  // Active item for Note Edit Modal
  const activeNoteModalItem = useMemo(() => {
    if (!noteModalItemKey) return null;
    return (
      allReviewItemsInPeriod.find((i) => i.key === noteModalItemKey) || null
    );
  }, [allReviewItemsInPeriod, noteModalItemKey]);

  // Reprocess Impact Preview (§7)
  const reprocessImpactPreview = useMemo(() => {
    return mockAttendanceService.previewReprocessImpact({
      fromDate: reprocessFrom,
      toDate: reprocessTo,
      groupName: reprocessGroup,
      personId: reprocessPersonId,
    });
  }, [
    reprocessFrom,
    reprocessTo,
    reprocessGroup,
    reprocessPersonId,
    refreshKey,
  ]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDirection('ASC');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedGroup('ALL');
    setSelectedPersonnelType('ALL');
    setSelectedShiftCategory('ALL');
    setSelectedAttendanceStatus('ALL');
    setSelectedHRReviewFilter('ALL');
    setActiveTab('ALL');
    setCurrentPage(1);
  };

  const handleOpenNoteEditor = (item: AttendanceReviewItem) => {
    setNoteModalItemKey(item.key);
    if (item.attendanceRecord?.notes) {
      setFormReasonCode(item.attendanceRecord.notes.reasonCode);
      setFormNoteText(item.attendanceRecord.notes.note);
    } else if (
      item.evaluationStatus === 'MISSING_CHECKOUT' ||
      item.hasMissingCheckout
    ) {
      setFormReasonCode('FORGOT_CHECKOUT');
      setFormNoteText(
        'ลืมสแกนออกหลังเลิกเวร แต่หัวหน้างานยืนยันว่ามาปฏิบัติงานจริงครบตามเวลา'
      );
    } else if (item.evaluationStatus === 'LATE') {
      setFormReasonCode('LATE_EXPLANATION');
      setFormNoteText('');
    } else {
      setFormReasonCode('SICK_LEAVE');
      setFormNoteText('');
    }
    setFormHRReviewStatus('REVIEWED');
  };

  const handleSaveHRReview = () => {
    const targetItem = activeNoteModalItem || selectedDetailItem;
    if (!targetItem || !currentUser) return;

    mockAttendanceService.saveAttendanceHRReview({
      attendanceId: targetItem.attendanceId,
      reasonCode: formReasonCode,
      reasonLabel: REASON_LABELS[formReasonCode],
      note: formNoteText.trim() || REASON_LABELS[formReasonCode],
      hrReviewStatus: formHRReviewStatus,
      authorUserId: currentUser.id,
      authorName: currentUser.fullName,
      fallbackRecordData: {
        personId: targetItem.personId,
        fingleId: targetItem.fingleId,
        fullName: targetItem.fullName,
        department: targetItem.department,
        groupName: targetItem.groupName,
        personnelType: targetItem.personnelType,
        workDate: targetItem.workDate,
        shiftId: targetItem.shiftId,
        shiftName: targetItem.shiftName,
        shiftStartTime: targetItem.shiftStartTime,
        shiftEndTime: targetItem.shiftEndTime,
        crossMidnight: targetItem.crossMidnight,
        graceMinutes: targetItem.graceMinutes,
        shiftCategory: targetItem.shiftCategory,
        checkInAt: targetItem.checkInAt,
        checkOutAt: targetItem.checkOutAt,
        lateMinutes: targetItem.lateMinutes,
        status:
          targetItem.evaluationStatus === 'PENDING_EVALUATION' ||
          targetItem.evaluationStatus === 'UPCOMING_SHIFT'
            ? 'NO_SCAN'
            : targetItem.evaluationStatus,
        hasMissingCheckout: targetItem.hasMissingCheckout,
      },
    });

    setNoteModalItemKey(null);
    setRefreshKey((k) => k + 1);
    setToastMessage(
      `บันทึกการตรวจสอบ HR ของ ${targetItem.fullName} (${targetItem.workDate}) เรียบร้อยแล้ว — คงสถานะ Attendance เดิม (${targetItem.evaluationStatus})`
    );
  };

  const handleRunReprocess = () => {
    const res = mockAttendanceService.reprocessAttendance(
      reprocessFrom,
      reprocessTo,
      {
        groupName: reprocessGroup,
        personId: reprocessPersonId,
      }
    );
    setReprocessResult(res);
    setRefreshKey((k) => k + 1);
    setToastMessage(
      `Reprocess สำเร็จ: ประมวลผล ${res.reprocessedCount} กะ · เปลี่ยนแปลง ${res.updatedCount} กะ · ไม่เปลี่ยนแปลง ${res.unchangedCount} กะ`
    );
  };

  // Render Attendance Status Badge (Separated from HR Review Status per §4 & §5)
  const renderAttendanceStatusBadge = (item: AttendanceReviewItem) => {
    const { evaluationStatus, hasMissingCheckout, lateMinutes } = item;

    if (evaluationStatus === 'NORMAL' && !hasMissingCheckout) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          ปกติ (ตรงเวลา)
        </span>
      );
    }

    if (evaluationStatus === 'LATE' && hasMissingCheckout) {
      return (
        <div className="flex flex-col gap-1 items-start">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" />
            มาสาย (+{lateMinutes}น.)
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
            <AlertCircle className="w-3 h-3" />
            MISSING_CHECKOUT
          </span>
        </div>
      );
    }

    if (evaluationStatus === 'LATE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3" />
          มาสาย (+{lateMinutes}น.)
        </span>
      );
    }

    if (evaluationStatus === 'MISSING_CHECKOUT' || hasMissingCheckout) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
          <AlertCircle className="w-3 h-3" />
          MISSING_CHECKOUT
        </span>
      );
    }

    if (evaluationStatus === 'NO_SCAN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3 h-3" />
          NO_SCAN (ไม่พบสแกน)
        </span>
      );
    }

    if (evaluationStatus === 'PENDING_MAPPING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-300">
          <Fingerprint className="w-3 h-3" />
          ยังไม่พบ FINGLE_ID Mapping
        </span>
      );
    }

    if (evaluationStatus === 'NO_SCHEDULE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <CalendarOff className="w-3 h-3" />
          ยังไม่ได้กำหนดกะ
        </span>
      );
    }

    if (evaluationStatus === 'PENDING_EVALUATION') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
          <Clock3 className="w-3 h-3" />
          กำลังปฏิบัติงาน (รอจบกะ)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
        <CalendarClock className="w-3 h-3" />
        กะในอนาคต
      </span>
    );
  };

  // Render HR Review Status Badge (Strictly separated from Attendance Status per §4)
  const renderHRReviewBadge = (item: AttendanceReviewItem) => {
    if (item.hrReviewStatus === 'PENDING_REVIEW') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100/80 text-amber-900 border border-amber-300">
          <AlertTriangle className="w-3 h-3 text-amber-700" />
          ต้องตรวจสอบ
        </span>
      );
    }
    if (item.hrReviewStatus === 'REVIEWED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
          <ClipboardCheck className="w-3 h-3 text-purple-700" />
          ตรวจสอบแล้ว
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
        ไม่ต้องตรวจสอบ
      </span>
    );
  };

  // ============================================================================
  // ROLE-BASED ACCESS GUARD (§10 & §13):
  // GENERAL_USER cannot access Attendance Review for all hospital personnel.
  // ============================================================================
  if (currentUser?.role === 'GENERAL_USER') {
    return (
      <div className="bg-white rounded-2xl border border-[#E9E5F2] p-8 text-center max-w-xl mx-auto my-10 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          จำกัดสิทธิ์การเข้าถึงเฉพาะเจ้าหน้าที่ HR และผู้ดูแลระบบ
        </h2>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          บัญชีผู้ใช้งานระดับ <strong>GENERAL_USER</strong> ไม่สามารถเข้าถึงหน้าตรวจสอบบันทึกเวลาปฏิบัติงานของบุคลากรทั้งหมดได้ กรุณาตรวจสอบข้อมูลของท่านที่เมนู <strong>“เวลาปฏิบัติงานของฉัน (My Attendance)”</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-purple-900 text-white px-4 py-3 rounded-2xl shadow-md flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-purple-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          SECTION 1: HEADER & GLOBAL ACTION BUTTONS (§2)
         ===================================================================== */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              กลุ่มงานทรัพยากรบุคคล (HR Operations) · โรงพยาบาลสามชุก
            </span>
            <span className="text-xs text-slate-500 font-medium">
              • {periodLabel}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1F2937] tracking-tight">
            ตรวจสอบบันทึกเวลาปฏิบัติงาน (Attendance Review)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ตรวจสอบผลการลงเวลาของบุคลากร ค้นหารายการผิดปกติ บันทึกเหตุผล และประมวลผลข้อมูลใหม่
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setReprocessFrom(effectiveFrom);
              setReprocessTo(
                effectiveTo > CURRENT_SYSTEM_DATE
                  ? CURRENT_SYSTEM_DATE
                  : effectiveTo
              );
              setReprocessResult(null);
              setIsReprocessOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reprocess Attendance</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRefreshKey((k) => k + 1);
              setToastMessage(
                'รีเฟรชข้อมูล Attendance Review จาก Shared Mock State ล่าสุดเรียบร้อยแล้ว'
              );
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-purple-50 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-purple-700" />
            <span>Refresh ข้อมูล</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          SECTION 2: 4 PERIOD MODE SELECTORS (Daily / Monthly / Yearly / Date Range — §2)
         ===================================================================== */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#F8F7FC] p-1 rounded-xl border border-[#E9E5F2]">
          {(
            [
              { id: 'DAILY', label: '1. รายวัน (Daily)' },
              { id: 'MONTHLY', label: '2. รายเดือน (Monthly)' },
              { id: 'YEARLY', label: '3. รายปี (Yearly)' },
              { id: 'RANGE', label: '4. กำหนดช่วงเวลา (Date Range)' },
            ] as Array<{ id: ReviewPeriodMode; label: string }>
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setPeriodMode(mode.id);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                periodMode === mode.id
                  ? 'bg-[#6D28D9] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Dynamic Date Input Control Matching Active Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {periodMode === 'DAILY' && (
            <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-700" />
              <span className="text-xs font-semibold text-slate-600">
                ประจำวันที่:
              </span>
              <input
                type="date"
                value={selectedDailyDate}
                onChange={(e) => {
                  setSelectedDailyDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
              />
              {selectedDailyDate !== CURRENT_SYSTEM_DATE && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDailyDate(CURRENT_SYSTEM_DATE);
                    setCurrentPage(1);
                  }}
                  className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                >
                  วันนี้ ({CURRENT_SYSTEM_DATE})
                </button>
              )}
            </div>
          )}

          {periodMode === 'MONTHLY' && (
            <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-700" />
              <span className="text-xs font-semibold text-slate-600">
                เลือกเดือนและปี:
              </span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
              />
            </div>
          )}

          {periodMode === 'YEARLY' && (
            <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-700" />
              <span className="text-xs font-semibold text-slate-600">
                เลือกปี:
              </span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none"
              >
                <option value="2026">พ.ศ. 2569 (2026)</option>
                <option value="2025">พ.ศ. 2568 (2025)</option>
              </select>
            </div>
          )}

          {periodMode === 'RANGE' && (
            <div className="flex flex-wrap items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-700" />
              <span className="text-xs font-semibold text-slate-600">จาก:</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => {
                  setRangeFrom(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
              />
              <span className="text-xs font-semibold text-slate-600">ถึง:</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => {
                  setRangeTo(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          SECTION 3: 6 COMPACT KPI SUMMARY CARDS (§3)
         ===================================================================== */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: กะที่ถึงกำหนดและประเมินได้ */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('ALL');
              setSelectedAttendanceStatus('ALL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              activeTab === 'ALL' && selectedAttendanceStatus === 'ALL'
                ? 'bg-purple-50/70 border-purple-500 ring-2 ring-purple-500/15'
                : 'bg-white hover:bg-purple-50/30 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>กะที่ถึงกำหนดประเมินได้</span>
              <Layers className="w-4 h-4 text-purple-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-purple-700">
                {kpiStats.evaluableCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">กะ</span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 flex items-center justify-between">
              <span>บุคลากร {kpiStats.evaluablePeopleCount} คน</span>
              <span className="text-purple-700 font-semibold">ดูทั้งหมด →</span>
            </div>
          </button>

          {/* Card 2: ปกติ (ตรงเวลา) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('ALL');
              setSelectedAttendanceStatus('NORMAL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              selectedAttendanceStatus === 'NORMAL'
                ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/15'
                : 'bg-white hover:bg-emerald-50/30 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>ปกติ (ตรงเวลา)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-700">
                {kpiStats.normalCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">กะ</span>
            </div>
            <div className="mt-1.5 text-[11px] text-emerald-700 font-medium flex items-center justify-between">
              <span>
                {kpiStats.normalPeopleCount} คน ({kpiStats.onTimeShiftPercent}% ของกะ)
              </span>
              <span>กรอง →</span>
            </div>
          </button>

          {/* Card 3: มาสาย (Late) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('LATE');
              setSelectedAttendanceStatus('ALL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              activeTab === 'LATE'
                ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/15'
                : 'bg-white hover:bg-amber-50/30 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>มาสาย (Late)</span>
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-amber-600">
                {kpiStats.lateCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">ครั้ง</span>
            </div>
            <div className="mt-1.5 text-[11px] text-amber-800 font-medium flex items-center justify-between">
              <span>
                {kpiStats.latePeopleCount} คน · รวม {kpiStats.totalLateMinutes} น.
              </span>
              <span>กรอง →</span>
            </div>
          </button>

          {/* Card 4: ไม่มีข้อมูลสแกน (NO_SCAN) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('NO_SCAN');
              setSelectedAttendanceStatus('ALL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              activeTab === 'NO_SCAN'
                ? 'bg-rose-50/80 border-rose-500 ring-2 ring-rose-500/15'
                : 'bg-white hover:bg-rose-50/30 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>ไม่มีสแกน (NO_SCAN)</span>
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-rose-600">
                {kpiStats.noScanCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">ครั้ง</span>
            </div>
            <div className="mt-1.5 text-[11px] text-rose-700 font-medium flex items-center justify-between">
              <span>{kpiStats.noScanPeopleCount} คน (ไม่รวมกะอนาคต)</span>
              <span>กรอง →</span>
            </div>
          </button>

          {/* Card 5: ลืมสแกนออก (MISSING_CHECKOUT) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('MISSING_CHECKOUT');
              setSelectedAttendanceStatus('ALL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              activeTab === 'MISSING_CHECKOUT'
                ? 'bg-orange-50/80 border-orange-500 ring-2 ring-orange-500/15'
                : 'bg-white hover:bg-orange-50/30 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>ลืมสแกนออก</span>
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-orange-600">
                {kpiStats.missingCheckoutCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">ครั้ง</span>
            </div>
            <div className="mt-1.5 text-[11px] text-orange-800 font-medium flex items-center justify-between">
              <span>{kpiStats.missingCheckoutPeopleCount} คน (จบเวลากะแล้ว)</span>
              <span>กรอง →</span>
            </div>
          </button>

          {/* Card 6: ต้องตรวจสอบ (Needs HR Review) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('NEEDS_REVIEW');
              setSelectedAttendanceStatus('ALL');
              setSelectedHRReviewFilter('ALL');
              setCurrentPage(1);
            }}
            className={`text-left rounded-2xl p-4 border transition cursor-pointer flex flex-col justify-between ${
              activeTab === 'NEEDS_REVIEW'
                ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20'
                : 'bg-white hover:bg-amber-50/40 border-[#E9E5F2]'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span>ต้องตรวจสอบ (HR)</span>
              <FileEdit className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-amber-700">
                {kpiStats.needsReviewCount}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                รายการ
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-amber-800 font-medium flex items-center justify-between">
              <span>
                {kpiStats.needsReviewPeopleCount} คน · ตรวจแล้ว{' '}
                {kpiStats.reviewedCount}
              </span>
              <span>กรอง →</span>
            </div>
          </button>
        </div>

        {/* Explanatory note on KPI event counting rules (§3) */}
        <div className="px-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            * หมายเหตุการคำนวณ KPI: นับตามรายการกะที่ถึงกำหนดประเมินได้ (ไม่รวมกะในอนาคตและกะที่ยังไม่สิ้นสุดเวลา) • รายการที่มีหลายปัญหาในกะเดียวกัน (เช่น มาสายและลืมสแกนออก) จะแสดงในจำนวนเหตุการณ์ของทั้งสองหมวด • KPI “ต้องตรวจสอบ” นับเฉพาะรายการที่ยังไม่ได้รับการตรวจสอบจาก HR เท่านั้น
          </span>
        </div>
      </div>

      {/* =====================================================================
          SECTION 4: HR STATUS TABS & GLOBAL FILTER BAR (§2 & §4)
         ===================================================================== */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-xs space-y-3.5">
        {/* Status Tabs Row (§4) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: 'NEEDS_REVIEW',
                  label: 'ต้องตรวจสอบ',
                  count: kpiStats.needsReviewCount,
                  badgeClass: 'bg-amber-100 text-amber-900',
                },
                {
                  id: 'ALL',
                  label: 'ทั้งหมด',
                  count: dimensionFilteredItems.length,
                  badgeClass: 'bg-purple-100 text-purple-900',
                },
                {
                  id: 'LATE',
                  label: 'มาสาย',
                  count: kpiStats.lateCount,
                  badgeClass: 'bg-amber-100 text-amber-900',
                },
                {
                  id: 'MISSING_CHECKOUT',
                  label: 'ลืมสแกนออก',
                  count: kpiStats.missingCheckoutCount,
                  badgeClass: 'bg-orange-100 text-orange-900',
                },
                {
                  id: 'NO_SCAN',
                  label: 'ไม่มีข้อมูลสแกน',
                  count: kpiStats.noScanCount,
                  badgeClass: 'bg-rose-100 text-rose-900',
                },
                {
                  id: 'REVIEWED',
                  label: 'ตรวจสอบแล้ว',
                  count: kpiStats.reviewedCount,
                  badgeClass: 'bg-emerald-100 text-emerald-900',
                },
                {
                  id: 'SPECIAL_CASES',
                  label: 'กะกำลังปฏิบัติงาน / อนาคต / รอผูกบัตร',
                  count: kpiStats.specialCasesCount,
                  badgeClass: 'bg-slate-200 text-slate-800',
                },
              ] as Array<{
                id: HRStatusTab;
                label: string;
                count: number;
                badgeClass: string;
              }>
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-[#6D28D9] text-white shadow-xs'
                      : 'bg-[#F8F7FC] hover:bg-purple-50 text-slate-700 border border-[#E9E5F2]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white/20 text-white' : tab.badgeClass
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Multi-Dimensional Filter Controls (§2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Search Input */}
          <div className="sm:col-span-2 flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาชื่อ–นามสกุล, PERSON_ID, FINGLE_ID..."
              className="w-full text-xs text-slate-800 bg-transparent focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Group / Department Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">ทุกกลุ่มงาน / แผนก</option>
            <optgroup label="กลุ่มงานหลัก">
              {departmentAndGroupOptions.groups.map((g) => (
                <option key={`grp_${g}`} value={g}>
                  {g}
                </option>
              ))}
            </optgroup>
            <optgroup label="ฝ่าย / แผนกย่อย">
              {departmentAndGroupOptions.depts.map((d) => (
                <option key={`dept_${d}`} value={d}>
                  {d}
                </option>
              ))}
            </optgroup>
          </select>

          {/* Personnel Type Filter */}
          <select
            value={selectedPersonnelType}
            onChange={(e) => {
              setSelectedPersonnelType(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">ทุกประเภทบุคลากร</option>
            {personnelTypeOptions.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>

          {/* Shift Category Filter */}
          <select
            value={selectedShiftCategory}
            onChange={(e) => {
              setSelectedShiftCategory(e.target.value as ShiftCategoryFilter);
              setCurrentPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">ทุกประเภทกะ</option>
            <option value="MORNING">กะเช้า (Morning)</option>
            <option value="AFTERNOON">กะบ่าย (Afternoon)</option>
            <option value="NIGHT">กะดึก (Night)</option>
            <option value="OFFICIAL">เวลาราชการ (Official)</option>
            <option value="COMBINED">กะควบ / กะทั้งวัน</option>
            <option value="OTHER">กะพิเศษอื่น ๆ</option>
          </select>

          {/* Attendance & HR Status Filters + Reset */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedHRReviewFilter}
              onChange={(e) => {
                setSelectedHRReviewFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">สถานะตรวจ HR ทั้งหมด</option>
              <option value="PENDING_REVIEW">ต้องตรวจสอบ</option>
              <option value="REVIEWED">ตรวจสอบแล้ว</option>
              <option value="NOT_REQUIRED">ไม่ต้องตรวจสอบ</option>
            </select>

            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3 py-2 rounded-xl border border-[#E9E5F2] bg-slate-50 hover:bg-purple-50 text-xs font-bold text-purple-700 shrink-0 cursor-pointer"
              title="ล้างตัวกรองทั้งหมด"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION 5: COMPACT ATTENDANCE REVIEW TABLE (§5 — 11 Columns)
         ===================================================================== */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-[#F8F7FC] border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              ตารางตรวจสอบบันทึกเวลาปฏิบัติงานรายกะ ({filteredAndSortedItems.length}{' '}
              รายการ)
            </span>
            <span className="text-[11px] text-slate-500">
              • แสดง 1 แถวต่อ 1 กะปฏิบัติงาน (คลิกที่แถวเพื่อเปิดดูรายละเอียด 3 ส่วนและ Raw Scan ทั้งหมด)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedAttendanceStatus}
              onChange={(e) => {
                setSelectedAttendanceStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-[#E9E5F2] rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              <option value="ALL">กรองสถานะ Attendance: ทั้งหมด</option>
              <option value="NORMAL">ปกติ (ตรงเวลา)</option>
              <option value="LATE">มาสาย (LATE)</option>
              <option value="MISSING_CHECKOUT">MISSING_CHECKOUT</option>
              <option value="NO_SCAN">NO_SCAN</option>
              <option value="PENDING_EVALUATION">กำลังปฏิบัติงาน (รอประเมิน)</option>
              <option value="UPCOMING_SHIFT">กะในอนาคต</option>
              <option value="PENDING_MAPPING">ยังไม่พบ FINGLE_ID Mapping</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600 uppercase">
                <SortableHeader
                  label="1. วันที่ปฏิบัติงาน"
                  sortKey="workDate"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="2. PERSON_ID / FINGLE"
                  sortKey="personId"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="3. ชื่อ–นามสกุล"
                  sortKey="fullName"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="4. หน่วยงาน/แผนก"
                  sortKey="department"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="5. กะเวลาทำงาน"
                  sortKey="shiftName"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="6. สแกนเข้า"
                  sortKey="checkInAt"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="7. สแกนออก"
                  sortKey="checkOutAt"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="8. สถานะ Attendance"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="9. นาทีสาย"
                  sortKey="lateMinutes"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="10. สถานะตรวจ HR"
                  sortKey="hrReviewStatus"
                  currentSortKey={sortKey}
                  currentSortDir={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-3 px-4">11. หมายเหตุ / จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-2.5">
                      <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
                      <div className="text-sm font-bold text-slate-800">
                        {activeTab === 'NEEDS_REVIEW'
                          ? 'ไม่มีรายการที่ต้องตรวจสอบในช่วงเวลา/ตัวกรองที่เลือก'
                          : 'ไม่พบรายการบันทึกเวลาปฏิบัติงานตามเงื่อนไขที่เลือก'}
                      </div>
                      <p className="text-xs text-slate-500">
                        ท่านสามารถสลับแท็บไปดูรายการทั้งหมด หรือล้างตัวกรองเพื่อดูข้อมูลกะปฏิบัติงานทั้งหมดในช่วงเวลานี้
                      </p>
                      <div className="pt-1 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('ALL');
                            setSelectedAttendanceStatus('ALL');
                            setSelectedHRReviewFilter('ALL');
                            setCurrentPage(1);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold cursor-pointer"
                        >
                          ดูรายการทั้งหมด ({dimensionFilteredItems.length} รายการ)
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedItems.map((item) => (
                  <tr
                    key={item.key}
                    onClick={() => setSelectedDetailItemKey(item.key)}
                    className={`transition-colors cursor-pointer ${
                      item.hrReviewStatus === 'PENDING_REVIEW'
                        ? 'bg-amber-50/20 hover:bg-purple-50/50'
                        : 'hover:bg-purple-50/40'
                    }`}
                  >
                    {/* 1. วันที่ปฏิบัติงาน */}
                    <td className="py-3 px-3.5 font-mono">
                      <div className="font-bold text-slate-900">
                        {item.workDate}
                      </div>
                      {item.crossMidnight && (
                        <div className="text-[10px] font-sans font-semibold text-indigo-600">
                          เลิกกะ {item.endDate.slice(5)} (+1 วัน)
                        </div>
                      )}
                    </td>

                    {/* 2. PERSON_ID / FINGLE_ID */}
                    <td className="py-3 px-3.5 font-mono">
                      <div className="font-bold text-slate-800">
                        {item.personId}
                      </div>
                      <div className="text-[10px] text-purple-700 font-semibold">
                        FINGLE: #{item.fingleId}
                      </div>
                    </td>

                    {/* 3. ชื่อ–นามสกุล */}
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900">
                        {item.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.personnelType}
                      </div>
                    </td>

                    {/* 4. หน่วยงาน/แผนก */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-800 truncate max-w-[150px]">
                        {item.department}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                        {item.groupName}
                      </div>
                    </td>

                    {/* 5. กะเวลาทำงาน */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                            item.shiftCategory
                          )}`}
                        >
                          <ShiftCategoryIcon
                            category={item.shiftCategory}
                            className="w-3.5 h-3.5"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate max-w-[160px]">
                            {item.shiftName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {item.shiftStartTime} – {item.shiftEndTime} น.
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 6. เวลาสแกนเข้า */}
                    <td className="py-3 px-3.5 font-mono">
                      {item.checkInAt ? (
                        <span className="font-bold text-emerald-700">
                          {item.checkInAt}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                      {item.relatedRawScans.length > 0 && (
                        <div className="text-[10px] text-slate-400 font-sans">
                          สแกนดิบ {item.relatedRawScans.length} ครั้ง
                        </div>
                      )}
                    </td>

                    {/* 7. เวลาสแกนออก */}
                    <td className="py-3 px-3.5 font-mono">
                      {item.checkOutAt ? (
                        <span className="font-bold text-purple-700">
                          {item.checkOutAt}
                        </span>
                      ) : item.evaluationStatus === 'PENDING_EVALUATION' ? (
                        <span className="text-[10px] font-sans text-violet-600 font-semibold">
                          รอเลิกกะ ({item.shiftEndTime})
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* 8. สถานะ Attendance */}
                    <td className="py-3 px-3.5">
                      {renderAttendanceStatusBadge(item)}
                    </td>

                    {/* 9. นาทีมาสาย */}
                    <td className="py-3 px-3.5 text-right font-mono">
                      {item.lateMinutes > 0 ? (
                        <span className="font-bold text-amber-700">
                          +{item.lateMinutes} น.
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* 10. สถานะการตรวจสอบของ HR */}
                    <td className="py-3 px-3.5">{renderHRReviewBadge(item)}</td>

                    {/* 11. หมายเหตุ / จัดการ */}
                    <td
                      className="py-3 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col gap-1">
                        {item.attendanceRecord?.notes ? (
                          <div className="text-[11px]">
                            <div className="font-bold text-purple-900 line-clamp-1">
                              {item.attendanceRecord.notes.reasonLabel}
                            </div>
                            <div className="text-[10px] text-slate-500 line-clamp-1">
                              {item.attendanceRecord.notes.note}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {item.hrReviewStatus === 'PENDING_REVIEW'
                              ? 'ยังไม่ได้ระบุหมายเหตุ'
                              : '-'}
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.personId !== 'UNMAPPED' && item.isEvaluable && (
                            <button
                              type="button"
                              onClick={() => handleOpenNoteEditor(item)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[10px] font-bold cursor-pointer"
                            >
                              <FileEdit className="w-3 h-3" />
                              {item.attendanceRecord?.notes
                                ? 'แก้ไขหมายเหตุ'
                                : 'บันทึกผลตรวจ'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedDetailItemKey(item.key)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            รายละเอียด
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={filteredAndSortedItems.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* =====================================================================
          MODAL 1: ATTENDANCE DETAIL MODAL (3 SECTIONS: A, B, C — §6 & §8)
         ===================================================================== */}
      <SharedModal
        open={Boolean(selectedDetailItem)}
        onClose={() => setSelectedDetailItemKey(null)}
        title={
          selectedDetailItem
            ? `รายละเอียดการตรวจสอบเวลาปฏิบัติงาน — ${selectedDetailItem.fullName}`
            : 'รายละเอียดการตรวจสอบเวลาปฏิบัติงาน'
        }
        subtitle={
          selectedDetailItem
            ? `วันที่ปฏิบัติงาน ${selectedDetailItem.workDate} • PERSON_ID: ${selectedDetailItem.personId} • FINGLE_ID: #${selectedDetailItem.fingleId}`
            : ''
        }
        badgeText="HR Attendance Inspector (3-Part View)"
        maxWidthClass="max-w-4xl"
      >
        {selectedDetailItem && (
          <div className="space-y-6 text-xs">
            {/* ---------------------------------------------------------------
                PART A: ข้อมูลบุคลากรและกะ (§6.A & §8)
               --------------------------------------------------------------- */}
            <div className="rounded-2xl border border-[#E9E5F2] bg-[#F8F7FC] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[11px]">
                    ส่วนที่ A
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    ข้อมูลบุคลากรและกะเวลาทำงาน (Read-Only จาก HOSOffice & Personnel Roster)
                  </h4>
                </div>

                {/* Button to open Personnel Roster Schedule in Read-Only mode (§8) */}
                {selectedDetailItem.personId !== 'UNMAPPED' && (
                  <button
                    type="button"
                    onClick={() => {
                      const p = personnelMap.get(selectedDetailItem.personId);
                      if (p) setRosterSchedulePerson(p);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-purple-50 text-purple-700 border border-purple-300 font-bold text-xs shadow-2xs cursor-pointer"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    ดูตารางกะ (Personnel Roster Read-Only)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    ชื่อ–นามสกุล (HOSOffice)
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {selectedDetailItem.fullName}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    PERSON_ID / FINGLE_ID
                  </div>
                  <div className="font-mono font-bold text-purple-700 mt-0.5">
                    {selectedDetailItem.personId} · #{selectedDetailItem.fingleId}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    หน่วยงาน / กลุ่มงาน
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedDetailItem.department} ({selectedDetailItem.groupName})
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    ประเภทบุคลากร
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedDetailItem.personnelType}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    วันที่ปฏิบัติงาน
                  </div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {selectedDetailItem.workDate}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    ชื่อกะเวลาทำงาน
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                    <ShiftCategoryIcon
                      category={selectedDetailItem.shiftCategory}
                      className="w-3.5 h-3.5"
                    />
                    <span>{selectedDetailItem.shiftName}</span>
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    เวลาเริ่ม–สิ้นสุด & Grace Period
                  </div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {selectedDetailItem.shiftStartTime} –{' '}
                    {selectedDetailItem.shiftEndTime} น. (Grace{' '}
                    {selectedDetailItem.graceMinutes} นาที)
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-semibold">
                    กะข้ามเที่ยงคืน (Cross-Midnight)
                  </div>
                  <div className="font-bold text-indigo-700 mt-0.5">
                    {selectedDetailItem.crossMidnight
                      ? `ข้ามคืน (สิ้นสุด ${selectedDetailItem.endDate} +1 วัน)`
                      : 'ภายในวันเดียวกัน'}
                  </div>
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------------
                PART B: ผลการสแกนและ Attendance + Raw Scan ทั้งหมด (§6.B)
               --------------------------------------------------------------- */}
            <div className="rounded-2xl border border-[#E9E5F2] bg-white p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[11px]">
                    ส่วนที่ B
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    ผลการสแกนและ Attendance พร้อมเหตุการณ์ Raw Scan ต้นฉบับทั้งหมด
                  </h4>
                </div>
                {renderAttendanceStatusBadge(selectedDetailItem)}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70">
                  <div className="text-[10px] text-emerald-800 font-semibold">
                    เวลาสแกนเข้าที่ประมวลผลได้
                  </div>
                  <div className="text-sm font-mono font-bold text-emerald-700 mt-0.5">
                    {selectedDetailItem.checkInAt || 'ไม่พบเวลาสแกนเข้า'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/70">
                  <div className="text-[10px] text-purple-800 font-semibold">
                    เวลาสแกนออกที่ประมวลผลได้
                  </div>
                  <div className="text-sm font-mono font-bold text-purple-700 mt-0.5">
                    {selectedDetailItem.checkOutAt || 'ไม่พบเวลาสแกนออก'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/70">
                  <div className="text-[10px] text-amber-800 font-semibold">
                    นาทีมาสาย
                  </div>
                  <div className="text-sm font-mono font-bold text-amber-700 mt-0.5">
                    {selectedDetailItem.lateMinutes > 0
                      ? `+${selectedDetailItem.lateMinutes} นาที`
                      : '0 นาที (ไม่สาย)'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-500 font-semibold">
                    สถานะ MISSING_CHECKOUT / NO_SCAN
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {selectedDetailItem.evaluationStatus === 'NO_SCAN'
                      ? 'NO_SCAN (ไม่มีข้อมูลสแกน)'
                      : selectedDetailItem.hasMissingCheckout ||
                        selectedDetailItem.evaluationStatus ===
                          'MISSING_CHECKOUT'
                      ? 'MISSING_CHECKOUT (ลืมสแกนออก)'
                      : 'สแกนครบถ้วน'}
                  </div>
                </div>
              </div>

              {/* Immutable Raw Scan Warning */}
              <div className="px-3.5 py-2 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>กฎเหล็ก Raw Scan (Immutable):</strong> แสดง 1 แถวต่อ 1 เหตุการณ์การสแกนนิ้วจริง ห้ามแก้ไขหรือลบ Raw Scan และไม่สมมติว่า{' '}
                  <code className="font-mono font-bold">inOutMode = 1</code>{' '}
                  คือสแกนเข้าเสมอโดยไม่ผ่านการจับคู่ตารางกะ
                </span>
              </div>

              {/* Raw Scan Table (All related events) */}
              {selectedDetailItem.relatedRawScans.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                  ไม่พบเหตุการณ์ Raw Scan ของ FINGLE_ID #{selectedDetailItem.fingleId}{' '}
                  ในวันที่ {selectedDetailItem.workDate}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600">
                        <th className="py-2 px-3">ลำดับ</th>
                        <th className="py-2 px-3">scanDateTime</th>
                        <th className="py-2 px-3">machineNo</th>
                        <th className="py-2 px-3">enrollNumber</th>
                        <th className="py-2 px-3">verifyMode</th>
                        <th className="py-2 px-3">inOutMode (ค่าดิบ)</th>
                        <th className="py-2 px-3">workCode</th>
                        <th className="py-2 px-3 text-right">JSON 6 ฟิลด์</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDetailItem.relatedRawScans.map((raw, idx) => (
                        <tr key={raw.id} className="hover:bg-purple-50/40">
                          <td className="py-2 px-3 font-mono font-bold text-purple-700">
                            #{idx + 1}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {raw.scanDateTime}
                          </td>
                          <td className="py-2 px-3">เครื่อง #{raw.machineNo}</td>
                          <td className="py-2 px-3 font-mono">
                            {raw.enrollNumber}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">
                            {raw.verifyMode}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                              {raw.inOutMode}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-400">
                            {raw.workCode === null ? 'null' : raw.workCode}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedRawScanJson(raw)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] cursor-pointer"
                            >
                              <FileCode2 className="w-3 h-3" />
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

            {/* ---------------------------------------------------------------
                PART C: การตรวจสอบของเจ้าหน้าที่ HR & ประวัติการแก้ไขหมายเหตุ (§6.C)
               --------------------------------------------------------------- */}
            <div className="rounded-2xl border border-[#E9E5F2] bg-[#F8F7FC] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[11px]">
                    ส่วนที่ C
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    การตรวจสอบของเจ้าหน้าที่ HR (HR Review & Audit Note History)
                  </h4>
                </div>
                {renderHRReviewBadge(selectedDetailItem)}
              </div>

              {/* Current Saved HR Note Display */}
              {selectedDetailItem.attendanceRecord?.notes ? (
                <div className="bg-white p-3.5 rounded-xl border border-purple-200 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-purple-900 text-xs">
                      เหตุผลที่บันทึก:{' '}
                      {selectedDetailItem.attendanceRecord.notes.reasonLabel}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ผู้บันทึก:{' '}
                      <strong className="text-slate-800">
                        {selectedDetailItem.attendanceRecord.notes.authorName}
                      </strong>{' '}
                      • เวลา:{' '}
                      <span className="font-mono">
                        {selectedDetailItem.attendanceRecord.notes.updatedAt}
                      </span>
                    </span>
                  </div>
                  <p className="text-slate-700 text-xs">
                    รายละเอียด: {selectedDetailItem.attendanceRecord.notes.note}
                  </p>
                  <div className="text-[11px] text-emerald-700 font-semibold pt-1">
                    ✓ สถานะ Attendance ยังคงเป็น{' '}
                    <span className="font-mono">
                      {selectedDetailItem.evaluationStatus}
                    </span>{' '}
                    ตามข้อเท็จจริงจากเครื่องสแกน (ไม่สร้าง Raw Scan ปลอม)
                  </div>
                </div>
              ) : (
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-slate-500 flex items-center justify-between">
                  <span>ยังไม่มีการบันทึกหมายเหตุจากเจ้าหน้าที่ HR สำหรับกะนี้</span>
                </div>
              )}

              {/* Button to Open HR Review / Note Form */}
              {selectedDetailItem.personId !== 'UNMAPPED' &&
                selectedDetailItem.isEvaluable && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenNoteEditor(selectedDetailItem)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      {selectedDetailItem.attendanceRecord?.notes
                        ? 'แก้ไขหมายเหตุ / สถานะการตรวจสอบ HR'
                        : 'บันทึกผลการตรวจสอบ / ระบุเหตุผล'}
                    </button>
                  </div>
                )}

              {/* Note Change History (§6.C) */}
              <div className="space-y-2 pt-2 border-t border-slate-200/80">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-purple-700" />
                  ประวัติการเปลี่ยนแปลงหมายเหตุ (Note History)
                </div>
                {!selectedDetailItem.attendanceRecord?.noteHistory ||
                selectedDetailItem.attendanceRecord.noteHistory.length === 0 ? (
                  <div className="text-[11px] text-slate-400">
                    ยังไม่มีประวัติการแก้ไขหมายเหตุ
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDetailItem.attendanceRecord.noteHistory.map(
                      (nh) => (
                        <div
                          key={nh.id}
                          className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div>
                            <span className="font-bold text-purple-800">
                              [{nh.hrReviewStatus === 'REVIEWED' ? 'ตรวจสอบแล้ว' : 'ต้องตรวจสอบ'}] {nh.reasonLabel}
                            </span>
                            <span className="text-slate-600 ml-2">
                              — {nh.note}
                            </span>
                          </div>
                          <div className="text-slate-400 font-mono">
                            โดย {nh.authorName} · {nh.timestamp}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SharedModal>

      {/* =====================================================================
          MODAL 2: HR REVIEW & NOTE RECORDING MODAL (§4 & §6.C)
         ===================================================================== */}
      <SharedModal
        open={Boolean(activeNoteModalItem)}
        onClose={() => setNoteModalItemKey(null)}
        title="บันทึกผลการตรวจสอบของเจ้าหน้าที่ HR"
        subtitle={
          activeNoteModalItem
            ? `${activeNoteModalItem.fullName} (${activeNoteModalItem.personId}) • วันที่ ${activeNoteModalItem.workDate} • ${activeNoteModalItem.shiftName}`
            : ''
        }
        badgeText="HR Review & Reason Logger"
        maxWidthClass="max-w-lg"
      >
        {activeNoteModalItem && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-purple-700 shrink-0" />
                การแยกสถานะ Attendance และสถานะการตรวจสอบ HR:
              </div>
              <p className="text-[11px] text-purple-900 leading-relaxed">
                การบันทึกเหตุผลและเปลี่ยนสถานะ HR Review เป็น{' '}
                <strong>“ตรวจสอบแล้ว”</strong> จะไม่สร้าง Raw Scan ปลอม และยังคงสถานะ Attendance เดิมไว้ (เช่น{' '}
                <code className="font-mono font-bold">
                  {activeNoteModalItem.evaluationStatus}
                </code>
                ) เพื่อความถูกต้องในการตรวจสอบย้อนหลัง
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                1. สถานะการตรวจสอบของเจ้าหน้าที่ HR:
              </label>
              <select
                value={formHRReviewStatus}
                onChange={(e) =>
                  setFormHRReviewStatus(e.target.value as HRReviewStatus)
                }
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              >
                <option value="REVIEWED">
                  ตรวจสอบแล้ว (Reviewed — ยืนยันผลการตรวจสอบ)
                </option>
                <option value="PENDING_REVIEW">
                  ต้องตรวจสอบเพิ่มเติม (Pending Review)
                </option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                2. ประเภทสาเหตุ / เหตุผลประกอบการตรวจสอบ:
              </label>
              <select
                value={formReasonCode}
                onChange={(e) =>
                  setFormReasonCode(e.target.value as NoScanReasonCode)
                }
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="FORGOT_CHECKOUT">
                  ลืมสแกนออก แต่ยืนยันว่ามาปฏิบัติงาน (สำหรับ MISSING_CHECKOUT)
                </option>
                <option value="SICK_LEAVE">
                  ลาป่วย (มีใบรับรองแพทย์/แจ้งการลา)
                </option>
                <option value="VACATION_LEAVE">ลาพักผ่อนประจำปี</option>
                <option value="BUSINESS_LEAVE">ลากิจส่วนตัว</option>
                <option value="TRAINING">อบรม / สัมมนาทางวิชาการ</option>
                <option value="OFFICIAL_DUTY">ไปราชการ / ประชุมภายนอก</option>
                <option value="DAY_OFF">
                  วันหยุดตามเวร / วันหยุดนักขัตฤกษ์
                </option>
                <option value="LATE_EXPLANATION">
                  ชี้แจงเหตุผลการมาสาย (สำหรับ LATE)
                </option>
                <option value="SCANNER_ISSUE">
                  เครื่องสแกนขัดข้อง / ลายนิ้วมืออ่านไม่ติด
                </option>
                <option value="OTHER">เหตุผลอื่น ๆ</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                3. รายละเอียดหมายเหตุเพิ่มเติม:
              </label>
              <textarea
                rows={3}
                value={formNoteText}
                onChange={(e) => setFormNoteText(e.target.value)}
                placeholder="เช่น ลืมสแกนออกแต่หัวหน้างานยืนยันว่าปฏิบัติงานจริง หรือระบุเลขที่หนังสือส่งตัวไปราชการ/ใบลา..."
                className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setNoteModalItemKey(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveHRReview}
                className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                บันทึกผลการตรวจสอบ
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      {/* =====================================================================
          MODAL 3: REPROCESS ATTENDANCE MODAL (§7)
         ===================================================================== */}
      <SharedModal
        open={isReprocessOpen}
        onClose={() => setIsReprocessOpen(false)}
        title="ประมวลผลเวลาปฏิบัติงานใหม่ (Reprocess Attendance)"
        subtitle="คำนวณสถานะการมาทำงานและนาทีสายใหม่จาก Raw Scan, Shift Assignment และกฎเวลากะ โดยไม่ลบหมายเหตุของ HR"
        badgeText="Deterministic Reprocess Engine"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              หลักการทำงานของ Reprocess Attendance:
            </div>
            <p className="text-[11px] leading-relaxed">
              ระบบจะนำเหตุการณ์ Raw Scan ต้นฉบับทั้งหมดในช่วงวันที่เลือก มาประมวลผลคู่กับตารางกะ (Shift Assignment) และ Grace Period ล่าสุด โดย<strong>ไม่ลบ Raw Scan</strong> และ<strong>ไม่ลบหมายเหตุ/ผลการตรวจสอบของเจ้าหน้าที่ HR</strong> ที่มีอยู่เดิม
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                วันเริ่มต้น (From Date):
              </label>
              <input
                type="date"
                value={reprocessFrom}
                onChange={(e) => {
                  setReprocessFrom(e.target.value);
                  setReprocessResult(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                วันสิ้นสุด (To Date):
              </label>
              <input
                type="date"
                value={reprocessTo}
                onChange={(e) => {
                  setReprocessTo(e.target.value);
                  setReprocessResult(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                ขอบเขตหน่วยงาน / กลุ่มงาน:
              </label>
              <select
                value={reprocessGroup}
                onChange={(e) => {
                  setReprocessGroup(e.target.value);
                  setReprocessResult(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">ทุกกลุ่มงาน / ทั้งโรงพยาบาล</option>
                {departmentAndGroupOptions.groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                ขอบเขตบุคลากร:
              </label>
              <select
                value={reprocessPersonId}
                onChange={(e) => {
                  setReprocessPersonId(e.target.value);
                  setReprocessResult(null);
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">บุคลากรทั้งหมดในขอบเขต</option>
                {allPersonnel.map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.personId} — {p.prefix}
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Impact Preview Card before Confirmation (§7) */}
          <div className="p-3.5 rounded-xl bg-[#F8F7FC] border border-[#E9E5F2] space-y-2">
            <div className="font-bold text-slate-800">
              จำนวนรายการที่คาดว่าจะได้รับผลกระทบ (Impact Preview):
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">รายการกะที่จะประเมิน</div>
                <div className="text-base font-mono font-bold text-purple-700">
                  {reprocessImpactPreview.targetAttendanceCount} กะ
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">Raw Scan ในช่วงเวลา</div>
                <div className="text-base font-mono font-bold text-slate-800">
                  {reprocessImpactPreview.matchingRawScansCount} ครั้ง
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">สแกนยังไม่ผูกบัตร</div>
                <div className="text-base font-mono font-bold text-amber-700">
                  {reprocessImpactPreview.unmappedScansCount} รายการ
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <div className="text-[10px] text-slate-500">กะในอนาคต (ข้าม)</div>
                <div className="text-base font-mono font-bold text-sky-700">
                  {reprocessImpactPreview.futureSkippedCount} กะ
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Reprocess Execution Result (§7) */}
          {reprocessResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2.5">
              <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ผลการประมวลผลใหม่ (Reprocess Result Summary)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white p-2 rounded-lg border border-emerald-200">
                  <div className="text-[10px] text-slate-500">ประมวลผลทั้งหมด</div>
                  <div className="font-mono font-bold text-sm text-slate-900">
                    {reprocessResult.reprocessedCount} รายการ
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-200">
                  <div className="text-[10px] text-slate-500">เปลี่ยนสถานะ</div>
                  <div className="font-mono font-bold text-sm text-emerald-700">
                    {reprocessResult.updatedCount} รายการ
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-200">
                  <div className="text-[10px] text-slate-500">ไม่เปลี่ยนแปลง</div>
                  <div className="font-mono font-bold text-sm text-slate-700">
                    {reprocessResult.unchangedCount} รายการ
                  </div>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-200">
                  <div className="text-[10px] text-slate-500">
                    ข้าม/ประมวลผลไม่ได้
                  </div>
                  <div className="font-mono font-bold text-sm text-amber-700">
                    {reprocessResult.skippedCount} รายการ
                  </div>
                </div>
              </div>

              {reprocessResult.skippedReasons.length > 0 && (
                <div className="bg-white/90 p-2.5 rounded-lg border border-amber-200 space-y-1">
                  <div className="font-bold text-[11px] text-amber-900">
                    รายการที่ข้ามการประมวลผลและเหตุผล:
                  </div>
                  <ul className="text-[11px] text-slate-600 space-y-0.5 max-h-28 overflow-y-auto">
                    {reprocessResult.skippedReasons.slice(0, 6).map((sr, i) => (
                      <li key={i}>
                        • <strong>{sr.label}</strong>: {sr.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsReprocessOpen(false)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={handleRunReprocess}
              className="px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              ยืนยัน Reprocess Attendance
            </button>
          </div>
        </div>
      </SharedModal>

      {/* =====================================================================
          MODAL 4: PERSONNEL ROSTER SCHEDULE MODAL (Read-Only from Attendance Review — §8)
         ===================================================================== */}
      <SharedModal
        open={Boolean(rosterSchedulePerson)}
        onClose={() => setRosterSchedulePerson(null)}
        title={
          rosterSchedulePerson
            ? `ตารางกะจาก Personnel Roster (Read-Only) — ${rosterSchedulePerson.prefix}${rosterSchedulePerson.firstName} ${rosterSchedulePerson.lastName}`
            : 'ตารางกะจาก Personnel Roster'
        }
        subtitle={
          rosterSchedulePerson
            ? `PERSON_ID: ${rosterSchedulePerson.personId} • FINGLE_ID: #${rosterSchedulePerson.fingleId} • ${rosterSchedulePerson.department}`
            : ''
        }
        badgeText="Personnel Roster Link (Read-Only)"
        maxWidthClass="max-w-2xl"
      >
        {rosterSchedulePerson && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-700 shrink-0" />
              <span>
                ตารางกะด้านล่างดึงจาก <strong>Personnel Roster</strong> ชุดเดียวกันแบบ Read-Only หากต้องการเพิ่มหรือเปลี่ยนกะล่วงหน้า กรุณาไปที่เมนู <strong>Personnel Roster</strong> แล้วสั่ง Reprocess Attendance
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E9E5F2]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-[11px] font-bold text-slate-600">
                    <th className="py-2.5 px-3">วันที่ปฏิบัติงาน</th>
                    <th className="py-2.5 px-3">กะเวลาที่ผูกไว้</th>
                    <th className="py-2.5 px-3">เวลาเริ่ม–สิ้นสุด</th>
                    <th className="py-2.5 px-3">รูปแบบการมอบหมาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mockAttendanceService
                    .getPersonShiftAssignments(rosterSchedulePerson.personId)
                    .map((asgn) => {
                      const sh = shiftMap.get(asgn.shiftId);
                      const cat = resolveShiftCategory(
                        sh,
                        asgn.shiftCategory
                      ).category;
                      return (
                        <tr key={asgn.id} className="hover:bg-purple-50/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {asgn.workDate}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <ShiftCategoryIcon
                                category={cat}
                                className="w-3.5 h-3.5"
                              />
                              <span className="font-bold text-slate-800">
                                {asgn.shiftName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {asgn.shiftStartTime || sh?.startTime} –{' '}
                            {asgn.shiftEndTime || sh?.endTime} น.
                            {(asgn.crossMidnight ?? sh?.crossMidnight)
                              ? ' (+1 วัน)'
                              : ''}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {asgn.assignmentType}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SharedModal>

      {/* =====================================================================
          MODAL 5: 6-FIELD RAW SCAN JSON MODAL (§6.B)
         ===================================================================== */}
      <SharedModal
        open={Boolean(selectedRawScanJson)}
        onClose={() => setSelectedRawScanJson(null)}
        title="ข้อมูลดิบจากเครื่องสแกนนิ้ว (6-Field Raw Scan JSON)"
        subtitle={
          selectedRawScanJson
            ? `Event ID: ${selectedRawScanJson.id} • Dedupe Key: ${selectedRawScanJson.dedupeKey}`
            : ''
        }
        badgeText="Read-Only 6-Field Contract"
        maxWidthClass="max-w-xl"
      >
        {selectedRawScanJson && (
          <div className="space-y-3 text-xs">
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
