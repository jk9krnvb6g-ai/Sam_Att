/**
 * Sam_Att V2 — Repository Interface & Mode Contracts (Phase 1+2 Hardening — §2)
 *
 * Separates the Repository Contract (`ISamAttRepository`) from concrete implementations:
 * - `MOCK`: `InMemorySamAttRepository` (for UI Prototype & Unit Tests)
 * - `TEST`: `SqlitePersistentTestRepository` / `InMemorySamAttRepository` (for Automated Integration & Disk Persistence Tests)
 * - `REAL`: `MySqlSamAttRepository` (executes real parameterized SQL against MySQL `samchuk_attendance` pool with real `BEGIN` / `COMMIT` / `ROLLBACK` transactions; NEVER falls back to Mock on error).
 */

import {
  EngineAttendanceRecord,
  EngineFingerprintMapping,
  EngineHRNote,
  EngineHRReviewHistoryItem,
  EngineHRReviewStatus,
  EnginePersonnel,
  EngineShiftAssignment,
  EngineShiftConfig,
  ReprocessExecutionResult,
  ReprocessPreviewResult,
  UserRole,
  ValidatedRawScanEvent,
} from '../types';
import { RawScanIngestionSummary } from '../services/scannerAdapter';

export type RepositoryMode = 'MOCK' | 'TEST' | 'REAL';

export interface ParameterizedSqlRecord {
  sql: string;
  params: ReadonlyArray<unknown>;
  timestamp: string;
}

