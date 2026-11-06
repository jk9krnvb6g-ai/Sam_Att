/**
 * Sam_Att V2 — Mock Attendance & Scanner Integration Service
 * Simulates server-side logic, deterministic late calculation, deduplication of 6-field raw JSON,
 * Reprocess from raw events, NO_SCAN notes, and manual HOSOffice push.
 */

import {
  AttendanceRecord,
  RawScanEvent,
  ScannerDevice,
  SyncRunLog,
  PushHistory,
  Personnel,
  Shift,
  ShiftAssignment,
  DashboardSummary,
  NoScanReasonCode,
} from '../types/attendance';
import {
  MOCK_ATTENDANCE,
  MOCK_HISTORICAL_ATTENDANCE,
  MOCK_RAW_SCANS,
  MOCK_SCANNERS,
  MOCK_SYNC_RUNS,
  MOCK_PUSH_HISTORY,
  MOCK_PERSONNEL,
  MOCK_SHIFTS,
  MOCK_SHIFT_ASSIGNMENTS,
} from '../mock/mockData';

class MockAttendanceService {
  private attendance: AttendanceRecord[] = [...MOCK_ATTENDANCE, ...MOCK_HISTORICAL_ATTENDANCE];
  private rawScans: RawScanEvent[] = [...MOCK_RAW_SCANS];
  private scanners: ScannerDevice[] = [...MOCK_SCANNERS];
  private syncRuns: SyncRunLog[] = [...MOCK_SYNC_RUNS];
  private pushHistory: PushHistory[] = [...MOCK_PUSH_HISTORY];
  private personnel: Personnel[] = [...MOCK_PERSONNEL];
  private shifts: Shift[] = [...MOCK_SHIFTS];
  private assignments: ShiftAssignment[] = [...MOCK_SHIFT_ASSIGNMENTS];

  // ==========================================
  // Attendance Queries
  // ==========================================

  public getAttendance(params?: {
    workDate?: string;
    personId?: string;
    department?: string;
    groupName?: string;
    status?: string;
    searchQuery?: string;
  }): AttendanceRecord[] {
    let list = [...this.attendance];

    if (params?.workDate) {
      list = list.filter((r) => r.workDate === params.workDate);
    }
    if (params?.personId) {
      list = list.filter((r) => r.personId === params.personId);
    }
    if (params?.department && params.department !== 'ALL') {
      list = list.filter((r) => r.department === params.department);
    }
    if (params?.groupName && params.groupName !== 'ALL') {
      list = list.filter((r) => r.groupName === params.groupName);
    }
    if (params?.status && params.status !== 'ALL') {
      list = list.filter((r) => r.status === params.status);
    }
    if (params?.searchQuery) {
      const q = params.searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.personId.toLowerCase().includes(q) ||
          String(r.fingleId).includes(q) ||
          r.department.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.workDate.localeCompare(a.workDate) || a.fullName.localeCompare(b.fullName));
  }

  public getMyAttendance(personId: string, fromDate?: string, toDate?: string): AttendanceRecord[] {
    let list = this.attendance.filter((r) => r.personId === personId);
    if (fromDate) {
      list = list.filter((r) => r.workDate >= fromDate);
    }
    if (toDate) {
      list = list.filter((r) => r.workDate <= toDate);
    }
    return list.sort((a, b) => b.workDate.localeCompare(a.workDate));
  }

  // ==========================================
  // Deterministic Late Calculation Core
  // lateMinutes = max(0, actualCheckIn - shiftStart - grace)
  // ==========================================

  public calculateLate(checkInTimeStr: string, shiftStartTimeStr: string, graceMinutes: number): { isLate: boolean; lateMinutes: number } {
    const [cHour, cMin] = checkInTimeStr.split(':').map(Number);
    const [sHour, sMin] = shiftStartTimeStr.split(':').map(Number);

    const checkInMins = cHour * 60 + cMin;
    const shiftStartMins = sHour * 60 + sMin;
    const allowedThreshold = shiftStartMins + graceMinutes;

    if (checkInMins > allowedThreshold) {
      return {
        isLate: true,
        lateMinutes: checkInMins - allowedThreshold,
      };
    }
    return { isLate: false, lateMinutes: 0 };
  }

  // ==========================================
  // Scanner Raw Scan Ingestion & Deduplication
  // ==========================================

  public getScanners(): ScannerDevice[] {
    return [...this.scanners];
  }

  public getRawScans(): RawScanEvent[] {
    return [...this.rawScans].sort((a, b) => b.scanDateTime.localeCompare(a.scanDateTime));
  }

