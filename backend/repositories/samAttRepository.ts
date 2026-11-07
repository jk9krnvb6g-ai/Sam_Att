/**
 * Sam_Att V2 — In-Memory & Disk-Persisted Test Repository + Repository Mode Factory
 * Phase 1+2 Hardening — §2
 *
 * Strictly separates Repository Modes:
 * - `MOCK`: In-Memory Repository (for UI Prototype & Unit Tests)
 * - `TEST`: Disk-Persisted Test Repository (survives Backend/Repository restart for Integration Tests)
 * - `REAL`: `MySqlSamAttRepository` (executes real SQL against MySQL `samchuk_attendance` pool; NEVER falls back to Mock!)
 */

import fs from 'node:fs';
import {
  EngineAttendanceRecord,
  EngineFingerprintMapping,
  EngineHRNote,
  EngineHRReviewHistoryItem,
  EngineHRReviewStatus,
  EnginePersonnel,
  EngineShiftAssignment,
  EngineShiftConfig,
  RawScanDto,
  ReprocessExecutionResult,
  ReprocessPreviewResult,
  UserRole,
  ValidatedRawScanEvent,
} from '../types';
import {
  ISamAttRepository,
  ParameterizedSqlRecord,
  RepositoryAuditLog,
  RepositoryMode,
  RepositoryPushHistory,
  RepositoryShiftCancellationLog,
  RepositoryUserAccount,
} from './interfaces';
import {
  MySqlSamAttRepository,
  DatabaseUnavailableError,
  MySqlConnectionConfig,
  SqlConnectionPool,
} from './mysqlSamAttRepository';
import { ScannerAdapter, RawScanIngestionSummary } from '../services/scannerAdapter';
import { AttendanceCalculator } from '../services/attendanceCalculator';

export type {
  ISamAttRepository,
  ParameterizedSqlRecord,
  RepositoryAuditLog,
  RepositoryMode,
  RepositoryPushHistory,
  RepositoryShiftCancellationLog,
  RepositoryUserAccount,
};
export { MySqlSamAttRepository, DatabaseUnavailableError };

interface DatabaseSnapshot {
  users: RepositoryUserAccount[];
  personnel: EnginePersonnel[];
  fingerprintMappings: EngineFingerprintMapping[];
  shifts: EngineShiftConfig[];
  assignments: EngineShiftAssignment[];
  cancellationLogs: RepositoryShiftCancellationLog[];
  rawScans: ValidatedRawScanEvent[];
  attendance: EngineAttendanceRecord[];
  notes: Map<string, EngineHRNote>;
  reviewHistory: Map<string, EngineHRReviewHistoryItem[]>;
  pushHistory: RepositoryPushHistory[];
  auditLogs: RepositoryAuditLog[];
}

export class SamAttRepository implements ISamAttRepository {
  public readonly mode: RepositoryMode;
  private persistenceFilePath: string | null = null;
  private txMutexChain: Promise<unknown> = Promise.resolve();

  private users: RepositoryUserAccount[] = [];
  private personnel: EnginePersonnel[] = [];
  private fingerprintMappings: EngineFingerprintMapping[] = [];
  private shifts: EngineShiftConfig[] = [];
  private assignments: EngineShiftAssignment[] = [];
  private cancellationLogs: RepositoryShiftCancellationLog[] = [];
  private rawScans: ValidatedRawScanEvent[] = [];
  private attendance: EngineAttendanceRecord[] = [];
  private notes = new Map<string, EngineHRNote>();
  private reviewHistory = new Map<string, EngineHRReviewHistoryItem[]>();
  private pushHistory: RepositoryPushHistory[] = [];
  private auditLogs: RepositoryAuditLog[] = [];
  private parameterizedQueryLog: ParameterizedSqlRecord[] = [];

  constructor(
    seed?: Partial<{
      mode: RepositoryMode;
      persistenceFilePath: string;
      users: RepositoryUserAccount[];
      personnel: EnginePersonnel[];
      fingerprintMappings: EngineFingerprintMapping[];
      shifts: EngineShiftConfig[];
      assignments: EngineShiftAssignment[];
      rawScans: RawScanDto[];
      attendance: EngineAttendanceRecord[];
    }>,
    options?: {
      mode?: RepositoryMode;
      persistenceFilePath?: string;
    }
  ) {
    const resolvedPath = options?.persistenceFilePath || seed?.persistenceFilePath || null;
    this.mode = options?.mode || seed?.mode || (resolvedPath ? 'TEST' : 'MOCK');
    this.persistenceFilePath = resolvedPath;

    // If a persistence file exists on disk (e.g., after Backend Restart in TEST mode), load state from disk!
    if (this.persistenceFilePath && fs.existsSync(this.persistenceFilePath)) {
      this.loadFromDiskFile(this.persistenceFilePath);
      return;
    }

    if (seed?.users) this.users = structuredClone(seed.users);
    if (seed?.personnel) this.personnel = structuredClone(seed.personnel);
    if (seed?.fingerprintMappings) {
      this.fingerprintMappings = structuredClone(seed.fingerprintMappings);
    }
    if (seed?.shifts) this.shifts = structuredClone(seed.shifts);
    if (seed?.assignments) this.assignments = structuredClone(seed.assignments);
    if (seed?.attendance) {
      this.attendance = structuredClone(seed.attendance);
      for (const rec of this.attendance) {
        if (rec.notes) {
          this.notes.set(rec.id, structuredClone(rec.notes));
        }
        if (rec.noteHistory && rec.noteHistory.length > 0) {
          this.reviewHistory.set(rec.id, structuredClone(rec.noteHistory));
        }
      }
    }
    if (seed?.rawScans && seed.rawScans.length > 0) {
      this.ingestRawScans(seed.rawScans, 'SYSTEM_SEED');
    }

    this.flushToDiskIfConfigured();
  }

