import React, { useState, useMemo } from 'react';
import { mockAttendanceService } from '../services/mockAttendanceService';
import {
  PersonnelTypeScheduleRule,
  Shift,
  ShiftVisualCategory,
  ShiftConfigDeactivationLog,
} from '../types/attendance';
import { useAuth } from '../context/AuthContext';
import { SharedModal } from '../components/common/SharedModal';
import {
  SortableHeader,
  TablePaginationBar,
  PageSizeOption,
} from '../components/common/TablePaginationBar';
import {
  ShiftCategoryIcon,
  resolveShiftCategory,
  getShiftIconButtonClasses,
} from './PersonnelView';
import {
  Clock,
  RotateCcw,
  Save,
  Plus,
  Search,
  Edit3,
  Trash2,
  Sunrise,
  Sun,
  MoonStar,
  SunMoon,
  Clock3,
  CalendarClock,
  CheckCircle2,
  Layers,
  AlertTriangle,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Ban,
  Power,
  Info,
  History,
} from 'lucide-react';

const SHIFT_CATEGORY_OPTIONS: Array<{
  value: ShiftVisualCategory;
  label: string;
  desc: string;
}> = [
  { value: 'MORNING', label: 'กะเช้า (Sunrise)', desc: 'ไอคอนพระอาทิตย์ขึ้น สีเหลืองทอง' },
  { value: 'AFTERNOON', label: 'กะบ่าย (Sun)', desc: 'ไอคอนพระอาทิตย์กลางวัน สีส้ม' },
  { value: 'NIGHT', label: 'กะดึก (MoonStar)', desc: 'ไอคอนพระจันทร์และดาว สีคราม' },
  {
    value: 'MORNING_AFTERNOON',
    label: 'กะเช้า–บ่าย (Sunrise + Sun)',
    desc: 'กะควบเช้า–บ่ายในชุดไอคอนเดียว',
  },
  {
    value: 'AFTERNOON_NIGHT',
    label: 'กะบ่าย–ดึก (Sun + MoonStar)',
    desc: 'กะควบบ่าย–ดึกในชุดไอคอนเดียว',
  },
  { value: 'ALL_DAY', label: 'กะทั้งวัน (SunMoon)', desc: 'ไอคอนกลางวันและกลางคืน สีม่วงเข้ม' },
  { value: 'OFFICIAL', label: 'เวลาราชการ (Clock3)', desc: 'ไอคอนนาฬิกาเวลาราชการ สีม่วง' },
  {
    value: 'OTHER',
    label: 'กะพิเศษ / กะอื่น ๆ (CalendarClock)',
    desc: 'ไอคอนปฏิทินพร้อมนาฬิกา สีเทาอมม่วง',
  },
];

function shortShiftLabel(shift: Shift): string {
  const { category } = resolveShiftCategory(shift);
  if (category === 'OFFICIAL') return 'ราชการ';
  if (category === 'ALL_DAY') return 'ทั้งวัน';
  if (category === 'MORNING_AFTERNOON') return 'เช้า–บ่าย';
  if (category === 'AFTERNOON_NIGHT') return 'บ่าย–ดึก';
  if (category === 'MORNING') return 'เช้า';
  if (category === 'AFTERNOON') return 'บ่าย';
  if (category === 'NIGHT') return 'ดึก';
  const cleaned = shift.name.replace(/\(.*?\)/g, '').replace(/^กะ/, '').trim();
  return cleaned.length > 14 ? `${cleaned.slice(0, 12)}…` : cleaned || shift.code;
}

/**
 * Compute late cutoff time string (HH:mm) = startTime + graceMinutes
 */
function addMinutesToTimeStr(timeStr: string, addMins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return timeStr;
  const total = ((h * 60 + (m || 0) + (addMins || 0)) % 1440 + 1440) % 1440;
  const rH = String(Math.floor(total / 60)).padStart(2, '0');
  const rM = String(total % 60).padStart(2, '0');
  return `${rH}:${rM}`;
}

/**
 * Interactive & Collapsible 24-Hour / Cross-Midnight Visual Timeline (§14)
 * - Supports collapsible toggle (ย่อ/ขยายได้)
 * - Supports selecting an individual shift from the table OR viewing overview of active shifts
 * - Renders a continuous 2-Day track (Day 1 -> Day 2 +1 วัน) when inspecting a cross-midnight shift
 *   so cross-midnight shifts are never squashed or distorted into a single day!
 * - Shows real startTime, endTime, Grace Period window, and Late Cutoff marker.
 */
