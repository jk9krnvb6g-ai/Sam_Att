import React, { useState, useMemo } from 'react';
import {
  mockAttendanceService,
  CURRENT_SYSTEM_DATE,
  isPastWorkDate,
} from '../services/mockAttendanceService';
import {
  Personnel,
  Shift,
  ShiftVisualCategory,
  NoShiftStatusType,
  ShiftAssignment,
  ShiftCancellationLog,
} from '../types/attendance';
import { useAuth } from '../context/AuthContext';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  ShieldCheck,
  Building,
  CalendarPlus,
  CalendarDays,
  Trash2,
  UserCheck,
  X,
  Sunrise,
  Sun,
  MoonStar,
  SunMoon,
  Clock3,
  CalendarClock,
  CalendarOff,
  AlertTriangle,
  Copy,
  History,
  Lock,
} from 'lucide-react';

export type { ShiftVisualCategory };

export interface ShiftDisplayItem {
  key: string;
  assignment: ShiftAssignment;
  shift: Shift;
  category: ShiftVisualCategory;
  categoryLabel: string;
  fullName: string;
  startTime: string;
  endTime: string;
  crossMidnight: boolean;
  endDateStr: string;
  graceMinutes: number;
}

/**
 * Compute next calendar date (YYYY-MM-DD) for cross-midnight shifts (+1 วัน)
 */