  private flushToDiskIfConfigured(): void {
    if (!this.persistenceFilePath) return;
    const serialized = {
      users: this.users,
      personnel: this.personnel,
      fingerprintMappings: this.fingerprintMappings,
      shifts: this.shifts,
      assignments: this.assignments,
      cancellationLogs: this.cancellationLogs,
      rawScans: this.rawScans,
      attendance: this.attendance,
      notesEntries: Array.from(this.notes.entries()),
      reviewHistoryEntries: Array.from(this.reviewHistory.entries()),
      pushHistory: this.pushHistory,
      auditLogs: this.auditLogs,
    };
    fs.writeFileSync(this.persistenceFilePath, JSON.stringify(serialized, null, 2), 'utf8');
  }

  private loadFromDiskFile(filePath: string): void {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    this.users = parsed.users || [];
    this.personnel = parsed.personnel || [];
    this.fingerprintMappings = parsed.fingerprintMappings || [];
    this.shifts = parsed.shifts || [];
    this.assignments = parsed.assignments || [];
    this.cancellationLogs = parsed.cancellationLogs || [];
    this.rawScans = (parsed.rawScans || []).map((ev: ValidatedRawScanEvent) =>
      Object.freeze({ ...ev })
    );
    this.attendance = parsed.attendance || [];
    this.notes = new Map(parsed.notesEntries || []);
    this.reviewHistory = new Map(parsed.reviewHistoryEntries || []);
    this.pushHistory = parsed.pushHistory || [];
    this.auditLogs = parsed.auditLogs || [];
  }

  public async checkHealth(): Promise<{
    healthy: boolean;
    mode: RepositoryMode;
    database: string;
    message: string;
  }> {
    return {
      healthy: true,
      mode: this.mode,
      database:
        this.mode === 'TEST'
          ? `samchuk_attendance_test (${this.persistenceFilePath || 'memory'})`
          : 'samchuk_attendance_mock',
      message: `Repository active in ${this.mode} mode`,
    };
  }

  private recordSql(sql: string, params: ReadonlyArray<unknown>): void {
    this.parameterizedQueryLog.push({
      sql: sql.trim(),
      params,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    });
  }

  public getExecutedParameterizedQueries(): ReadonlyArray<ParameterizedSqlRecord> {
    return this.parameterizedQueryLog;
  }

  /**
   * Execute an atomic database transaction with serialized mutex locking (preventing concurrent update races)
   * and full rollback on failure (§2.7, §2.8, §2.9).
   */
  public async withTransaction<T>(fn: (repo: this) => Promise<T> | T): Promise<T> {
    const runTx = async (): Promise<T> => {
      const snapshot: DatabaseSnapshot = {
        users: structuredClone(this.users),
        personnel: structuredClone(this.personnel),
        fingerprintMappings: structuredClone(this.fingerprintMappings),
        shifts: structuredClone(this.shifts),
        assignments: structuredClone(this.assignments),
        cancellationLogs: structuredClone(this.cancellationLogs),
        rawScans: [...this.rawScans],
        attendance: structuredClone(this.attendance),
        notes: structuredClone(this.notes),
        reviewHistory: structuredClone(this.reviewHistory),
        pushHistory: structuredClone(this.pushHistory),
        auditLogs: structuredClone(this.auditLogs),
      };

      this.recordSql('START TRANSACTION', []);
      try {
        const result = await fn(this);
        this.recordSql('COMMIT', []);
        this.flushToDiskIfConfigured();
        return result;
      } catch (err) {
        this.recordSql('ROLLBACK', []);
        this.users = snapshot.users;
        this.personnel = snapshot.personnel;
        this.fingerprintMappings = snapshot.fingerprintMappings;
        this.shifts = snapshot.shifts;
        this.assignments = snapshot.assignments;
        this.cancellationLogs = snapshot.cancellationLogs;
        this.rawScans = snapshot.rawScans;
        this.attendance = snapshot.attendance;
        this.notes = snapshot.notes;
        this.reviewHistory = snapshot.reviewHistory;
        this.pushHistory = snapshot.pushHistory;
        this.auditLogs = snapshot.auditLogs;
        this.flushToDiskIfConfigured();
        throw err;
      }
    };

    const nextInQueue = this.txMutexChain.then(runTx, runTx);
    this.txMutexChain = nextInQueue.then(
      () => undefined,
      () => undefined
    );
    return nextInQueue;
  }

