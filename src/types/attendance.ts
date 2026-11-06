/**
 * Sam_Att V2 — Domain Data Types & Contracts
 * Based on MASTER DEVELOPMENT PROMPT (ฉบับ Final Scope — Updated Scanner JSON Contract)
 */

export type UserRole = 'ADMIN' | 'RESPONSIBLE_STAFF' | 'GENERAL_USER';

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
  prefix: string;             // คำนำหน้า
  firstName: string;          // ชื่อ
  lastName: string;           // นามสกุล
  position: string;           // ตำแหน่ง
  department: string;         // ฝ่าย / งาน
  groupName: string;          // กลุ่มงาน
  personnelType: string;      // ประเภทบุคลากร เช่น ข้าราชการ, พนักงานกระทรวง, ลูกจ้างชั่วคราว
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

export interface Shift {
  id: string;
  code: string;
  name: string;               // e.g. กะเช้า, กะบ่าย, กะดึก, เวรปกติ 08:30-16:30
  startTime: string;          // HH:mm (e.g. 08:00)
  endTime: string;            // HH:mm (e.g. 16:00)
  crossMidnight: boolean;     // กะข้ามวัน
  graceMinutes: number;       // นาทีที่อนุโลมก่อนถือว่าสาย (default 15)
  earlyScanWindowMinutes: number; // สแกนก่อนเริ่มได้กี่นาที (default 60)
  lateScanWindowMinutes: number;  // สแกนหลังสิ้นสุดได้กี่นาที (default 120)
  active: boolean;
}

export interface ShiftAssignment {
  id: string;
  personId: string;
  workDate: string;           // YYYY-MM-DD
  shiftId: string;
  shiftName: string;
  assignmentType: 'DAILY' | 'RECURRING' | 'STANDARD_FALLBACK';
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
  status: AttendanceStatus;
  computedAt: string;
  rawScanInId?: string;
  rawScanOutId?: string;
  notes?: AttendanceNote;
  isPushedToHosOffice?: boolean;
  lastPushedAt?: string;
  modifiedAfterPush?: boolean;
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