function getNextDateStr(workDate: string): string {
  const dt = new Date(`${workDate}T00:00:00Z`);
  if (isNaN(dt.getTime())) return workDate;
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve visual category directly from Shift Configuration (`shift.category` or snapshotted `assignment.shiftCategory`).
 * Uses fallback only if a legacy record has no category field.
 */
export function resolveShiftCategory(
  shift?: Shift,
  snapshotCategory?: ShiftVisualCategory
): {
  category: ShiftVisualCategory;
  categoryLabel: string;
} {
  const explicitCat = snapshotCategory || shift?.category;
  if (explicitCat) {
    switch (explicitCat) {
      case 'MORNING':
        return { category: 'MORNING', categoryLabel: 'กะเช้า' };
      case 'AFTERNOON':
        return { category: 'AFTERNOON', categoryLabel: 'กะบ่าย' };
      case 'NIGHT':
        return { category: 'NIGHT', categoryLabel: 'กะดึก' };
      case 'MORNING_AFTERNOON':
        return { category: 'MORNING_AFTERNOON', categoryLabel: 'กะควบเช้า–บ่าย' };
      case 'AFTERNOON_NIGHT':
        return { category: 'AFTERNOON_NIGHT', categoryLabel: 'กะควบบ่าย–ดึก' };
      case 'ALL_DAY':
        return { category: 'ALL_DAY', categoryLabel: 'กะทั้งวัน' };
      case 'OFFICIAL':
        return { category: 'OFFICIAL', categoryLabel: 'เวลาราชการ' };
      case 'OTHER':
      default:
        return { category: 'OTHER', categoryLabel: 'กะพิเศษ / กะอื่น ๆ' };
    }
  }

  const code = (shift?.code || '').toUpperCase();
  if (code === 'MORN_AFTN') return { category: 'MORNING_AFTERNOON', categoryLabel: 'กะควบเช้า–บ่าย' };
  if (code === 'AFTN_NGHT') return { category: 'AFTERNOON_NIGHT', categoryLabel: 'กะควบบ่าย–ดึก' };
  if (code === 'ALLDAY') return { category: 'ALL_DAY', categoryLabel: 'กะทั้งวัน' };
  if (code.startsWith('MORN')) return { category: 'MORNING', categoryLabel: 'กะเช้า' };
  if (code.startsWith('AFTN')) return { category: 'AFTERNOON', categoryLabel: 'กะบ่าย' };
  if (code.startsWith('NGHT')) return { category: 'NIGHT', categoryLabel: 'กะดึก' };
  if (code === 'OFFC') return { category: 'OFFICIAL', categoryLabel: 'เวลาราชการ' };
  return { category: 'OTHER', categoryLabel: 'กะพิเศษ / กะอื่น ๆ' };
}

/**
 * Build chronological shift icon items for a person on a selected workDate.
 * IMPORTANT (§3):
 * - Sorts all assigned shifts by real startTime.
 * - NEVER auto-merges two separate single-shift assignments (e.g., กะเช้า + กะบ่าย assigned as 2 records)
 *   into a combined shift icon, and NEVER splits a single combined shift (e.g., SH06 กะควบเช้า–บ่าย).
 * - Uses snapshotted startTime/endTime/graceMinutes on the assignment if present so editing a shift template
 *   never alters past worked shifts (§11).
 */
function buildPersonDayShiftItems(
  personAssignments: ShiftAssignment[],
  shiftsMap: Map<string, Shift>
): ShiftDisplayItem[] {
  return personAssignments
    .map((assignment) => {
      const shift = shiftsMap.get(assignment.shiftId);
      if (!shift && !assignment.shiftStartTime) return null;

      const resolvedShift: Shift = shift || {
        id: assignment.shiftId,
        code: assignment.shiftId,
        name: assignment.shiftName,
        category: assignment.shiftCategory || 'OTHER',
        startTime: assignment.shiftStartTime || '08:00',
        endTime: assignment.shiftEndTime || '16:00',
        crossMidnight: assignment.crossMidnight ?? false,
        graceMinutes: assignment.graceMinutes ?? 15,
        earlyScanWindowMinutes: 60,
        lateScanWindowMinutes: 120,
        active: true,
      };

      const useSnapshot = isPastWorkDate(assignment.workDate) && !!assignment.shiftStartTime;
      const startTime = useSnapshot
        ? assignment.shiftStartTime || resolvedShift.startTime
        : resolvedShift.startTime;
      const endTime = useSnapshot
        ? assignment.shiftEndTime || resolvedShift.endTime
        : resolvedShift.endTime;
      const crossMidnight = useSnapshot
        ? assignment.crossMidnight ?? resolvedShift.crossMidnight
        : resolvedShift.crossMidnight;
      const graceMinutes = useSnapshot
        ? assignment.graceMinutes ?? resolvedShift.graceMinutes
        : resolvedShift.graceMinutes;
      const fullName = useSnapshot ? assignment.shiftName : resolvedShift.name;

      const { category, categoryLabel } = resolveShiftCategory(
        resolvedShift,
        useSnapshot ? assignment.shiftCategory : resolvedShift.category
      );

      return {
        key: assignment.id,
        assignment,
        shift: resolvedShift,
        category,
        categoryLabel,
        fullName,
        startTime,
        endTime,
        crossMidnight,
        endDateStr: crossMidnight ? getNextDateStr(assignment.workDate) : assignment.workDate,
        graceMinutes,
      };
    })
    .filter((item): item is ShiftDisplayItem => item !== null)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * Render the appropriate Lucide icon(s) for each shift category (§2)
 */
export const ShiftCategoryIcon: React.FC<{
  category: ShiftVisualCategory;
  className?: string;
}> = ({ category, className = 'w-4 h-4' }) => {
  switch (category) {
    case 'MORNING':
      return <Sunrise className={`${className} text-amber-500 shrink-0`} />;
    case 'AFTERNOON':
      return <Sun className={`${className} text-orange-500 shrink-0`} />;
    case 'NIGHT':
      return <MoonStar className={`${className} text-indigo-600 shrink-0`} />;
    case 'MORNING_AFTERNOON':
      return (
        <span className="inline-flex items-center -space-x-1 shrink-0">
          <Sunrise className={`${className} text-amber-500`} />
          <Sun className={`${className} text-orange-500`} />
        </span>
      );
    case 'AFTERNOON_NIGHT':
      return (
        <span className="inline-flex items-center -space-x-1 shrink-0">
          <Sun className={`${className} text-orange-500`} />
          <MoonStar className={`${className} text-indigo-600`} />
        </span>
      );
    case 'ALL_DAY':
      return <SunMoon className={`${className} text-violet-600 shrink-0`} />;
    case 'OFFICIAL':
      return <Clock3 className={`${className} text-purple-600 shrink-0`} />;
    case 'OTHER':
    default:
      return <CalendarClock className={`${className} text-slate-600 shrink-0`} />;
  }
};

export function getShiftIconButtonClasses(category: ShiftVisualCategory): string {
  switch (category) {
    case 'MORNING':
      return 'bg-amber-50/95 hover:bg-amber-100 text-amber-950 border-amber-300/90 focus-visible:ring-amber-400';
    case 'AFTERNOON':
      return 'bg-orange-50/95 hover:bg-orange-100 text-orange-950 border-orange-300/90 focus-visible:ring-orange-400';
    case 'NIGHT':
      return 'bg-indigo-50/95 hover:bg-indigo-100 text-indigo-950 border-indigo-300/90 focus-visible:ring-indigo-400';
    case 'MORNING_AFTERNOON':
      return 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-950 border-amber-300 focus-visible:ring-amber-400';
    case 'AFTERNOON_NIGHT':
      return 'bg-gradient-to-r from-orange-50 to-indigo-50 hover:from-orange-100 hover:to-indigo-100 text-indigo-950 border-indigo-300 focus-visible:ring-indigo-400';
    case 'ALL_DAY':
      return 'bg-violet-50/95 hover:bg-violet-100 text-violet-950 border-violet-300/90 focus-visible:ring-violet-400';
    case 'OFFICIAL':
      return 'bg-purple-50/95 hover:bg-purple-100 text-purple-950 border-purple-300/90 focus-visible:ring-purple-400';
    case 'OTHER':
    default:
      return 'bg-slate-100/90 hover:bg-violet-50 text-slate-800 border-slate-300 focus-visible:ring-violet-400';
  }
}

function getNoShiftIconClasses(status: NoShiftStatusType): string {
  switch (status) {
    case 'SHIFT_CANCELLED':
      return 'bg-rose-50/80 hover:bg-rose-100 text-rose-500 border-dashed border-rose-300 focus-visible:ring-rose-400';
    case 'SCHEDULED_DAY_OFF':
      return 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-600 border-dashed border-emerald-300 focus-visible:ring-emerald-400';
    case 'UNASSIGNED':
    default:
      return 'bg-slate-50 hover:bg-slate-100 text-slate-400 border-dashed border-slate-300 focus-visible:ring-slate-400';
  }
}

export const PersonnelView: React.FC = () => {
  const { currentUser } = useAuth();
  const canManageShifts =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'RESPONSIBLE_STAFF';

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedWorkDate, setSelectedWorkDate] = useState(CURRENT_SYSTEM_DATE);
  const [syncToast, setSyncToast] = useState<{
    type: 'success' | 'warning';
    message: string;
    details?: string[];
  } | null>(null);

  // Multi-select personnel for bulk shift assignment
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<string>('personId');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Modal 1: Read-Only Detail Modal for Person & Shifts on Selected Date (§4)
  const [inspectPerson, setInspectPerson] = useState<Personnel | null>(null);
  const [highlightedShiftIds, setHighlightedShiftIds] = useState<string[]>([]);

  // Modal 2: Assign Shift Modal (Checkbox Multi-Select + Multi-Day Calendar / Range)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetIds, setAssignTargetIds] = useState<string[]>([]);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>(['SH04']);
  const [dateSelectionMode, setDateSelectionMode] = useState<'RANGE' | 'CALENDAR'>('RANGE');
  const [assignFromDate, setAssignFromDate] = useState(CURRENT_SYSTEM_DATE);
  const [assignToDate, setAssignToDate] = useState(CURRENT_SYSTEM_DATE);
  const [calendarPickedDates, setCalendarPickedDates] = useState<string[]>([
    CURRENT_SYSTEM_DATE,
  ]);
  const [assignType, setAssignType] = useState<'DAILY' | 'RECURRING'>('DAILY');
  const [replaceExistingOnDay, setReplaceExistingOnDay] = useState(false);

  // Modal 3: Copy Shifts Across Months Modal
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copySourceMonth, setCopySourceMonth] = useState('2026-11');
  const [copyTargetMonth, setCopyTargetMonth] = useState('2026-12');
  const [copyMode, setCopyMode] = useState<'BY_DATE' | 'BY_WEEKDAY'>('BY_DATE');

  // Modal 4: Cancel Shift Confirmation Modal (Single or Bulk)
  const [cancelTargetAssignments, setCancelTargetAssignments] = useState<ShiftAssignment[]>([]);
  const [cancelReason, setCancelReason] = useState('ปรับตารางเวรประจำเดือน');

  // Modal 5: Cancellation History Log Modal
  const [isCancelLogModalOpen, setIsCancelLogModalOpen] = useState(false);

  const personnelList = useMemo(() => mockAttendanceService.getPersonnel(), [refreshKey]);
  const shifts = useMemo(() => mockAttendanceService.getShifts(), [refreshKey]);
  const personnelTypeRules = useMemo(
    () => mockAttendanceService.getPersonnelTypeRules(),
    [refreshKey]
  );
  const shiftsMap = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const s of shifts) {
      map.set(s.id, s);
    }
    return map;
  }, [shifts]);

  const allAssignments = useMemo(
    () => mockAttendanceService.getShiftAssignments(),
    [refreshKey]
  );

  const cancellationLogs: ShiftCancellationLog[] = useMemo(
    () => mockAttendanceService.getShiftCancellationLogs(),
    [refreshKey]
  );

  // Sync from HOSOffice mock
  const handleSyncHosOffice = () => {
    if (!canManageShifts) return;
    const res = mockAttendanceService.syncPersonnelFromHosOffice();
    setSyncToast({
      type: 'success',
      message: `อัปเดตข้อมูลบุคลากรจาก HOSOffice สำเร็จ: ตรวจสอบ ${res.updatedCount} รายการ (Authoritative Source — ข้อมูลหลักเป็น Read-Only)`,
    });
    setRefreshKey((k) => k + 1);
  };

  const groupNames: string[] = useMemo(
    () => Array.from(new Set(personnelList.map((p) => p.groupName))),
    [personnelList]
  );
  const personnelTypes: string[] = useMemo(
    () => Array.from(new Set(personnelList.map((p) => p.personnelType))),
    [personnelList]
  );

  // Pre-compute each person's assignments on selectedWorkDate
  const assignmentsByPersonOnDate = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>();
    for (const a of allAssignments) {
      if (a.workDate !== selectedWorkDate) continue;
      const list = map.get(a.personId) || [];
      list.push(a);
      map.set(a.personId, list);
    }
    return map;
  }, [allAssignments, selectedWorkDate]);

  // Filter & Sort
  const filteredAndSortedList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = personnelList.filter((p) => {
      const fullNameStr = `${p.prefix}${p.firstName} ${p.lastName}`.toLowerCase();
      const matchesSearch =
        !q ||
        fullNameStr.includes(q) ||
        p.personId.toLowerCase().includes(q) ||
        String(p.fingleId).includes(q) ||
        p.department.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q);

      const matchesGroup = selectedGroup === 'ALL' || p.groupName === selectedGroup;
      const matchesType = selectedType === 'ALL' || p.personnelType === selectedType;
      return matchesSearch && matchesGroup && matchesType;
    });

    return [...filtered].sort((a, b) => {
      const dir = sortDir === 'ASC' ? 1 : -1;
      if (sortKey === 'fingleId') return (a.fingleId - b.fingleId) * dir;
      if (sortKey === 'fullName')
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) * dir;
      if (sortKey === 'department') return a.department.localeCompare(b.department) * dir;
      if (sortKey === 'personnelType') return a.personnelType.localeCompare(b.personnelType) * dir;
      return a.personId.localeCompare(b.personId) * dir;
    });
  }, [personnelList, searchQuery, selectedGroup, selectedType, sortKey, sortDir]);

  const pagedList = useMemo(() => {
    if (pageSize === 'ALL') return filteredAndSortedList;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedList.slice(start, start + pageSize);
  }, [filteredAndSortedList, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDir('ASC');
    }
    setCurrentPage(1);
  };

  // Multi-select handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageShifts) return;
    if (e.target.checked) {
      setSelectedPersonIds(filteredAndSortedList.map((p) => p.personId));
    } else {
      setSelectedPersonIds([]);
    }
  };

  const handleToggleSelect = (personId: string) => {
    if (!canManageShifts) return;
    setSelectedPersonIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  };

  // Open Assign Shift Modal (Enforces Grill-Me Rule #8: defaults to >= CURRENT_SYSTEM_DATE)
  const openAssignModalFor = (personIds: string[]) => {
    if (!canManageShifts) return;
    const safeDate =
      selectedWorkDate < CURRENT_SYSTEM_DATE ? CURRENT_SYSTEM_DATE : selectedWorkDate;
    setAssignTargetIds(personIds);
    const firstActiveShift = shifts.find((s) => s.active);
    setSelectedShiftIds(firstActiveShift ? [firstActiveShift.id] : []);
    setAssignFromDate(safeDate);
    setAssignToDate(safeDate);
    setCalendarPickedDates([safeDate]);
    setReplaceExistingOnDay(false);
    setIsAssignModalOpen(true);
  };

  // Toggle Checkbox Multi-Select Shift inside Assign Modal (only active shifts allowed)
  const handleToggleShiftCheckbox = (shiftId: string) => {
    const targetShift = shiftsMap.get(shiftId);
    if (!targetShift || !targetShift.active) return;
    setSelectedShiftIds((prev) =>
      prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId]
    );
  };

  // Toggle calendar date in Monthly Shift Calendar Picker
  const handleToggleCalendarDate = (dateStr: string) => {
    if (isPastWorkDate(dateStr)) return; // Past dates are Read-Only
    setCalendarPickedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  // Open Read-Only Shift Detail Modal when clicking a shift icon (§4)
  const handleOpenShiftPopup = (
    e: React.MouseEvent,
    person: Personnel,
    assignmentIds: string[] = []
  ) => {
    e.stopPropagation();
    setHighlightedShiftIds(assignmentIds);
    setInspectPerson(person);
  };

  // Compute effective target dates in Assign Modal
  const effectiveTargetDates = useMemo(() => {
    if (dateSelectionMode === 'CALENDAR') {
      return [...calendarPickedDates].sort();
    }
    const list: string[] = [];
    const start = new Date(`${assignFromDate}T00:00:00Z`);
    const end = new Date(`${assignToDate}T00:00:00Z`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const curr = new Date(start);
      let safety = 0;
      while (curr <= end && safety < 62) {
        list.push(curr.toISOString().slice(0, 10));
        curr.setUTCDate(curr.getUTCDate() + 1);
        safety++;
      }
    } else if (assignFromDate) {
      list.push(assignFromDate);
    }
    return list;
  }, [dateSelectionMode, calendarPickedDates, assignFromDate, assignToDate]);

  // Determine recommended shift IDs from the selected personnel's PersonnelTypeScheduleRule
  const recommendedShiftIdsForTargets = useMemo(() => {
    const recSet = new Set<string>();
    assignTargetIds.forEach((pid) => {
      const p = personnelList.find((x) => x.personId === pid);
      if (!p) return;
      const matchingRule = personnelTypeRules.find(
        (r) => r.name === p.personnelType || r.name.includes(p.personnelType)
      );
      if (matchingRule) {
        mockAttendanceService
          .getShiftsForPersonnelTypeRule(matchingRule.id)
          .forEach((s) => recSet.add(s.id));
      }
    });
    return recSet;
  }, [assignTargetIds, personnelList, personnelTypeRules, refreshKey]);

  // Live overlap check between selected shifts themselves + existing shifts (§4.2 & §4.3)
  const liveSelectionValidation = useMemo(() => {
    const selectedShiftObjects = selectedShiftIds
      .map((id) => shiftsMap.get(id))
      .filter((s): s is Shift => !!s && s.active);

    const selfOverlaps: string[] = [];
    for (let i = 0; i < selectedShiftObjects.length; i++) {
      for (let j = i + 1; j < selectedShiftObjects.length; j++) {
        const sA = selectedShiftObjects[i];
        const sB = selectedShiftObjects[j];
        if (
          mockAttendanceService.doShiftsOverlap(
            sA,
            sB,
            CURRENT_SYSTEM_DATE,
            CURRENT_SYSTEM_DATE
          )
        ) {
          selfOverlaps.push(
            `กะที่เลือกซ้อนทับกันเอง: "${sA.name}" (${sA.startTime}–${sA.endTime}) ซ้อนทับกับ "${sB.name}" (${sB.startTime}–${sB.endTime})`
          );
        }
      }
    }

    const pastDateErrors = effectiveTargetDates
      .filter((d) => isPastWorkDate(d))
      .map(
        (d) =>
          `วันที่ ${d}: ไม่อนุญาตให้เพิ่มหรือแก้ไขกะย้อนหลังในวันที่ผ่านมาแล้ว (Read-Only Past Date)`
      );

    const existingConflicts: string[] = [];
    if (!replaceExistingOnDay && selfOverlaps.length === 0) {
      for (const pid of assignTargetIds) {
        const person = personnelList.find((p) => p.personId === pid);
        const label = person ? `${person.prefix}${person.firstName}` : pid;
        for (const d of effectiveTargetDates) {
          if (isPastWorkDate(d)) continue;
          const nearby = allAssignments.filter((a) => a.personId === pid);
          for (const targetSh of selectedShiftObjects) {
            for (const ex of nearby) {
              if (ex.workDate === d && ex.shiftId === targetSh.id) {
                existingConflicts.push(
                  `${label} (${d}): มีกะ "${targetSh.name}" อยู่แล้ว`
                );
                break;
              }
              const exSh = shiftsMap.get(ex.shiftId);
              if (
                exSh &&
                mockAttendanceService.doShiftsOverlap(exSh, targetSh, ex.workDate, d)
              ) {
                existingConflicts.push(
                  `${label} (${d}): "${targetSh.name}" ซ้อนทับกับกะเดิม "${exSh.name}" (${ex.workDate} ${exSh.startTime}–${exSh.endTime})`
                );
                break;
              }
            }
          }
        }
      }
    }

    return {
      selectedShiftObjects,
      selfOverlaps,
      pastDateErrors,
      existingConflicts,
    };
  }, [
    selectedShiftIds,
    shiftsMap,
    effectiveTargetDates,
    replaceExistingOnDay,
    assignTargetIds,
    personnelList,
    allAssignments,
  ]);

  // Confirm Multi-Shift Assignment
  const handleConfirmAssignShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts || assignTargetIds.length === 0 || selectedShiftIds.length === 0) return;

    const res = mockAttendanceService.assignMultipleShiftsToPersonnel({
      personIds: assignTargetIds,
      shiftIds: selectedShiftIds,
      specificDates:
        dateSelectionMode === 'CALENDAR' ? calendarPickedDates : undefined,
      fromDate: assignFromDate,
      toDate: assignToDate,
      assignmentType: assignType,
      replaceExistingOnDay,
    });

    setIsAssignModalOpen(false);
    setSelectedPersonIds([]);
    setRefreshKey((k) => k + 1);

    if (res.skippedCount > 0 && res.assignedCount === 0) {
      setSyncToast({
        type: 'warning',
        message: `ไม่สามารถเพิ่มกะที่เลือกได้ (ข้าม ${res.skippedCount} รายการเนื่องจากซ้ำ/เวลาซ้อนทับ/วันที่ผ่านมาแล้ว)`,
        details: res.conflicts,
      });
    } else if (res.skippedCount > 0) {
      setSyncToast({
        type: 'warning',
        message: `บันทึกสำเร็จ ${res.assignedCount} รายการ และข้ามรายการที่ซ้ำ/ซ้อนทับ ${res.skippedCount} รายการ`,
        details: res.conflicts,
      });
    } else {
      setSyncToast({
        type: 'success',
        message: `กำหนดตารางกะแบบหลายตัวเลือกสำเร็จจำนวน ${res.assignedCount} รายการ (${assignTargetIds.length} บุคลากร · ${selectedShiftIds.length} กะ)`,
      });
    }
  };

  // Confirm Shift Cancellation (Single or Bulk) with Retroactive Guard
  const handleConfirmCancelAssignments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts || cancelTargetAssignments.length === 0) return;

    const res = mockAttendanceService.cancelShiftAssignments({
      assignmentIds: cancelTargetAssignments.map((a) => a.id),
      cancelledBy: currentUser?.fullName || 'เจ้าหน้าที่ผู้รับผิดชอบ (Sam_Att)',
      reason: cancelReason || 'ยกเลิกกะเวลาปฏิบัติงาน',
    });

    setCancelTargetAssignments([]);
    setRefreshKey((k) => k + 1);

    if (res.blockedPastCount > 0 && res.cancelledCount === 0) {
      setSyncToast({
        type: 'warning',
        message: 'ไม่อนุญาตให้ยกเลิกกะย้อนหลังในวันที่ผ่านมาแล้ว (Read-Only Past Date)',
        details: res.errors,
      });
    } else if (res.blockedPastCount > 0) {
      setSyncToast({
        type: 'warning',
        message: `ยกเลิกกะสำเร็จ ${res.cancelledCount} รายการ และข้ามวันที่ผ่านมาแล้ว ${res.blockedPastCount} รายการ`,
        details: res.errors,
      });
    } else {
      setSyncToast({
        type: 'success',
        message: `ยกเลิกกะสำเร็จ ${res.cancelledCount} รายการ พร้อมบันทึกประวัติการยกเลิกกะเรียบร้อยแล้ว (ข้อมูลสแกนดิบไม่ถูกลบ)`,
      });
    }
  };

  // Copy Shifts Across Months
  const handleConfirmCopyMonth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts) return;
    const targets =
      selectedPersonIds.length > 0
        ? selectedPersonIds
        : filteredAndSortedList.map((p) => p.personId);

    const res = mockAttendanceService.copyShiftsAcrossMonth({
      personIds: targets,
      sourceMonth: copySourceMonth,
      targetMonth: copyTargetMonth,
      copyMode,
    });

    setIsCopyModalOpen(false);
    setRefreshKey((k) => k + 1);

    if (res.assignedCount === 0) {
      setSyncToast({
        type: 'warning',
        message: `ไม่พบรายการกะที่สามารถคัดลอกได้ หรือข้ามรายการซ้ำ/ย้อนหลัง (${res.skippedCount} รายการ)`,
        details: res.conflicts,
      });
    } else {
      setSyncToast({
        type: 'success',
        message: `คัดลอกตารางกะจากเดือน ${copySourceMonth} ไปยัง ${copyTargetMonth} (${
          copyMode === 'BY_DATE' ? 'ตามวันที่' : 'ตามวันในสัปดาห์'
        }) สำเร็จ ${res.assignedCount} รายการ (ข้าม ${res.skippedCount} รายการ)`,
        details: res.conflicts,
      });
    }
  };

  // Generate November 2026 days for Monthly Shift Calendar Picker
  const novemberCalendarDays = useMemo(() => {
    return Array.from({ length: 30 }, (_, idx) => {
      const dayNum = String(idx + 1).padStart(2, '0');
      return `2026-11-${dayNum}`;
    });
  }, []);

  const isSelectedWorkDatePast = isPastWorkDate(selectedWorkDate);
  const MAX_INLINE_ICONS = 4;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200 font-bold">
              PERSONNEL ROSTER & ICON-ONLY SHIFT DISPLAY
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 font-medium">
              วันที่อ้างอิงปัจจุบัน:{' '}
              <strong className="font-mono-data text-violet-800">{CURRENT_SYSTEM_DATE}</strong>
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            บัญชีรายชื่อบุคลากร HOSOffice และการจัดตารางกะ (Personnel Roster)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            คอลัมน์กะเวลาปัจจุบันแสดงเฉพาะไอคอนกะ (Icon-Only) เรียงตามเวลาเริ่มกะจริง พร้อม Tooltip และคลิกดูรายละเอียดตารางกะแบบ Read-Only
          </p>
        </div>

        {canManageShifts && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedPersonIds.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignModalFor(selectedPersonIds)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] rounded-xl shadow-xs cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>จัดกะให้ผู้ที่เลือก ({selectedPersonIds.length} ท่าน)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCopyModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-violet-600" />
              <span>คัดลอกตารางกะข้ามเดือน</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCancelLogModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-[#F8F7FC] hover:bg-violet-50 border border-[#E9E5F2] rounded-xl transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-violet-600" />
              <span>ประวัติการยกเลิกกะ ({cancellationLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={handleSyncHosOffice}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-violet-300" />
              <span>ดึง/อัปเดตรายชื่อจาก HOSOffice</span>
            </button>
          </div>
        )}
      </div>

      {/* Sync / Assignment Toast */}
      {syncToast && (
        <div
          className={`rounded-2xl p-3.5 text-xs flex items-start justify-between gap-3 border ${
            syncToast.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-violet-50 border-violet-200 text-violet-950'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              {syncToast.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
              )}
              <span>{syncToast.message}</span>
            </div>
            {syncToast.details && syncToast.details.length > 0 && (
              <ul className="list-disc list-inside text-[11px] text-amber-800 pl-5 space-y-0.5">
                {syncToast.details.slice(0, 5).map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Authority Notice & Shift Icon Legend */}
      <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-2xl p-4 text-xs text-slate-700 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-slate-900">
                กติกาการแสดงผลไอคอนกะและข้อมูลหลัก HOSOffice:
              </div>
              <p className="text-slate-600">
                คอลัมน์กะเวลาปัจจุบันแสดง <strong>เฉพาะไอคอนกะ (Icon-Only)</strong> อ้างอิงประเภทกะจาก Shift Configuration โดยตรง · ไม่ยุบรวมกะเดี่ยวที่ผูกแยกกัน · นำเมาส์ชี้ (Hover/Focus) เพื่อดู Tooltip เวลาเริ่ม–สิ้นสุด และคลิกที่ไอคอนเพื่อเปิดดูรายละเอียดตารางกะแบบ Read-Only
              </p>
            </div>
          </div>

          {isSelectedWorkDatePast && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>วันที่เลือก ({selectedWorkDate}) เป็นวันที่ผ่านมาแล้ว — โหมดดูข้อมูลอย่างเดียว (Read-Only)</span>
            </span>
          )}
        </div>

        {/* Compact Shift Icon Legend */}
        <div className="pt-2.5 border-t border-[#E9E5F2] flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-bold text-slate-700 mr-1">คำอธิบายไอคอนกะ (Shift Icons):</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-950 font-semibold">
            <Sunrise className="w-3.5 h-3.5 text-amber-500" />
            <span>กะเช้า</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-950 font-semibold">
            <Sun className="w-3.5 h-3.5 text-orange-500" />
            <span>กะบ่าย</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-950 font-semibold">
            <MoonStar className="w-3.5 h-3.5 text-indigo-600" />
            <span>กะดึก</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 font-semibold">
            <span className="inline-flex items-center -space-x-1">
              <Sunrise className="w-3.5 h-3.5 text-amber-500" />
              <Sun className="w-3.5 h-3.5 text-orange-500" />
            </span>
            <span>กะเช้า–บ่าย (กะควบ)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gradient-to-r from-orange-50 to-indigo-50 border border-indigo-200 text-indigo-950 font-semibold">
            <span className="inline-flex items-center -space-x-1">
              <Sun className="w-3.5 h-3.5 text-orange-500" />
              <MoonStar className="w-3.5 h-3.5 text-indigo-600" />
            </span>
            <span>กะบ่าย–ดึก (กะควบ)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-950 font-semibold">
            <SunMoon className="w-3.5 h-3.5 text-violet-600" />
            <span>กะทั้งวัน</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-950 font-semibold">
            <Clock3 className="w-3.5 h-3.5 text-purple-600" />
            <span>เวลาราชการ</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
            <CalendarClock className="w-3.5 h-3.5 text-slate-600" />
            <span>กะพิเศษ / กะอื่น ๆ</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-dashed border-slate-300 text-slate-500 font-medium">
            <CalendarOff className="w-3.5 h-3.5 text-slate-400" />
            <span>ไม่มีกะ (ยังไม่กำหนด / วันหยุด / ยกเลิกกะ)</span>
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, สกุล, PERSON_ID, หรือ FINGLE_ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs bg-transparent focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
          <Building className="w-4 h-4 text-violet-600 shrink-0" />
          <select
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs bg-transparent focus:outline-none font-semibold text-slate-700 cursor-pointer"
          >
            <option value="ALL">ทุกกลุ่มงาน</option>
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
          <UserCheck className="w-4 h-4 text-violet-600 shrink-0" />
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs bg-transparent focus:outline-none font-semibold text-slate-700 cursor-pointer"
          >
            <option value="ALL">ทุกประเภทบุคลากร</option>
            {personnelTypes.map((pt) => (
              <option key={pt} value={pt}>
                {pt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
          <CalendarDays className="w-4 h-4 text-violet-600 shrink-0" />
          <span className="text-slate-500 font-semibold shrink-0">วันที่ดูตารางกะ:</span>
          <input
            type="date"
            value={selectedWorkDate}
            onChange={(e) => setSelectedWorkDate(e.target.value || CURRENT_SYSTEM_DATE)}
            className="w-full text-xs bg-transparent font-mono-data font-bold text-violet-900 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Personnel Table */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900">
            รายชื่อบุคลากรทั้งหมด ({filteredAndSortedList.length} ท่าน — คลิกที่ไอคอนกะเพื่อเปิดดูรายละเอียดกะแบบ Read-Only)
          </div>
          <span className="text-xs text-violet-700 font-mono font-semibold">
            Authoritative Table: hosoffice.hr_person
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                {canManageShifts && (
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredAndSortedList.length > 0 &&
                        selectedPersonIds.length === filteredAndSortedList.length
                      }
                      onChange={handleSelectAll}
                      className="rounded text-violet-600 cursor-pointer"
                    />
                  </th>
                )}
                <SortableHeader
                  label="PERSON_ID"
                  sortKey="personId"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="FINGLE_ID"
                  sortKey="fingleId"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ชื่อ - นามสกุล"
                  sortKey="fullName"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ตำแหน่ง / ฝ่าย"
                  sortKey="department"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ประเภทบุคลากร"
                  sortKey="personnelType"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <th className="py-2.5 px-3 text-center w-44">
                  กะเวลาปัจจุบัน ({selectedWorkDate})
                </th>
                {canManageShifts && (
                  <th className="py-2.5 px-3 text-center">จัดการกะ (Sam_Att)</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E5F2]">
              {pagedList.map((p) => {
                const isSelected = selectedPersonIds.includes(p.personId);
                const rawDayAssigns = assignmentsByPersonOnDate.get(p.personId) || [];
                const displayShiftItems = buildPersonDayShiftItems(rawDayAssigns, shiftsMap);
                const visibleIcons = displayShiftItems.slice(0, MAX_INLINE_ICONS);
                const hiddenIcons = displayShiftItems.slice(MAX_INLINE_ICONS);
                const noShiftInfo =
                  displayShiftItems.length === 0
                    ? mockAttendanceService.getNoShiftStatus(p.personId, selectedWorkDate)
                    : null;

                return (
                  <tr
                    key={p.personId}
                    onClick={() => {
                      setHighlightedShiftIds([]);
                      setInspectPerson(p);
                    }}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-violet-50/70' : 'hover:bg-violet-50/40'
                    }`}
                  >
                    {canManageShifts && (
                      <td
                        className="py-2.5 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(p.personId)}
                          className="rounded text-violet-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-mono-data font-bold text-slate-800">
                      {p.personId}
                    </td>
                    <td className="py-2.5 px-3 font-mono-data font-bold text-violet-700">
                      #{p.fingleId}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {p.prefix}
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="font-semibold text-slate-800">{p.department}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.position} · {p.groupName}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 text-[11px] font-semibold">
                        {p.personnelType}
                      </span>
                    </td>

                    {/* PART 1 (§1–§5): กะเวลาปัจจุบัน (วันที่ที่เลือก) — ICON-ONLY DISPLAY */}
                    <td
                      className="py-2 px-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {displayShiftItems.length === 0 && noShiftInfo ? (
                        <div className="relative inline-flex items-center justify-center group">
                          <button
                            type="button"
                            onClick={(e) => handleOpenShiftPopup(e, p, [])}
                            aria-label={`${noShiftInfo.label} — ${noShiftInfo.detail}`}
                            className={`w-8 h-8 rounded-xl border inline-flex items-center justify-center transition-all cursor-pointer focus:outline-none focus-visible:ring-2 ${getNoShiftIconClasses(
                              noShiftInfo.status
                            )}`}
                          >
                            <CalendarOff className="w-4 h-4 shrink-0" />
                          </button>

                          {/* Rich Hover/Focus Tooltip for No-Shift State (§5) */}
                          <div
                            role="tooltip"
                            className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-60 rounded-xl bg-slate-900 text-white p-2.5 text-left text-[11px] shadow-lg"
                          >
                            <div className="font-bold text-violet-200 flex items-center justify-between gap-2">
                              <span>{noShiftInfo.label}</span>
                              <span className="font-mono text-[10px] text-slate-300">
                                {selectedWorkDate}
                              </span>
                            </div>
                            <div className="text-slate-200 mt-1 leading-snug">
                              {noShiftInfo.detail}
                            </div>
                            <div className="text-[10px] text-emerald-300 mt-1 font-medium">
                              • ไม่ถือว่าขาดงานหรือ NO_SCAN
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                          {visibleIcons.map((item) => {
                            const ariaText = `${item.fullName} เวลา ${item.startTime} ถึง ${
                              item.endTime
                            } น.${
                              item.crossMidnight
                                ? ` (ข้ามเที่ยงคืน สิ้นสุดวันที่ ${item.endDateStr} +1 วัน)`
                                : ''
                            } · Grace Period ${item.graceMinutes} นาที`;

                            return (
                              <div
                                key={item.key}
                                className="relative inline-flex items-center group"
                              >
                                <button
                                  type="button"
                                  onClick={(e) =>
                                    handleOpenShiftPopup(e, p, [item.assignment.id])
                                  }
                                  aria-label={ariaText}
                                  className={`h-8 min-w-8 px-2 rounded-xl border inline-flex items-center justify-center transition-all shadow-2xs cursor-pointer focus:outline-none focus-visible:ring-2 ${getShiftIconButtonClasses(
                                    item.category
                                  )}`}
                                >
                                  <ShiftCategoryIcon
                                    category={item.category}
                                    className="w-4 h-4"
                                  />
                                </button>

                                {/* Rich Hover / Focus Tooltip (§4) */}
                                <div
                                  role="tooltip"
                                  className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-64 rounded-xl bg-slate-900 text-white p-3 text-left text-[11px] shadow-xl border border-slate-700"
                                >
                                  <div className="font-bold text-white flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5 mb-1.5">
                                    <span className="truncate">{item.fullName}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-violet-500/30 text-violet-200 text-[10px] shrink-0">
                                      {item.categoryLabel}
                                    </span>
                                  </div>
                                  <div className="space-y-1 font-mono-data text-[11px]">
                                    <div className="flex justify-between text-slate-200">
                                      <span className="font-sans text-slate-400">เวลาเริ่ม–สิ้นสุด:</span>
                                      <strong className="text-amber-300">
                                        {item.startTime} – {item.endTime} น.
                                      </strong>
                                    </div>
                                    <div className="flex justify-between text-slate-200">
                                      <span className="font-sans text-slate-400">วันที่สิ้นสุดกะ:</span>
                                      <span
                                        className={
                                          item.crossMidnight
                                            ? 'text-indigo-300 font-bold'
                                            : 'text-slate-300'
                                        }
                                      >
                                        {item.endDateStr}
                                        {item.crossMidnight ? ' (+1 วัน ข้ามคืน)' : ' (วันเดียวกัน)'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-slate-200">
                                      <span className="font-sans text-slate-400">Grace Period:</span>
                                      <span className="text-emerald-300 font-bold">
                                        {item.graceMinutes} นาที
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-1.5 pt-1 border-t border-slate-800 text-[10px] text-violet-300 font-sans">
                                    คลิกที่ไอคอนเพื่อเปิดดูรายละเอียดกะทั้งหมด
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {hiddenIcons.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) =>
                                handleOpenShiftPopup(
                                  e,
                                  p,
                                  hiddenIcons.map((hi) => hi.assignment.id)
                                )
                              }
                              aria-label={`มีกะเพิ่มเติมอีก ${hiddenIcons.length} กะในวันเดียวกัน คลิกเพื่อดูรายละเอียดทั้งหมด`}
                              title={`มีกะเพิ่มเติมอีก ${hiddenIcons.length} กะในวันเดียวกัน — คลิกเพื่อดูทั้งหมด`}
                              className="h-8 px-2 rounded-xl bg-violet-100 hover:bg-violet-200 text-violet-900 border border-violet-300 text-[11px] font-mono-data font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                            >
                              +{hiddenIcons.length}
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {canManageShifts && (
                      <td
                        className="py-2.5 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openAssignModalFor([p.personId])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <CalendarPlus className="w-3 h-3" />
                            <span>กำหนดกะ</span>
                          </button>

                          {rawDayAssigns.length > 0 && !isSelectedWorkDatePast && (
                            <button
                              type="button"
                              onClick={() => setCancelTargetAssignments(rawDayAssigns)}
                              title="ยกเลิกกะของวันนี้"
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={filteredAndSortedList.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* =================================================================
          MODAL 1: READ-ONLY DETAIL MODAL FOR PERSON & SHIFTS ON SELECTED DATE (§4 & §5)
         ================================================================= */}
      <SharedModal
        open={!!inspectPerson}
        onClose={() => {
          setInspectPerson(null);
          setHighlightedShiftIds([]);
        }}
        title={
          inspectPerson
            ? `รายละเอียดกะเวลาปฏิบัติงาน (Read-Only Detail) — ${inspectPerson.prefix}${inspectPerson.firstName} ${inspectPerson.lastName}`
            : ''
        }
        subtitle={`ข้อมูลหลักจาก HOSOffice (Read-Only) และรายละเอียดกะเวลาปฏิบัติงานจริงจาก ShiftAssignment (วันที่เลือก: ${selectedWorkDate})`}
        badgeText={inspectPerson?.personId}
        maxWidthClass="max-w-2xl"
      >
        {inspectPerson &&
          (() => {
            const personAssigns = mockAttendanceService.getPersonShiftAssignments(
              inspectPerson.personId
            );
            const selectedDayRawAssigns = personAssigns.filter(
              (a) => a.workDate === selectedWorkDate
            );
            const selectedDayItems = buildPersonDayShiftItems(
              selectedDayRawAssigns,
              shiftsMap
            );
            const noShiftStatus =
              selectedDayItems.length === 0
                ? mockAttendanceService.getNoShiftStatus(
                    inspectPerson.personId,
                    selectedWorkDate
                  )
                : null;

            return (
              <div className="space-y-4 text-xs">
                {/* Authoritative HOSOffice Fields (Read-Only) */}
                <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500">รหัสบุคลากร (PERSON_ID):</span>
                    <div className="font-mono-data font-bold text-slate-900 mt-0.5">
                      {inspectPerson.personId} (Read-Only)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">รหัสลายนิ้วมือ (FINGLE_ID):</span>
                    <div className="font-mono-data font-bold text-violet-700 mt-0.5">
                      #{inspectPerson.fingleId} (Read-Only)
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">ตำแหน่ง / แผนก:</span>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {inspectPerson.position} ({inspectPerson.department})
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">ประเภทบุคลากร (HOSOffice):</span>
                    <div className="font-semibold text-violet-800 mt-0.5">
                      {inspectPerson.personnelType}
                    </div>
                  </div>
                </div>

                {/* Selected Date Shift Summary Box */}
                <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4 text-violet-600" />
                      <span>
                        กะเวลาปฏิบัติงานในวันที่เลือก ({selectedWorkDate}) — รวม{' '}
                        {selectedDayItems.length} กะ
                      </span>
                    </div>

                    {canManageShifts && (
                      <div className="flex items-center gap-2">
                        {selectedDayRawAssigns.length > 0 &&
                          !isPastWorkDate(selectedWorkDate) && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectPerson(null);
                                setCancelTargetAssignments(selectedDayRawAssigns);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>ยกเลิกทุกกะของวันนี้</span>
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => {
                            const pid = inspectPerson.personId;
                            setInspectPerson(null);
                            openAssignModalFor([pid]);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-2xs cursor-pointer"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>+ กำหนดกะเพิ่ม (Multi-Select)</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedDayItems.length === 0 && noShiftStatus ? (
                    <div
                      className={`bg-white border border-dashed rounded-xl p-4 flex items-start gap-3 ${
                        noShiftStatus.status === 'SHIFT_CANCELLED'
                          ? 'border-rose-300'
                          : noShiftStatus.status === 'SCHEDULED_DAY_OFF'
                          ? 'border-emerald-300'
                          : 'border-slate-300'
                      }`}
                    >
                      <CalendarOff
                        className={`w-5 h-5 shrink-0 mt-0.5 ${
                          noShiftStatus.status === 'SHIFT_CANCELLED'
                            ? 'text-rose-500'
                            : noShiftStatus.status === 'SCHEDULED_DAY_OFF'
                            ? 'text-emerald-600'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            สถานะ: {noShiftStatus.label} ({selectedWorkDate})
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              noShiftStatus.status === 'SHIFT_CANCELLED'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : noShiftStatus.status === 'SCHEDULED_DAY_OFF'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {noShiftStatus.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {noShiftStatus.detail}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          • วันที่ไม่มีตารางกะจะไม่ถูกนับเป็นขาดงาน (NO_SCAN) ในรายงานหรือแดชบอร์ด
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayItems.map((item) => {
                        const isHighlighted = highlightedShiftIds.includes(
                          item.assignment.id
                        );
                        const isPast = isPastWorkDate(item.assignment.workDate);

                        return (
                          <div
                            key={item.key}
                            className={`bg-white border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 ${
                              isHighlighted
                                ? 'border-violet-500 ring-2 ring-violet-200'
                                : 'border-[#E9E5F2]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-9 h-9 rounded-xl border inline-flex items-center justify-center ${getShiftIconButtonClasses(
                                  item.category
                                )}`}
                              >
                                <ShiftCategoryIcon
                                  category={item.category}
                                  className="w-4 h-4"
                                />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900">
                                    {item.fullName}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 text-[10px] font-bold">
                                    {item.categoryLabel}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono-data text-slate-600 mt-0.5">
                                  เวลาเริ่ม <strong>{item.startTime}</strong> – สิ้นสุด{' '}
                                  <strong>{item.endTime} น.</strong> · วันที่สิ้นสุด:{' '}
                                  <strong
                                    className={
                                      item.crossMidnight
                                        ? 'text-indigo-700'
                                        : 'text-slate-800'
                                    }
                                  >
                                    {item.endDateStr}
                                    {item.crossMidnight ? ' (+1 วัน ข้ามเที่ยงคืน)' : ''}
                                  </strong>{' '}
                                  · Grace Period <strong>{item.graceMinutes} นาที</strong>
                                </div>
                              </div>
                            </div>

                            {canManageShifts &&
                              (isPast ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-semibold">
                                  <Lock className="w-3 h-3" />
                                  <span>วันที่ผ่านมาแล้ว (ห้ามยกเลิกย้อนหลัง)</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectPerson(null);
                                    setCancelTargetAssignments([item.assignment]);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>ยกเลิกกะนี้</span>
                                </button>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* All Assigned Shifts Across Dates */}
                <div className="space-y-2">
                  <div className="font-bold text-slate-900">
                    ตารางกะทั้งหมดที่ผูกไว้ของบุคลากรท่านนี้ ({personAssigns.length} รายการ):
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-[#E9E5F2] rounded-xl divide-y divide-[#E9E5F2]">
                    {personAssigns.length === 0 ? (
                      <div className="p-4 text-center text-slate-400">
                        ยังไม่มีตารางกะที่ผูกไว้
                      </div>
                    ) : (
                      personAssigns.map((a) => {
                        const sh = shiftsMap.get(a.shiftId);
                        const isPast = isPastWorkDate(a.workDate);
                        const { category } = resolveShiftCategory(sh, a.shiftCategory);
                        const startT = a.shiftStartTime || sh?.startTime || '08:00';
                        const endT = a.shiftEndTime || sh?.endTime || '16:00';
                        const isCross = a.crossMidnight ?? sh?.crossMidnight ?? false;
                        return (
                          <div
                            key={a.id}
                            className="p-2.5 flex items-center justify-between hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono-data font-bold text-violet-800">
                                {a.workDate}
                              </span>
                              <ShiftCategoryIcon category={category} className="w-3.5 h-3.5" />
                              <span className="font-semibold text-slate-900">
                                {a.shiftName || sh?.name || a.shiftId}
                              </span>
                              <span className="font-mono-data text-[11px] text-slate-500">
                                ({startT}–{endT}
                                {isCross ? ' +1 วัน' : ''})
                              </span>
                            </div>
                            {canManageShifts &&
                              (isPast ? (
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  Read-Only (ย้อนหลัง)
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInspectPerson(null);
                                    setCancelTargetAssignments([a]);
                                  }}
                                  className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold cursor-pointer"
                                >
                                  ยกเลิกกะ
                                </button>
                              ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </SharedModal>

      {/* =================================================================
          MODAL 2: ASSIGN SHIFT MODAL — CHECKBOX MULTI-SELECT (§4.1–§4.7)
         ================================================================= */}
      <SharedModal
        open={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="กำหนดตารางเวลาปฏิบัติงาน (Shift Assignment — Checkbox Multi-Select)"
        subtitle={`เลือกได้หลายกะและหลายวันพร้อมกันสำหรับบุคลากร ${assignTargetIds.length} ท่าน (ห้ามแก้ไขกะย้อนหลังก่อนวันที่ ${CURRENT_SYSTEM_DATE})`}
        badgeText="Multi-Select Shift Assignment"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleConfirmAssignShift} className="space-y-4 text-xs">
          {/* 1. Selected Personnel Summary */}
          <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-slate-500">บุคลากรที่เลือก:</span>{' '}
              <strong className="text-violet-800">{assignTargetIds.length} ท่าน</strong>
              <span className="text-slate-600 ml-2">
                (
                {assignTargetIds
                  .slice(0, 3)
                  .map((id) => {
                    const p = personnelList.find((x) => x.personId === id);
                    return p ? `${p.prefix}${p.firstName}` : id;
                  })
                  .join(', ')}
                {assignTargetIds.length > 3
                  ? ` และอีก ${assignTargetIds.length - 3} ท่าน`
                  : ''}
                )
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 font-mono-data font-bold text-[11px]">
              เลือกแล้ว {selectedShiftIds.length} กะ · {effectiveTargetDates.length} วัน
            </span>
          </div>

          {/* 2. Checkbox Multi-Select Shift List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800">
                1. เลือกกะเวลาปฏิบัติงาน (Checkbox Multi-Select — เลือกได้มากกว่า 1 กะ):
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedShiftIds(
                      ['SH01', 'SH02'].filter((id) => shiftsMap.get(id)?.active)
                    )
                  }
                  className="text-violet-700 hover:underline font-semibold cursor-pointer"
                >
                  เลือก กะเช้า + กะบ่าย (2 กะแยก)
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedShiftIds([])}
                  className="text-slate-500 hover:underline cursor-pointer"
                >
                  ล้างที่เลือก
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
              {shifts.map((sh) => {
                const isChecked = selectedShiftIds.includes(sh.id);
                const { category } = resolveShiftCategory(sh);
                const isRecommended = recommendedShiftIdsForTargets.has(sh.id);
                const isDisabled = !sh.active;

                return (
                  <label
                    key={sh.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all select-none ${
                      isDisabled
                        ? 'bg-slate-50 border-slate-200 opacity-55 cursor-not-allowed'
                        : isChecked
                        ? 'bg-violet-50/90 border-violet-400 ring-1 ring-violet-300 shadow-2xs cursor-pointer'
                        : 'bg-white border-[#E9E5F2] hover:border-violet-200 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isDisabled}
                      checked={isChecked}
                      onChange={() => handleToggleShiftCheckbox(sh.id)}
                      className="mt-0.5 rounded text-violet-600 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                          <ShiftCategoryIcon category={category} className="w-3.5 h-3.5" />
                          <span className="truncate">{sh.name}</span>
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            sh.active
                              ? isRecommended
                                ? 'bg-violet-100 text-violet-800 border border-violet-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {sh.active ? (isRecommended ? 'ตรงประเภท' : 'เปิดใช้') : 'ยกเลิกใช้งาน'}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-data text-slate-600">
                        <strong className="text-violet-800">
                          {sh.startTime}–{sh.endTime} น.
                        </strong>
                        <span>· Grace {sh.graceMinutes} นาที</span>
                        {sh.crossMidnight && (
                          <span className="text-indigo-700 font-sans font-semibold">
                            · ข้ามวัน (+1 วัน)
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Live Selection Summary & Overlap Check */}
          <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-3 space-y-1.5">
            <div className="font-bold text-violet-950 flex items-center justify-between">
              <span>
                สรุปกะที่เลือก ({liveSelectionValidation.selectedShiftObjects.length} กะ):
              </span>
              {liveSelectionValidation.selfOverlaps.length === 0 ? (
                <span className="text-emerald-700 text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ช่วงเวลาไม่ซ้อนทับกันเอง
                </span>
              ) : (
                <span className="text-rose-700 text-[11px] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  พบกะที่เวลาซ้อนทับกัน
                </span>
              )}
            </div>

            {liveSelectionValidation.selectedShiftObjects.length === 0 ? (
              <div className="text-slate-500">กรุณาเลือกอย่างน้อย 1 กะเวลาที่เปิดใช้งาน</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {liveSelectionValidation.selectedShiftObjects.map((sh) => {
                  const { category } = resolveShiftCategory(sh);
                  return (
                    <span
                      key={sh.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${getShiftIconButtonClasses(
                        category
                      )}`}
                    >
                      <ShiftCategoryIcon category={category} className="w-3.5 h-3.5" />
                      <span>{sh.name}</span>
                      <span className="font-mono-data text-[10px]">
                        ({sh.startTime}–{sh.endTime})
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Multi-Date Selector: Date Range vs Monthly Shift Calendar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800">
                2. เลือกวันที่ปฏิบัติงาน (เฉพาะวันนี้ {CURRENT_SYSTEM_DATE} หรือวันล่วงหน้า):
              </label>
              <div className="inline-flex items-center gap-1 p-0.5 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setDateSelectionMode('RANGE')}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                    dateSelectionMode === 'RANGE'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  ช่วงวันที่ (From–To)
                </button>
                <button
                  type="button"
                  onClick={() => setDateSelectionMode('CALENDAR')}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer ${
                    dateSelectionMode === 'CALENDAR'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  ปฏิทินเลือกหลายวัน (Monthly Calendar)
                </button>
              </div>
            </div>

            {dateSelectionMode === 'RANGE' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    ตั้งแต่วันที่ (ไม่ต่ำกว่า {CURRENT_SYSTEM_DATE}):
                  </label>
                  <input
                    type="date"
                    min={CURRENT_SYSTEM_DATE}
                    value={assignFromDate}
                    onChange={(e) => setAssignFromDate(e.target.value)}
                    className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 font-mono-data font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">ถึงวันที่:</label>
                  <input
                    type="date"
                    min={assignFromDate || CURRENT_SYSTEM_DATE}
                    value={assignToDate}
                    onChange={(e) => setAssignToDate(e.target.value)}
                    className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 font-mono-data font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">รูปแบบตารางกะ:</label>
                  <select
                    value={assignType}
                    onChange={(e) => setAssignType(e.target.value as 'DAILY' | 'RECURRING')}
                    className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 font-bold text-slate-800"
                  >
                    <option value="DAILY">รายวัน (DAILY)</option>
                    <option value="RECURRING">ต่อเนื่อง (RECURRING)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">
                    ปฏิทินเดือนพฤศจิกายน 2026 (คลิกเลือกได้หลายวัน · วันที่ก่อน {CURRENT_SYSTEM_DATE} ถูกล็อก Read-Only):
                  </span>
                  <span className="text-violet-700 font-bold">
                    เลือกแล้ว {calendarPickedDates.length} วัน
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {novemberCalendarDays.map((dStr) => {
                    const past = isPastWorkDate(dStr);
                    const picked = calendarPickedDates.includes(dStr);
                    const dayNum = dStr.slice(8, 10);
                    return (
                      <button
                        key={dStr}
                        type="button"
                        disabled={past}
                        onClick={() => handleToggleCalendarDate(dStr)}
                        title={
                          past
                            ? `${dStr} (วันที่ผ่านมาแล้ว — ห้ามแก้ไขกะย้อนหลัง)`
                            : `คลิกเพื่อเลือก/ยกเลิกวันที่ ${dStr}`
                        }
                        className={`py-1.5 px-1 rounded-lg font-mono-data text-xs font-bold border transition-all ${
                          past
                            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                            : picked
                            ? 'bg-violet-600 text-white border-violet-600 shadow-2xs cursor-pointer'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300 cursor-pointer'
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Replace existing option */}
          <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceExistingOnDay}
              onChange={(e) => setReplaceExistingOnDay(e.target.checked)}
              className="rounded text-violet-600 cursor-pointer"
            />
            <span>แทนที่กะเดิมในวันเดียวกัน (เฉพาะวันที่ยังไม่ผ่านไป)</span>
          </label>

          {/* Validation / Overlap Warnings */}
          {(liveSelectionValidation.selfOverlaps.length > 0 ||
            liveSelectionValidation.pastDateErrors.length > 0 ||
            liveSelectionValidation.existingConflicts.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 text-amber-950">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  ตรวจสอบพบรายการซ้อนทับหรือข้อจำกัด (ระบบจะข้ามรายการที่ซ้อนทับโดยอัตโนมัติ):
                </span>
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-4 text-amber-800">
                {[
                  ...liveSelectionValidation.selfOverlaps,
                  ...liveSelectionValidation.pastDateErrors,
                  ...liveSelectionValidation.existingConflicts,
                ]
                  .slice(0, 5)
                  .map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E5F2]">
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={
                selectedShiftIds.length === 0 ||
                effectiveTargetDates.length === 0 ||
                liveSelectionValidation.selfOverlaps.length > 0
              }
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] disabled:opacity-50 text-white font-bold shadow-xs cursor-pointer"
            >
              บันทึกตารางกะ ({selectedShiftIds.length} กะ)
            </button>
          </div>
        </form>
      </SharedModal>

      {/* =================================================================
          MODAL 3: COPY SHIFTS ACROSS MONTHS
         ================================================================= */}
      <SharedModal
        open={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        title="คัดลอกตารางกะข้ามเดือน (Copy Shift Schedule Across Months)"
        subtitle="รองรับการคัดลอกตามวันที่ (BY_DATE) หรือตามวันในสัปดาห์ (BY_WEEKDAY) โดยไม่กระทบวันที่ผ่านมาแล้ว"
        badgeText="Cross-Month Copy"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleConfirmCopyMonth} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">เดือนต้นทาง (Source):</label>
              <select
                value={copySourceMonth}
                onChange={(e) => setCopySourceMonth(e.target.value)}
                className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 font-bold text-slate-900"
              >
                <option value="2026-11">พฤศจิกายน 2026 (2026-11)</option>
                <option value="2026-10">ตุลาคม 2026 (2026-10)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">เดือนปลายทาง (Target):</label>
              <select
                value={copyTargetMonth}
                onChange={(e) => setCopyTargetMonth(e.target.value)}
                className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 font-bold text-violet-900"
              >
                <option value="2026-12">ธันวาคม 2026 (2026-12)</option>
                <option value="2027-01">มกราคม 2027 (2027-01)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block font-bold text-slate-700">รูปแบบการคัดลอก:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border cursor-pointer ${
                  copyMode === 'BY_DATE'
                    ? 'bg-violet-50 border-violet-400 text-violet-950 font-bold'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="copyMode"
                  checked={copyMode === 'BY_DATE'}
                  onChange={() => setCopyMode('BY_DATE')}
                  className="mr-2"
                />
                <span>คัดลอกตามวันที่ (เช่น วันที่ 6 → วันที่ 6)</span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer ${
                  copyMode === 'BY_WEEKDAY'
                    ? 'bg-violet-50 border-violet-400 text-violet-950 font-bold'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="copyMode"
                  checked={copyMode === 'BY_WEEKDAY'}
                  onChange={() => setCopyMode('BY_WEEKDAY')}
                  className="mr-2"
                />
                <span>คัดลอกตามวันในสัปดาห์ (จันทร์–ศุกร์)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCopyModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white font-bold cursor-pointer"
            >
              ยืนยันคัดลอกตารางกะ
            </button>
          </div>
        </form>
      </SharedModal>

      {/* =================================================================
          MODAL 4: CONFIRM CANCEL SHIFT ASSIGNMENT POPUP
         ================================================================= */}
      <SharedModal
        open={cancelTargetAssignments.length > 0}
        onClose={() => setCancelTargetAssignments([])}
        title={`ยืนยันการยกเลิกตารางกะ (${cancelTargetAssignments.length} รายการ)`}
        subtitle="การยกเลิกกะจะบันทึกประวัติการยกเลิกกะไว้ตรวจสอบ และไม่ลบข้อมูลสแกนดิบ (Raw Scans)"
        badgeText="Cancel Shift Confirmation"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmCancelAssignments} className="space-y-4 text-xs">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>รายการกะที่จะถูกยกเลิก:</span>
            </div>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-4">
              {cancelTargetAssignments.map((a) => {
                const p = personnelList.find((x) => x.personId === a.personId);
                const sh = shiftsMap.get(a.shiftId);
                return (
                  <li key={a.id}>
                    {p ? `${p.prefix}${p.firstName} ${p.lastName}` : a.personId} — วันที่{' '}
                    <strong>{a.workDate}</strong> ({a.shiftName || sh?.name || a.shiftId})
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ระบุเหตุผลการยกเลิกกะ (บันทึกในประวัติการยกเลิกกะ):
            </label>
            <input
              type="text"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="เช่น ปรับเปลี่ยนเวร / แลกเวร / ยกเลิกกะล่วงหน้า..."
              className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-slate-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCancelTargetAssignments([])}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
            >
              ยืนยันยกเลิกกะ
            </button>
          </div>
        </form>
      </SharedModal>

      {/* =================================================================
          MODAL 5: CANCELLATION LOG HISTORY MODAL
         ================================================================= */}
      <SharedModal
        open={isCancelLogModalOpen}
        onClose={() => setIsCancelLogModalOpen(false)}
        title={`ประวัติการยกเลิกตารางกะ (Shift Cancellation Logs — ${cancellationLogs.length} รายการ)`}
        subtitle="บันทึกประวัติการยกเลิกตารางเวรของบุคลากรเพื่อการตรวจสอบย้อนหลัง"
        badgeText="Audit & Cancellation History"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          {cancellationLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400">ยังไม่มีประวัติการยกเลิกกะ</div>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-[#E9E5F2] rounded-xl divide-y divide-[#E9E5F2]">
              {cancellationLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">
                      {log.personName} ({log.personId}) — วันที่เวร{' '}
                      <span className="font-mono-data text-violet-800">{log.workDate}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      กะที่ยกเลิก: <strong>{log.shiftName}</strong> · เหตุผล:{' '}
                      <span className="text-rose-700 font-semibold">{log.reason}</span>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 shrink-0">
                    <div className="font-mono-data">{log.cancelledAt}</div>
                    <div>โดย {log.cancelledBy}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SharedModal>
    </div>
  );
};