  // ==========================================
  // 1. Audit Logs
  // ==========================================
  public recordAuditLog(params: {
    actor: string;
    actorName?: string;
    actorRole?: UserRole;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): RepositoryAuditLog {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entry: RepositoryAuditLog = {
      id: `AUD_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actor: params.actor,
      actorName: params.actorName || params.actor,
      actorRole: params.actorRole || 'RESPONSIBLE_STAFF',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary,
      timestamp,
      metadata: params.metadata,
    };

    this.recordSql(
      'INSERT INTO audit_logs (id, actor, actor_name, actor_role, action, entity_type, entity_id, summary, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        entry.id,
        entry.actor,
        entry.actorName,
        entry.actorRole,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.summary,
        entry.timestamp,
        JSON.stringify(entry.metadata || {}),
      ]
    );

    this.auditLogs.unshift(entry);
    this.flushToDiskIfConfigured();
    return entry;
  }

  public getAuditLogs(limit = 100): RepositoryAuditLog[] {
    this.recordSql('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    return this.auditLogs.slice(0, limit);
  }

  // ==========================================
  // 2. Users & Role Lookup
  // ==========================================
  public findUserByUsername(username: string): RepositoryUserAccount | undefined {
    this.recordSql(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND active = TRUE LIMIT 1',
      [username]
    );
    return this.users.find(
      (u) => u.active && u.username.toLowerCase() === username.toLowerCase()
    );
  }

  public findUserById(userId: string): RepositoryUserAccount | undefined {
    this.recordSql('SELECT * FROM users WHERE id = ? AND active = TRUE LIMIT 1', [
      userId,
    ]);
    return this.users.find((u) => u.active && u.id === userId);
  }

  public updateUserPasswordHash(userId: string, newPasswordHash: string): void {
    this.recordSql('UPDATE users SET password_hash = ? WHERE id = ?', [
      newPasswordHash,
      userId,
    ]);
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.passwordHash = newPasswordHash;
      this.flushToDiskIfConfigured();
    }
  }

  public getUsers(): RepositoryUserAccount[] {
    this.recordSql(
      'SELECT id, username, full_name, role, person_id, department, position, active FROM users',
      []
    );
    return structuredClone(this.users);
  }

  // ==========================================
  // 3. Personnel & Effective-Date FINGLE_ID Mappings
  // ==========================================
  public getPersonnel(filters?: {
    search?: string;
    department?: string;
    personnelType?: string;
    activeOnly?: boolean;
  }): EnginePersonnel[] {
    this.recordSql('SELECT * FROM personnel WHERE active = ?', [
      filters?.activeOnly ?? true,
    ]);
    let list = [...this.personnel];
    if (filters?.activeOnly !== false) {
      list = list.filter((p) => p.active);
    }
    if (filters?.department && filters.department !== 'ALL') {
      list = list.filter(
        (p) =>
          p.department === filters.department ||
          p.groupName === filters.department
      );
    }
    if (filters?.personnelType && filters.personnelType !== 'ALL') {
      list = list.filter((p) => p.personnelType === filters.personnelType);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.personId.toLowerCase().includes(q) ||
          String(p.fingleId).includes(q) ||
          `${p.prefix}${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q)
      );
    }
    return structuredClone(list);
  }

  public getFingerprintMappings(personId?: string): EngineFingerprintMapping[] {
    if (personId) {
      this.recordSql(
        'SELECT * FROM fingerprint_mappings WHERE person_id = ? ORDER BY effective_from DESC',
        [personId]
      );
      return structuredClone(
        this.fingerprintMappings.filter((m) => m.personId === personId)
      );
    }
    this.recordSql(
      'SELECT * FROM fingerprint_mappings ORDER BY effective_from DESC',
      []
    );
    return structuredClone(this.fingerprintMappings);
  }

  public upsertPersonnelFromHosOffice(
    incomingPersonnel: ReadonlyArray<EnginePersonnel>,
    syncDateStr = '2026-11-06',
    actor = 'SYSTEM_HOSOFFICE_SYNC'
  ): {
    insertedCount: number;
    updatedCount: number;
    fingleIdChangedCount: number;
    disputedMappings: Array<{ fingleId: number; personIds: string[]; reason: string }>;
  } {
    let insertedCount = 0;
    let updatedCount = 0;
    let fingleIdChangedCount = 0;

    const fingleToPersons = new Map<number, string[]>();
    for (const p of incomingPersonnel) {
      if (p.active && p.fingleId > 0) {
        if (!fingleToPersons.has(p.fingleId)) {
          fingleToPersons.set(p.fingleId, []);
        }
        fingleToPersons.get(p.fingleId)!.push(p.personId);
      }
    }

    const disputedMappings: Array<{
      fingleId: number;
      personIds: string[];
      reason: string;
    }> = [];
    for (const [fingleId, pids] of fingleToPersons.entries()) {
      if (pids.length > 1) {
        disputedMappings.push({
          fingleId,
          personIds: pids,
          reason: `พบ FINGLE_ID #${fingleId} ซ้ำกันในบุคลากร ${pids.join(', ')} ต้องให้เจ้าหน้าที่ตรวจสอบ Mapping`,
        });
      }
    }

    const disputedFingleIds = new Set(disputedMappings.map((d) => d.fingleId));

    for (const incoming of incomingPersonnel) {
      if (!incoming.personId || incoming.personId.trim() === '') {
        continue;
      }

      const existingIdx = this.personnel.findIndex(
        (p) => p.personId === incoming.personId
      );
      const isDisputed = disputedFingleIds.has(incoming.fingleId);

      if (existingIdx === -1) {
        insertedCount++;
        const created: EnginePersonnel = {
          ...incoming,
          lastHosOfficeSync: `${syncDateStr} 08:00:00`,
        };
        this.personnel.push(created);

        this.recordSql(
          'INSERT INTO personnel (person_id, fingle_id_current, prefix, first_name, last_name, position, department, group_name, personnel_type, active, last_hosoffice_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            created.personId,
            created.fingleId,
            created.prefix,
            created.firstName,
            created.lastName,
            created.position,
            created.department,
            created.groupName,
            created.personnelType,
            created.active,
            created.lastHosOfficeSync,
          ]
        );

        if (created.fingleId > 0) {
          this.fingerprintMappings.push({
            id: `FM_${created.personId}_${created.fingleId}_${syncDateStr.replace(/-/g, '')}`,
            personId: created.personId,
            fingleId: created.fingleId,
            effectiveFrom: '2020-01-01',
            effectiveTo: null,
            status: isDisputed ? 'DISPUTED' : 'ACTIVE',
          });
        }
      } else {
        const prev = this.personnel[existingIdx];
        updatedCount++;

        if (prev.fingleId !== incoming.fingleId && incoming.fingleId > 0) {
          fingleIdChangedCount++;
          const prevDayMs =
            AttendanceCalculator.parseWorkDateToEpochMs(syncDateStr) - 86400000;
          const prevDayStr = AttendanceCalculator.formatEpochMs(prevDayMs).dateStr;

          this.fingerprintMappings.forEach((m) => {
            if (m.personId === prev.personId && m.status === 'ACTIVE') {
              m.effectiveTo = prevDayStr;
              m.status = 'SUPERSEDED';
            }
          });

          this.fingerprintMappings.push({
            id: `FM_${incoming.personId}_${incoming.fingleId}_${syncDateStr.replace(/-/g, '')}`,
            personId: incoming.personId,
            fingleId: incoming.fingleId,
            effectiveFrom: syncDateStr,
            effectiveTo: null,
            status: isDisputed ? 'DISPUTED' : 'ACTIVE',
          });
        } else if (isDisputed) {
          this.fingerprintMappings.forEach((m) => {
            if (m.fingleId === incoming.fingleId && m.status === 'ACTIVE') {
              m.status = 'DISPUTED';
            }
          });
        }

        this.personnel[existingIdx] = {
          ...prev,
          ...incoming,
          lastHosOfficeSync: `${syncDateStr} 08:00:00`,
        };

        this.recordSql(
          'UPDATE personnel SET fingle_id_current = ?, prefix = ?, first_name = ?, last_name = ?, position = ?, department = ?, group_name = ?, personnel_type = ?, active = ?, last_hosoffice_sync = ? WHERE person_id = ?',
          [
            incoming.fingleId,
            incoming.prefix,
            incoming.firstName,
            incoming.lastName,
            incoming.position,
            incoming.department,
            incoming.groupName,
            incoming.personnelType,
            incoming.active,
            `${syncDateStr} 08:00:00`,
            incoming.personId,
          ]
        );
      }
    }

