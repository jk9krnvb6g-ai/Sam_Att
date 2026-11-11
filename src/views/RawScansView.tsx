import React, { useState, useMemo } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import { RawScanEvent, SyncRunLog, Personnel, AttendanceRecord } from '../types/attendance';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import {
  Fingerprint,
  RefreshCw,
  Copy,
  Check,
  Code,
  History,
  Search,
  Calendar,
  X,
  RotateCcw,
  Lock,
  UserCheck,
  AlertTriangle,
  Layers,
  ArrowUpDown,
  Clock,
} from 'lucide-react';

export const RawScansView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scans' | 'runs' | 'contract'>('scans');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedContract, setCopiedContract] = useState(false);
  const [syncToast, setSyncToast] = useState<{
    totalRead: number;
    newScans: number;
    duplicateScans: number;
    unmappedScans: number;
    totalEventsAfterSync?: number;
  } | null>(null);

  // =========================================================
  // Filter Controls (Supports Multi-Scan Filter & Chronological Sort)
  // =========================================================
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'SINGLE' | 'RANGE'>('SINGLE');
  const [selectedDate, setSelectedDate] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string>('ALL');
  const [selectedHosStatus, setSelectedHosStatus] = useState<string>('ALL');
  const [onlyMultiScanPeople, setOnlyMultiScanPeople] = useState<boolean>(false);

  // Table Sorting & Pagination for Raw Scans
  const [scanSortKey, setScanSortKey] = useState<string>('scanDateTime');
  const [scanSortDir, setScanSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [scanPage, setScanPage] = useState(1);
  const [scanPageSize, setScanPageSize] = useState<PageSizeOption>(10);

  // Table Sorting & Pagination for Sync Runs
  const [runSortKey, setRunSortKey] = useState<string>('startedAt');
  const [runSortDir, setRunSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [runPage, setRunPage] = useState(1);
  const [runPageSize, setRunPageSize] = useState<PageSizeOption>(10);

  // Popup Detail Modal States
  const [selectedRawScan, setSelectedRawScan] = useState<RawScanEvent | null>(null);
  const [selectedSyncRun, setSelectedSyncRun] = useState<SyncRunLog | null>(null);

  // Data from service
  const rawScans = useMemo(() => mockAttendanceService.getRawScans(), [refreshKey]);
  const syncRuns = useMemo(() => mockAttendanceService.getSyncRuns(), [refreshKey]);
  const personnelList = useMemo(() => mockAttendanceService.getPersonnel(), [refreshKey]);
  const attendanceList = useMemo(() => mockAttendanceService.getAttendance(), [refreshKey]);

  const personnelByFingle = useMemo(() => {
    const map = new Map<number, Personnel>();
    personnelList.forEach((p) => map.set(p.fingleId, p));
    return map;
  }, [personnelList]);

  const attendanceByFingleDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendanceList.forEach((a) => map.set(`${a.fingleId}_${a.workDate}`, a));
    return map;
  }, [attendanceList]);

  // Count how many Raw Scan Events each (enrollNumber, date) has across the dataset
  const scanEventsByFingleAndDate = useMemo(() => {
    const map = new Map<string, RawScanEvent[]>();
    rawScans.forEach((s) => {
      const d = s.scanDateTime.slice(0, 10);
      const key = `${s.enrollNumber}_${d}`;
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    // Sort each person-day's events chronologically (oldest to newest)
    map.forEach((list) => {
      list.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));
    });
    return map;
  }, [rawScans]);

  // Combined dynamic filtering + sorting for Raw Scans (never collapses multiple scans of same person)
  const filteredAndSortedScans = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const filtered = rawScans.filter((scan) => {
      const person = personnelByFingle.get(scan.enrollNumber);
      const scanDate = scan.scanDateTime.slice(0, 10);
      const att = attendanceByFingleDate.get(`${scan.enrollNumber}_${scanDate}`);
      const personDayEvents =
        scanEventsByFingleAndDate.get(`${scan.enrollNumber}_${scanDate}`) || [];

      // 1. Search by FINGLE_ID, Name, Department, PERSON_ID
      if (q) {
        const fullName = person
          ? `${person.prefix}${person.firstName} ${person.lastName}`.toLowerCase()
          : '';
        const dept = person ? `${person.department} ${person.groupName}`.toLowerCase() : '';
        const personIdStr = person ? person.personId.toLowerCase() : '';
        const matchesSearch =
          String(scan.enrollNumber).includes(q) ||
          fullName.includes(q) ||
          dept.includes(q) ||
          personIdStr.includes(q) ||
          scan.scanDateTime.includes(q);
        if (!matchesSearch) return false;
      }

      // 2. Date or Date Range
      if (dateFilterMode === 'SINGLE' && selectedDate) {
        if (scanDate !== selectedDate) return false;
      } else if (dateFilterMode === 'RANGE') {
        if (rangeFrom && scanDate < rangeFrom) return false;
        if (rangeTo && scanDate > rangeTo) return false;
      }

      // 3. Scanner Device
      if (selectedMachine !== 'ALL') {
        if (String(scan.machineNo) !== selectedMachine) return false;
      }

      // 4. HOSOffice Push Status
      if (selectedHosStatus !== 'ALL') {
        if (selectedHosStatus === 'PUSHED' && !att?.isPushedToHosOffice) return false;
        if (selectedHosStatus === 'PENDING' && (!person || att?.isPushedToHosOffice)) return false;
        if (selectedHosStatus === 'UNMAPPED' && !!person) return false;
      }

      // 5. Filter: เฉพาะบุคลากรที่สแกนมากกว่า 1 ครั้งในวันนั้น
      if (onlyMultiScanPeople && personDayEvents.length <= 1) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const dir = scanSortDir === 'ASC' ? 1 : -1;
      switch (scanSortKey) {
        case 'machineNo':
          return (a.machineNo - b.machineNo) * dir;
        case 'enrollNumber':
          return (a.enrollNumber - b.enrollNumber) * dir;
        case 'scanDateTime':
          return a.scanDateTime.localeCompare(b.scanDateTime) * dir;
        case 'inOutMode':
          return (a.inOutMode - b.inOutMode) * dir;
        case 'dailyScanCount': {
          const countA =
            scanEventsByFingleAndDate.get(
              `${a.enrollNumber}_${a.scanDateTime.slice(0, 10)}`
            )?.length || 1;
          const countB =
            scanEventsByFingleAndDate.get(
              `${b.enrollNumber}_${b.scanDateTime.slice(0, 10)}`
            )?.length || 1;
          return (countA - countB) * dir;
        }
        case 'importedAt':
          return a.importedAt.localeCompare(b.importedAt) * dir;
        default:
          return 0;
      }
    });
  }, [
    rawScans,
    searchQuery,
    dateFilterMode,
    selectedDate,
    rangeFrom,
    rangeTo,
    selectedMachine,
    selectedHosStatus,
    onlyMultiScanPeople,
    scanSortKey,
    scanSortDir,
    personnelByFingle,
    attendanceByFingleDate,
    scanEventsByFingleAndDate,
  ]);

  const pagedScans = useMemo(() => {
    if (scanPageSize === 'ALL') return filteredAndSortedScans;
    const start = (scanPage - 1) * scanPageSize;
    return filteredAndSortedScans.slice(start, start + scanPageSize);
  }, [filteredAndSortedScans, scanPage, scanPageSize]);

  // Sorted & Paginated Sync Runs
  const sortedSyncRuns = useMemo(() => {
    return [...syncRuns].sort((a, b) => {
      const dir = runSortDir === 'ASC' ? 1 : -1;
      switch (runSortKey) {
        case 'deviceName':
          return a.deviceName.localeCompare(b.deviceName) * dir;
        case 'mode':
          return a.mode.localeCompare(b.mode) * dir;
        case 'startedAt':
          return a.startedAt.localeCompare(b.startedAt) * dir;
        case 'totalRead':
          return (a.totalRead - b.totalRead) * dir;
        case 'newScans':
          return (a.newScans - b.newScans) * dir;
        default:
          return 0;
      }
    });
  }, [syncRuns, runSortKey, runSortDir]);

  const pagedSyncRuns = useMemo(() => {
    if (runPageSize === 'ALL') return sortedSyncRuns;
    const start = (runPage - 1) * runPageSize;
    return sortedSyncRuns.slice(start, start + runPageSize);
  }, [sortedSyncRuns, runPage, runPageSize]);

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedDate('');
    setRangeFrom('');
    setRangeTo('');
    setSelectedMachine('ALL');
    setSelectedHosStatus('ALL');
    setOnlyMultiScanPeople(false);
    setScanPage(1);
  };

  // Trigger Scanner Sync / Refresh from Backend API
  const handleTriggerSync = async () => {
    await mockAttendanceService.hydrateFromRealApi('ADMIN');
    const result = mockAttendanceService.triggerMockScannerSync();
    setSyncToast(result);
    setRefreshKey((k) => k + 1);
  };

  const handleScanSort = (key: string) => {
    if (scanSortKey === key) {
      setScanSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setScanSortKey(key);
      setScanSortDir('DESC');
    }
    setScanPage(1);
  };

  const handleRunSort = (key: string) => {
    if (runSortKey === key) {
      setRunSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setRunSortKey(key);
      setRunSortDir('DESC');
    }
    setRunPage(1);
  };

  const sampleJsonContract = `{
  "success": true,
  "totalRead": 5,
  "machines": [
    { "machineNo": 1, "ip": "192.168.111.163", "read": 5, "status": "OK" }
  ],
  "scans": [
    {
      "machineNo": 1,
      "enrollNumber": 54,
      "scanDateTime": "2026-11-06 07:45:10",
      "verifyMode": 268435456,
      "inOutMode": 1,
      "workCode": null
    },
    {
      "machineNo": 1,
      "enrollNumber": 54,
      "scanDateTime": "2026-11-06 07:46:02",
      "verifyMode": 268435456,
      "inOutMode": 1,
      "workCode": null
    }
  ]
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sampleJsonContract);
    setCopiedContract(true);
    setTimeout(() => setCopiedContract(false), 2000);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 text-[11px] font-bold mb-1.5">
            <Lock className="w-3 h-3 text-violet-600" />
            <span>Read-Only Original Telemetry (6-Field Scanner JSON Contract)</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ข้อมูลสแกนดิบและประวัติการ Sync (Raw Scans & Sync Runs)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            แสดงทุกเหตุการณ์สแกนนิ้วจริงตามลำดับเวลาโดยไม่ยุบรวมเป็น 1 แถวต่อวัน (คลิกที่ชื่อบุคลากรหรือ FINGLE_ID เพื่อดูเหตุการณ์สแกนทั้งหมดในวันนั้นและ JSON 6 ฟิลด์)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              await mockAttendanceService.hydrateFromRealApi('ADMIN');
              setRefreshKey((k) => k + 1);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-[#F8F7FC] hover:bg-violet-50 border border-[#E9E5F2] rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-violet-600" />
            <span>รีเฟรชข้อมูล</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerSync}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ตรวจสอบข้อมูลสแกนล่าสุด (Sync Status)</span>
          </button>
        </div>
      </div>

      {/* Sync Toast Result (Shows newScans, duplicateScans, unmappedScans, totalEventsAfterSync) */}
      {syncToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              การตรวจสอบข้อมูลสแกนดิบเสร็จสิ้น (Deduplicate ด้วย machineNo + enrollNumber + scanDateTime)
            </div>
            <div className="text-[11px] text-emerald-800 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                อ่านได้ในรอบนี้:{' '}
                <strong className="font-mono-data">{syncToast.totalRead}</strong> เหตุการณ์
              </span>
              <span>|</span>
              <span>
                เหตุการณ์ใหม่:{' '}
                <strong className="font-mono-data text-emerald-700">
                  +{syncToast.newScans}
                </strong>
              </span>
              <span>|</span>
              <span>
                เหตุการณ์ซ้ำที่ข้าม:{' '}
                <strong className="font-mono-data text-slate-700">
                  {syncToast.duplicateScans}
                </strong>
              </span>
              <span>|</span>
              <span>
                เหตุการณ์ที่ไม่พบ Mapping:{' '}
                <strong className="font-mono-data text-amber-700">
                  {syncToast.unmappedScans}
                </strong>
              </span>
              <span>|</span>
              <span>
                จำนวนเหตุการณ์รวมหลัง Sync:{' '}
                <strong className="font-mono-data text-violet-800">
                  {syncToast.totalEventsAfterSync ?? rawScans.length}
                </strong>{' '}
                รายการ
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-2.5 py-1 bg-emerald-100 rounded-lg cursor-pointer shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {/* =================================================================
          FILTER BAR
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* 1. Search by Name, FINGLE_ID, PERSON_ID, Department */}
          <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setScanPage(1);
              }}
              placeholder="ค้นหาชื่อ, PERSON_ID, FINGLE_ID, แผนก..."
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

          {/* 2. Date or Date Range Filter */}
          <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-violet-600 shrink-0" />
            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as 'SINGLE' | 'RANGE')}
              className="text-[11px] font-bold text-violet-700 bg-violet-100/80 rounded px-1.5 py-0.5 focus:outline-none cursor-pointer"
            >
              <option value="SINGLE">รายวัน</option>
              <option value="RANGE">ช่วงวัน</option>
            </select>

            {dateFilterMode === 'SINGLE' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setScanPage(1);
                }}
                className="w-full bg-transparent font-mono-data text-slate-800 focus:outline-none cursor-pointer"
              />
            ) : (
              <div className="flex items-center gap-1 w-full">
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => {
                    setRangeFrom(e.target.value);
                    setScanPage(1);
                  }}
                  className="w-full bg-transparent font-mono-data text-[11px] text-slate-800 focus:outline-none"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => {
                    setRangeTo(e.target.value);
                    setScanPage(1);
                  }}
                  className="w-full bg-transparent font-mono-data text-[11px] text-slate-800 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* 3. Scanner Dropdown (เครื่องสแกนทั้งหมด 1, 2, 3) */}
          <select
            value={selectedMachine}
            onChange={(e) => {
              setSelectedMachine(e.target.value);
              setScanPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">เครื่องสแกนทั้งหมด (1, 2, 3)</option>
            <option value="1">เครื่องสแกน 1 — อาคารผู้ป่วยนอก (OPD)</option>
            <option value="2">เครื่องสแกน 2 — อาคารอุบัติเหตุและฉุกเฉิน (ER)</option>
            <option value="3">เครื่องสแกน 3 — อาคารผู้ป่วยใน (IPD)</option>
          </select>

          {/* 4. HOSOffice Push Status Filter */}
          <select
            value={selectedHosStatus}
            onChange={(e) => {
              setSelectedHosStatus(e.target.value);
              setScanPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">สถานะส่ง hosoffice ทั้งหมด</option>
            <option value="PUSHED">ส่งเข้า hosoffice แล้ว (Pushed)</option>
            <option value="PENDING">รอส่งเข้า hosoffice (Staging PENDING)</option>
            <option value="UNMAPPED">ยังไม่พบรหัสบุคลากร (PENDING_MAPPING)</option>
          </select>
        </div>

        {/* Second Filter Strip: Multi-Scan Toggle + Chronological Sort + Tabs */}
        <div className="pt-2.5 border-t border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Tabs */}
          <div className="inline-flex items-center gap-1 p-1 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('scans')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'scans'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-violet-800'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>เหตุการณ์ Raw Scan ({filteredAndSortedScans.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('runs')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'runs'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-violet-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>ประวัติรอบการ Sync ({syncRuns.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('contract')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                activeTab === 'contract'
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-violet-800'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>สัญญา JSON (6 Fields Contract)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Multi-scan filter checkbox required by §2.2 */}
            <label
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-colors ${
                onlyMultiScanPeople
                  ? 'bg-violet-100 border-violet-300 text-violet-900'
                  : 'bg-[#F8F7FC] border-[#E9E5F2] text-slate-700 hover:bg-violet-50/50'
              }`}
            >
              <input
                type="checkbox"
                checked={onlyMultiScanPeople}
                onChange={(e) => {
                  setOnlyMultiScanPeople(e.target.checked);
                  setScanPage(1);
                }}
                className="rounded text-violet-600 cursor-pointer"
              />
              <Layers className="w-3.5 h-3.5 text-violet-600" />
              <span>เฉพาะบุคลากรที่สแกนมากกว่า 1 ครั้ง</span>
            </label>

            {/* Quick Chronological Sort Toggle (ASC vs DESC) */}
            <button
              type="button"
              onClick={() => {
                setScanSortKey('scanDateTime');
                setScanSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'));
                setScanPage(1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-[#F8F7FC] hover:bg-violet-50 border border-[#E9E5F2] rounded-xl transition-colors cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-violet-600" />
              <span>
                เรียงเวลา: {scanSortDir === 'ASC' ? 'เก่าไปใหม่ (ASC)' : 'ใหม่ไปเก่า (DESC)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ล้างตัวกรอง</span>
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================
          TAB 1: RAW SCANS TABLE (Read-Only + Multi-Scan Badge + Row Click Popup)
         ================================================================= */}
      {activeTab === 'scans' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-4 py-3 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">
              ตารางบันทึกเหตุการณ์สแกนดิบ (Immutable Raw Events — แสดงทุกครั้งที่สแกนใน 1 วัน ไม่ยุบรวมแถว)
            </div>
            <div className="text-xs text-slate-500">
              ค่า <code className="font-mono text-violet-700">inOutMode</code> แสดงตามค่าดิบจากเครื่องสแกน (Read-Only)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                  <SortableHeader
                    label="machineNo"
                    sortKey="machineNo"
                    currentSortKey={scanSortKey}
                    currentSortDir={scanSortDir}
                    onSort={handleScanSort}
                  />
                  <SortableHeader
                    label="enrollNumber (FINGLE_ID)"
                    sortKey="enrollNumber"
                    currentSortKey={scanSortKey}
                    currentSortDir={scanSortDir}
                    onSort={handleScanSort}
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-600">
                    บุคลากรที่จับคู่ได้ (HR Mapping)
                  </th>
                  <SortableHeader
                    label="scanDateTime"
                    sortKey="scanDateTime"
                    currentSortKey={scanSortKey}
                    currentSortDir={scanSortDir}
                    onSort={handleScanSort}
                  />
                  <SortableHeader
                    label="จำนวนสแกนในวันนั้น"
                    sortKey="dailyScanCount"
                    currentSortKey={scanSortKey}
                    currentSortDir={scanSortDir}
                    onSort={handleScanSort}
                    align="center"
                  />
                  <th className="py-2.5 px-3 font-mono font-semibold text-slate-600">verifyMode</th>
                  <SortableHeader
                    label="inOutMode (ค่าดิบ)"
                    sortKey="inOutMode"
                    currentSortKey={scanSortKey}
                    currentSortDir={scanSortDir}
                    onSort={handleScanSort}
                  />
                  <th className="py-2.5 px-3 font-mono font-semibold text-slate-600">workCode</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-600 text-center">
                    สถานะส่ง hosoffice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E5F2]">
                {pagedScans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      ไม่พบข้อมูลสแกนดิบตามตัวกรองที่เลือก
                    </td>
                  </tr>
                ) : (
                  pagedScans.map((scan) => {
                    const person = personnelByFingle.get(scan.enrollNumber);
                    const scanDate = scan.scanDateTime.slice(0, 10);
                    const att = attendanceByFingleDate.get(`${scan.enrollNumber}_${scanDate}`);
                    const sameDayEvents =
                      scanEventsByFingleAndDate.get(`${scan.enrollNumber}_${scanDate}`) || [scan];
                    const eventOrderIdx =
                      sameDayEvents.findIndex((s) => s.id === scan.id) + 1;

                    return (
                      <tr
                        key={scan.id}
                        onClick={() => setSelectedRawScan(scan)}
                        className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3 font-mono-data font-bold text-slate-800">
                          เครื่อง #{scan.machineNo}
                        </td>
                        <td className="py-3 px-3 font-mono-data font-bold text-violet-700">
                          <span className="underline decoration-dotted underline-offset-2">
                            #{scan.enrollNumber}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {person ? (
                            <div>
                              <div className="font-bold text-slate-900 hover:text-violet-700">
                                {person.prefix}
                                {person.firstName} {person.lastName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {person.department} ({person.personId})
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              ไม่พบรหัสบุคลากร (PENDING_MAPPING)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono-data font-semibold text-slate-900 whitespace-nowrap">
                          {scan.scanDateTime}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono-data font-bold border ${
                              sameDayEvents.length > 1
                                ? 'bg-violet-50 text-violet-800 border-violet-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title={`สแกนครั้งที่ ${eventOrderIdx} จากทั้งหมด ${sameDayEvents.length} ครั้งในวันที่ ${scanDate}`}
                          >
                            ครั้งที่ {eventOrderIdx}/{sameDayEvents.length}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono-data text-slate-600 text-[11px]">
                          {scan.verifyMode}
                        </td>
                        <td className="py-3 px-3 font-mono-data text-slate-800">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold">
                            {scan.inOutMode}
                          </span>{' '}
                          <span className="text-[11px] text-slate-500 font-sans">
                            (เหตุการณ์สแกน · ค่าดิบ)
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono-data text-slate-400">
                          {scan.workCode === null ? 'null' : scan.workCode}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {!person ? (
                            <span className="text-[11px] font-semibold text-amber-700">
                              รอผูก FINGLE_ID
                            </span>
                          ) : att?.isPushedToHosOffice ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                              ส่งแล้ว
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 text-[11px] font-semibold">
                              รอส่ง (Staging)
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

          <TablePaginationBar
            totalItems={filteredAndSortedScans.length}
            currentPage={scanPage}
            pageSize={scanPageSize}
            onPageChange={setScanPage}
            onPageSizeChange={setScanPageSize}
          />
        </div>
      )}

      {/* =================================================================
          TAB 2: SYNC RUNS HISTORY TABLE
         ================================================================= */}
      {activeTab === 'runs' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-4 py-3 border-b border-[#E9E5F2] flex items-center justify-between">
            <div className="text-xs font-bold text-slate-900">
              ประวัติรอบการดึงสแกน (Sync Runs Log — คลิกที่แถวเพื่อดูรายละเอียด)
            </div>
            <span className="text-xs text-violet-700 font-mono font-semibold">
              ตั้งเวลารายวัน: 00:00, 08:00 (Asia/Bangkok)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                  <SortableHeader
                    label="เครื่องสแกน"
                    sortKey="deviceName"
                    currentSortKey={runSortKey}
                    currentSortDir={runSortDir}
                    onSort={handleRunSort}
                  />
                  <SortableHeader
                    label="โหมดการ Sync"
                    sortKey="mode"
                    currentSortKey={runSortKey}
                    currentSortDir={runSortDir}
                    onSort={handleRunSort}
                  />
                  <SortableHeader
                    label="เวลาเริ่มต้น - สิ้นสุด"
                    sortKey="startedAt"
                    currentSortKey={runSortKey}
                    currentSortDir={runSortDir}
                    onSort={handleRunSort}
                  />
                  <th className="py-2.5 px-4 text-center">สถานะ</th>
                  <SortableHeader
                    label="จำนวนที่อ่านได้"
                    sortKey="totalRead"
                    currentSortKey={runSortKey}
                    currentSortDir={runSortDir}
                    onSort={handleRunSort}
                    align="right"
                  />
                  <SortableHeader
                    label="เหตุการณ์ใหม่"
                    sortKey="newScans"
                    currentSortKey={runSortKey}
                    currentSortDir={runSortDir}
                    onSort={handleRunSort}
                    align="right"
                  />
                  <th className="py-2.5 px-4 text-right">เหตุการณ์ซ้ำที่ข้าม</th>
                  <th className="py-2.5 px-4 text-right">ไม่พบ Mapping</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E5F2]">
                {pagedSyncRuns.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedSyncRun(run)}
                    className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-bold text-slate-900">{run.deviceName}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-semibold">
                        {run.mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono-data text-[11px]">
                      {run.startedAt} → {run.finishedAt.split(' ')[1]}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data font-bold text-slate-900">
                      {run.totalRead}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-emerald-700 font-bold">
                      +{run.newScans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-slate-500">
                      {run.duplicateScans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-data text-amber-700 font-semibold">
                      {run.unmappedScans}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePaginationBar
            totalItems={sortedSyncRuns.length}
            currentPage={runPage}
            pageSize={runPageSize}
            onPageChange={setRunPage}
            onPageSizeChange={setRunPageSize}
          />
        </div>
      )}

      {/* =================================================================
          TAB 3: CONTRACT SPECIFICATIONS
         ================================================================= */}
      {activeTab === 'contract' && (
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                ข้อกำหนดสัญญาข้อมูลดิบเครื่องสแกน (Scanner Raw JSON Contract)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ยึดตาม MASTER DEVELOPMENT PROMPT §14 (Updated Scanner JSON Contract — 6 ฟิลด์คงที่)
              </p>
            </div>
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors cursor-pointer"
            >
              {copiedContract ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedContract ? 'คัดลอกแล้ว' : 'คัดลอก JSON'}</span>
            </button>
          </div>

          <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto">
            <pre>{sampleJsonContract}</pre>
          </div>
        </div>
      )}

      {/* =================================================================
          POPUP 1: RAW SCAN DETAIL MODAL (Shows all scans on that date + 6-Field JSON)
         ================================================================= */}
      <SharedModal
        open={!!selectedRawScan}
        onClose={() => setSelectedRawScan(null)}
        title={
          selectedRawScan
            ? `รายละเอียดข้อมูลสแกนดิบ (Raw Scan Event #${selectedRawScan.id})`
            : ''
        }
        subtitle="ข้อมูลต้นฉบับจากเครื่องสแกนลายนิ้วมือ (Read-Only ห้ามแก้ไขหรือลบ) พร้อมรายการสแกนทั้งหมดในวันเดียวกัน"
        badgeText="6-Field JSON Contract"
        maxWidthClass="max-w-2xl"
      >
        {selectedRawScan && (() => {
          const person = personnelByFingle.get(selectedRawScan.enrollNumber);
          const scanDate = selectedRawScan.scanDateTime.slice(0, 10);
          const att = attendanceByFingleDate.get(`${selectedRawScan.enrollNumber}_${scanDate}`);
          const sameDayEvents =
            scanEventsByFingleAndDate.get(`${selectedRawScan.enrollNumber}_${scanDate}`) || [
              selectedRawScan,
            ];
          const relatedSyncRun =
            syncRuns.find((r) => r.machineNo === selectedRawScan.machineNo) || syncRuns[0];

          const rawSixFieldJson = JSON.stringify(
            {
              machineNo: selectedRawScan.machineNo,
              enrollNumber: selectedRawScan.enrollNumber,
              scanDateTime: selectedRawScan.scanDateTime,
              verifyMode: selectedRawScan.verifyMode,
              inOutMode: selectedRawScan.inOutMode,
              workCode: selectedRawScan.workCode,
            },
            null,
            2
          );

          return (
            <div className="space-y-4 text-xs">
              {/* 1. Matched Personnel Info + Total Scan Count on Date */}
              <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-violet-600" />
                    <span>1. ข้อมูลบุคลากรที่จับคู่ได้ (HOSOffice Authoritative Mapping):</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200 font-mono-data font-bold text-[11px]">
                    รวม {sameDayEvents.length} เหตุการณ์สแกนในวันที่ {scanDate}
                  </span>
                </div>

                {person ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-slate-500">ชื่อ - นามสกุล:</span>{' '}
                      <strong className="text-slate-900">
                        {person.prefix}
                        {person.firstName} {person.lastName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">PERSON_ID / FINGLE_ID:</span>{' '}
                      <strong className="font-mono-data text-violet-700">
                        {person.personId} / #{person.fingleId}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">ตำแหน่ง / แผนก:</span>{' '}
                      <span className="text-slate-800">
                        {person.position} ({person.department})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">ผลคำนวณเวลาเข้า–ออก (กะหลัก):</span>{' '}
                      <strong className="font-mono-data text-slate-900">
                        เข้า {att?.checkInAt ? att.checkInAt.split(' ')[1] : '-'} / ออก{' '}
                        {att?.checkOutAt ? att.checkOutAt.split(' ')[1] : '-'}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    ยังไม่พบรหัสบุคลากรใน HOSOffice ที่ตรงกับ enrollNumber #{selectedRawScan.enrollNumber} (สถานะ: PENDING_MAPPING)
                  </div>
                )}
              </div>

              {/* 2. Chronological List of All Scan Events for this Person on Selected Date */}
              <div className="bg-white border border-[#E9E5F2] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-violet-600" />
                    <span>
                      2. รายการสแกนทั้งหมดของ #{selectedRawScan.enrollNumber} ในวันที่ {scanDate} ({sameDayEvents.length} ครั้ง):
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500">คลิกเพื่อสลับดู JSON ของแต่ละครั้ง</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sameDayEvents.map((ev, idx) => {
                    const isCurrent = ev.id === selectedRawScan.id;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedRawScan(ev)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-violet-50 border-violet-400 text-violet-950 shadow-2xs'
                            : 'bg-[#F8F7FC] border-[#E9E5F2] text-slate-700 hover:bg-violet-50/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-violet-600 text-white font-mono-data font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-mono-data font-bold text-slate-900">
                              {ev.scanDateTime.split(' ')[1]} น.
                            </div>
                            <div className="text-[10px] text-slate-500">
                              เครื่อง #{ev.machineNo} · inOutMode={ev.inOutMode}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-violet-700 font-semibold">
                          {ev.id}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Original 6-Field JSON */}
              <div>
                <div className="text-xs font-bold text-slate-900 mb-1.5 flex items-center justify-between">
                  <span>3. ข้อมูล JSON ดิบ 6 ฟิลด์จากเครื่องสแกน (Original Payload):</span>
                  <span className="font-mono text-[11px] text-violet-700">
                    Dedupe Key: {selectedRawScan.dedupeKey}
                  </span>
                </div>
                <pre className="bg-slate-900 text-violet-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
                  {rawSixFieldJson}
                </pre>
              </div>

              {/* 4. Related Sync Run */}
              {relatedSyncRun && (
                <div className="bg-white border border-[#E9E5F2] rounded-xl p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800">4. รอบการ Sync ที่นำเข้า:</span>{' '}
                    <span className="font-mono-data text-violet-700">{relatedSyncRun.id}</span> (
                    {relatedSyncRun.deviceName})
                  </div>
                  <div className="font-mono-data text-slate-500">
                    นำเข้าเมื่อ: {selectedRawScan.importedAt}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </SharedModal>

      {/* =================================================================
          POPUP 2: SYNC RUN DETAIL MODAL
         ================================================================= */}
      <SharedModal
        open={!!selectedSyncRun}
        onClose={() => setSelectedSyncRun(null)}
        title={selectedSyncRun ? `รายละเอียดรอบการดึงข้อมูล (${selectedSyncRun.id})` : ''}
        subtitle={selectedSyncRun?.deviceName}
        badgeText={selectedSyncRun?.mode}
        maxWidthClass="max-w-xl"
      >
        {selectedSyncRun && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-4">
              <div>
                <span className="text-slate-500">เครื่องสแกน:</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedSyncRun.deviceName}</div>
              </div>
              <div>
                <span className="text-slate-500">โหมดการทำงาน:</span>
                <div className="font-mono font-bold text-violet-700 mt-0.5">
                  {selectedSyncRun.mode}
                </div>
              </div>
              <div>
                <span className="text-slate-500">เริ่มต้น:</span>
                <div className="font-mono-data font-semibold text-slate-800 mt-0.5">
                  {selectedSyncRun.startedAt}
                </div>
              </div>
              <div>
                <span className="text-slate-500">สิ้นสุด:</span>
                <div className="font-mono-data font-semibold text-slate-800 mt-0.5">
                  {selectedSyncRun.finishedAt}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white border border-[#E9E5F2] rounded-xl p-3">
                <div className="text-[11px] text-slate-500">อ่านได้ทั้งหมด</div>
                <div className="text-lg font-bold font-mono-data text-slate-900">
                  {selectedSyncRun.totalRead}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="text-[11px] text-emerald-700">เหตุการณ์ใหม่</div>
                <div className="text-lg font-bold font-mono-data text-emerald-700">
                  +{selectedSyncRun.newScans}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] text-slate-500">ซ้ำ (ข้าม)</div>
                <div className="text-lg font-bold font-mono-data text-slate-700">
                  {selectedSyncRun.duplicateScans}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-[11px] text-amber-800">ไม่พบ Mapping</div>
                <div className="text-lg font-bold font-mono-data text-amber-700">
                  {selectedSyncRun.unmappedScans}
                </div>
              </div>
            </div>
          </div>
        )}
      </SharedModal>
    </div>
  );
};
