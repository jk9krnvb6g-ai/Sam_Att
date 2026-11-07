/**
 * Backend Data Contracts & Interfaces for Sam_Att V2 (Phase 1 + Phase 2)
 * Shared types for Attendance Engine, Raw Scan Processor, Repository Layer,
 * HOSOffice Adapter, and Modular Router in Central API Gateway (Port 3002, /api/Sam_Att/)
 */

export type UserRole = 'ADMIN' | 'RESPONSIBLE_STAFF' | 'GENERAL_USER';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  personId: string | null;
  department?: string;
  authMode: 'VERIFIED_TOKEN' | 'DEV_PERSONA';
}

/**
 * Confirmed 6-field raw scanner JSON contract from existing hospital Scanner Reader EXE (§2)
 */
export interface RawScanDto {
  machineNo: number;
  enrollNumber: number;
  scanDateTime: string; // "yyyy-MM-dd HH:mm:ss"
  verifyMode: number;
  inOutMode: number;
  workCode: number | null;
}

export interface IngestScansRequest {
  success?: boolean;
  totalRead?: number;
  machines?: Array<{
    machineNo: number;
    ip: string;
    read: number;
    status: string;
  }>;
  scans: RawScanDto[];
}

export interface ValidatedRawScanEvent extends Readonly<RawScanDto> {
  readonly id: string;
  readonly dedupeKey: string;
  readonly importedAt: string;
  readonly epochMs: number;
  readonly workDatePart: string; // "yyyy-MM-dd"
  readonly timePart: string;     // "HH:mm:ss"
  readonly mappedPersonId: string | null;
  readonly mappingStatus: 'MAPPED' | 'PENDING_MAPPING' | 'DISPUTED_MAPPING';
}

export type ShiftCategoryCode =
  | 'MORNING'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'MORNING_AFTERNOON'
  | 'AFTERNOON_NIGHT'
  | 'ALL_DAY'
  | 'OFFICE'
  | 'SPECIAL'
  | 'OTHER';

export interface EngineShiftConfig {
  id: string;
  code: string;
  name: string;
  category: ShiftCategoryCode;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm" ("24:00" or "00:00" supported)
  crossMidnight: boolean;
  graceMinutes: number;
  earlyScanWindowMinutes: number; // default e.g. 180
  lateScanWindowMinutes: number;  // default e.g. 240
  active: boolean;
}

export interface EngineShiftAssignment {
  id: string;
  personId: string;
  workDate: string; // "yyyy-MM-dd" (date the shift starts)
  shiftId: string;
  assignmentType: 'DAILY' | 'RECURRING' | 'STANDARD_FALLBACK';
  shiftName?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  crossMidnight?: boolean;
  graceMinutes?: number;
  shiftCategory?: ShiftCategoryCode;
  status?: 'ACTIVE' | 'CANCELLED';
}

export interface EnginePersonnel {
  personId: string;
  fingleId: number;
  prefix: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  groupName: string;
  personnelType: string;
  active: boolean;
  lastHosOfficeSync?: string | null;
}

export interface EngineFingerprintMapping {
  id: string;
  personId: string;
  fingleId: number;
  effectiveFrom: string; // "yyyy-MM-dd"
  effectiveTo: string | null; // "yyyy-MM-dd" or null
  status: 'ACTIVE' | 'SUPERSEDED' | 'DISPUTED';
}

export type EngineAttendanceStatus =
  | 'NORMAL'
  | 'LATE'
  | 'NO_SCAN'
  | 'MISSING_CHECKOUT'
  | 'EARLY_CHECKOUT'
  | 'NO_SCHEDULE'
  | 'PENDING_MAPPING';

export type EngineHRReviewStatus = 'PENDING_REVIEW' | 'REVIEWED' | 'NOT_REQUIRED';

export type EngineEvaluationState =
  | 'EVALUATED'
  | 'IN_PROGRESS'
  | 'FUTURE'
  | 'AMBIGUOUS_REQUIRES_REVIEW';

export interface EngineHRNote {
  id: string;
  attendanceId: string;
  reasonCode: string;
  reasonLabel: string;
  note: string;
  authorUserId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineHRReviewHistoryItem {
  id: string;
  attendanceId: string;
  reasonCode: string;
  reasonLabel: string;
  note: string;
  hrReviewStatus: EngineHRReviewStatus;
  authorUserId: string;
  authorName: string;
  timestamp: string;
}

export interface EngineAttendanceRecord {
  id: string;
   businessKey: string; // `${personId}_${workDate}_${shiftId}`
  personId: string;
  fingleId: number;
  fullName: string;
  department: string;
  groupName: string;
  personnelType: string;
  workDate: string;
  shiftId: string;
  shiftName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  crossMidnight: boolean;
  graceMinutes: number;
  shiftCategory: ShiftCategoryCode;
  checkInAt: string | null;       // "HH:mm:ss"
  checkOutAt: string | null;      // "HH:mm:ss"
  checkInDateTime: string | null; // "yyyy-MM-dd HH:mm:ss"
  checkOutDateTime: string | null;// "yyyy-MM-dd HH:mm:ss"
  lateMinutes: number;
  earlyCheckoutMinutes?: number;
  hasMissingCheckout: boolean;
  status: EngineAttendanceStatus;
  evaluationState: EngineEvaluationState;
  hrReviewStatus: EngineHRReviewStatus;
  ambiguousScanFlag?: boolean;
  evaluationNote?: string;
  rawScanInId: string | null;
  rawScanOutId: string | null;
  relatedRawScanIds: string[];
  computedAt: string;
  notes?: EngineHRNote;
  noteHistory?: EngineHRReviewHistoryItem[];
  isPushedToHosOffice: boolean;
  lastPushedAt: string | null;
  modifiedAfterPush: boolean;
}

export interface ReprocessPreviewResult {
  fromDate: string;
  toDate: string;
  targetAssignmentsCount: number;
  targetExistingAttendanceCount: number;
  matchingRawScansCount: number;
  unmappedScansCount: number;
  noScheduleScansCount: number;
  futureSkippedCount: number;
  inProgressCount: number;
}

export interface ReprocessExecutionResult {
  fromDate: string;
  toDate: string;
  reprocessedCount: number;
  succeededCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  errorsCount: number;
  unmappedScansCount: number;
  noScheduleCount: number;
  skippedReasons: Array<{ label: string; reason: string }>;
  changes: Array<{
    id: string;
    businessKey: string;
    personId: string;
    fullName: string;
    workDate: string;
    shiftId: string;
    shiftName: string;
    oldStatus: string;
    newStatus: string;
  }>;
  records: EngineAttendanceRecord[];
  unmappedEvents: ValidatedRawScanEvent[];
  noScheduleRecords: EngineAttendanceRecord[];
}
