/**
 * Sam_Att V2 — Domain Data Types & Contracts
 * Based on MASTER DEVELOPMENT PROMPT (ฉบับ Final Scope — Updated Scanner JSON Contract)
 */

export type UserRole = 'ADMIN' | 'RESPONSIBLE_STAFF' | 'GENERAL_USER';

export type PageSizeOption = 10 | 50 | 100 | 'ALL';

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  personId: string | null; // Bound PERSON_ID for GENERAL_USER
  department: string;
  position: string;
  active: boolean;
}

export type AttendanceStatus =
  | 'NORMAL'             // เข้างานปกติ
  | 'LATE'               // มาสาย
  | 'NO_SCAN'            // ไม่พบการสแกน
  | 'MISSING_CHECKOUT'   // ขาดสแกนออก
  | 'EARLY_CHECKOUT'     // ออกก่อนเวลา
  | 'NO_SCHEDULE'        // ไม่มีตารางเวร
  | 'PENDING_MAPPING';   // รอยืนยันรหัสนิ้วมือกับบุคลากร

export type NoScanReasonCode =
  | 'SICK_LEAVE'       // ลาป่วย
  | 'BUSINESS_LEAVE'   // ลากิจ
  | 'VACATION_LEAVE'   // ลาพักผ่อน
  | 'OFFICIAL_DUTY'    // ไปราชการ
  | 'TRAINING'         // อบรม / ประชุม
  | 'DAY_OFF'          // หยุดตามเวร
  | 'OTHER';           // อื่นๆ

export interface Personnel {
  personId: string;           // รหัสบุคคล HOSOffice
  fingleId: number;           // รหัสนิ้วมือ FINGLE_ID
  cidMasked?: string;         // เลขบัตรประชาชนแบบปกปิดบางส่วน (HR_CID)
  prefix: string;             // คำนำหน้า
  firstName: string;          // ชื่อ
  lastName: string;           // นามสกุล
  position: string;           // ตำแหน่ง
  department: string;         // ฝ่าย / งาน
  groupName: string;          // กลุ่มงาน
  personnelType: string;      // ประเภทบุคลากร เช่น ข้าราชการ, พนักงานกระทรวงสาธารณสุข, ลูกจ้างชั่วคราว
  active: boolean;
  lastHosOfficeSync: string;
}

export interface FingerprintMapping {
  id: string;
  personId: string;
  fingleId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DISPUTED';
}

export type ShiftVisualCategory =
  | 'MORNING'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'MORNING_AFTERNOON'
  | 'AFTERNOON_NIGHT'
  | 'ALL_DAY'
  | 'OFFICIAL'
  | 'OTHER';

export type NoShiftStatusType = 'UNASSIGNED' | 'SCHEDULED_DAY_OFF' | 'SHIFT_CANCELLED';

export interface Shift {
  id: string;
  code: string;
  name: string;               // e.g. กะเช้า, กะบ่าย, กะดึก, เวรปกติ 08:30-16:30
  category?: ShiftVisualCategory; // ประเภทกะ/ไอคอนจาก Shift Configuration โดยตรง
  startTime: string;          // HH:mm (e.g. 08:00)
  endTime: string;            // HH:mm (e.g. 16:00)
  crossMidnight: boolean;     // กะข้ามวัน (+1 วัน)
  graceMinutes: number;       // นาทีที่อนุโลมก่อนถือว่าสาย (default 15)
  earlyScanWindowMinutes: number; // สแกนก่อนเริ่มได้กี่นาที (default 60)
  lateScanWindowMinutes: number;  // สแกนหลังสิ้นสุดได้กี่นาที (default 120)
  active: boolean;
  personnelTypeRuleId?: string; // ผูกกับประเภทบุคลากร (ถ้าสร้างเฉพาะประเภท)
  deactivatedAt?: string;
  deactivatedReason?: string;
}