const InteractiveRuleTimeline: React.FC<{
  ruleShifts: Shift[];
  selectedShiftId: string | 'OVERVIEW';
  onSelectShiftId: (id: string | 'OVERVIEW') => void;
}> = ({ ruleShifts, selectedShiftId, onSelectShiftId }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const activeShifts = useMemo(
    () => ruleShifts.filter((s) => s.active),
    [ruleShifts]
  );

  const focusedShift = useMemo(() => {
    if (selectedShiftId === 'OVERVIEW') return null;
    return ruleShifts.find((s) => s.id === selectedShiftId) || null;
  }, [ruleShifts, selectedShiftId]);

  const toMinutes = (t: string, isEnd = false): number => {
    if (isEnd && (t === '24:00' || t === '00:00')) return 1440;
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  return (
    <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl overflow-hidden">
      {/* Collapsible Header Bar */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-white border-b border-[#E9E5F2]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-violet-600 shrink-0" />
          <span className="font-bold text-slate-900 text-xs">
            แถบเวลาปฏิบัติงาน 24 ชั่วโมง (24-Hour Visual Timeline)
          </span>
          {focusedShift ? (
            <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200 font-bold text-[11px]">
              กำลังดูกะ: {focusedShift.name} ({focusedShift.startTime}–{focusedShift.endTime} น.)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
              โหมดภาพรวมกะหลัก ({activeShifts.length} กะที่เปิดใช้งาน)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {focusedShift && (
            <button
              type="button"
              onClick={() => onSelectShiftId('OVERVIEW')}
              className="px-2.5 py-1 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 text-[11px] font-bold cursor-pointer"
            >
              ดูภาพรวมทุกกะ
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-violet-50 text-slate-700 text-[11px] font-bold cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-violet-600" />
                <span>ย่อ Timeline</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-violet-600" />
                <span>ขยายดู Timeline</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3.5 space-y-3">
          {/* Mandatory Disclaimers & Guidance (§14) */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-violet-50/70 border border-violet-200/80 rounded-lg px-3 py-2 text-violet-950">
            <div className="flex items-center gap-1.5 font-semibold">
              <Info className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <span>
                รายการกะในหน้านี้เป็นรูปแบบกะที่สามารถนำไปมอบหมายได้ ไม่ใช่ตารางเวรที่บุคลากรทุกคนต้องปฏิบัติงานพร้อมกัน
              </span>
            </div>
            <span className="text-slate-500">
              (คลิกเลือกกะจากปุ่มด้านล่างหรือตารางด้านล่างเพื่อดูช่วงเวลาเฉพาะกะ)
            </span>
          </div>

          {/* Shift Selector Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectShiftId('OVERVIEW')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                selectedShiftId === 'OVERVIEW'
                  ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-[#E9E5F2] hover:border-violet-300'
              }`}
            >
              ภาพรวมกะที่เปิดใช้งาน ({activeShifts.length})
            </button>
            {ruleShifts.map((sh) => {
              const { category } = resolveShiftCategory(sh);
              const isSelected = selectedShiftId === sh.id;
              return (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => onSelectShiftId(sh.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : sh.active
                      ? 'bg-white text-slate-800 border-[#E9E5F2] hover:border-violet-300'
                      : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                  }`}
                >
                  <ShiftCategoryIcon category={category} className="w-3.5 h-3.5" />
                  <span>{shortShiftLabel(sh)}</span>
                  <span className="font-mono-data text-[10px] opacity-80">
                    {sh.startTime}–{sh.endTime}
                  </span>
                </button>
              );
            })}
          </div>

          {/* CASE A: Single Focused Shift Timeline (Supports 24h or 48h Cross-Midnight Track) */}
          {focusedShift ? (
            (() => {
              const startM = toMinutes(focusedShift.startTime, false);
              let endM = toMinutes(focusedShift.endTime, true);
              const isTwoDayTrack =
                focusedShift.crossMidnight && endM < 1440 && endM <= startM;
              const totalTrackMins = isTwoDayTrack ? 2880 : 1440;
              if (isTwoDayTrack) {
                endM = 1440 + endM;
              } else if (endM <= startM) {
                endM = 1440;
              }

              const leftPct = Math.max(0, Math.min(100, (startM / totalTrackMins) * 100));
              const widthPct = Math.max(
                4,
                Math.min(100 - leftPct, ((endM - startM) / totalTrackMins) * 100)
              );
              const graceEndM = startM + (focusedShift.graceMinutes || 0);
              const cutoffPct = Math.max(
                0,
                Math.min(100, (graceEndM / totalTrackMins) * 100)
              );
              const graceWidthPct = Math.max(
                0.5,
                ((focusedShift.graceMinutes || 0) / totalTrackMins) * 100
              );
              const lateCutoffStr = addMinutesToTimeStr(
                focusedShift.startTime,
                focusedShift.graceMinutes
              );
              const { category, categoryLabel } = resolveShiftCategory(focusedShift);

              return (
                <div className="space-y-2 bg-white border border-[#E9E5F2] rounded-xl p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <ShiftCategoryIcon category={category} className="w-4 h-4" />
                      <span className="font-bold text-slate-900">
                        {focusedShift.name} ({categoryLabel})
                      </span>
                      <span className="font-mono-data font-bold text-violet-700">
                        {focusedShift.startTime} – {focusedShift.endTime} น.
                      </span>
                      {focusedShift.crossMidnight && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]">
                          +1 วัน (ข้ามเที่ยงคืน)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-700 font-semibold">
                        Grace Period: {focusedShift.graceMinutes} นาที ({focusedShift.startTime}–
                        {lateCutoffStr} น.)
                      </span>
                      <span className="text-rose-700 font-bold">
                        เส้นสีแดง = จุดตัดคิดสาย ({lateCutoffStr} น.)
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar (24h or 48h continuous for cross-midnight) */}
                  <div className="relative h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden">
                    {/* Midnight Divider when viewing 2-day cross-midnight track */}
                    {isTwoDayTrack && (
                      <div
                        style={{ left: '50%' }}
                        className="absolute inset-y-0 border-l-2 border-dashed border-indigo-400 z-10 flex items-start pl-1 pt-0.5"
                      >
                        <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50/90 px-1 rounded">
                          00:00 (เข้าสู่วันที่ +1)
                        </span>
                      </div>
                    )}

                    {/* Shift Interval Bar */}
                    <div
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className={`absolute inset-y-1 rounded-lg border flex items-center justify-center px-2 text-[11px] font-bold truncate ${getShiftIconButtonClasses(
                        category
                      )}`}
                    >
                      <ShiftCategoryIcon category={category} className="w-3.5 h-3.5 mr-1" />
                      <span>
                        {focusedShift.startTime}–{focusedShift.endTime}
                        {focusedShift.crossMidnight ? ' (+1 วัน)' : ''}
                      </span>
                    </div>

                    {/* Grace Period Window Highlight */}
                    {focusedShift.graceMinutes > 0 && (
                      <div
                        style={{ left: `${leftPct}%`, width: `${graceWidthPct}%` }}
                        className="absolute inset-y-1 bg-emerald-400/35 border-r border-emerald-600 z-20"
                        title={`ช่วง Grace Period อนุโลมสาย ${focusedShift.graceMinutes} นาที`}
                      />
                    )}

                    {/* Late Cutoff Marker Line */}
                    <div
                      style={{ left: `${cutoffPct}%` }}
                      className="absolute inset-y-0 w-0.5 bg-rose-600 z-30"
                      title={`จุดตัดคิดสาย ${lateCutoffStr} น.`}
                    />
                  </div>

                  {/* Scale */}
                  {isTwoDayTrack ? (
                    <div className="flex items-center justify-between text-[10px] font-mono-data text-slate-500 px-0.5">
                      <span>00:00 (วันที่ 1)</span>
                      <span>12:00</span>
                      <span className="font-bold text-indigo-700">24:00 / 00:00 (+1 วัน)</span>
                      <span>12:00 (+1 วัน)</span>
                      <span>24:00 (+1 วัน)</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px] font-mono-data text-slate-500 px-0.5">
                      <span>00:00</span>
                      <span>06:00</span>
                      <span className="font-bold text-violet-800">{focusedShift.startTime}</span>
                      <span>12:00</span>
                      <span className="font-bold text-violet-800">{focusedShift.endTime}</span>
                      <span>18:00</span>
                      <span>24:00</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            /* CASE B: Overview of All Active Shifts in Separate Lanes/Segments */
            <div className="space-y-1.5 bg-white border border-[#E9E5F2] rounded-xl p-3">
              {activeShifts.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">
                  ไม่มีกะที่เปิดใช้งานในประเภทบุคลากรนี้
                </div>
              ) : (
                activeShifts.map((sh) => {
                  const sM = toMinutes(sh.startTime, false);
                  let eM = toMinutes(sh.endTime, true);
                  const extendsNextDay = sh.crossMidnight && eM < 1440 && eM <= sM;
                  const firstDayEndM = extendsNextDay ? 1440 : Math.max(sM + 30, eM);
                  const leftPct = Math.max(0, Math.min(100, (sM / 1440) * 100));
                  const widthPct = Math.max(
                    5,
                    Math.min(100 - leftPct, ((firstDayEndM - sM) / 1440) * 100)
                  );
                  const nextDayWidthPct = extendsNextDay
                    ? Math.max(4, Math.min(100, (eM / 1440) * 100))
                    : 0;
                  const cutoffMins = sM + (sh.graceMinutes || 0);
                  const cutoffPct = Math.max(0, Math.min(100, (cutoffMins / 1440) * 100));
                  const lateCutoffStr = addMinutesToTimeStr(sh.startTime, sh.graceMinutes);
                  const { category } = resolveShiftCategory(sh);

                  return (
                    <div
                      key={sh.id}
                      onClick={() => onSelectShiftId(sh.id)}
                      className="grid grid-cols-12 items-center gap-2 py-1 hover:bg-violet-50/50 rounded-lg px-1.5 cursor-pointer transition-colors"
                      title="คลิกเพื่อดูไทม์ไลน์เฉพาะกะนี้แบบละเอียด"
                    >
                      <div className="col-span-4 sm:col-span-3 flex items-center gap-1.5 truncate text-[11px]">
                        <ShiftCategoryIcon category={category} className="w-3.5 h-3.5" />
                        <span className="font-bold text-slate-800 truncate">{sh.name}</span>
                      </div>
                      <div className="col-span-8 sm:col-span-9 relative h-6 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden">
                        {/* Next-day spillover segment (00:00..endTime) for cross-midnight shifts */}
                        {extendsNextDay && nextDayWidthPct > 0 && (
                          <div
                            style={{ left: '0%', width: `${nextDayWidthPct}%` }}
                            className="absolute inset-y-0.5 rounded-r bg-indigo-200/70 border-r border-dashed border-indigo-500 flex items-center justify-center text-[9px] font-mono font-bold text-indigo-950 px-1 truncate"
                          >
                            → {sh.endTime} (+1 วัน)
                          </div>
                        )}
                        {/* Main segment */}
                        <div
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className={`absolute inset-y-0.5 rounded border flex items-center justify-between px-1.5 text-[10px] font-mono-data font-bold truncate ${getShiftIconButtonClasses(
                            category
                          )}`}
                        >
                          <span>
                            {sh.startTime}–{sh.endTime}
                            {sh.crossMidnight ? ' (+1 วัน)' : ''}
                          </span>
                          <span className="text-[9px] opacity-75 hidden sm:inline">
                            สายหลัง {lateCutoffStr}
                          </span>
                        </div>
                        {/* Late Cutoff Line */}
                        <div
                          style={{ left: `${cutoffPct}%` }}
                          className="absolute inset-y-0 w-0.5 bg-rose-600 z-20"
                          title={`จุดตัดคิดสาย ${lateCutoffStr} น. (Grace ${sh.graceMinutes} นาที)`}
                        />
                      </div>
                    </div>
                  );
                })
              )}

              {/* 24h Scale */}
              <div className="grid grid-cols-12 gap-2 pt-1 border-t border-slate-100">
                <div className="col-span-4 sm:col-span-3 text-[10px] text-slate-400 font-semibold">
                  สเกลเวลา 24 ชม.
                </div>
                <div className="col-span-8 sm:col-span-9 flex items-center justify-between text-[10px] font-mono-data text-slate-500">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>24:00</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ShiftsView: React.FC = () => {
  const { currentUser } = useAuth();
  const canManageShifts =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'RESPONSIBLE_STAFF';

  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMsg, setToastMsg] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  // Filter, Sort & Pagination for Personnel Type Schedule Matrix Table
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);

  // Modal 1: "รายละเอียดกติกาเวลากะ" (Inspect & Direct Shift Management Modal per Part 2 §8–§14)
  const [inspectRuleId, setInspectRuleId] = useState<string | null>(null);
  const [timelineSelectedShiftId, setTimelineSelectedShiftId] = useState<string | 'OVERVIEW'>(
    'OVERVIEW'
  );

  // Inline / Sub-Dialog Form inside "รายละเอียดกติกาเวลากะ" for Add / Edit Individual Shift (§10 & §11)
  const [shiftSubForm, setShiftSubForm] = useState<{
    mode: 'ADD' | 'EDIT';
    ruleId: string;
    originalShift?: Shift;
    id?: string;
    code: string;
    name: string;
    category: ShiftVisualCategory;
    startTime: string;
    endTime: string;
    crossMidnight: boolean;
    graceMinutes: number;
    active: boolean;
  } | null>(null);
  const [shiftSubFormError, setShiftSubFormError] = useState<string | null>(null);

  // Deactivate Shift Confirmation Sub-Dialog (§12)
  const [deactivateTargetShift, setDeactivateTargetShift] = useState<{
    shift: Shift;
    ruleId?: string;
    reason: string;
  } | null>(null);

  // Modal 2: Add / Edit PersonnelTypeScheduleRule metadata
  const [editingRule, setEditingRule] = useState<Partial<PersonnelTypeScheduleRule> | null>(
    null
  );
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);

  // Separate Confirmation Popup for Personnel-Type-Level Enable/Disable (§13)
  const [confirmRuleStatusAction, setConfirmRuleStatusAction] = useState<{
    rule: PersonnelTypeScheduleRule;
    targetActive: boolean;
  } | null>(null);

  // Deactivation History Modal
  const [isDeactivationHistoryOpen, setIsDeactivationHistoryOpen] = useState(false);

  // Fetch data from Mock Service
  const rules = useMemo(
    () => mockAttendanceService.getPersonnelTypeRules(),
    [refreshKey]
  );
  const shifts = useMemo(() => mockAttendanceService.getShifts(), [refreshKey]);
  const shiftsMap = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach((s) => map.set(s.id, s));
    return map;
  }, [shifts]);
  const personnelList = useMemo(
    () => mockAttendanceService.getPersonnel(),
    [refreshKey]
  );
  const deactivationLogs: ShiftConfigDeactivationLog[] = useMemo(
    () => mockAttendanceService.getShiftConfigDeactivationLogs(),
    [refreshKey]
  );

  // Active inspected rule resolved live from `rules` so any shift add/edit/deactivate inside the modal updates immediately
  const inspectRule = useMemo(
    () => (inspectRuleId ? rules.find((r) => r.id === inspectRuleId) || null : null),
    [rules, inspectRuleId]
  );

  const inspectRuleShifts = useMemo(
    () =>
      inspectRule
        ? mockAttendanceService.getShiftsForPersonnelTypeRule(inspectRule.id)
        : [],
    [inspectRule, refreshKey]
  );

  // Count how many personnel in HR match each personnelType name
  const countPersonnelByType = (typeName: string) => {
    return personnelList.filter(
      (p) => p.personnelType === typeName || typeName.includes(p.personnelType)
    ).length;
  };

  // Filtered & Sorted rules for Compact Summary Table
  const filteredAndSortedRules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = rules.filter((r) => {
      if (statusFilter === 'ACTIVE' && !r.active) return false;
      if (statusFilter === 'INACTIVE' && r.active) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const dir = sortDir === 'ASC' ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name, 'th') * dir;
        case 'personCount':
          return (countPersonnelByType(a.name) - countPersonnelByType(b.name)) * dir;
        case 'morningStart': {
          const valA = a.hasMorning === false ? '99:99' : a.morningStart;
          const valB = b.hasMorning === false ? '99:99' : b.morningStart;
          return valA.localeCompare(valB) * dir;
        }
        case 'afternoonStart': {
          const valA = a.hasAfternoon === false ? '99:99' : a.afternoonStart;
          const valB = b.hasAfternoon === false ? '99:99' : b.afternoonStart;
          return valA.localeCompare(valB) * dir;
        }
        case 'nightStart': {
          const valA = a.hasNight === false ? '99:99' : a.nightStart;
          const valB = b.hasNight === false ? '99:99' : b.nightStart;
          return valA.localeCompare(valB) * dir;
        }
        case 'otherShifts':
          return ((a.otherShiftIds?.length || 0) - (b.otherShiftIds?.length || 0)) * dir;
        case 'active':
          return (Number(b.active) - Number(a.active)) * dir;
        default:
          return 0;
      }
    });
  }, [rules, searchQuery, statusFilter, sortKey, sortDir, personnelList]);

  const pagedRules = useMemo(() => {
    if (pageSize === 'ALL') return filteredAndSortedRules;
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRules.slice(start, start + pageSize);
  }, [filteredAndSortedRules, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortKey(key);
      setSortDir('ASC');
    }
    setCurrentPage(1);
  };

  // Open "+ เพิ่มกะ" sub-dialog inside "รายละเอียดกติกาเวลากะ" (§10)
  const handleOpenAddShiftInModal = (rule: PersonnelTypeScheduleRule) => {
    if (!canManageShifts) return;
    setShiftSubFormError(null);
    setShiftSubForm({
      mode: 'ADD',
      ruleId: rule.id,
      code: `SH_${rule.code.slice(0, 4)}_${inspectRuleShifts.length + 1}`,
      name: '',
      category: 'OTHER',
      startTime: '08:00',
      endTime: '16:00',
      crossMidnight: false,
      graceMinutes: 15,
      active: true,
    });
  };

  // Open Edit Individual Shift sub-dialog inside "รายละเอียดกติกาเวลากะ" (§11)
  const handleOpenEditShiftInModal = (rule: PersonnelTypeScheduleRule, sh: Shift) => {
    if (!canManageShifts) return;
    setShiftSubFormError(null);
    const { category } = resolveShiftCategory(sh);
    setShiftSubForm({
      mode: 'EDIT',
      ruleId: rule.id,
      originalShift: { ...sh },
      id: sh.id,
      code: sh.code,
      name: sh.name,
      category,
      startTime: sh.startTime,
      endTime: sh.endTime,
      crossMidnight: sh.crossMidnight,
      graceMinutes: sh.graceMinutes,
      active: sh.active,
    });
  };

  // Compute similarity / overlap advisory warnings for the Shift Sub-Form (§10)
  const shiftSubFormAdvisory = useMemo(() => {
    if (!shiftSubForm) return { warnings: [], futureImpact: [] };
    const warnings: string[] = [];
    const peerShifts = mockAttendanceService
      .getShiftsForPersonnelTypeRule(shiftSubForm.ruleId)
      .filter((s) => s.id !== shiftSubForm.id);

    const candidateShift: Shift = {
      id: shiftSubForm.id || 'TEMP_CANDIDATE',
      code: shiftSubForm.code,
      name: shiftSubForm.name.trim(),
      category: shiftSubForm.category,
      startTime: shiftSubForm.startTime,
      endTime: shiftSubForm.endTime,
      crossMidnight: shiftSubForm.crossMidnight,
      graceMinutes: shiftSubForm.graceMinutes,
      earlyScanWindowMinutes: 60,
      lateScanWindowMinutes: 120,
      active: shiftSubForm.active,
    };

    for (const peer of peerShifts) {
      if (
        peer.startTime === candidateShift.startTime &&
        peer.endTime === candidateShift.endTime &&
        peer.crossMidnight === candidateShift.crossMidnight
      ) {
        warnings.push(
          `ช่วงเวลา ${candidateShift.startTime}–${candidateShift.endTime} น. ตรงกับกะ "${peer.name}" ที่มีอยู่แล้ว`
        );
      } else if (
        mockAttendanceService.doShiftsOverlap(
          peer,
          candidateShift,
          '2026-11-06',
          '2026-11-06'
        )
      ) {
        warnings.push(
          `ช่วงเวลาซ้อนทับกับกะ "${peer.name}" (${peer.startTime}–${peer.endTime} น.) — สามารถบันทึกเป็นตัวเลือกแม่แบบกะได้ แต่ระบบจะป้องกันการมอบหมายซ้อนทับกันในหน้า Personnel Roster`
        );
      }
    }

    const futureImpact =
      shiftSubForm.mode === 'EDIT' && shiftSubForm.id
        ? mockAttendanceService.getFutureAssignmentsByShift(shiftSubForm.id)
        : [];

    return { warnings, futureImpact };
  }, [shiftSubForm]);

  // Save Add / Edit Shift inside "รายละเอียดกติกาเวลากะ" (§10 & §11)
  const handleSaveShiftSubForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts || !shiftSubForm) return;

    const trimmedName = shiftSubForm.name.trim();
    if (!trimmedName) {
      setShiftSubFormError('กรุณาระบุชื่อกะเวลา');
      return;
    }
    if (!shiftSubForm.startTime || !shiftSubForm.endTime) {
      setShiftSubFormError('กรุณาระบุเวลาเริ่มต้นและเวลาสิ้นสุดให้ครบถ้วน');
      return;
    }
    if (shiftSubForm.graceMinutes < 0 || isNaN(shiftSubForm.graceMinutes)) {
      setShiftSubFormError('ค่า Grace Period ต้องไม่ติดลบ (อย่างน้อย 0 นาที)');
      return;
    }

    const [sH, sM] = shiftSubForm.startTime.split(':').map(Number);
    const [eH, eM] = shiftSubForm.endTime.split(':').map(Number);
    const sTotal = (sH || 0) * 60 + (sM || 0);
    const eTotal =
      shiftSubForm.endTime === '00:00' || shiftSubForm.endTime === '24:00'
        ? 1440
        : (eH || 0) * 60 + (eM || 0);

    if (eTotal <= sTotal && !shiftSubForm.crossMidnight) {
      setShiftSubFormError(
        'เวลาสิ้นสุดน้อยกว่าหรือเท่ากับเวลาเริ่มต้น กรุณาเปิดตัวเลือก "กะข้ามเที่ยงคืน (+1 วัน)" หรือปรับเวลาสิ้นสุดใหม่'
      );
      return;
    }

    // Block exact duplicate shift (same name + same startTime + same endTime) within this rule
    const peerShifts = mockAttendanceService
      .getShiftsForPersonnelTypeRule(shiftSubForm.ruleId)
      .filter((s) => s.id !== shiftSubForm.id);
    const exactDup = peerShifts.find(
      (s) =>
        s.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        s.startTime === shiftSubForm.startTime &&
        s.endTime === shiftSubForm.endTime
    );
    if (exactDup) {
      setShiftSubFormError(
        `ไม่สามารถบันทึกกะซ้ำทุกประการได้: มีกะ "${exactDup.name}" (${exactDup.startTime}–${exactDup.endTime}) อยู่แล้ว`
      );
      return;
    }

    const saved = mockAttendanceService.saveShift(
      {
        id: shiftSubForm.id,
        code: shiftSubForm.code.trim() || `SH_${Date.now()}`,
        name: trimmedName,
        category: shiftSubForm.category,
        startTime: shiftSubForm.startTime,
        endTime: shiftSubForm.endTime,
        crossMidnight: shiftSubForm.crossMidnight,
        graceMinutes: shiftSubForm.graceMinutes,
        active: shiftSubForm.active,
      },
      {
        ruleId: shiftSubForm.ruleId,
        updateFutureAssignments: true,
      }
    );

    const wasEdit = shiftSubForm.mode === 'EDIT';
    setShiftSubForm(null);
    setShiftSubFormError(null);
    setTimelineSelectedShiftId(saved.id);
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: 'success',
      text: wasEdit
        ? `บันทึกการแก้ไขกะ "${saved.name}" (${saved.startTime}–${saved.endTime} น.) สำเร็จ (ไม่กระทบกะย้อนหลังในอดีต)`
        : `เพิ่มกะใหม่ "${saved.name}" (${saved.startTime}–${saved.endTime} น.) ในกติกากะและซิงค์ไปยัง Personnel Roster สำเร็จ`,
    });
  };

  // Confirm Deactivate Individual Shift (§12)
  const handleConfirmDeactivateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts || !deactivateTargetShift) return;

    const res = mockAttendanceService.deactivateShiftInConfig({
      shiftId: deactivateTargetShift.shift.id,
      ruleId: deactivateTargetShift.ruleId,
      reason: deactivateTargetShift.reason || 'ยกเลิกการใช้งานกะเวลาในตารางกติกากะ',
      actorName: currentUser?.fullName || 'เจ้าหน้าที่ HR (Sam_Att)',
    });

    setDeactivateTargetShift(null);
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: 'warning',
      text: `ยกเลิกการใช้งานกะ "${res.shift?.name}" (สถานะ Inactive) เรียบร้อยแล้ว · รายการจัดกะล่วงหน้า ${res.futureAffectedCount} รายการและข้อมูลสแกนเดิมไม่ถูกลบ`,
    });
  };

  // Reactivate an Inactive Shift
  const handleReactivateShift = (shift: Shift, ruleId?: string) => {
    if (!canManageShifts) return;
    mockAttendanceService.reactivateShiftInConfig(shift.id, ruleId);
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: 'success',
      text: `เปิดใช้งานกะ "${shift.name}" (${shift.startTime}–${shift.endTime} น.) อีกครั้งเรียบร้อยแล้ว`,
    });
  };

  // Handlers for PersonnelTypeScheduleRule metadata Add/Edit
  const handleOpenAddRule = () => {
    if (!canManageShifts) return;
    setRuleFormError(null);
    setEditingRule({
      code: `PT_CUSTOM_${rules.length + 1}`,
      name: '',
      description: '',
      badgeChar: 'บ',
      hasMorning: true,
      morningShiftId: 'SH01',
      morningStart: '08:15',
      morningEnd: '16:00',
      morningLateCutoff: '08:15',
      morningGraceMinutes: 15,
      hasAfternoon: true,
      afternoonShiftId: 'SH02',
      afternoonStart: '16:00',
      afternoonEnd: '24:00',
      afternoonLateCutoff: '16:00',
      afternoonGraceMinutes: 15,
      hasNight: true,
      nightShiftId: 'SH03',
      nightStart: '00:00',
      nightEnd: '08:00',
      nightCrossMidnight: true,
      nightGraceMinutes: 15,
      otherShiftIds: ['SH04'],
      shiftIds: ['SH01', 'SH02', 'SH03', 'SH04'],
      active: true,
    });
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageShifts || !editingRule || !editingRule.name?.trim()) {
      setRuleFormError('กรุณาระบุชื่อประเภทบุคลากร');
      return;
    }

    const saved = mockAttendanceService.savePersonnelTypeRule({
      ...editingRule,
      name: editingRule.name.trim(),
      code: editingRule.code || `PT_${Date.now()}`,
      morningLateCutoff: editingRule.morningLateCutoff || editingRule.morningStart || '08:15',
      afternoonLateCutoff:
        editingRule.afternoonLateCutoff || editingRule.afternoonStart || '16:00',
    });

    setEditingRule(null);
    setRuleFormError(null);
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: 'success',
      text: `บันทึกข้อมูลประเภทบุคลากร "${saved.name}" สำเร็จ`,
    });
  };

  // Confirm Personnel-Type-Level Status Change (§13)
  const handleConfirmRuleStatusToggle = () => {
    if (!canManageShifts || !confirmRuleStatusAction) return;
    const { rule, targetActive } = confirmRuleStatusAction;
    mockAttendanceService.savePersonnelTypeRule({
      ...rule,
      active: targetActive,
    });
    setConfirmRuleStatusAction(null);
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: targetActive ? 'success' : 'warning',
      text: targetActive
        ? `เปิดใช้งานประเภทบุคลากร "${rule.name}" เรียบร้อยแล้ว`
        : `ปิดใช้งานประเภทบุคลากร "${rule.name}" เรียบร้อยแล้ว (กะรายรายการและข้อมูลบุคลากรใน HOSOffice ไม่ถูกลบ)`,
    });
  };

  const handleResetDefault = () => {
    if (!canManageShifts) return;
    mockAttendanceService.resetPersonnelTypeRulesToDefault();
    setRefreshKey((k) => k + 1);
    setToastMsg({
      type: 'success',
      text: 'คืนค่าเริ่มต้นตารางกติกากะทั้ง 6 ประเภทบุคลากรและแม่แบบกะทั้งหมดเรียบร้อยแล้ว',
    });
  };

  return (
    <div className="space-y-5 pb-8">
      {/* =================================================================
          1. TOP HEADER BAR
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200 font-bold">
                SCHEDULE MATRIX & DIRECT SHIFT MANAGEMENT
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 font-medium">รพ.สามชุก จ.สุพรรณบุรี</span>
              <span className="text-slate-400">·</span>
              <span className="text-violet-700 font-semibold">
                คลิกที่ประเภทบุคลากรเพื่อเพิ่ม แก้ไข และยกเลิกการใช้งานกะได้โดยตรงในหน้าต่างเดียว
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-violet-600 shrink-0" />
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                ตั้งค่าประเภทบุคลากรและช่วงเวลากะ (Personnel Schedule Matrix)
              </h1>
            </div>

            <p className="text-xs text-slate-500">
              แสดงตารางสรุปเวลาเริ่ม–เลิกงานของทุกประเภทบุคลากร คลิกที่แถวหรือปุ่ม &ldquo;รายละเอียด / จัดการกะ&rdquo; เพื่อเปิดตารางจัดการกะทุกประเภทพร้อม 24-Hour Visual Timeline
            </p>
          </div>

          {/* Right Action Toolbar */}
          {canManageShifts && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDeactivationHistoryOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E5F2] bg-[#F8F7FC] hover:bg-violet-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-violet-600" />
                <span>ประวัติยกเลิกใช้งานกะ ({deactivationLogs.length})</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefault}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E9E5F2] bg-white hover:bg-violet-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>คืนค่าเริ่มต้น</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setToastMsg({
                    type: 'success',
                    text: 'บันทึกตารางกติกากะทั้งหมดลงในสถานะจำลอง (Mock State) เรียบร้อยแล้ว',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800 text-xs font-bold transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-violet-600" />
                <span>บันทึกการตั้งค่า (Mock)</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddRule}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มประเภทบุคลากร</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {toastMsg && (
        <div
          className={`rounded-2xl px-4 py-3 text-xs flex items-center justify-between shadow-2xs border ${
            toastMsg.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-violet-50 border-violet-200 text-violet-950'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {toastMsg.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="p-1 text-slate-600 hover:text-slate-950 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =================================================================
          2. FOUR SUMMARY KPI CARDS
         ================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-600">ประเภทบุคลากรทั้งหมด</div>
          <div className="my-1.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono-data text-slate-900">
              {rules.length}
            </span>
            <span className="text-xs text-slate-500">ประเภท</span>
          </div>
          <div className="text-[11px] font-semibold text-violet-700">
            เปิดใช้งาน {rules.filter((r) => r.active).length} รายการ
          </div>
        </div>

        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-600">แม่แบบกะเวลาในระบบ</div>
          <div className="my-1.5 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono-data text-violet-700">
              {shifts.filter((s) => s.active).length}
            </span>
            <span className="text-xs text-slate-500">
              / {shifts.length} กะ (Active)
            </span>
          </div>
          <div className="text-[11px] font-semibold text-emerald-700">
            ซิงค์กับหน้า Personnel Roster อัตโนมัติ
          </div>
        </div>

        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-600">กะเช้า ข้าราชการ / พกส.</div>
          <div className="my-1.5 flex items-baseline gap-1.5 font-mono-data">
            <span className="text-2xl font-bold text-slate-900">08:15</span>
            <span className="text-xs text-slate-500">– 16:00 น.</span>
          </div>
          <div className="text-[11px] text-slate-500">สแกนเข้าเกินจุดตัดสายคิดสายทันที</div>
        </div>

        <div className="bg-white border border-[#E9E5F2] rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-600">กะเช้า ลูกจ้างรายวัน / รายเดือน</div>
          <div className="my-1.5 flex items-baseline gap-1.5 font-mono-data">
            <span className="text-2xl font-bold text-slate-900">07:30</span>
            <span className="text-xs text-slate-500">– 16:00 น.</span>
          </div>
          <div className="text-[11px] text-slate-500">สแกนเข้าเกินจุดตัดสายคิดสายทันที</div>
        </div>
      </div>

      {/* =================================================================
          3. SEARCH BAR & STATUS FILTER
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex items-center gap-2 bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาชื่อประเภทบุคลากร, รหัส, คำอธิบาย..."
              className="w-full bg-transparent text-slate-800 focus:outline-none"
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

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
              setCurrentPage(1);
            }}
            className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">ทุกสถานะประเภทบุคลากร ({rules.length})</option>
            <option value="ACTIVE">
              เฉพาะที่เปิดใช้งาน ({rules.filter((r) => r.active).length})
            </option>
            <option value="INACTIVE">
              ปิดใช้งาน ({rules.filter((r) => !r.active).length})
            </option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Sunrise className="w-3.5 h-3.5 text-amber-500" />
            <span>เช้า</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-orange-500" />
            <span>บ่าย</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MoonStar className="w-3.5 h-3.5 text-indigo-600" />
            <span>ดึก</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="w-3.5 h-3.5 text-purple-600" />
            <span>ราชการ</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <SunMoon className="w-3.5 h-3.5 text-violet-600" />
            <span>ทั้งวัน</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5 text-slate-600" />
            <span>กะพิเศษ</span>
          </span>
        </div>
      </div>

      {/* =================================================================
          4. COMPACT SUMMARY TABLE OF PERSONNEL TYPE SCHEDULE RULES
         ================================================================= */}
      <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <span>ตารางสรุปประเภทบุคลากรและช่วงเวลากะ (Compact Summary Table)</span>
            <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-[11px]">
              คลิกที่แถวเพื่อเปิดหน้าต่าง &ldquo;รายละเอียดกติกาเวลากะ&rdquo; (เพิ่ม / แก้ไข / ยกเลิกกะได้โดยตรง)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F7FC] border-b border-[#E9E5F2] text-slate-600 font-semibold">
                <SortableHeader
                  label="ประเภทบุคลากร"
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="จำนวนบุคลากร"
                  sortKey="personCount"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeader
                  label="กะเช้า"
                  sortKey="morningStart"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="กะบ่าย"
                  sortKey="afternoonStart"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="กะดึก"
                  sortKey="nightStart"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="กะอื่น ๆ / กะควบ"
                  sortKey="otherShifts"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="สถานะประเภท"
                  sortKey="active"
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <th className="py-2.5 px-3 text-center font-semibold text-slate-600">
                  จัดการกติกากะ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E5F2]">
              {pagedRules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    ไม่พบประเภทบุคลากรตามคำค้นหาหรือตัวกรองที่เลือก
                  </td>
                </tr>
              ) : (
                pagedRules.map((rule) => {
                  const personCount = countPersonnelByType(rule.name);
                  const hasMorning = rule.hasMorning !== false;
                  const hasAfternoon = rule.hasAfternoon !== false;
                  const hasNight = rule.hasNight !== false;
                  const otherShiftsList = (rule.otherShiftIds || [])
                    .map((id) => shiftsMap.get(id))
                    .filter((s): s is Shift => !!s);

                  return (
                    <tr
                      key={rule.id}
                      onClick={() => {
                        setInspectRuleId(rule.id);
                        setTimelineSelectedShiftId('OVERVIEW');
                        setShiftSubForm(null);
                      }}
                      className="hover:bg-violet-50/50 transition-colors cursor-pointer"
                    >
                      {/* 1. ประเภทบุคลากร */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-violet-100 border border-violet-200 text-violet-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {rule.badgeChar}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{rule.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {rule.description}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. จำนวนบุคลากร */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 font-mono-data font-bold text-xs">
                          {personCount}{' '}
                          <span className="font-sans font-normal text-[11px]">คน</span>
                        </span>
                      </td>

                      {/* 3. กะเช้า */}
                      <td className="py-3 px-3">
                        {hasMorning ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50/90 border border-amber-200 text-amber-950">
                            <Sunrise className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <div>
                              <div className="font-mono-data font-bold text-xs leading-tight">
                                {rule.morningStart}–{rule.morningEnd}
                              </div>
                              <div className="text-[10px] text-amber-800">
                                Grace {rule.morningGraceMinutes ?? 15} นาที
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-sm px-2">—</span>
                        )}
                      </td>

                      {/* 4. กะบ่าย */}
                      <td className="py-3 px-3">
                        {hasAfternoon ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50/90 border border-orange-200 text-orange-950">
                            <Sun className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <div>
                              <div className="font-mono-data font-bold text-xs leading-tight">
                                {rule.afternoonStart}–{rule.afternoonEnd}
                              </div>
                              <div className="text-[10px] text-orange-800">
                                Grace {rule.afternoonGraceMinutes ?? 15} นาที
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-sm px-2">—</span>
                        )}
                      </td>

                      {/* 5. กะดึก */}
                      <td className="py-3 px-3">
                        {hasNight ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/90 border border-indigo-200 text-indigo-950">
                            <MoonStar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <div>
                              <div className="font-mono-data font-bold text-xs leading-tight">
                                {rule.nightStart}–{rule.nightEnd}
                              </div>
                              <div className="text-[10px] text-indigo-700">
                                {rule.nightCrossMidnight ? 'เวรข้ามคืน (+1 วัน)' : 'ภายในวันเดียว'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-sm px-2">—</span>
                        )}
                      </td>

                      {/* 6. กะอื่น ๆ */}
                      <td className="py-3 px-3">
                        {otherShiftsList.length === 0 ? (
                          <span className="text-slate-400 font-mono text-sm px-2">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {otherShiftsList.slice(0, 2).map((sh) => {
                              const { category } = resolveShiftCategory(sh);
                              return (
                                <span
                                  key={sh.id}
                                  title={`${sh.name} (${sh.startTime}–${sh.endTime} น.)`}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] ${
                                    sh.active
                                      ? 'bg-purple-50/90 border-purple-200 text-purple-950'
                                      : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                                  }`}
                                >
                                  <ShiftCategoryIcon
                                    category={category}
                                    className="w-3 h-3"
                                  />
                                  <span className="font-bold">{shortShiftLabel(sh)}</span>
                                  <span className="font-mono-data text-[10px] opacity-80">
                                    {sh.startTime}–{sh.endTime}
                                  </span>
                                </span>
                              );
                            })}
                            {otherShiftsList.length > 2 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-800 border border-violet-200 font-mono-data font-bold text-[10px]">
                                +{otherShiftsList.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 7. สถานะ */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            rule.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              rule.active ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          />
                          {rule.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>

                      {/* 8. จัดการ */}
                      <td
                        className="py-3 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectRuleId(rule.id);
                              setTimelineSelectedShiftId('OVERVIEW');
                              setShiftSubForm(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>รายละเอียด / จัดการกะ</span>
                          </button>

                          {canManageShifts && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmRuleStatusAction({
                                  rule,
                                  targetActive: !rule.active,
                                })
                              }
                              title={
                                rule.active
                                  ? 'ปิดใช้งานประเภทบุคลากรนี้'
                                  : 'เปิดใช้งานประเภทบุคลากรนี้'
                              }
                              className="p-1.5 rounded-lg border border-[#E9E5F2] text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationBar
          totalItems={filteredAndSortedRules.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* =================================================================
          MODAL 1 (PART 2 §8–§14): "รายละเอียดกติกาเวลากะ"
          - Unified Compact Table of ALL shifts (Morning, Afternoon, Night, Combined, All-Day, Official, Custom)
          - "+ เพิ่มกะ" button & Inline/Sub-Dialog Form
          - Edit Individual Shift with Before/After comparison & future impact preview
          - Deactivate Individual Shift with Confirmation Dialog & future impact preview
          - Collapsible & Selectable 24-Hour Visual Timeline
          - Strict separation between Shift-Level controls and Personnel-Type-Level status
         ================================================================= */}
      <SharedModal
        open={!!inspectRule}
        onClose={() => {
          setInspectRuleId(null);
          setShiftSubForm(null);
          setShiftSubFormError(null);
        }}
        title={inspectRule ? `รายละเอียดกติกาเวลากะ — ${inspectRule.name}` : ''}
        subtitle={
          inspectRule
            ? `${inspectRule.description} · จัดการเพิ่ม แก้ไข และยกเลิกการใช้งานกะได้โดยตรงในหน้าต่างเดียว`
            : ''
        }
        badgeText={inspectRule?.code}
        maxWidthClass="max-w-4xl"
      >
        {inspectRule && (
          <div className="space-y-4 text-xs">
            {/* 1. Top Personnel Type Summary Banner */}
            <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 border border-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center">
                  {inspectRule.badgeChar}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>{inspectRule.name}</span>
                    <span className="font-mono text-xs text-violet-700">
                      ({inspectRule.code})
                    </span>
                  </div>
                  <div className="text-slate-500">
                    บุคลากรในระบบ HR ที่สังกัดประเภทนี้:{' '}
                    <strong className="text-violet-700 font-mono-data">
                      {countPersonnelByType(inspectRule.name)} คน
                    </strong>{' '}
                    · กะที่ผูกไว้ทั้งหมด:{' '}
                    <strong className="text-slate-800 font-mono-data">
                      {inspectRuleShifts.length} กะ
                    </strong>{' '}
                    (เปิดใช้งาน{' '}
                    <strong className="text-emerald-700 font-mono-data">
                      {inspectRuleShifts.filter((s) => s.active).length} กะ
                    </strong>
                    )
                  </div>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  inspectRule.active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                สถานะประเภทบุคลากร:{' '}
                {inspectRule.active ? 'เปิดใช้งาน (Active)' : 'ปิดใช้งาน (Inactive)'}
              </span>
            </div>

            {/* 2. Collapsible & Interactive 24-Hour Visual Timeline (§14) */}
            <InteractiveRuleTimeline
              ruleShifts={inspectRuleShifts}
              selectedShiftId={timelineSelectedShiftId}
              onSelectShiftId={setTimelineSelectedShiftId}
            />

            {/* 3. Inline Add / Edit Shift Sub-Dialog Form (Shown when clicking "+ เพิ่มกะ" or "แก้ไขกะ" per §10 & §11) */}
            {shiftSubForm && canManageShifts && (
              <form
                onSubmit={handleSaveShiftSubForm}
                className="bg-violet-50/60 border-2 border-violet-300 rounded-2xl p-4 space-y-3.5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-violet-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShiftCategoryIcon
                      category={shiftSubForm.category}
                      className="w-4 h-4"
                    />
                    <span className="font-bold text-slate-900 text-sm">
                      {shiftSubForm.mode === 'ADD'
                        ? `เพิ่มกะเวลาใหม่ในประเภท "${inspectRule.name}"`
                        : `แก้ไขกะเวลา — ${shiftSubForm.originalShift?.name}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftSubForm(null);
                      setShiftSubFormError(null);
                    }}
                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Before vs After Comparison when Editing (§11) */}
                {shiftSubForm.mode === 'EDIT' && shiftSubForm.originalShift && (
                  <div className="bg-white border border-violet-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="text-slate-500 font-semibold">
                        ค่าเดิมก่อนแก้ไข (Original Values):
                      </div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {shiftSubForm.originalShift.name} ·{' '}
                        <span className="font-mono-data text-violet-800">
                          {shiftSubForm.originalShift.startTime}–
                          {shiftSubForm.originalShift.endTime} น.
                        </span>{' '}
                        · Grace {shiftSubForm.originalShift.graceMinutes} นาที
                        {shiftSubForm.originalShift.crossMidnight
                          ? ' · ข้ามวัน (+1 วัน)'
                          : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-semibold">
                        ผลกระทบต่อตารางกะล่วงหน้า (Future ShiftAssignment):
                      </div>
                      <div className="font-bold text-emerald-800 mt-0.5">
                        มีรายการจัดกะล่วงหน้าที่ใช้กะนี้{' '}
                        <span className="font-mono-data">
                          {shiftSubFormAdvisory.futureImpact.length}
                        </span>{' '}
                        รายการ (กะย้อนหลังในอดีตจะไม่ถูกแก้ไข)
                      </div>
                    </div>
                  </div>
                )}

                {shiftSubFormError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-2.5 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{shiftSubFormError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      ชื่อกะเวลา (Shift Name): *
                    </label>
                    <input
                      type="text"
                      required
                      value={shiftSubForm.name}
                      onChange={(e) =>
                        setShiftSubForm({ ...shiftSubForm, name: e.target.value })
                      }
                      placeholder="เช่น กะเช้าพยาบาล (08:00 - 16:00), เวรบ่ายพิเศษ..."
                      className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      รหัสกะ (Shift Code): *
                    </label>
                    <input
                      type="text"
                      required
                      value={shiftSubForm.code}
                      onChange={(e) =>
                        setShiftSubForm({
                          ...shiftSubForm,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 font-mono-data font-bold text-violet-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      ประเภทกะ / ไอคอน (Shift Category & Icon):
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-9 h-9 rounded-xl border inline-flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                          shiftSubForm.category
                        )}`}
                      >
                        <ShiftCategoryIcon
                          category={shiftSubForm.category}
                          className="w-4 h-4"
                        />
                      </span>
                      <select
                        value={shiftSubForm.category}
                        onChange={(e) =>
                          setShiftSubForm({
                            ...shiftSubForm,
                            category: e.target.value as ShiftVisualCategory,
                          })
                        }
                        className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 font-bold text-slate-800 cursor-pointer"
                      >
                        {SHIFT_CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      เวลาเริ่มต้น (Start Time):
                    </label>
                    <input
                      type="time"
                      required
                      value={shiftSubForm.startTime}
                      onChange={(e) =>
                        setShiftSubForm({ ...shiftSubForm, startTime: e.target.value })
                      }
                      className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 font-mono-data font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      เวลาสิ้นสุด (End Time):
                    </label>
                    <input
                      type="time"
                      required
                      value={shiftSubForm.endTime}
                      onChange={(e) =>
                        setShiftSubForm({ ...shiftSubForm, endTime: e.target.value })
                      }
                      className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 font-mono-data font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Grace Period (นาทีอนุโลมสาย):
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={shiftSubForm.graceMinutes}
                      onChange={(e) =>
                        setShiftSubForm({
                          ...shiftSubForm,
                          graceMinutes: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2 font-mono-data font-bold text-slate-900"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 font-bold text-indigo-950 bg-white border border-indigo-200 rounded-xl px-3 py-2.5 mt-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shiftSubForm.crossMidnight}
                      onChange={(e) =>
                        setShiftSubForm({
                          ...shiftSubForm,
                          crossMidnight: e.target.checked,
                        })
                      }
                      className="rounded text-indigo-600 cursor-pointer"
                    />
                    <span>กะข้ามเที่ยงคืน (+1 วัน)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 font-bold text-emerald-950 bg-white border border-emerald-200 rounded-xl px-3 py-2.5 mt-4 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shiftSubForm.active}
                      onChange={(e) =>
                        setShiftSubForm({
                          ...shiftSubForm,
                          active: e.target.checked,
                        })
                      }
                      className="rounded text-emerald-600 cursor-pointer"
                    />
                    <span>เปิดใช้งานกะนี้ (Active)</span>
                  </label>
                </div>

                {/* Advisory Warning for overlapping/similar shift templates (§10) */}
                {shiftSubFormAdvisory.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-950 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>คำแนะนำการตรวจสอบช่วงเวลากะ (สามารถยืนยันบันทึกได้):</span>
                    </div>
                    <ul className="list-disc list-inside pl-4 space-y-0.5 text-amber-800">
                      {shiftSubFormAdvisory.warnings.slice(0, 3).map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-violet-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShiftSubForm(null);
                      setShiftSubFormError(null);
                    }}
                    className="px-4 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white font-bold shadow-xs cursor-pointer"
                  >
                    {shiftSubForm.mode === 'ADD'
                      ? 'บันทึกกะใหม่เข้าตารางกติกากะ'
                      : 'ยืนยันบันทึกการแก้ไขกะ'}
                  </button>
                </div>
              </form>
            )}

            {/* 4. UNIFIED COMPACT TABLE OF ALL SHIFTS IN THIS RULE (§9) */}
            <div className="bg-white border border-[#E9E5F2] rounded-2xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-[#F8F7FC] border-b border-[#E9E5F2] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-600" />
                    <span>
                      ตารางรายการกะทั้งหมดของประเภทบุคลากรนี้ ({inspectRuleShifts.length}{' '}
                      รายการ — รวมกะเช้า บ่าย ดึก กะควบ ทั้งวัน เวลาราชการ และกะพิเศษ)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    คลิกที่แถวกะเพื่อไฮไลต์ดูบน 24-Hour Visual Timeline ด้านบน
                  </div>
                </div>

                {canManageShifts && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddShiftInModal(inspectRule)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#7C3AED] hover:to-[#5B21B6] text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ เพิ่มกะ</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#E9E5F2] text-slate-600 font-semibold">
                      <th className="py-2.5 px-3.5">1. ไอคอนและชื่อกะ</th>
                      <th className="py-2.5 px-3">2. เวลาเริ่มต้น–สิ้นสุด</th>
                      <th className="py-2.5 px-3 text-center">3. ข้ามวัน (+1 วัน)</th>
                      <th className="py-2.5 px-3 text-center">4. Grace Period</th>
                      <th className="py-2.5 px-3 text-center">5. สถานะ</th>
                      <th className="py-2.5 px-3 text-center">6. จัดการกะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9E5F2]">
                    {inspectRuleShifts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          ยังไม่มีรายการกะในประเภทบุคลากรนี้ กดปุ่ม &ldquo;+ เพิ่มกะ&rdquo; เพื่อเริ่มต้น
                        </td>
                      </tr>
                    ) : (
                      inspectRuleShifts.map((sh) => {
                        const { category, categoryLabel } = resolveShiftCategory(sh);
                        const isTimelineFocused = timelineSelectedShiftId === sh.id;
                        const lateCutoffStr = addMinutesToTimeStr(
                          sh.startTime,
                          sh.graceMinutes
                        );

                        return (
                          <tr
                            key={sh.id}
                            onClick={() => setTimelineSelectedShiftId(sh.id)}
                            className={`transition-colors cursor-pointer ${
                              isTimelineFocused
                                ? 'bg-violet-50/80'
                                : !sh.active
                                ? 'bg-slate-50/70 opacity-70'
                                : 'hover:bg-violet-50/40'
                            }`}
                          >
                            {/* 1. ไอคอนและชื่อกะ */}
                            <td className="py-2.5 px-3.5">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`w-8 h-8 rounded-xl border inline-flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                                    category
                                  )}`}
                                >
                                  <ShiftCategoryIcon
                                    category={category}
                                    className="w-4 h-4"
                                  />
                                </span>
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>{sh.name}</span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                      {sh.code}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    ประเภท: {categoryLabel}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 2. เวลาเริ่มต้น–สิ้นสุด */}
                            <td className="py-2.5 px-3">
                              <div className="font-mono-data font-bold text-violet-800 text-xs">
                                {sh.startTime} – {sh.endTime} น.
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono-data">
                                จุดตัดสาย: {lateCutoffStr} น.
                              </div>
                            </td>

                            {/* 3. ข้ามวัน (+1 วัน หากมี) */}
                            <td className="py-2.5 px-3 text-center">
                              {sh.crossMidnight ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                                  +1 วัน (ข้ามคืน)
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">
                                  ภายในวันเดียว
                                </span>
                              )}
                            </td>

                            {/* 4. Grace Period */}
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono-data font-bold text-slate-800">
                                {sh.graceMinutes} นาที
                              </span>
                            </td>

                            {/* 5. สถานะ */}
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                  sh.active
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    sh.active ? 'bg-emerald-600' : 'bg-slate-400'
                                  }`}
                                />
                                {sh.active ? 'เปิดใช้งาน (Active)' : 'ยกเลิกใช้งาน (Inactive)'}
                              </span>
                            </td>

                            {/* 6. จัดการ */}
                            <td
                              className="py-2.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setTimelineSelectedShiftId(sh.id)}
                                  title="ดูบน 24-Hour Visual Timeline"
                                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    isTimelineFocused
                                      ? 'bg-violet-600 text-white border-violet-600'
                                      : 'border-[#E9E5F2] text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {canManageShifts && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenEditShiftInModal(inspectRule, sh)
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-800 text-[11px] font-bold transition-colors cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>แก้ไข</span>
                                    </button>

                                    {sh.active ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeactivateTargetShift({
                                            shift: sh,
                                            ruleId: inspectRule.id,
                                            reason: 'ยกเลิกการใช้งานกะเวลาในตารางกติกากะ',
                                          })
                                        }
                                        title="ยกเลิกการใช้งานเฉพาะกะนี้ (เปลี่ยนสถานะเป็น Inactive)"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-colors cursor-pointer"
                                      >
                                        <Ban className="w-3 h-3" />
                                        <span>ยกเลิกกะ</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleReactivateShift(sh, inspectRule.id)
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition-colors cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>เปิดใช้งาน</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. STRICTLY SEPARATED FOOTER: Personnel-Type-Level Status Controls vs Modal Close (§13) */}
            <div className="pt-3 border-t-2 border-[#E9E5F2] flex flex-wrap items-center justify-between gap-3 bg-[#F8F7FC] rounded-xl p-3">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-800 text-xs">
                  การจัดการระดับประเภทบุคลากร (Personnel-Type Status Control):
                </div>
                <div className="text-[11px] text-slate-500">
                  แยกจากปุ่มยกเลิกกะรายรายการด้านบน · ใช้สำหรับเปิด/ปิดใช้งานหรือแก้ไขชื่อประเภทบุคลากร &ldquo;{inspectRule.name}&rdquo; ทั้งประเภท
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canManageShifts && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRule({ ...inspectRule });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E5F2] bg-white hover:bg-violet-50 text-slate-700 font-bold cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-violet-600" />
                      <span>แก้ไขชื่อ/คำอธิบายประเภทบุคลากร</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setConfirmRuleStatusAction({
                          rule: inspectRule,
                          targetActive: !inspectRule.active,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border font-bold cursor-pointer ${
                        inspectRule.active
                          ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700'
                          : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>
                        {inspectRule.active
                          ? 'ปิดใช้งานทั้งประเภทบุคลากรนี้'
                          : 'เปิดใช้งานประเภทบุคลากรนี้'}
                      </span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setInspectRuleId(null);
                    setShiftSubForm(null);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )}
      </SharedModal>

      {/* =================================================================
          MODAL 2 (§12): CONFIRM DEACTIVATE INDIVIDUAL SHIFT DIALOG
         ================================================================= */}
      <SharedModal
        open={!!deactivateTargetShift}
        onClose={() => setDeactivateTargetShift(null)}
        title={
          deactivateTargetShift
            ? `ยืนยันการยกเลิกการใช้งานกะ — ${deactivateTargetShift.shift.name}`
            : ''
        }
        subtitle="การยกเลิกการใช้งานกะจะเปลี่ยนสถานะกะเป็น Inactive เพื่อไม่ให้นำไปมอบหมายใหม่ โดยไม่ลบข้อมูลสแกนหรือตารางกะเดิม"
        badgeText="Shift Deactivation Confirmation"
        maxWidthClass="max-w-lg"
      >
        {deactivateTargetShift &&
          (() => {
            const futureList = mockAttendanceService.getFutureAssignmentsByShift(
              deactivateTargetShift.shift.id
            );
            const { category, categoryLabel } = resolveShiftCategory(
              deactivateTargetShift.shift
            );

            return (
              <form
                onSubmit={handleConfirmDeactivateShift}
                className="space-y-4 text-xs"
              >
                <div className="bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl p-3.5 flex items-center gap-3">
                  <span
                    className={`w-10 h-10 rounded-xl border inline-flex items-center justify-center shrink-0 ${getShiftIconButtonClasses(
                      category
                    )}`}
                  >
                    <ShiftCategoryIcon category={category} className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      {deactivateTargetShift.shift.name} ({deactivateTargetShift.shift.code})
                    </div>
                    <div className="text-slate-600 font-mono-data">
                      เวลา {deactivateTargetShift.shift.startTime}–
                      {deactivateTargetShift.shift.endTime} น. · {categoryLabel} · Grace{' '}
                      {deactivateTargetShift.shift.graceMinutes} นาที
                    </div>
                  </div>
                </div>

                {/* Future ShiftAssignment Impact Box (§12) */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-950 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      ผลกระทบต่อรายการจัดกะล่วงหน้า (Future ShiftAssignment): พบ{' '}
                      {futureList.length} รายการ
                    </span>
                  </div>
                  {futureList.length === 0 ? (
                    <div className="text-[11px] text-amber-800">
                      ไม่มีบุคลากรที่ถูกผูกกะนี้ไว้ในอนาคต สามารถยกเลิกการใช้งานกะได้อย่างปลอดภัย
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-amber-800">
                        รายการจัดกะที่ผูกไว้แล้วด้านล่างจะยังคงอยู่ในระบบ (ไม่ถูกลบอัตโนมัติ) แต่กะนี้จะไม่สามารถเลือกมอบหมายใหม่ในหน้า Personnel Roster ได้จนกว่าจะเปิดใช้งานอีกครั้ง:
                      </div>
                      <ul className="list-disc list-inside text-[11px] pl-3 space-y-0.5 max-h-28 overflow-y-auto">
                        {futureList.map((item) => (
                          <li key={item.assignment.id}>
                            <strong>{item.personName}</strong> ({item.department}) — วันที่{' '}
                            <span className="font-mono-data font-bold">
                              {item.assignment.workDate}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ระบุเหตุผลการยกเลิกการใช้งานกะ (บันทึกในประวัติการตั้งค่ากะ): *
                  </label>
                  <input
                    type="text"
                    required
                    value={deactivateTargetShift.reason}
                    onChange={(e) =>
                      setDeactivateTargetShift({
                        ...deactivateTargetShift,
                        reason: e.target.value,
                      })
                    }
                    placeholder="เช่น ปรับเปลี่ยนช่วงเวลากะประจำปี / ยกเลิกคลินิกนอกเวลาชั่วคราว..."
                    className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E5F2]">
                  <button
                    type="button"
                    onClick={() => setDeactivateTargetShift(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                  >
                    ปิดหน้าต่าง
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs cursor-pointer"
                  >
                    ยืนยันยกเลิกการใช้งานกะนี้ (Inactive)
                  </button>
                </div>
              </form>
            );
          })()}
      </SharedModal>

      {/* =================================================================
          MODAL 3 (§13): CONFIRM PERSONNEL-TYPE-LEVEL ENABLE/DISABLE DIALOG
         ================================================================= */}
      <SharedModal
        open={!!confirmRuleStatusAction}
        onClose={() => setConfirmRuleStatusAction(null)}
        title={
          confirmRuleStatusAction
            ? confirmRuleStatusAction.targetActive
              ? `ยืนยันการเปิดใช้งานประเภทบุคลากร — ${confirmRuleStatusAction.rule.name}`
              : `ยืนยันการปิดใช้งานทั้งประเภทบุคลากร — ${confirmRuleStatusAction.rule.name}`
            : ''
        }
        subtitle="การเปลี่ยนสถานะระดับประเภทบุคลากรแยกจากการยกเลิกกะรายรายการ และไม่ลบข้อมูลบุคลากรใน HOSOffice"
        badgeText="Personnel Type Status"
        maxWidthClass="max-w-md"
      >
        {confirmRuleStatusAction && (
          <div className="space-y-4 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-950">
              {confirmRuleStatusAction.targetActive
                ? `คุณต้องการเปิดใช้งานกติกากะของประเภทบุคลากร "${confirmRuleStatusAction.rule.name}" อีกครั้งใช่หรือไม่?`
                : `คุณต้องการปิดใช้งานกติกากะของประเภทบุคลากร "${confirmRuleStatusAction.rule.name}" ทั้งประเภทใช่หรือไม่? (หากต้องการยกเลิกเฉพาะบางกะ กรุณาใช้ปุ่ม "ยกเลิกกะ" ในตารางรายการกะแทน)`}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRuleStatusAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmRuleStatusToggle}
                className={`px-5 py-2 rounded-xl text-white font-bold cursor-pointer ${
                  confirmRuleStatusAction.targetActive
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        )}
      </SharedModal>

      {/* =================================================================
          MODAL 4: ADD / EDIT PERSONNEL TYPE METADATA
         ================================================================= */}
      <SharedModal
        open={!!editingRule}
        onClose={() => {
          setEditingRule(null);
          setRuleFormError(null);
        }}
        title={
          editingRule?.id
            ? `แก้ไขข้อมูลประเภทบุคลากร — ${editingRule.name}`
            : 'เพิ่มประเภทบุคลากรใหม่'
        }
        subtitle="กำหนดชื่อ รหัส และคำอธิบายประเภทบุคลากร (สามารถเพิ่ม/แก้ไขเวลากะรายรายการได้ในหน้าต่างรายละเอียดกติกาเวลากะ)"
        badgeText="Personnel Type"
        maxWidthClass="max-w-lg"
      >
        {editingRule && (
          <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
            {ruleFormError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{ruleFormError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  ชื่อประเภทบุคลากร: *
                </label>
                <input
                  type="text"
                  required
                  value={editingRule.name || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      name: e.target.value,
                      badgeChar: e.target.value.charAt(0) || 'บ',
                    })
                  }
                  placeholder="เช่น ข้าราชการ, พนักงานราชการ..."
                  className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">รหัสประเภท:</label>
                <input
                  type="text"
                  value={editingRule.code || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ตัวอักษรย่อ:</label>
                <input
                  type="text"
                  maxLength={2}
                  value={editingRule.badgeChar || ''}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, badgeChar: e.target.value })
                  }
                  className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs text-center font-bold text-violet-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">คำอธิบายเพิ่มเติม:</label>
              <input
                type="text"
                value={editingRule.description || ''}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, description: e.target.value })
                }
                placeholder="เช่น ข้าราชการพลเรือน / สาธารณสุข"
                className="w-full bg-[#F8F7FC] border border-[#E9E5F2] rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E5F2]">
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setRuleFormError(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white font-bold shadow-xs cursor-pointer"
              >
                บันทึกประเภทบุคลากร
              </button>
            </div>
          </form>
        )}
      </SharedModal>

      {/* =================================================================
          MODAL 5: SHIFT DEACTIVATION HISTORY LOGS
         ================================================================= */}
      <SharedModal
        open={isDeactivationHistoryOpen}
        onClose={() => setIsDeactivationHistoryOpen(false)}
        title={`ประวัติการยกเลิกใช้งานกะเวลา (Shift Config Deactivation Logs — ${deactivationLogs.length} รายการ)`}
        subtitle="บันทึกประวัติการยกเลิกใช้งานแม่แบบกะเวลาใน Personnel Schedule Matrix"
        badgeText="Shift Config Audit"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          {deactivationLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              ยังไม่มีประวัติการยกเลิกการใช้งานกะเวลา
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-[#E9E5F2] rounded-xl divide-y divide-[#E9E5F2]">
              {deactivationLogs.map((log) => (
                <div key={log.id} className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">
                      {log.shiftName} ({log.shiftCode})
                      {log.personnelTypeName ? ` · ประเภท: ${log.personnelTypeName}` : ''}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      เหตุผล: <strong className="text-rose-700">{log.reason}</strong> ·
                      กระทบตารางกะล่วงหน้า {log.futureAffectedCount} รายการ
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 shrink-0">
                    <div className="font-mono-data">{log.deactivatedAt}</div>
                    <div>โดย {log.deactivatedBy}</div>
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
