import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { HRPersonSummary } from '../types/attendance';
import { StatusBadge } from '../components/common/StatusBadge';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import {
  Calendar,
  TrendingUp,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Award,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Zap,
  Database,
  Download,
  Printer,
  ArrowUpDown,
  Trophy,
  ShieldAlert,
  X,
  Info,
} from 'lucide-react';

type ReportPeriodMode = 'DAILY' | 'MONTHLY' | 'YEARLY' | 'RANGE';
type ShiftCategory = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';

export const HRAttendanceManagementView: React.FC = () => {
  const { currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Period Mode & Date Pickers
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('MONTHLY');
  const [selectedDailyDate, setSelectedDailyDate] = useState('2026-11-06');
  const [selectedMonth, setSelectedMonth] = useState('2026-11');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [rangeFrom, setRangeFrom] = useState('2026-11-01');
  const [rangeTo, setRangeTo] = useState('2026-11-06');

  // Shift filter tabs
  const [shiftCategory, setShiftCategory] = useState<ShiftCategory>('ALL');

  // Top-level Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedPersonnelType, setSelectedPersonnelType] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // View Tab: Individual Summary Table vs Lateness Rankings (Merged from Reports & Rankings)
  const [activeSubView, setActiveSubView] = useState<'SUMMARY_TABLE' | 'LATE_RANKINGS'>('SUMMARY_TABLE');
  const [rankingOrder, setRankingOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Column Header Inline Filters (Matching Reference Image 1)
  const [showHeaderFilters, setShowHeaderFilters] = useState(true);
  const [colFilterFingle, setColFilterFingle] = useState('');
  const [colFilterCid, setColFilterCid] = useState('');
  const [colFilterName, setColFilterName] = useState('');
  const [colFilterDept, setColFilterDept] = useState('');
  const [colMinWorkDays, setColMinWorkDays] = useState('');
  const [colMinNormal, setColMinNormal] = useState('');
  const [colMinLateCount, setColMinLateCount] = useState('');
  const [colMinLateMins, setColMinLateMins] = useState('');
  const [colMinEarlyOut, setColMinEarlyOut] = useState('');
  const [colMinOtHours, setColMinOtHours] = useState('');
  const [colMinOnTimeRate, setColMinOnTimeRate] = useState('');

  // Sorting & Pagination
  const [sortKey, setSortKey] = useState<string>('fingleId');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Detail Popup Modal State
  const [selectedPersonModal, setSelectedPersonModal] = useState<HRPersonSummary | null>(null);
  const [kpiModalType, setKpiModalType] = useState<
    null | 'ALL_STAFF' | 'WORKING_DAYS' | 'LATE_SUMMARY' | 'OT_SUMMARY'
  >(null);

  // Compute effective fromDate and toDate
  const { effectiveFrom, effectiveTo, periodLabel } = useMemo(() => {
    if (periodMode === 'DAILY') {
      return {
        effectiveFrom: selectedDailyDate,
        effectiveTo: selectedDailyDate,
        periodLabel: `ประจำวันที่ ${selectedDailyDate}`,
      };
    }
    if (periodMode === 'MONTHLY') {
      return {
        effectiveFrom: `${selectedMonth}-01`,
        effectiveTo: `${selectedMonth}-31`,
        periodLabel: `ประจำเดือน ${selectedMonth}`,
      };
    }
    if (periodMode === 'YEARLY') {
      return {
        effectiveFrom: `${selectedYear}-01-01`,
        effectiveTo: `${selectedYear}-12-31`,
        periodLabel: `ประจำปี ${selectedYear}`,
      };
    }
    return {
      effectiveFrom: rangeFrom,
      effectiveTo: rangeTo,
      periodLabel: `ช่วงวันที่ ${rangeFrom} ถึง ${rangeTo}`,
    };
  }, [periodMode, selectedDailyDate, selectedMonth, selectedYear, rangeFrom, rangeTo]);

  // Personnel metadata for dropdowns
  const allPersonnel = useMemo(() => mockAttendanceService.getPersonnel(), [refreshKey]);
  const groupOptions = useMemo(
    () => Array.from(new Set(allPersonnel.map((p) => p.groupName))),
    [allPersonnel]
  );
  const personnelTypeOptions = useMemo(
    () => Array.from(new Set(allPersonnel.map((p) => p.personnelType))),
    [allPersonnel]
  );

  // Base summaries from service
  const baseSummaries = useMemo(() => {
    return mockAttendanceService.getHRSummaries({
      fromDate: effectiveFrom,
      toDate: effectiveTo,
      groupName: selectedGroup,
      personnelType: selectedPersonnelType,
      statusFilter: selectedStatusFilter,
      shiftCategory,
      searchQuery,
    });
  }, [
    effectiveFrom,
    effectiveTo,
    selectedGroup,
    selectedPersonnelType,
    selectedStatusFilter,
    shiftCategory,
    searchQuery,
    refreshKey,
  ]);

  // Shift category counts for pill tabs
  const shiftCounts = useMemo(() => {
    const allRecs = mockAttendanceService.getAttendance({
      fromDate: effectiveFrom,
      toDate: effectiveTo,
      groupName: selectedGroup,
      personnelType: selectedPersonnelType,
    });
    const morning = allRecs.filter(
      (r) =>
        r.shiftId === 'SH01' ||
        r.shiftId === 'SH04' ||
        r.shiftStartTime.startsWith('07:') ||
        r.shiftStartTime.startsWith('08:')
    ).length;
    const afternoon = allRecs.filter(
      (r) => r.shiftId === 'SH02' || r.shiftStartTime.startsWith('16:')
    ).length;
    const night = allRecs.filter(
      (r) =>
        r.shiftId === 'SH03' ||
        r.shiftStartTime.startsWith('00:') ||
        r.shiftStartTime.startsWith('24:')
    ).length;
    return {
      all: allRecs.length,
      morning,
      afternoon,
      night,
    };
  }, [effectiveFrom, effectiveTo, selectedGroup, selectedPersonnelType, refreshKey]);

  // Apply inline column header filters + sorting
  const filteredAndSortedSummaries = useMemo(() => {
    let list = baseSummaries.filter((item) => {
      if (colFilterFingle && !String(item.fingleId).includes(colFilterFingle.trim())) {
        return false;
      }
      if (colFilterCid && !item.cidMasked.toLowerCase().includes(colFilterCid.toLowerCase().trim())) {
        return false;
      }
      if (
        colFilterName &&
        !item.fullName.toLowerCase().includes(colFilterName.toLowerCase().trim()) &&
        !item.personId.toLowerCase().includes(colFilterName.toLowerCase().trim())
      ) {
        return false;
      }
      if (
        colFilterDept &&
        !item.department.toLowerCase().includes(colFilterDept.toLowerCase().trim()) &&
        !item.position.toLowerCase().includes(colFilterDept.toLowerCase().trim()) &&
        !item.groupName.toLowerCase().includes(colFilterDept.toLowerCase().trim())
      ) {
        return false;
      }
      if (colMinWorkDays !== '' && item.workingDaysCount < Number(colMinWorkDays)) return false;
      if (colMinNormal !== '' && item.normalCount < Number(colMinNormal)) return false;
      if (colMinLateCount !== '' && item.lateCount < Number(colMinLateCount)) return false;
      if (colMinLateMins !== '' && item.totalLateMinutes < Number(colMinLateMins)) return false;
      if (colMinEarlyOut !== '' && item.earlyCheckoutCount < Number(colMinEarlyOut)) return false;
      if (colMinOtHours !== '' && item.totalOtHours < Number(colMinOtHours)) return false;
      if (colMinOnTimeRate !== '' && item.onTimeRatePercent < Number(colMinOnTimeRate)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === 'ASC' ? 1 : -1;
      switch (sortKey) {
        case 'fingleId':
          return (a.fingleId - b.fingleId) * dir;
        case 'cidMasked':
          return a.cidMasked.localeCompare(b.cidMasked) * dir;
        case 'fullName':
          return a.fullName.localeCompare(b.fullName) * dir;
        case 'department':
          return a.department.localeCompare(b.department) * dir;
        case 'workingDaysCount':
          return (a.workingDaysCount - b.workingDaysCount) * dir;
        case 'normalCount':
          return (a.normalCount - b.normalCount) * dir;
        case 'lateCount':
          return (a.lateCount - b.lateCount || a.totalLateMinutes - b.totalLateMinutes) * dir;
        case 'totalLateMinutes':
          return (a.totalLateMinutes - b.totalLateMinutes) * dir;
        case 'earlyCheckoutCount':
          return (a.earlyCheckoutCount - b.earlyCheckoutCount) * dir;
        case 'totalOtHours':
          return (a.totalOtHours - b.totalOtHours) * dir;
        case 'onTimeRatePercent':
          return (a.onTimeRatePercent - b.onTimeRatePercent) * dir;
        case 'noScanCount':
          return (a.noScanCount - b.noScanCount) * dir;
        default:
          return 0;
      }
    });

    return list;
  }, [
    baseSummaries,
    colFilterFingle,
    colFilterCid,
    colFilterName,
    colFilterDept,
    colMinWorkDays,
    colMinNormal,
    colMinLateCount,
    colMinLateMins,
    colMinEarlyOut,
    colMinOtHours,
    colMinOnTimeRate,
    sortKey,
    sortDir,
  ]);

  // Aggregate KPI totals from filtered summaries
  const kpiTotals = useMemo(() => {
    const staffCount = filteredAndSortedSummaries.length;
    const totalWorkingDays = filteredAndSortedSummaries.reduce(
      (s, i) => s + i.workingDaysCount,
      0
    );
    const totalLateOccurrences = filteredAndSortedSummaries.reduce((s, i) => s + i.lateCount, 0);
    const distinctLatePeople = filteredAndSortedSummaries.filter((i) => i.lateCount > 0).length;
    const totalLateMinutes = filteredAndSortedSummaries.reduce(
      (s, i) => s + i.totalLateMinutes,
      0
    );
    const totalOtHours = filteredAndSortedSummaries.reduce((s, i) => s + i.totalOtHours, 0);
    return {
      staffCount,
      totalWorkingDays,
      totalLateOccurrences,
      distinctLatePeople,
      totalLateMinutes,
      totalOtHours,
    };
  }, [filteredAndSortedSummaries]);

  // Pagination slice
  const pagedSummaries = useMemo(() => {
    if (pageSize === 'ALL') return filteredAndSortedSummaries;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedSummaries.slice(start, start + pageSize);
  }, [filteredAndSortedSummaries, currentPage, pageSize]);

  // Handle Sort click
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDir('ASC');
    }
    setCurrentPage(1);
  };

  // Quick Actions
  const handleSyncScanners = () => {
    const res = mockAttendanceService.triggerMockScannerSync();
    setRefreshKey((k) => k + 1);
    setToastMessage(
      `ดึงข้อมูลจากเครื่องสแกนจำลองสำเร็จ: อ่าน ${res.totalRead} รายการ (ใหม่ +${res.newScans}, ข้ามซ้ำ ${res.duplicateScans})`
    );
  };

  const handleSyncHosOffice = () => {
    const res = mockAttendanceService.syncPersonnelFromHosOffice();
    setRefreshKey((k) => k + 1);
    setToastMessage(`อัปเดตรายชื่อบุคลากรจาก HOSOffice จำลองสำเร็จ: ตรวจสอบ ${res.updatedCount} ท่าน`);
  };

  const handleReprocess = () => {
    const res = mockAttendanceService.reprocessAttendance(effectiveFrom, effectiveTo);
    setRefreshKey((k) => k + 1);
    setToastMessage(
      `ประมวลผลเวลาใหม่ (Reprocess) ช่วง ${effectiveFrom} ถึง ${effectiveTo} สำเร็จ: ตรวจสอบ ${res.reprocessedCount} รายการ`
    );
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'FINGLE_ID',
      'PERSON_ID',
      'HR_CID',
      'ชื่อ-นามสกุล',
      'ตำแหน่ง',
      'ฝ่าย/งาน',
      'กลุ่มงาน',
      'ประเภทบุคลากร',
      'วันทำงานจริง(วัน)',
      'ตรงเวลา(ครั้ง)',
      'มาสาย(ครั้ง)',
      'รวมเวลาสาย(นาที)',
      'ออกก่อน(ครั้ง)',
      'รวมOT(ชม.)',
      'อัตราตรงเวลา(%)',
      'ไม่พบสแกน(ครั้ง)',
    ];
    const rows = filteredAndSortedSummaries.map((s) => [
      s.fingleId,
      s.personId,
      s.cidMasked,
      `"${s.fullName}"`,
      `"${s.position}"`,
      `"${s.department}"`,
      `"${s.groupName}"`,
      `"${s.personnelType}"`,
      s.workingDaysCount,
      s.normalCount,
      s.lateCount,
      s.totalLateMinutes,
      s.earlyCheckoutCount,
      s.totalOtHours.toFixed(1),
      `${s.onTimeRatePercent}%`,
      s.noScanCount,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Sam_Att_HR_Report_${effectiveFrom}_${effectiveTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearColumnFilters = () => {
    setColFilterFingle('');
    setColFilterCid('');
    setColFilterName('');
    setColFilterDept('');
    setColMinWorkDays('');
    setColMinNormal('');
    setColMinLateCount('');
    setColMinLateMins('');
    setColMinEarlyOut('');
    setColMinOtHours('');
    setColMinOnTimeRate('');
  };

  // Guard: GENERAL_USER cannot access this page
  if (currentUser?.role === 'GENERAL_USER') {
    return (
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-8 text-center max-w-lg mx-auto my-8">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">จำกัดสิทธิ์เฉพาะเจ้าหน้าที่ HR และผู้ดูแลระบบ</h2>
        <p className="text-xs text-slate-500 mt-1">
          ผู้ใช้งานทั่วไป (GENERAL_USER) สามารถดูข้อมูลการลงเวลาเฉพาะของตนเองได้ในเมนู "เวลาปฏิบัติงานของฉัน" เท่านั้น
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* =================================================================
          1. TOP HEADER & ACTION BAR (Matches Reference Image 1)
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          {/* Title & Subtitle */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-violet-50 border border-violet-200/80 text-violet-800 text-xs font-bold">
              <Users className="w-3.5 h-3.5 text-violet-600" />
              <span>กลุ่มงานทรัพยากรบุคคล (HR) & กลุ่มงานการเงิน โรงพยาบาลสามชุก</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                รายงานสรุปการมาปฏิบัติงานบุคลากร (HR Attendance Report)
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F8F7FC] text-violet-800 border border-[#E9E5F2]">
                {periodMode === 'DAILY' && 'รายวัน'}
                {periodMode === 'MONTHLY' && 'รายเดือน'}
                {periodMode === 'YEARLY' && 'รายปี'}
                {periodMode === 'RANGE' && 'กำหนดช่วงเวลา'}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              สรุปข้อมูลวันทำงาน, สถิติตรงเวลา/มาสาย, นาทีสายรวม, อันดับการมาสาย และชั่วโมง OT ({periodLabel})
            </p>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleSyncScanners}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>ดึงข้อมูลจากเครื่องสแกน</span>
            </button>

            <button
              type="button"
              onClick={handleSyncHosOffice}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-violet-300" />
              <span>ดึงจาก HosOffice</span>
            </button>

            <button
              type="button"
              onClick={handleReprocess}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ประมวลผลใหม่</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-violet-600" />
              <span>ส่งออก CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-[#E9E5F2] rounded-xl transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>พิมพ์</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {toastMessage && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 text-xs text-violet-950 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 text-violet-700 hover:text-violet-950 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================
          2. PERIOD TABS (1. รายวัน, 2. รายเดือน, 3. รายปี, 4. กำหนดช่วงเวลา)
         ================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-[#E9E5F2] rounded-2xl shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setPeriodMode('DAILY');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              periodMode === 'DAILY'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800 hover:bg-violet-50/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>1. รายวัน (Daily)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPeriodMode('MONTHLY');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              periodMode === 'MONTHLY'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800 hover:bg-violet-50/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>2. รายเดือน (Monthly)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPeriodMode('YEARLY');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              periodMode === 'YEARLY'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800 hover:bg-violet-50/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>3. รายปี (Yearly)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPeriodMode('RANGE');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              periodMode === 'RANGE'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-violet-800 hover:bg-violet-50/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>4. กำหนดช่วงเวลา (Range)</span>
          </button>
        </div>

        {/* Dynamic Period Picker */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-[#E9E5F2] rounded-2xl px-4 py-2 text-xs shadow-2xs">
          <Calendar className="w-4 h-4 text-violet-600 shrink-0" />
          {periodMode === 'DAILY' && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">ประจำวันที่:</span>
              <input
                type="date"
                value={selectedDailyDate}
                onChange={(e) => setSelectedDailyDate(e.target.value)}
                className="font-mono-data font-bold text-slate-900 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg px-2.5 py-1"
              />
            </div>
          )}

          {periodMode === 'MONTHLY' && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">ประจำเดือน:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="font-mono-data font-bold text-slate-900 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg px-2.5 py-1 cursor-pointer"
              >
                <option value="2026-11">November 2026 (พ.ย. 2569)</option>
                <option value="2026-10">October 2026 (ต.ค. 2569)</option>
                <option value="2026-09">September 2026 (ก.ย. 2569)</option>
              </select>
            </div>
          )}

          {periodMode === 'YEARLY' && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">ประจำปี พ.ศ./ค.ศ.:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="font-mono-data font-bold text-slate-900 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg px-2.5 py-1 cursor-pointer"
              >
                <option value="2026">2026 (พ.ศ. 2569)</option>
                <option value="2025">2025 (พ.ศ. 2568)</option>
              </select>
            </div>
          )}

          {periodMode === 'RANGE' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-600">ตั้งแต่:</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="font-mono-data font-bold text-slate-900 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg px-2 py-1"
              />
              <span className="font-semibold text-slate-600">ถึง:</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="font-mono-data font-bold text-slate-900 bg-[#F8F7FC] border border-[#E9E5F2] rounded-lg px-2 py-1"
              />
            </div>
          )}
        </div>
      </div>

      {/* =================================================================
          3. FOUR SUMMARY KPI CARDS (Matches Reference Image 1, Clickable)
         ================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: เจ้าหน้าที่ในรายงาน */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setKpiModalType('ALL_STAFF')}
          className={`bg-white rounded-2xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between shadow-2xs ${
            selectedStatusFilter === 'ALL'
              ? 'border-violet-500 ring-2 ring-violet-100'
              : 'border-[#E9E5F2] hover:border-violet-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">เจ้าหน้าที่ในรายงาน</span>
            <Users className="w-4 h-4 text-violet-600" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono-data text-slate-900">
              {kpiTotals.staffCount}
            </span>
            <span className="text-xs font-semibold text-slate-600">ท่าน</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-violet-700 font-semibold">
              คลิกเพื่อดูรายละเอียด ({kpiTotals.staffCount} ท่าน)
            </span>
            {selectedStatusFilter !== 'ALL' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStatusFilter('ALL');
                }}
                className="text-violet-600 underline font-semibold"
              >
                แสดงทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* Card 2: รวมวันปฏิบัติงานจริง */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setKpiModalType('WORKING_DAYS')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between shadow-2xs ${
            selectedStatusFilter === 'HAS_SCAN'
              ? 'border-emerald-500 ring-2 ring-emerald-100'
              : 'border-[#E9E5F2] hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">รวมวันปฏิบัติงานจริง</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono-data text-emerald-700">
              {kpiTotals.totalWorkingDays}
            </span>
            <span className="text-xs font-semibold text-emerald-700">วัน</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">คลิกดูรายละเอียด / กรองผู้มีสแกน</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStatusFilter((prev) => (prev === 'HAS_SCAN' ? 'ALL' : 'HAS_SCAN'));
              }}
              className="text-emerald-700 hover:underline font-semibold"
            >
              {selectedStatusFilter === 'HAS_SCAN' ? 'ล้างตัวกรอง' : 'กรองเฉพาะผู้มีสแกน'}
            </button>
          </div>
        </div>

        {/* Card 3: สถิติมาสายรวม */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setKpiModalType('LATE_SUMMARY')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between shadow-2xs ${
            selectedStatusFilter === 'LATE'
              ? 'border-amber-500 ring-2 ring-amber-100'
              : 'border-[#E9E5F2] hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">สถิติมาสายรวม</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono-data text-amber-600">
              {kpiTotals.totalLateOccurrences}
            </span>
            <span className="text-xs font-semibold text-amber-700">
              ครั้ง ({kpiTotals.distinctLatePeople} คน · รวม {kpiTotals.totalLateMinutes} น.)
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-700 font-semibold">คลิกดูอันดับสาย / รายการสาย</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStatusFilter((prev) => (prev === 'LATE' ? 'ALL' : 'LATE'));
              }}
              className="text-amber-800 hover:underline font-semibold"
            >
              {selectedStatusFilter === 'LATE' ? 'ล้างตัวกรอง' : 'กรองผู้มีประวัติสาย'}
            </button>
          </div>
        </div>

        {/* Card 4: รวมชั่วโมง OT ทั้งสิ้น */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setKpiModalType('OT_SUMMARY')}
          className="bg-white rounded-2xl p-4 border border-[#E9E5F2] hover:border-violet-400 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">รวมชั่วโมง OT ทั้งสิ้น</span>
            <Award className="w-4 h-4 text-violet-600" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono-data text-violet-700">
              {kpiTotals.totalOtHours.toFixed(1)}
            </span>
            <span className="text-xs font-semibold text-violet-700">ชม.</span>
          </div>
          <div className="text-[11px] text-violet-700 font-medium">
            คลิกดูนโยบายคำนวณ OT (ไม่เดาจากเวลาสแกน)
          </div>
        </div>
      </div>

      {/* =================================================================
          4. SHIFT FILTER BAR (ทุกกะ, กะเช้า, กะบ่าย, กะดึก)
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs no-print">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
            <Layers className="w-4 h-4 text-violet-600" />
            <span>ตัวกรองกะ:</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setShiftCategory('ALL');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              shiftCategory === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-[#F8F7FC] text-slate-700 border border-[#E9E5F2] hover:border-violet-300'
            }`}
          >
            <span>ทุกกะ (All Shifts)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-violet-500/20 text-violet-200 font-mono-data">
              {shiftCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShiftCategory('MORNING');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              shiftCategory === 'MORNING'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-[#E9E5F2] hover:border-violet-300'
            }`}
          >
            <span>กะเช้า (08:15)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono-data">
              {shiftCounts.morning}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShiftCategory('AFTERNOON');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              shiftCategory === 'AFTERNOON'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-[#E9E5F2] hover:border-violet-300'
            }`}
          >
            <span>กะบ่าย (16:00)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono-data">
              {shiftCounts.afternoon}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShiftCategory('NIGHT');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              shiftCategory === 'NIGHT'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-[#E9E5F2] hover:border-violet-300'
            }`}
          >
            <span>กะดึก (24:00)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-violet-100 text-violet-800 font-mono-data">
              {shiftCounts.night}
            </span>
          </button>
        </div>

        {/* Switch between Individual Summary Table and Lateness Rankings */}
        <div className="flex items-center gap-1.5 bg-[#F8F7FC] p-1 rounded-xl border border-[#E9E5F2]">
          <button
            type="button"
            onClick={() => setActiveSubView('SUMMARY_TABLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeSubView === 'SUMMARY_TABLE'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-violet-800'
            }`}
          >
            ตารางสรุปรายบุคคล
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('LATE_RANKINGS')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeSubView === 'LATE_RANKINGS'
                ? 'bg-violet-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-violet-800'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>อันดับการมาสาย (Rankings)</span>
          </button>
        </div>
      </div>

      {/* =================================================================
          5. SEARCH & DROPDOWN FILTERS BAR (Matches Reference Image 1)
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-3.5 shadow-2xs grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 no-print">
        {/* Search Input */}
        <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="ค้นหาชื่อ, FINGLE_ID, เลขบัตรประชาชน, ตำแหน่ง..."
            className="w-full bg-transparent text-slate-800 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600"
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
          className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value="ALL">ทุกกลุ่มงาน/ฝ่ายหลัก (HR_DEPARTMENT)</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {/* Personnel Type Filter */}
        <select
          value={selectedPersonnelType}
          onChange={(e) => {
            setSelectedPersonnelType(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value="ALL">ทุกประเภทบุคลากร (ข้าราชการ/ลูกจ้าง/พนักงาน)</option>
          {personnelTypeOptions.map((pt) => (
            <option key={pt} value={pt}>
              {pt}
            </option>
          ))}
        </select>

        {/* Attendance Status Filter */}
        <select
          value={selectedStatusFilter}
          onChange={(e) => {
            setSelectedStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value="ALL">สถานะทั้งหมด</option>
          <option value="HAS_SCAN">เฉพาะผู้มีวันปฏิบัติงานจริง (มีสแกน)</option>
          <option value="LATE">เฉพาะผู้มีประวัติมาสาย (Late &gt; 0)</option>
          <option value="NORMAL_ONLY">เฉพาะผู้ตรงเวลา 100% (ไม่สายเลย)</option>
          <option value="NO_SCAN">เฉพาะผู้มีรายการไม่พบสแกน (NO_SCAN)</option>
        </select>
      </div>

      {/* =================================================================
          6A. INDIVIDUAL SUMMARY TABLE (Matches Reference Image 1)
         ================================================================= */}
      {activeSubView === 'SUMMARY_TABLE' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          {/* Table Top Bar */}
          <div className="px-4 py-3 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                สรุปผลการปฏิบัติงานรายบุคคล ({periodLabel})
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">
                คลิกที่แถวเพื่อดูประวัติรายวันใน Popup
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 no-print">
              <button
                type="button"
                onClick={() => setShowHeaderFilters((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  showHeaderFilters
                    ? 'bg-violet-600 text-white shadow-2xs'
                    : 'bg-violet-50 text-violet-800 border border-violet-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{showHeaderFilters ? 'ซ่อนฟิลเตอร์หัวตาราง' : 'แสดงฟิลเตอร์หัวตาราง'}</span>
              </button>
              <span className="text-[11px] text-slate-400 font-mono">
                * มาตรฐานเครื่องสแกน HIP CMiF68S
              </span>
            </div>
          </div>

          {/* Responsive Table Wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-700">
                  <SortableHeader
                    label="FINGLE_ID"
                    sortKey="fingleId"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="เลขประชาชน (HR_CID)"
                    sortKey="cidMasked"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="ชื่อ - สกุล"
                    sortKey="fullName"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="ตำแหน่ง / หน่วยงานย่อย"
                    sortKey="department"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="วันทำงาน (วัน)"
                    sortKey="workingDaysCount"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="ปกติ / ตรงเวลา"
                    sortKey="normalCount"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="มาสาย (ครั้ง)"
                    sortKey="lateCount"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="รวมเวลาสาย"
                    sortKey="totalLateMinutes"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="ออกก่อน"
                    sortKey="earlyCheckoutCount"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="รวม OT (ชม.)"
                    sortKey="totalOtHours"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="อัตราตรงเวลา"
                    sortKey="onTimeRatePercent"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="ไม่พบสแกน"
                    sortKey="noScanCount"
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={handleSort}
                    align="center"
                  />
                </tr>

                {/* Toggleable Column Filter Row (Matches Reference Image 1) */}
                {showHeaderFilters && (
                  <tr className="bg-[#F8F7FC]/80 border-b border-[#E9E5F2] text-[11px] no-print">
                    <th className="p-2">
                      <input
                        type="text"
                        value={colFilterFingle}
                        onChange={(e) => setColFilterFingle(e.target.value)}
                        placeholder="รหัส..."
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-2 py-1 text-[11px] font-normal focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2">
                      <input
                        type="text"
                        value={colFilterCid}
                        onChange={(e) => setColFilterCid(e.target.value)}
                        placeholder="เลขบัตร..."
                        className="w-24 bg-white border border-[#E9E5F2] rounded-md px-2 py-1 text-[11px] font-normal focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2">
                      <input
                        type="text"
                        value={colFilterName}
                        onChange={(e) => setColFilterName(e.target.value)}
                        placeholder="ค้นชื่อ..."
                        className="w-28 bg-white border border-[#E9E5F2] rounded-md px-2 py-1 text-[11px] font-normal focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2">
                      <input
                        type="text"
                        value={colFilterDept}
                        onChange={(e) => setColFilterDept(e.target.value)}
                        placeholder="ตำแหน่ง/แผนก..."
                        className="w-28 bg-white border border-[#E9E5F2] rounded-md px-2 py-1 text-[11px] font-normal focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinWorkDays}
                        onChange={(e) => setColMinWorkDays(e.target.value)}
                        placeholder=">= วัน"
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinNormal}
                        onChange={(e) => setColMinNormal(e.target.value)}
                        placeholder=">= ครั้ง"
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinLateCount}
                        onChange={(e) => setColMinLateCount(e.target.value)}
                        placeholder=">= ครั้ง"
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinLateMins}
                        onChange={(e) => setColMinLateMins(e.target.value)}
                        placeholder=">= นาที"
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinEarlyOut}
                        onChange={(e) => setColMinEarlyOut(e.target.value)}
                        placeholder=">= ค"
                        className="w-14 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={colMinOtHours}
                        onChange={(e) => setColMinOtHours(e.target.value)}
                        placeholder=">= ชม."
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={colMinOnTimeRate}
                        onChange={(e) => setColMinOnTimeRate(e.target.value)}
                        placeholder=">= %"
                        className="w-16 bg-white border border-[#E9E5F2] rounded-md px-1.5 py-1 text-[11px] font-normal text-right focus:outline-none focus:border-violet-400"
                      />
                    </th>
                    <th className="p-2 text-center">
                      <button
                        type="button"
                        onClick={clearColumnFilters}
                        className="text-[10px] text-violet-700 hover:underline font-semibold cursor-pointer"
                      >
                        ล้างกรอง
                      </button>
                    </th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-[#E9E5F2]">
                {pagedSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      ไม่พบข้อมูลสรุปตามเงื่อนไขที่เลือกหรือตัวกรองหัวตาราง
                    </td>
                  </tr>
                ) : (
                  pagedSummaries.map((item) => (
                    <tr
                      key={item.personId}
                      onClick={() => setSelectedPersonModal(item)}
                      className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3 font-mono-data font-bold text-violet-700">
                        #{item.fingleId}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {item.personId}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono-data text-slate-600 text-[11px]">
                        {item.cidMasked}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{item.fullName}</div>
                        <div className="text-[11px] text-slate-500">{item.personnelType}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{item.department}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.position} · {item.groupName}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data font-bold text-slate-900">
                        {item.workingDaysCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data font-semibold text-emerald-700">
                        {item.normalCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data">
                        {item.lateCount > 0 ? (
                          <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            {item.lateCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data">
                        {item.totalLateMinutes > 0 ? (
                          <span className="font-bold text-amber-700">
                            {item.totalLateMinutes} น.
                          </span>
                        ) : (
                          <span className="text-slate-400">0 น.</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data text-slate-600">
                        {item.earlyCheckoutCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data text-slate-600">
                        {item.totalOtHours.toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-data">
                        <span
                          className={`font-bold ${
                            item.onTimeRatePercent >= 90
                              ? 'text-emerald-700'
                              : item.onTimeRatePercent >= 70
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.workingDaysCount > 0 ? `${item.onTimeRatePercent}%` : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono-data">
                        {item.noScanCount > 0 ? (
                          <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                            {item.noScanCount}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Standardized Pagination Footer */}
          <TablePaginationBar
            totalItems={filteredAndSortedSummaries.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            extraControls={
              <button
                type="button"
                onClick={() => setShowHeaderFilters((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-200 text-violet-700 bg-violet-50/70 hover:bg-violet-100 text-xs font-semibold cursor-pointer"
              >
                <Filter className="w-3 h-3" />
                <span>ฟิลเตอร์หัวตาราง</span>
              </button>
            }
          />
        </div>
      )}

      {/* =================================================================
          6B. LATENESS RANKINGS SECTION (Merged from Reports & Rankings)
         ================================================================= */}
      {activeSubView === 'LATE_RANKINGS' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-5 py-4 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-violet-600" />
                <span>จัดอันดับสถิติการมาสาย (Lateness Rankings — {periodLabel})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                แยกระหว่าง "จำนวนคนที่สาย (Distinct People)" และ "จำนวนครั้งที่สาย (Occurrences)" พร้อมตัวหารค่าเฉลี่ยชัดเจน (นาทีสายรวม ÷ จำนวนกะที่สาย)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setRankingOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'))
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-violet-600" />
                <span>
                  {rankingOrder === 'DESC'
                    ? 'เรียงจากสายมากที่สุด → น้อยที่สุด'
                    : 'เรียงจากสายน้อยที่สุด (ตรงเวลาเด่น) → มากที่สุด'}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-700 font-semibold">
                  <th className="py-3 px-4 w-16 text-center">อันดับ</th>
                  <th className="py-3 px-4 font-mono">รหัส / FINGLE_ID</th>
                  <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                  <th className="py-3 px-4">ตำแหน่ง / ฝ่าย</th>
                  <th className="py-3 px-4 text-right">วันทำงานจริง</th>
                  <th className="py-3 px-4 text-right">จำนวนครั้งที่สาย (Occurrences)</th>
                  <th className="py-3 px-4 text-right">นาทีสายสะสมรวม</th>
                  <th className="py-3 px-4 text-right">เฉลี่ยต่อกะที่สาย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E5F2]">
                {[...filteredAndSortedSummaries]
                  .sort((a, b) =>
                    rankingOrder === 'DESC'
                      ? b.lateCount - a.lateCount || b.totalLateMinutes - a.totalLateMinutes
                      : a.lateCount - b.lateCount || a.totalLateMinutes - b.totalLateMinutes
                  )
                  .map((item, idx) => (
                    <tr
                      key={item.personId}
                      onClick={() => setSelectedPersonModal(item)}
                      className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-center font-mono-data font-bold text-slate-700">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono-data">
                        <span className="font-bold text-slate-900">{item.personId}</span>
                        <span className="text-violet-700 ml-1.5 font-semibold">
                          (FID #{item.fingleId})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{item.fullName}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.department} · <span className="text-slate-400">{item.groupName}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-data font-semibold text-slate-800">
                        {item.workingDaysCount} วัน
                      </td>
                      <td className="py-3 px-4 text-right font-mono-data">
                        {item.lateCount > 0 ? (
                          <span className="font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                            {item.lateCount} ครั้ง
                          </span>
                        ) : (
                          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                            0 ครั้ง (ไม่สายเลย)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-data font-bold text-slate-900">
                        {item.totalLateMinutes} นาที
                      </td>
                      <td className="py-3 px-4 text-right font-mono-data text-slate-600">
                        {item.avgLateMinutesPerLateShift} นาที/ครั้ง
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================
          POPUP MODAL 1: INDIVIDUAL PERSON ATTENDANCE DETAILS
         ================================================================= */}
      <SharedModal
        open={!!selectedPersonModal}
        onClose={() => setSelectedPersonModal(null)}
        title={
          selectedPersonModal
            ? `ประวัติการปฏิบัติงานรายบุคคล — ${selectedPersonModal.fullName}`
            : ''
        }
        subtitle={
          selectedPersonModal
            ? `รหัสบุคลากร: ${selectedPersonModal.personId} · FINGLE_ID: #${selectedPersonModal.fingleId} · ${selectedPersonModal.position} (${selectedPersonModal.department})`
            : ''
        }
        badgeText={periodLabel}
        maxWidthClass="max-w-4xl"
      >
        {selectedPersonModal && (
          <div className="space-y-4">
            {/* Summary Cards inside Person Modal */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3">
                <span className="text-[11px] text-slate-500">วันปฏิบัติงานจริง</span>
                <div className="text-lg font-bold font-mono-data text-slate-900 mt-0.5">
                  {selectedPersonModal.workingDaysCount} วัน
                </div>
              </div>
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3">
                <span className="text-[11px] text-emerald-800">เข้างานปกติ (ตรงเวลา)</span>
                <div className="text-lg font-bold font-mono-data text-emerald-700 mt-0.5">
                  {selectedPersonModal.normalCount} ครั้ง ({selectedPersonModal.onTimeRatePercent}%)
                </div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3">
                <span className="text-[11px] text-amber-800">มาสายสะสม</span>
                <div className="text-lg font-bold font-mono-data text-amber-700 mt-0.5">
                  {selectedPersonModal.lateCount} ครั้ง ({selectedPersonModal.totalLateMinutes} น.)
                </div>
              </div>
              <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3">
                <span className="text-[11px] text-rose-800">ไม่พบสแกน (NO_SCAN)</span>
                <div className="text-lg font-bold font-mono-data text-rose-700 mt-0.5">
                  {selectedPersonModal.noScanCount} วัน
                </div>
              </div>
            </div>

            {/* Daily Shift Records Table */}
            <div className="border border-[#E9E5F2] rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-700 font-semibold">
                    <th className="py-2.5 px-3">วันที่ปฏิบัติงาน</th>
                    <th className="py-2.5 px-3">กะเวลาทำงาน</th>
                    <th className="py-2.5 px-3">สแกนเข้า</th>
                    <th className="py-2.5 px-3">สแกนออก</th>
                    <th className="py-2.5 px-3">สถานะ</th>
                    <th className="py-2.5 px-3 text-right">นาทีสาย</th>
                    <th className="py-2.5 px-3">หมายเหตุ / สถานะส่ง HOSOffice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2]">
                  {selectedPersonModal.records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        ไม่มีประวัติการลงเวลาในช่วงเวลาที่เลือก
                      </td>
                    </tr>
                  ) : (
                    selectedPersonModal.records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-violet-50/40">
                        <td className="py-2.5 px-3 font-mono-data font-bold text-slate-900">
                          {rec.workDate}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div className="font-semibold">{rec.shiftName}</div>
                          <div className="text-[10px] font-mono-data text-slate-400">
                            {rec.shiftStartTime} - {rec.shiftEndTime} น.
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-data font-bold text-violet-800">
                          {rec.checkInAt || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-slate-600">
                          {rec.checkOutAt || '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={rec.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-data">
                          {rec.lateMinutes > 0 ? (
                            <span className="font-bold text-amber-700">+{rec.lateMinutes} น.</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {rec.notes ? (
                            <span className="font-semibold text-rose-800">
                              {rec.notes.reasonLabel}: {rec.notes.note}
                            </span>
                          ) : rec.isPushedToHosOffice ? (
                            <span className="text-emerald-700 font-semibold">ส่ง HOSOffice แล้ว</span>
                          ) : (
                            <span className="text-slate-400">รอส่ง HOSOffice</span>
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

      {/* =================================================================
          POPUP MODAL 2: KPI SUMMARY CARD DETAILS
         ================================================================= */}
      <SharedModal
        open={!!kpiModalType}
        onClose={() => setKpiModalType(null)}
        title={
          kpiModalType === 'ALL_STAFF'
            ? 'รายชื่อเจ้าหน้าที่ในรายงานทั้งหมด'
            : kpiModalType === 'WORKING_DAYS'
            ? 'รายละเอียดวันปฏิบัติงานจริงของบุคลากร'
            : kpiModalType === 'LATE_SUMMARY'
            ? 'รายละเอียดสถิติการมาสาย (แยกจำนวนคน vs จำนวนครั้ง)'
            : 'ข้อมูลการคำนวณชั่วโมงทำงานล่วงเวลา (OT Policy)'
        }
        subtitle={`ขอบเขตรายงาน: ${periodLabel}`}
        badgeText="HR Report Insight"
      >
        {kpiModalType === 'OT_SUMMARY' ? (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2 text-violet-950">
            <div className="font-bold flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-violet-700" />
              <span>กฎการแสดงผลชั่วโมง OT ตามข้อกำหนด MASTER DEVELOPMENT PROMPT:</span>
            </div>
            <p className="text-xs leading-relaxed text-violet-900">
              • ระบบ Sam_Att V2 จะแสดงชั่วโมง OT เฉพาะกรณีที่มีข้อมูลการอนุมัติเวร OT หรือกติกา OT ที่ระบุไว้อย่างชัดเจนเท่านั้น
              <br />• <strong>ห้ามเดาหรือคำนวณ OT เองจากเวลาสแกนออก</strong> เพียงอย่างเดียว เพื่อป้องกันความคลาดเคลื่อนทางบัญชีและการเบิกจ่ายของโรงพยาบาลสามชุก
              <br />• ในชุดข้อมูลจำลองปัจจุบันยังไม่มีรายการอนุมัติ OT แยกต่างหาก ระบบจึงแสดงค่าเป็น{' '}
              <strong className="font-mono-data">0.0 ชม.</strong> อย่างโปร่งใส
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <span>
                จำนวนบุคลากรในหมวดนี้:{' '}
                <strong className="font-mono-data text-violet-700">
                  {kpiModalType === 'LATE_SUMMARY'
                    ? kpiTotals.distinctLatePeople
                    : filteredAndSortedSummaries.length}{' '}
                  ท่าน
                </strong>
              </span>
              {kpiModalType === 'LATE_SUMMARY' && (
                <span>
                  จำนวนครั้งที่สายรวม:{' '}
                  <strong className="font-mono-data text-amber-700">
                    {kpiTotals.totalLateOccurrences} ครั้ง (รวม {kpiTotals.totalLateMinutes} นาที)
                  </strong>
                </span>
              )}
            </div>

            <div className="border border-[#E9E5F2] rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">FINGLE_ID</th>
                    <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                    <th className="py-2.5 px-3">แผนก / กลุ่มงาน</th>
                    <th className="py-2.5 px-3 text-right">วันทำงานจริง</th>
                    <th className="py-2.5 px-3 text-right">มาสาย (ครั้ง)</th>
                    <th className="py-2.5 px-3 text-right">นาทีสายรวม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E5F2]">
                  {filteredAndSortedSummaries
                    .filter((s) => (kpiModalType === 'LATE_SUMMARY' ? s.lateCount > 0 : true))
                    .map((s) => (
                      <tr
                        key={s.personId}
                        onClick={() => {
                          setKpiModalType(null);
                          setSelectedPersonModal(s);
                        }}
                        className="hover:bg-violet-50/50 cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-mono-data font-bold text-violet-700">
                          #{s.fingleId}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{s.fullName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{s.department}</td>
                        <td className="py-2.5 px-3 text-right font-mono-data font-semibold">
                          {s.workingDaysCount} วัน
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-data text-amber-700 font-bold">
                          {s.lateCount} ครั้ง
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-data text-amber-700">
                          {s.totalLateMinutes} น.
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