export interface PersonnelTypeScheduleRule {
  id: string;
  code: string;               // รหัสประเภทบุคลากร
  name: string;               // ชื่อประเภทบุคลากร เช่น ข้าราชการ, พนักงานกระทรวงสาธารณสุข
  description: string;        // คำอธิบาย เช่น ข้าราชการพลเรือน / สาธารณสุข
  badgeChar: string;          // ตัวอักษรย่อแสดงหน้าการ์ด เช่น ข, พ, ล
  hasMorning?: boolean;       // มีกะเช้าหรือไม่ (default true)
  morningShiftId?: string;    // อ้างอิง Shift กะเช้าของประเภทบุคลากรนี้
  morningStart: string;       // เช่น 08:15 หรือ 07:30 (จุดตัดสายกะเช้า)
  morningEnd: string;         // เช่น 16:00
  morningLateCutoff: string;  // เช่น 08:15 หรือ 07:30
  morningGraceMinutes?: number;
  hasAfternoon?: boolean;     // มีกะบ่ายหรือไม่ (default true)
  afternoonShiftId?: string;  // อ้างอิง Shift กะบ่ายของประเภทบุคลากรนี้
  afternoonStart: string;     // เช่น 16:00
  afternoonEnd: string;       // เช่น 24:00
  afternoonLateCutoff: string;// เช่น 16:00
  afternoonGraceMinutes?: number;
  hasNight?: boolean;         // มีกะดึกหรือไม่ (default true)
  nightShiftId?: string;      // อ้างอิง Shift กะดึกของประเภทบุคลากรนี้
  nightStart: string;         // เช่น 00:00
  nightEnd: string;           // เช่น 08:00
  nightCrossMidnight: boolean;
  nightGraceMinutes?: number;
  otherShiftIds?: string[];   // รหัสกะอื่น ๆ ที่ผูกกับประเภทบุคลากรนี้ เช่น SH04, SH05, SH06, SH08
  shiftIds?: string[];        // รหัสกะทั้งหมดที่ผูกกับประเภทบุคลากรนี้ (รวมเช้า/บ่าย/ดึก/กะควบ/กะพิเศษ)
  active: boolean;
}

export interface ShiftAssignment {
  id: string;
  personId: string;
  workDate: string;           // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  assignmentType: 'DAILY' | 'RECURRING' | 'STANDARD_FALLBACK';
  /** Snapshot values at assignment time so editing a Shift Template does not alter past worked shifts */
  shiftStartTime?: string;
  shiftEndTime?: string;
  crossMidnight?: boolean;
  graceMinutes?: number;
  shiftCategory?: ShiftVisualCategory;
}

export interface ShiftCancellationLog {
  id: string;
  assignmentId: string;
  personId: string;
  personName: string;
  workDate: string;
  shiftId: string;
  shiftName: string;
  cancelledAt: string;
  cancelledBy: string;
  reason: string;
}

export interface ShiftConfigDeactivationLog {
  id: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  personnelTypeRuleId?: string;
  personnelTypeName?: string;
  futureAffectedCount: number;
  deactivatedAt: string;
  deactivatedBy: string;
  reason: string;
}

/**
 * สัญญาข้อมูลดิบเครื่องสแกน 6 ฟิลด์ ตาม MASTER DEVELOPMENT PROMPT §14:
 * {
 *   "machineNo": 1,
 *   "enrollNumber": 54,
 *   "scanDateTime": "2026-11-06 07:45:00",
 *   "verifyMode": 268435456,
 *   "inOutMode": 1,
 *   "workCode": null
 * }
 */
export interface RawScanEvent {
  id: string;
  machineNo: number;
  enrollNumber: number;       // รหัสนิ้วมือ
  scanDateTime: string;       // yyyy-MM-dd HH:mm:ss
  verifyMode: number;
  inOutMode: number;
  workCode: number | null;
  importedAt: string;         // ISO timestamp recorded by Backend
  dedupeKey: string;          // machineNo + enrollNumber + scanDateTime
  isNew?: boolean;
}

export interface ScannerDevice {
  id: string;
  machineNo: number;
  name: string;
  ip: string;
  port: number;
  location: string;
  enabled: boolean;
  autoSyncEnabled: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR';
  lastSyncAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
}

export interface SyncScheduleSlot {
  id: string;
  time: string;               // HH:mm (e.g. "00:00", "08:00")
  label: string;              // คำอธิบายรอบ เช่น รอบเที่ยงคืน (สรุปเวรบ่าย/เริ่มเวรดึก)
  timezone: 'Asia/Bangkok';
  enabled: boolean;
}