  public getSyncRuns(): SyncRunLog[] {
    return [...this.syncRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * Ingest raw scans according to MASTER DEVELOPMENT PROMPT §14:
   * 6 fields: machineNo, enrollNumber, scanDateTime, verifyMode, inOutMode, workCode
   */
  public ingestRawScans(
    incomingScans: Array<{
      machineNo: number;
      enrollNumber: number;
      scanDateTime: string;
      verifyMode: number;
      inOutMode: number;
      workCode: number | null;
    }>,
    mode: 'MANUAL' | 'SCHEDULED' = 'MANUAL',
    targetMachineNo?: number
  ): { totalRead: number; newScans: number; duplicateScans: number; unmappedScans: number } {
    let newCount = 0;
    let duplicateCount = 0;
    let unmappedCount = 0;
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const existingKeys = new Set(this.rawScans.map((s) => s.dedupeKey));
    const activeFingleIds = new Set(this.personnel.filter((p) => p.active).map((p) => p.fingleId));

    const newlyAdded: RawScanEvent[] = [];

    for (const scan of incomingScans) {
      const dedupeKey = `${scan.machineNo}_${scan.enrollNumber}_${scan.scanDateTime}`;
      if (existingKeys.has(dedupeKey)) {
        duplicateCount++;
        continue;
      }

      const isMapped = activeFingleIds.has(scan.enrollNumber);
      if (!isMapped) {
        unmappedCount++;
      }

      const newEvent: RawScanEvent = {
        id: `RAW_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        machineNo: scan.machineNo,
        enrollNumber: scan.enrollNumber,
        scanDateTime: scan.scanDateTime,
        verifyMode: scan.verifyMode,
        inOutMode: scan.inOutMode,
        workCode: scan.workCode,
        importedAt: nowIso,
        dedupeKey,
        isNew: true,
      };

      existingKeys.add(dedupeKey);
      this.rawScans.unshift(newEvent);
      newlyAdded.push(newEvent);
      newCount++;
    }

    // Record Sync Run
    const syncLog: SyncRunLog = {
      id: `SYNC_${Date.now()}`,
      deviceId: targetMachineNo ? `SC0${targetMachineNo}` : 'SC_ALL',
      machineNo: targetMachineNo ?? 1,
      deviceName: targetMachineNo
        ? this.scanners.find((s) => s.machineNo === targetMachineNo)?.name || `เครื่อง ${targetMachineNo}`
        : 'เครื่องสแกนทั้งหมด (Sync All)',
      mode,
      startedAt: nowIso,
      finishedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      status: 'SUCCESS',
      totalRead: incomingScans.length,
      newScans: newCount,
      duplicateScans: duplicateCount,
      unmappedScans: unmappedCount,
      latestEventAt: incomingScans[0]?.scanDateTime || null,
      errorMessage: null,
    };
    this.syncRuns.unshift(syncLog);

    // Update scanner lastSyncAt
    if (targetMachineNo) {
      const scanner = this.scanners.find((s) => s.machineNo === targetMachineNo);
      if (scanner) {
        scanner.lastSyncAt = nowIso;
        if (incomingScans[0]) scanner.lastEventAt = incomingScans[0].scanDateTime;
      }
    } else {
      this.scanners.forEach((s) => {
        s.lastSyncAt = nowIso;
      });
    }

    // Auto-compute attendance for newly mapped scans
    if (newCount > 0) {
      this.reprocessAttendance('2026-11-06', '2026-11-06');
    }

    return {
      totalRead: incomingScans.length,
      newScans: newCount,
      duplicateScans: duplicateCount,
      unmappedScans: unmappedCount,
    };
  }

  /**
   * Simulate a manual sync against the hospital scanner devices.
   * Generates mock scans adhering to the exact 6-field JSON schema.
   */
  public triggerMockScannerSync(machineNo?: number): {
    totalRead: number;
    newScans: number;
    duplicateScans: number;
    unmappedScans: number;
  } {
    // Generate mock scans for demonstration
    const sampleTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const mockBatch = [
      {
        machineNo: machineNo ?? 1,
        enrollNumber: 101, // Dr. Sudarat
        scanDateTime: '2026-11-06 08:15:20', // Duplicate of existing
        verifyMode: 268435456,
        inOutMode: 1,
        workCode: null,
      },
      {
        machineNo: machineNo ?? 1,
        enrollNumber: 102, // Nurse Wichai
        scanDateTime: '2026-11-06 08:28:45', // Duplicate of existing
        verifyMode: 268435456,
        inOutMode: 1,
        workCode: null,
      },
      {
        machineNo: machineNo ?? 3,
        enrollNumber: 111, // Nurse Orathai (New afternoon scan)
        scanDateTime: '2026-11-06 15:45:10',
        verifyMode: 268435456,
        inOutMode: 1,
        workCode: null,
      },
    ];

    return this.ingestRawScans(mockBatch, 'MANUAL', machineNo);
  }

  // ==========================================
  // Attendance Review & Reprocess
  // ==========================================

  public setNoScanReason(
    attendanceId: string,
    reasonCode: NoScanReasonCode,
    reasonLabel: string,
    note: string,
    authorUserId: string,
    authorName: string
  ): AttendanceRecord {
    const record = this.attendance.find((a) => a.id === attendanceId);
    if (!record) throw new Error('Record not found');

    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    record.notes = {
      id: `NOTE_${Date.now()}`,
      attendanceId,
      reasonCode,
      reasonLabel,
      note,
      authorUserId,
      authorName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (record.isPushedToHosOffice) {
      record.modifiedAfterPush = true;
    }

    return record;
  }

  /**
   * Deterministic Reprocess from Raw Scans + Personnel + Shifts.
   * Preserves existing notes and push histories.
   */
  public reprocessAttendance(fromDate: string, toDate: string): {
    reprocessedCount: number;
    updatedCount: number;
    errorsCount: number;
  } {
    let reprocessed = 0;
    let updated = 0;

    // Filter relevant raw scans within date range
    const filteredRaw = this.rawScans.filter((raw) => {
      const rawDate = raw.scanDateTime.slice(0, 10);
      return rawDate >= fromDate && rawDate <= toDate;
    });

    // Map by fingleId + date
    const rawByPersonDate = new Map<string, RawScanEvent[]>();
    filteredRaw.forEach((raw) => {
      const rawDate = raw.scanDateTime.slice(0, 10);
      const key = `${raw.enrollNumber}_${rawDate}`;
      if (!rawByPersonDate.has(key)) rawByPersonDate.set(key, []);
      rawByPersonDate.get(key)!.push(raw);
    });

    // For every attendance record in that range, re-evaluate
    this.attendance.forEach((att) => {
      if (att.workDate >= fromDate && att.workDate <= toDate) {
        reprocessed++;
        const key = `${att.fingleId}_${att.workDate}`;
        const scans = rawByPersonDate.get(key) || [];

        if (scans.length > 0) {
          // Sort ascending
          scans.sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));
          const firstScan = scans[0];
          const checkInTime = firstScan.scanDateTime.split(' ')[1];

          // Compute late
          const shift = this.shifts.find((s) => s.id === att.shiftId) || this.shifts[3];
          const lateCalc = this.calculateLate(checkInTime, shift.startTime, shift.graceMinutes);

          const previousStatus = att.status;
          att.checkInAt = checkInTime;
          att.lateMinutes = lateCalc.lateMinutes;
          att.status = lateCalc.isLate ? 'LATE' : 'NORMAL';
          att.rawScanInId = firstScan.id;
          att.computedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

          if (previousStatus !== att.status) {
            updated++;
            if (att.isPushedToHosOffice) {
              att.modifiedAfterPush = true;
            }
          }
        }
      }
    });

    return {
      reprocessedCount: reprocessed,
      updatedCount: updated,
      errorsCount: 0,
    };
  }

  // ==========================================
  // HOSOffice Manual Direct Push
  // (No multi-step approval workflow needed, per MASTER PROMPT §4.9)
  // ==========================================

  public getPushHistory(): PushHistory[] {
    return [...this.pushHistory].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
  }

  public pushToHosOffice(
    attendanceIds: string[],
    pushedBy: string,
    pushedByName: string
  ): { successCount: number; failureCount: number; items: PushHistory[] } {
    let successCount = 0;
    const items: PushHistory[] = [];
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    attendanceIds.forEach((id) => {
      const att = this.attendance.find((a) => a.id === id);
      if (!att) return;

      const idempotencyKey = `HASH_${att.personId}_${att.workDate.replace(/-/g, '')}_${att.status}_${Date.now()}`;
      const historyItem: PushHistory = {
        id: `PUSH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        attendanceId: att.id,
        personId: att.personId,
        fullName: att.fullName,
        workDate: att.workDate,
        status: att.status,
        target: 'HOSOffice_Attend',
        idempotencyKey,
        pushedBy,
        pushedByName,
        pushedAt: nowIso,
        responseStatus: 'SUCCESS',
        responseSummary:
          att.status === 'NO_SCAN' && att.notes
            ? `บันทึกหมายเหตุ (${att.notes.reasonLabel}) สำเร็จ [HOS-BATCH-${nowIso.slice(0, 10)}]`
            : `บันทึกเวลาเข้า (${att.checkInAt || 'ไม่มี'}) สถานะ ${att.status} สำเร็จ`,
      };

      att.isPushedToHosOffice = true;
      att.lastPushedAt = nowIso;
      att.modifiedAfterPush = false;

      this.pushHistory.unshift(historyItem);
      items.push(historyItem);
      successCount++;
    });

    return {
      successCount,
      failureCount: 0,
      items,
    };
  }

  // ==========================================
  // Personnel & Shifts
  // ==========================================

  public getPersonnel(): Personnel[] {
    return [...this.personnel];
  }

  public syncPersonnelFromHosOffice(): { updatedCount: number; newCount: number } {
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    this.personnel.forEach((p) => {
      p.lastHosOfficeSync = nowIso;
    });
    return {
      updatedCount: this.personnel.length,
      newCount: 0,
    };
  }

  public getShifts(): Shift[] {
    return [...this.shifts];
  }

  public getShiftAssignments(workDate: string): ShiftAssignment[] {
    return this.assignments.filter((a) => a.workDate === workDate);
  }

  // ==========================================
  // Dashboard & Reports Metrics
  // (Clear distinct late people vs late occurrences, clear late divisor)
  // ==========================================

  public getDashboardSummary(workDate: string = '2026-11-06'): DashboardSummary {
    const dayRecords = this.attendance.filter((r) => r.workDate === workDate);

    const totalPersonnel = this.personnel.filter((p) => p.active).length;
    const totalShiftsToday = dayRecords.length;
    const normalCount = dayRecords.filter((r) => r.status === 'NORMAL').length;

    // Distinct late persons
    const lateRecords = dayRecords.filter((r) => r.status === 'LATE');
    const distinctLatePeopleSet = new Set(lateRecords.map((r) => r.personId));
    const distinctLatePeople = distinctLatePeopleSet.size;
    const totalLateOccurrences = lateRecords.length;

    const noScanCount = dayRecords.filter((r) => r.status === 'NO_SCAN').length;
    const missingCheckoutCount = dayRecords.filter((r) => r.status === 'MISSING_CHECKOUT').length;

    const totalLateMinutes = lateRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    // Explicit denominator per MASTER PROMPT §4.2: totalLateMinutes / totalLateOccurrences
    const avgLateMinutesPerLateShift =
      totalLateOccurrences > 0 ? Math.round(totalLateMinutes / totalLateOccurrences) : 0;

    // Department grouping
    const deptMap = new Map<
      string,
      { total: number; lateCount: number; noScanCount: number; normalCount: number }
    >();

    dayRecords.forEach((r) => {
      const dept = r.department;
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { total: 0, lateCount: 0, noScanCount: 0, normalCount: 0 });
      }
      const entry = deptMap.get(dept)!;
      entry.total++;
      if (r.status === 'LATE') entry.lateCount++;
      if (r.status === 'NO_SCAN') entry.noScanCount++;
      if (r.status === 'NORMAL') entry.normalCount++;
    });