export interface RepositoryAuditLog {
  id: string;
  actor: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RepositoryShiftCancellationLog {
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

export interface RepositoryPushHistory {
  id: string;
  attendanceId: string;
  personId: string;
  fullName: string;
  workDate: string;
  shiftId: string;
  status: string;
  target: string;
  idempotencyKey: string;
  pushedBy: string;
  pushedByName: string;
  pushedAt: string;
  responseStatus: 'SUCCESS' | 'FAILED' | 'DRY_RUN_PREVIEW';
  responseSummary: string;
  payloadJson?: string;
}

export interface RepositoryUserAccount {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  personId: string | null;
  department: string;
  position: string;
  active: boolean;
}

export interface ISamAttRepository {
  readonly mode: RepositoryMode;

  /**
   * Check database health & connectivity.
   * In REAL mode, executes `SELECT 1` against MySQL and throws if unreachable.
   */
  checkHealth(): Promise<{
    healthy: boolean;
    mode: RepositoryMode;
    database: string;
    message: string;
  }>;

  /**
   * Execute an atomic database transaction (`START TRANSACTION` -> `COMMIT`, or `ROLLBACK` on error).
   */
  withTransaction<T>(fn: (txRepo: ISamAttRepository) => Promise<T> | T): Promise<T>;

  // Audit Logs
  recordAuditLog(params: {
    actor: string;
    actorName?: string;
    actorRole?: UserRole;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<RepositoryAuditLog> | RepositoryAuditLog;

  getAuditLogs(limit?: number): Promise<RepositoryAuditLog[]> | RepositoryAuditLog[];

  // Users & Auth
  findUserByUsername(username: string): Promise<RepositoryUserAccount | undefined> | RepositoryUserAccount | undefined;
  findUserById(userId: string): Promise<RepositoryUserAccount | undefined> | RepositoryUserAccount | undefined;
  updateUserPasswordHash(userId: string, newPasswordHash: string): Promise<void> | void;
  getUsers(): Promise<RepositoryUserAccount[]> | RepositoryUserAccount[];

  // Personnel & Fingerprint Mappings
  getPersonnel(filters?: {
    search?: string;
    department?: string;
    personnelType?: string;
    activeOnly?: boolean;
  }): Promise<EnginePersonnel[]> | EnginePersonnel[];

  getFingerprintMappings(personId?: string): Promise<EngineFingerprintMapping[]> | EngineFingerprintMapping[];

  upsertPersonnelFromHosOffice(
    incomingPersonnel: ReadonlyArray<EnginePersonnel>,
    syncDateStr?: string,
    actor?: string
  ): Promise<{
    insertedCount: number;
    updatedCount: number;
    fingleIdChangedCount: number;
    disputedMappings: Array<{ fingleId: number; personIds: string[]; reason: string }>;
  }> | {
    insertedCount: number;
    updatedCount: number;
    fingleIdChangedCount: number;
    disputedMappings: Array<{ fingleId: number; personIds: string[]; reason: string }>;
  };

  // Shifts & Assignments
  getShifts(): Promise<EngineShiftConfig[]> | EngineShiftConfig[];
  saveShift(shift: EngineShiftConfig, actor?: string): Promise<EngineShiftConfig> | EngineShiftConfig;

  getShiftAssignments(filters?: {
    personId?: string;
    workDate?: string;
    fromDate?: string;
    toDate?: string;
    includeCancelled?: boolean;
  }): Promise<EngineShiftAssignment[]> | EngineShiftAssignment[];

  assignShift(
    assignment: Omit<EngineShiftAssignment, 'id' | 'status'> & { id?: string },
    actor?: string
  ): Promise<{
    success: boolean;
    assignment?: EngineShiftAssignment;
    error?: string;
  }> | {
    success: boolean;
    assignment?: EngineShiftAssignment;
    error?: string;
  };

  cancelShiftAssignment(params: {
    assignmentId: string;
    reason: string;
    cancelledBy: string;
  }): Promise<{
    success: boolean;
    log?: RepositoryShiftCancellationLog;
    error?: string;
  }> | {
    success: boolean;
    log?: RepositoryShiftCancellationLog;
    error?: string;
  };

  getShiftCancellationLogs(personId?: string): Promise<RepositoryShiftCancellationLog[]> | RepositoryShiftCancellationLog[];

  // Immutable Raw Scans
  ingestRawScans(
    incomingScans: ReadonlyArray<unknown>,
    actor?: string
  ): Promise<RawScanIngestionSummary> | RawScanIngestionSummary;

  getRawScans(filters?: {
    fromDate?: string;
    toDate?: string;
    machineNo?: number;
    enrollNumber?: number;
    personId?: string;
    mappingStatus?: 'MAPPED' | 'PENDING_MAPPING' | 'DISPUTED_MAPPING';
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: ValidatedRawScanEvent[];
    total: number;
    page: number;
    pageSize: number;
  }> | {
    items: ValidatedRawScanEvent[];
    total: number;
    page: number;
    pageSize: number;
  };

  // Attendance, Reprocess & HR Review
  previewReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string;
    filterGroupName?: string;
    filterPersonId?: string;
  }): Promise<ReprocessPreviewResult> | ReprocessPreviewResult;

  executeReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string;
    filterGroupName?: string;
    filterPersonId?: string;
    actor?: string;
  }): Promise<ReprocessExecutionResult> | ReprocessExecutionResult;

  saveHRReviewAndNote(params: {
    attendanceId: string;
    reasonCode: string;
    reasonLabel: string;
    note: string;
    hrReviewStatus: EngineHRReviewStatus;
    authorUserId: string;
    authorName: string;
  }): Promise<EngineAttendanceRecord> | EngineAttendanceRecord;

  getAttendance(filters?: {
    fromDate?: string;
    toDate?: string;
    workDate?: string;
    personId?: string;
    department?: string;
    status?: string;
    hrReviewStatus?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: EngineAttendanceRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> | {
    items: EngineAttendanceRecord[];
    total: number;
    page: number;
    pageSize: number;
  };

  // HOSOffice Push History
  recordPushPreviewHistory(entry: RepositoryPushHistory): Promise<void> | void;
  getPushHistory(): Promise<RepositoryPushHistory[]> | RepositoryPushHistory[];

  // Persistent Session Revocation & Distributed Login Rate Limiting across Restart / Multi-Process (§3 & §9)
  revokeSessionJti(jti: string, userId: string, expiresAtSec: number): Promise<void> | void;
  isSessionJtiRevoked(jti: string): Promise<boolean> | boolean;
  revokeUserSessionsBefore?(userId: string, revokedBeforeSec: number): Promise<void> | void;
  getUserSessionsRevokedBefore?(userId: string): Promise<number | null> | number | null;
  getRateLimitEntry(rateKey: string): Promise<RepositoryRateLimitEntry | undefined> | RepositoryRateLimitEntry | undefined;
  recordFailedRateLimitAttempt(params: {
    rateKey: string;
    nowMs: number;
    windowMs: number;
    maxAttempts: number;
    lockoutMs: number;
  }): Promise<RepositoryRateLimitEntry> | RepositoryRateLimitEntry;
  saveRateLimitEntry(entry: RepositoryRateLimitEntry): Promise<void> | void;
  deleteRateLimitEntry(rateKey: string): Promise<void> | void;
}

export interface RepositoryRateLimitEntry {
  rateKey: string;
  failedAttempts: number;
  firstFailedAtMs: number;
  lockedUntilMs: number | null;
}

export type {
  EngineHRNote,
  EngineHRReviewHistoryItem,
};