export interface SyncRunLog {
  id: string;
  deviceId: string;
  machineNo: number;
  deviceName: string;
  mode: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  finishedAt: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  totalRead: number;
  newScans: number;
  duplicateScans: number;
  unmappedScans: number;
  latestEventAt: string | null;
  errorMessage: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUsername: string;
  actorName: string;
  actorRole: UserRole;
  action:
    | 'SYNC_SCANNERS'
    | 'SYNC_HOSOFFICE_HR'
    | 'REPROCESS_ATTENDANCE'
    | 'PUSH_HOSOFFICE'
    | 'SET_NO_SCAN_NOTE'
    | 'MANAGE_SHIFT_MATRIX'
    | 'ASSIGN_SHIFT'
    | 'MANAGE_SCANNER'
    | 'MANAGE_SYNC_SCHEDULE'
    | 'TEST_DB_CONNECTION';
  entityType: string;
  entityId: string;
  summary: string;
  metadataJson: string;
}

export interface AttendanceRecord {
  id: string;
  personId: string;
  fingleId: number;
  fullName: string;
  department: string;
  groupName: string;
  personnelType: string;
  workDate: string;           // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  checkInAt: string | null;   // HH:mm:ss or YYYY-MM-DD HH:mm:ss
  checkOutAt: string | null;  // HH:mm:ss or YYYY-MM-DD HH:mm:ss
  lateMinutes: number;        // คำนวณจาก max(0, checkIn - shiftStart - grace)
  earlyCheckoutMinutes?: number;
  approvedOtHours?: number;   // แสดงเฉพาะเมื่อมีข้อมูลหรือกติกา OT ที่ชัดเจน ไม่เดาเองจากเวลาสแกน
  status: AttendanceStatus;
  computedAt: string;
  rawScanInId?: string;
  rawScanOutId?: string;
  notes?: AttendanceNote;
  isPushedToHosOffice?: boolean;
  lastPushedAt?: string;
  modifiedAfterPush?: boolean;
}

export interface HRPersonSummary {
  personId: string;
  fingleId: number;
  cidMasked: string;
  fullName: string;
  position: string;
  department: string;
  groupName: string;
  personnelType: string;
  totalAssignedShifts: number;
  workingDaysCount: number;   // วันทำงานที่มีสแกนจริง (NORMAL + LATE + EARLY_CHECKOUT + MISSING_CHECKOUT)
  normalCount: number;        // ปกติ / ตรงเวลา
  lateCount: number;          // มาสาย (ครั้ง)
  totalLateMinutes: number;   // รวมเวลาสาย (นาที)
  avgLateMinutesPerLateShift: number;
  earlyCheckoutCount: number; // ออกก่อน (ครั้ง)
  totalOtHours: number;       // รวม OT (ชม.) ตามกติกา OT ที่ชัดเจนเท่านั้น (ไม่มี = 0.0)
  onTimeRatePercent: number;  // อัตราตรงเวลา (%)
  noScanCount: number;        // ไม่พบสแกน
  records: AttendanceRecord[];
}

export interface AttendanceNote {
  id: string;
  attendanceId: string;
  reasonCode: NoScanReasonCode;
  reasonLabel: string;
  note: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PushHistory {
  id: string;
  attendanceId: string;
  personId: string;
  fullName: string;
  workDate: string;
  status: AttendanceStatus;
  target: 'HOSOffice_Attend';
  idempotencyKey: string;
  pushedBy: string;
  pushedByName: string;
  pushedAt: string;
  responseStatus: 'SUCCESS' | 'FAILED';
  responseSummary: string;
}

export interface DashboardSummary {
  workDate: string;
  totalPersonnel: number;
  totalShiftsToday: number;
  normalCount: number;
  distinctLatePeople: number;
  totalLateOccurrences: number;
  noScanCount: number;
  missingCheckoutCount: number;
  totalLateMinutes: number;
  avgLateMinutesPerLateShift: number;
  departmentSummaries: {
    department: string;
    total: number;
    lateCount: number;
    noScanCount: number;
    normalCount: number;
  }[];
}