    const departmentSummaries = Array.from(deptMap.entries()).map(([department, data]) => ({
      department,
      ...data,
    }));

    return {
      workDate,
      totalPersonnel,
      totalShiftsToday,
      normalCount,
      distinctLatePeople,
      totalLateOccurrences,
      noScanCount,
      missingCheckoutCount,
      totalLateMinutes,
      avgLateMinutesPerLateShift,
      departmentSummaries,
    };
  }

  public getLateRankings(params: {
    fromDate: string;
    toDate: string;
    order: 'DESC' | 'ASC'; // Most Late or Least Late
    department?: string;
  }): Array<{
    personId: string;
    fullName: string;
    department: string;
    lateOccurrences: number;
    totalLateMinutes: number;
    avgLateMinutes: number;
  }> {
    const records = this.attendance.filter(
      (r) =>
        r.workDate >= params.fromDate &&
        r.workDate <= params.toDate &&
        (params.department && params.department !== 'ALL' ? r.department === params.department : true)
    );

    const aggMap = new Map<
      string,
      {
        personId: string;
        fullName: string;
        department: string;
        lateOccurrences: number;
        totalLateMinutes: number;
      }
    >();

    records.forEach((r) => {
      if (!aggMap.has(r.personId)) {
        aggMap.set(r.personId, {
          personId: r.personId,
          fullName: r.fullName,
          department: r.department,
          lateOccurrences: 0,
          totalLateMinutes: 0,
        });
      }
      if (r.status === 'LATE') {
        const item = aggMap.get(r.personId)!;
        item.lateOccurrences++;
        item.totalLateMinutes += r.lateMinutes;
      }
    });

    const list = Array.from(aggMap.values()).map((item) => ({
      ...item,
      avgLateMinutes: item.lateOccurrences > 0 ? Math.round(item.totalLateMinutes / item.lateOccurrences) : 0,
    }));

    return list.sort((a, b) => {
      if (params.order === 'DESC') {
        return b.lateOccurrences - a.lateOccurrences || b.totalLateMinutes - a.totalLateMinutes;
      } else {
        return a.lateOccurrences - b.lateOccurrences || a.totalLateMinutes - b.totalLateMinutes;
      }
    });
  }
}

export const mockAttendanceService = new MockAttendanceService();