    this.recordAuditLog({
      actor,
      action: 'SYNC_HOSOFFICE_PERSONNEL',
      entityType: 'Personnel',
      entityId: 'BATCH',
      summary: `ซิงค์ข้อมูลบุคลากรจาก HOSOffice: เพิ่มใหม่ ${insertedCount}, อัปเดต ${updatedCount}, เปลี่ยน FINGLE_ID ${fingleIdChangedCount}, พบปัญหา Mapping ซ้ำ ${disputedMappings.length}`,
      metadata: {
        insertedCount,
        updatedCount,
        fingleIdChangedCount,
        disputedMappings,
      },
    });

    this.flushToDiskIfConfigured();
    return {
      insertedCount,
      updatedCount,
      fingleIdChangedCount,
      disputedMappings,
    };
  }

  // ==========================================
  // 4. Shifts & Shift Assignments
  // ==========================================
  public getShifts(): EngineShiftConfig[] {
    this.recordSql('SELECT * FROM shifts ORDER BY start_time ASC', []);
    return structuredClone(this.shifts);
  }

  public saveShift(shift: EngineShiftConfig, actor = 'STAFF'): EngineShiftConfig {
    const idx = this.shifts.findIndex((s) => s.id === shift.id);
    if (idx !== -1) {
      this.shifts[idx] = structuredClone(shift);
      this.recordSql(
        'UPDATE shifts SET code = ?, name = ?, category = ?, start_time = ?, end_time = ?, cross_midnight = ?, grace_minutes = ?, active = ? WHERE id = ?',
        [
          shift.code,
          shift.name,
          shift.category,
          shift.startTime,
          shift.endTime,
          shift.crossMidnight,
          shift.graceMinutes,
          shift.active,
          shift.id,
        ]
      );
    } else {
      this.shifts.push(structuredClone(shift));
      this.recordSql(
        'INSERT INTO shifts (id, code, name, category, start_time, end_time, cross_midnight, grace_minutes, early_scan_window_minutes, late_scan_window_minutes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          shift.id,
          shift.code,
          shift.name,
          shift.category,
          shift.startTime,
          shift.endTime,
          shift.crossMidnight,
          shift.graceMinutes,
          shift.earlyScanWindowMinutes,
          shift.lateScanWindowMinutes,
          shift.active,
        ]
      );
    }

    this.recordAuditLog({
      actor,
      action: 'SAVE_SHIFT_CONFIG',
      entityType: 'Shift',
      entityId: shift.id,
      summary: `บันทึกข้อมูลกะ "${shift.name}" (${shift.startTime}-${shift.endTime})`,
    });

    this.flushToDiskIfConfigured();
    return structuredClone(shift);
  }

  public getShiftAssignments(filters?: {
    personId?: string;
    workDate?: string;
    fromDate?: string;
    toDate?: string;
    includeCancelled?: boolean;
  }): EngineShiftAssignment[] {
    this.recordSql('SELECT * FROM shift_assignments WHERE status = ?', [
      filters?.includeCancelled ? 'ALL' : 'ACTIVE',
    ]);
    let list = [...this.assignments];
    if (!filters?.includeCancelled) {
      list = list.filter((a) => a.status !== 'CANCELLED');
    }
    if (filters?.personId) {
      list = list.filter((a) => a.personId === filters.personId);
    }
    if (filters?.workDate) {
      list = list.filter((a) => a.workDate === filters.workDate);
    }
    if (filters?.fromDate) {
      list = list.filter((a) => a.workDate >= filters.fromDate!);
    }
    if (filters?.toDate) {
      list = list.filter((a) => a.workDate <= filters.toDate!);
    }
    return structuredClone(list);
  }

  public assignShift(
    assignment: Omit<EngineShiftAssignment, 'id' | 'status'> & { id?: string },
    actor = 'STAFF'
  ): {
    success: boolean;
    assignment?: EngineShiftAssignment;
    error?: string;
  } {
    const shift = this.shifts.find((s) => s.id === assignment.shiftId);
    if (!shift || !shift.active) {
      return {
        success: false,
        error: `ไม่พบกะที่เปิดใช้งาน (${assignment.shiftId})`,
      };
    }

    const duplicate = this.assignments.find(
      (a) =>
        a.status !== 'CANCELLED' &&
        a.personId === assignment.personId &&
        a.workDate === assignment.workDate &&
        a.shiftId === assignment.shiftId
    );
    if (duplicate) {
      return {
        success: false,
        error: `บุคลากร ${assignment.personId} มีกะ "${shift.name}" ในวันที่ ${assignment.workDate} อยู่แล้ว (Unique Constraint uq_person_work_shift)`,
      };
    }

    const candidateAssignment: EngineShiftAssignment = {
      id:
        assignment.id ||
        `SA_${assignment.personId}_${assignment.workDate.replace(/-/g, '')}_${assignment.shiftId}`,
      personId: assignment.personId,
      workDate: assignment.workDate,
      shiftId: assignment.shiftId,
      assignmentType: assignment.assignmentType,
      shiftName: shift.name,
      shiftStartTime: shift.startTime,
      shiftEndTime: shift.endTime,
      crossMidnight: shift.crossMidnight,
      graceMinutes: shift.graceMinutes,
      shiftCategory: shift.category,
      status: 'ACTIVE',
    };

    const existingForPerson = this.assignments
      .filter(
        (a) => a.status !== 'CANCELLED' && a.personId === assignment.personId
      )
      .map((a) => ({
        assignment: a,
        shift:
          this.shifts.find((s) => s.id === a.shiftId) || {
            id: a.shiftId,
            code: a.shiftId,
            name: a.shiftName || a.shiftId,
            category: a.shiftCategory || 'MORNING',
            startTime: a.shiftStartTime || '08:00',
            endTime: a.shiftEndTime || '16:00',
            crossMidnight: a.crossMidnight ?? false,
            graceMinutes: a.graceMinutes ?? 15,
            earlyScanWindowMinutes: 180,
            lateScanWindowMinutes: 240,
            active: true,
          },
      }));

    const checkOverlap = AttendanceCalculator.validateNonOverlappingAssignments([
      ...existingForPerson,
      { assignment: candidateAssignment, shift },
    ]);

    if (!checkOverlap.valid) {
      return {
        success: false,
        error: checkOverlap.overlaps[0].reason,
      };
    }

    this.assignments.push(candidateAssignment);
    this.recordSql(
      'INSERT INTO shift_assignments (id, person_id, work_date, shift_id, assignment_type, shift_name_snapshot, shift_start_snapshot, shift_end_snapshot, cross_midnight_snapshot, grace_minutes_snapshot, shift_category_snapshot, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        candidateAssignment.id,
        candidateAssignment.personId,
        candidateAssignment.workDate,
        candidateAssignment.shiftId,
        candidateAssignment.assignmentType,
        candidateAssignment.shiftName,
        candidateAssignment.shiftStartTime,
        candidateAssignment.shiftEndTime,
        candidateAssignment.crossMidnight,
        candidateAssignment.graceMinutes,
        candidateAssignment.shiftCategory,
        'ACTIVE',
      ]
    );

    this.recordAuditLog({
      actor,
      action: 'ASSIGN_SHIFT',
      entityType: 'ShiftAssignment',
      entityId: candidateAssignment.id,
      summary: `กำหนดกะ "${shift.name}" ให้ ${assignment.personId} วันที่ ${assignment.workDate}`,
    });

    this.flushToDiskIfConfigured();
    return {
      success: true,
      assignment: structuredClone(candidateAssignment),
    };
  }

  public cancelShiftAssignment(params: {
    assignmentId: string;
    reason: string;
    cancelledBy: string;
  }): {
    success: boolean;
    log?: RepositoryShiftCancellationLog;
    error?: string;
  } {
    const target = this.assignments.find(
      (a) => a.id === params.assignmentId && a.status !== 'CANCELLED'
    );
    if (!target) {
      return { success: false, error: 'ไม่พบรายการจัดกะที่ต้องการยกเลิก' };
    }

    const person = this.personnel.find((p) => p.personId === target.personId);
    const personName = person
      ? `${person.prefix}${person.firstName} ${person.lastName}`
      : target.personId;
    const cancelledAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    target.status = 'CANCELLED';

    const log: RepositoryShiftCancellationLog = {
      id: `CANC_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      assignmentId: target.id,
      personId: target.personId,
      personName,
      workDate: target.workDate,
      shiftId: target.shiftId,
      shiftName: target.shiftName || target.shiftId,
      cancelledAt,
      cancelledBy: params.cancelledBy,
      reason: params.reason,
    };

    this.cancellationLogs.unshift(log);

    this.recordSql(
      'UPDATE shift_assignments SET status = ?, cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?',
      ['CANCELLED', cancelledAt, params.cancelledBy, params.reason, target.id]
    );
    this.recordSql(
      'INSERT INTO shift_cancellation_logs (id, assignment_id, person_id, person_name, work_date, shift_id, shift_name, cancelled_at, cancelled_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        log.id,
        log.assignmentId,
        log.personId,
        log.personName,
        log.workDate,
        log.shiftId,
        log.shiftName,
        log.cancelledAt,
        log.cancelledBy,
        log.reason,
      ]
    );

    this.recordAuditLog({
      actor: params.cancelledBy,
      action: 'CANCEL_SHIFT_ASSIGNMENT',
      entityType: 'ShiftAssignment',
      entityId: target.id,
      summary: `ยกเลิกกะ "${log.shiftName}" ของ ${personName} วันที่ ${target.workDate} (เหตุผล: ${params.reason})`,
    });

    this.flushToDiskIfConfigured();
    return { success: true, log };
  }

  public getShiftCancellationLogs(
    personId?: string
  ): RepositoryShiftCancellationLog[] {
    if (personId) {
      return structuredClone(
        this.cancellationLogs.filter((c) => c.personId === personId)
      );
    }
    return structuredClone(this.cancellationLogs);
  }

  // ==========================================
  // 5. Immutable Raw Scans
  // ==========================================
  public ingestRawScans(
    incomingScans: ReadonlyArray<unknown>,
    actor = 'SCANNER_SYNC'
  ): RawScanIngestionSummary {
    const existingKeys = new Set(this.rawScans.map((s) => s.dedupeKey));
    const summary = ScannerAdapter.ingestAndDeduplicateScans({
      incomingScans,
      existingDedupeKeys: existingKeys,
      personnel: this.personnel,
      fingerprintMappings: this.fingerprintMappings,
    });

    for (const ev of summary.newEvents) {
      this.rawScans.push(ev);
      this.recordSql(
        'INSERT IGNORE INTO raw_scans (id, machine_no, enroll_number, scan_datetime_raw, verify_mode, in_out_mode, work_code, mapped_person_id, mapping_status, imported_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          ev.id,
          ev.machineNo,
          ev.enrollNumber,
          ev.scanDateTime,
          ev.verifyMode,
          ev.inOutMode,
          ev.workCode,
          ev.mappedPersonId,
          ev.mappingStatus,
          ev.importedAt,
          ev.dedupeKey,
        ]
      );
    }

    if (summary.newScansCount > 0 || summary.duplicateScansCount > 0) {
      this.recordAuditLog({
        actor,
        action: 'INGEST_RAW_SCANS',
        entityType: 'RawScan',
        entityId: `BATCH_${summary.totalRead}`,
        summary: `รับข้อมูลสแกนดิบ 6 ฟิลด์: อ่าน ${summary.totalRead}, ใหม่ ${summary.newScansCount}, ซ้ำข้าม ${summary.duplicateScansCount}, ไม่พบ Mapping ${summary.unmappedScansCount}`,
      });
    }

    this.flushToDiskIfConfigured();
    return summary;
  }

  public getRawScans(filters?: {
    fromDate?: string;
    toDate?: string;
    machineNo?: number;
    enrollNumber?: number;
    personId?: string;
    mappingStatus?: 'MAPPED' | 'PENDING_MAPPING' | 'DISPUTED_MAPPING';
    page?: number;
    pageSize?: number;
  }): {
    items: ValidatedRawScanEvent[];
    total: number;
    page: number;
    pageSize: number;
  } {
    this.recordSql('SELECT * FROM raw_scans ORDER BY scan_datetime_raw DESC', []);
    let list = [...this.rawScans];

    if (filters?.fromDate) {
      list = list.filter((s) => s.workDatePart >= filters.fromDate!);
    }
    if (filters?.toDate) {
      list = list.filter((s) => s.workDatePart <= filters.toDate!);
    }
    if (filters?.machineNo !== undefined) {
      list = list.filter((s) => s.machineNo === filters.machineNo);
    }
    if (filters?.enrollNumber !== undefined) {
      list = list.filter((s) => s.enrollNumber === filters.enrollNumber);
    }
    if (filters?.personId) {
      list = list.filter((s) => s.mappedPersonId === filters.personId);
    }
    if (filters?.mappingStatus) {
      list = list.filter((s) => s.mappingStatus === filters.mappingStatus);
    }

    list.sort((a, b) => b.epochMs - a.epochMs);

    const total = list.length;
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.max(1, filters?.pageSize || 50);
    const start = (page - 1) * pageSize;

    return {
      items: list.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    };
  }

  // ==========================================
  // 6. Attendance Calculation, Reprocess & HR Review Persistence
  // ==========================================
  public previewReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string;
    filterGroupName?: string;
    filterPersonId?: string;
  }): ReprocessPreviewResult {
    return AttendanceCalculator.previewReprocess({
      fromDate: params.fromDate,
      toDate: params.toDate,
      referenceDateTime: params.referenceDateTime,
      personnel: this.personnel,
      shifts: this.shifts,
      assignments: this.assignments,
      rawScans: this.rawScans,
      fingerprintMappings: this.fingerprintMappings,
      existingAttendance: this.getHydratedAttendanceList(),
      filterGroupName: params.filterGroupName,
      filterPersonId: params.filterPersonId,
    });
  }

  public executeReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string;
    filterGroupName?: string;
    filterPersonId?: string;
    actor?: string;
  }): ReprocessExecutionResult {
    const existingHydrated = this.getHydratedAttendanceList();

    const result = AttendanceCalculator.evaluateAndReprocess({
      fromDate: params.fromDate,
      toDate: params.toDate,
      referenceDateTime: params.referenceDateTime,
      personnel: this.personnel,
      shifts: this.shifts,
      assignments: this.assignments,
      rawScans: this.rawScans,
      fingerprintMappings: this.fingerprintMappings,
      existingAttendance: existingHydrated,
      filterGroupName: params.filterGroupName,
      filterPersonId: params.filterPersonId,
    });

    for (const computed of result.records) {
      const idx = this.attendance.findIndex(
        (a) =>
          (a.businessKey && a.businessKey === computed.businessKey) ||
          (a.personId === computed.personId &&
            a.workDate === computed.workDate &&
            a.shiftId === computed.shiftId)
      );

      const savedNote = this.notes.get(computed.id);
      const savedHistory = this.reviewHistory.get(computed.id);
      if (savedNote) {
        computed.notes = structuredClone(savedNote);
      }
      if (savedHistory && savedHistory.length > 0) {
        computed.noteHistory = structuredClone(savedHistory);
        computed.hrReviewStatus = savedHistory[0].hrReviewStatus;
      }

      if (idx !== -1) {
        this.attendance[idx] = structuredClone(computed);
        this.recordSql(
          'UPDATE attendance SET checkin_at = ?, checkout_at = ?, checkin_datetime = ?, checkout_datetime = ?, late_minutes = ?, has_missing_checkout = ?, status = ?, evaluation_state = ?, hr_review_status = ?, computed_at = ?, raw_scan_in_id = ?, raw_scan_out_id = ?, modified_after_push = ? WHERE person_id = ? AND work_date = ? AND shift_id = ?',
          [
            computed.checkInAt,
            computed.checkOutAt,
            computed.checkInDateTime,
            computed.checkOutDateTime,
            computed.lateMinutes,
            computed.hasMissingCheckout,
            computed.status,
            computed.evaluationState,
            computed.hrReviewStatus,
            computed.computedAt,
            computed.rawScanInId,
            computed.rawScanOutId,
            computed.modifiedAfterPush,
            computed.personId,
            computed.workDate,
            computed.shiftId,
          ]
        );
      } else {
        this.attendance.push(structuredClone(computed));
        this.recordSql(
          'INSERT INTO attendance (id, person_id, work_date, shift_id, checkin_at, checkout_at, checkin_datetime, checkout_datetime, late_minutes, has_missing_checkout, status, evaluation_state, hr_review_status, computed_at, raw_scan_in_id, raw_scan_out_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            computed.id,
            computed.personId,
            computed.workDate,
            computed.shiftId,
            computed.checkInAt,
            computed.checkOutAt,
            computed.checkInDateTime,
            computed.checkOutDateTime,
            computed.lateMinutes,
            computed.hasMissingCheckout,
            computed.status,
            computed.evaluationState,
            computed.hrReviewStatus,
            computed.computedAt,
            computed.rawScanInId,
            computed.rawScanOutId,
          ]
        );
      }
    }

    this.recordAuditLog({
      actor: params.actor || 'STAFF',
      action: 'REPROCESS_ATTENDANCE',
      entityType: 'Attendance',
      entityId: `${params.fromDate}_to_${params.toDate}`,
      summary: `Reprocess ช่วง ${params.fromDate} ถึง ${params.toDate}: ประมวลผล ${result.reprocessedCount}, เปลี่ยนแปลง ${result.updatedCount}, คงเดิม ${result.unchangedCount}, ข้าม ${result.skippedCount}`,
    });

    this.flushToDiskIfConfigured();
    return result;
  }

  public saveHRReviewAndNote(params: {
    attendanceId: string;
    reasonCode: string;
    reasonLabel: string;
    note: string;
    hrReviewStatus: EngineHRReviewStatus;
    authorUserId: string;
    authorName: string;
  }): EngineAttendanceRecord {
    const att = this.attendance.find((a) => a.id === params.attendanceId);
    if (!att) {
      throw new Error(`ไม่พบรายการ Attendance ID: ${params.attendanceId}`);
    }

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const existingNote = this.notes.get(att.id);

    const updatedNote: EngineHRNote = {
      id:
        existingNote?.id ||
        `NOTE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      attendanceId: att.id,
      reasonCode: params.reasonCode,
      reasonLabel: params.reasonLabel,
      note: params.note,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      createdAt: existingNote?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const historyItem: EngineHRReviewHistoryItem = {
      id: `HRH_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      attendanceId: att.id,
      reasonCode: params.reasonCode,
      reasonLabel: params.reasonLabel,
      note: params.note,
      hrReviewStatus: params.hrReviewStatus,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      timestamp: nowIso,
    };

    this.notes.set(att.id, updatedNote);
    const historyList = this.reviewHistory.get(att.id) || [];
    historyList.unshift(historyItem);
    this.reviewHistory.set(att.id, historyList);

    att.hrReviewStatus = params.hrReviewStatus;
    att.notes = structuredClone(updatedNote);
    att.noteHistory = structuredClone(historyList);
    if (att.isPushedToHosOffice) {
      att.modifiedAfterPush = true;
    }

    this.recordSql(
      'INSERT INTO attendance_notes (id, attendance_id, reason_code, reason_label, note, author_user_id, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason_code = VALUES(reason_code), reason_label = VALUES(reason_label), note = VALUES(note), author_user_id = VALUES(author_user_id), author_name = VALUES(author_name), updated_at = VALUES(updated_at)',
      [
        updatedNote.id,
        updatedNote.attendanceId,
        updatedNote.reasonCode,
        updatedNote.reasonLabel,
        updatedNote.note,
        updatedNote.authorUserId,
        updatedNote.authorName,
        updatedNote.createdAt,
        updatedNote.updatedAt,
      ]
    );

    this.recordSql(
      'INSERT INTO hr_review_history (id, attendance_id, reason_code, reason_label, note, hr_review_status, author_user_id, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        historyItem.id,
        historyItem.attendanceId,
        historyItem.reasonCode,
        historyItem.reasonLabel,
        historyItem.note,
        historyItem.hrReviewStatus,
        historyItem.authorUserId,
        historyItem.authorName,
        historyItem.timestamp,
      ]
    );

    this.recordSql('UPDATE attendance SET hr_review_status = ? WHERE id = ?', [
      params.hrReviewStatus,
      att.id,
    ]);

    this.recordAuditLog({
      actor: params.authorUserId,
      actorName: params.authorName,
      action: 'SAVE_HR_REVIEW_NOTE',
      entityType: 'AttendanceRecord',
      entityId: att.id,
      summary: `บันทึกผลตรวจสอบ HR (${params.hrReviewStatus} · ${params.reasonLabel}) ของ ${att.fullName} วันที่ ${att.workDate} (คงสถานะ Attendance: ${att.status})`,
    });

    this.flushToDiskIfConfigured();
    return structuredClone(att);
  }

  private getHydratedAttendanceList(): EngineAttendanceRecord[] {
    return this.attendance.map((att) => {
      const note = this.notes.get(att.id) || att.notes;
      const history = this.reviewHistory.get(att.id) || att.noteHistory;
      return {
        ...att,
        notes: note ? structuredClone(note) : undefined,
        noteHistory: history ? structuredClone(history) : undefined,
      };
    });
  }

  public getAttendance(filters?: {
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
  }): {
    items: EngineAttendanceRecord[];
    total: number;
    page: number;
    pageSize: number;
  } {
    this.recordSql('SELECT * FROM attendance ORDER BY work_date DESC', []);
    let list = this.getHydratedAttendanceList();

    if (filters?.workDate) {
      list = list.filter((a) => a.workDate === filters.workDate);
    }
    if (filters?.fromDate) {
      list = list.filter((a) => a.workDate >= filters.fromDate!);
    }
    if (filters?.toDate) {
      list = list.filter((a) => a.workDate <= filters.toDate!);
    }
    if (filters?.personId) {
      list = list.filter((a) => a.personId === filters.personId);
    }
    if (filters?.department && filters.department !== 'ALL') {
      list = list.filter(
        (a) =>
          a.department === filters.department ||
          a.groupName === filters.department
      );
    }
    if (filters?.status && filters.status !== 'ALL') {
      list = list.filter((a) => a.status === filters.status);
    }
    if (filters?.hrReviewStatus && filters.hrReviewStatus !== 'ALL') {
      list = list.filter((a) => a.hrReviewStatus === filters.hrReviewStatus);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.fullName.toLowerCase().includes(q) ||
          a.personId.toLowerCase().includes(q) ||
          String(a.fingleId).includes(q) ||
          a.department.toLowerCase().includes(q)
      );
    }

    list.sort(
      (a, b) =>
        b.workDate.localeCompare(a.workDate) ||
        a.shiftStartTime.localeCompare(b.shiftStartTime) ||
        a.fullName.localeCompare(b.fullName, 'th')
    );

    const total = list.length;
    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.max(1, filters?.pageSize || 50);
    const start = (page - 1) * pageSize;

    return {
      items: list.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    };
  }

  public recordPushPreviewHistory(entry: RepositoryPushHistory): void {
    this.recordSql(
      'INSERT INTO push_history (id, attendance_id, person_id, work_date, shift_id, status, target, idempotency_key, pushed_by, pushed_by_name, pushed_at, response_status, response_summary, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        entry.id,
        entry.attendanceId,
        entry.personId,
        entry.workDate,
        entry.shiftId,
        entry.status,
        entry.target,
        entry.idempotencyKey,
        entry.pushedBy,
        entry.pushedByName,
        entry.pushedAt,
        entry.responseStatus,
        entry.responseSummary,
        entry.payloadJson || null,
      ]
    );
    this.pushHistory.unshift(entry);
    this.flushToDiskIfConfigured();
  }

  public getPushHistory(): RepositoryPushHistory[] {
    return structuredClone(this.pushHistory);
  }
}

/**
 * Factory to create the appropriate Repository instance based on `RepositoryMode` (`MOCK` | `TEST` | `REAL`) (§2).
 * - `REAL` creates `MySqlSamAttRepository` with zero seed data and throws `DatabaseUnavailableError` if unconfigured.
 */
export function createRepositoryForMode(options?: {
  mode?: RepositoryMode;
  mysqlPoolOrConfig?: SqlConnectionPool | MySqlConnectionConfig;
  persistenceFilePath?: string;
}): ISamAttRepository {
  const mode: RepositoryMode =
    options?.mode ||
    ((process.env.SAM_ATT_REPO_MODE as RepositoryMode) || 'MOCK');

  if (mode === 'REAL') {
    return new MySqlSamAttRepository(options?.mysqlPoolOrConfig);
  }

  if (mode === 'TEST') {
    return new SamAttRepository({
      mode: 'TEST',
      persistenceFilePath: options?.persistenceFilePath,
    });
  }

  return new SamAttRepository({ mode: 'MOCK' });
}
