/**
 * Sam_Att V2 — Mock Attendance & Scanner Integration Service
 * Simulates server-side logic, deterministic late calculation, deduplication of 6-field raw JSON,
 * Reprocess from raw events, NO_SCAN notes, manual HOSOffice push,
 * Personnel Type Schedule Matrix CRUD, Shift Assignments, Scanner & Daily Sync Schedule CRUD,
 * HR Attendance Summary aggregation, and Audit Logging.
 */

import {
  AttendanceRecord,
  RawScanEvent,
  ScannerDevice,
  SyncScheduleSlot,
  SyncRunLog,
  AuditLogEntry,
  PushHistory,
  Personnel,
  Shift,
  ShiftVisualCategory,
  NoShiftStatusType,
  PersonnelTypeScheduleRule,
  ShiftAssignment,
  ShiftCancellationLog,
  ShiftConfigDeactivationLog,
  DashboardSummary,
  HRPersonSummary,
  HRReviewStatus,
  NoScanReasonCode,
  UserRole,
} from '../types/attendance';
import { ScannerAdapter } from '../../backend/services/scannerAdapter';
import { AttendanceCalculator } from '../../backend/services/attendanceCalculator';
import { apiAttendanceAdapter } from './apiAttendanceAdapter';

export const CURRENT_SYSTEM_DATE = '2026-11-06';

export function isPastWorkDate(workDate: string): boolean {
  return workDate < CURRENT_SYSTEM_DATE;
}

class MockAttendanceService {
  private attendance: AttendanceRecord[] = [];
  private rawScans: RawScanEvent[] = [];
  private scanners: ScannerDevice[] = [];
  private syncSchedules: SyncScheduleSlot[] = [];
  private syncRuns: SyncRunLog[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private pushHistory: PushHistory[] = [];
  private personnel: Personnel[] = [];
  private shifts: Shift[] = [];
  private personnelTypeRules: PersonnelTypeScheduleRule[] = [];
  private assignments: ShiftAssignment[] = [];
  private scheduledDayOffs: Array<{ personId: string; workDate: string; note: string }> = [];
  private shiftConfigDeactivationLogs: ShiftConfigDeactivationLog[] = [];
  private cancellationLogs: ShiftCancellationLog[] = [];

  private lastApiError: string | null = null;
  private isHydrating = false;

  public getLastApiError(): string | null {
    return this.lastApiError;
  }

  public getIsHydrating(): boolean {
    return this.isHydrating;
  }

  private notifyHydrated(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sam-att-data-hydrated'));
    }
  }

  public clearState(): void {
    this.attendance = [];
    this.rawScans = [];
    this.scanners = [];
    this.syncSchedules = [];
    this.syncRuns = [];
    this.auditLogs = [];
    this.pushHistory = [];
    this.personnel = [];
    this.shifts = [];
    this.personnelTypeRules = [];
    this.assignments = [];
    this.cancellationLogs = [];
    this.lastApiError = null;
    this.notifyHydrated();
  }

  /**
   * Hydrate runtime data strictly from the real Backend API (`/api/Sam_Att/*`).
   * - For `GENERAL_USER`, strictly calls ONLY `/api/Sam_Att/me/*` endpoints with full pagination.
   * - For `ADMIN` and `RESPONSIBLE_STAFF`, loads all pages from `/api/Sam_Att/*`.
   * - Never falls back to Mock Data if `/api/Sam_Att/*` returns an error or is unreachable.
   */
  public async hydrateFromRealApi(role?: UserRole): Promise<void> {
    this.isHydrating = true;
    this.lastApiError = null;
    try {
      if (role === 'GENERAL_USER') {
        const [myShiftsRes, myAttRecords, myRawScans] = await Promise.all([
          apiAttendanceAdapter.fetchMyShifts(),
          apiAttendanceAdapter.fetchAllMyAttendance(),
          apiAttendanceAdapter.fetchAllMyRawScans(),
        ]);

        this.personnel = myShiftsRes.person ? [myShiftsRes.person] : [];
        this.assignments = myShiftsRes.assignments || [];
        this.shifts = myShiftsRes.shifts || [];
        this.attendance = myAttRecords || [];
        this.rawScans = myRawScans || [];
        this.scanners = [];
        this.syncSchedules = [];
        this.personnelTypeRules = [];
        this.cancellationLogs = [];
        this.pushHistory = [];
        this.auditLogs = [];
        this.notifyHydrated();
        return;
      }

      const [
        personnelList,
        shiftsRes,
        assignmentsRes,
        attendanceList,
        rawScansList,
        pushBatchesRes,
        logsRes,
      ] = await Promise.all([
        apiAttendanceAdapter.fetchAllPersonnel(),
        apiAttendanceAdapter.fetchShifts(),
        apiAttendanceAdapter.fetchShiftAssignments(),
        apiAttendanceAdapter.fetchAllAttendance(),
        apiAttendanceAdapter.fetchAllRawScans(),
        apiAttendanceAdapter.fetchPushHistory(),
        apiAttendanceAdapter.fetchSystemLogs(200),
      ]);

      this.personnel = personnelList || [];
      this.shifts = shiftsRes || [];
      this.assignments = assignmentsRes || [];
      this.attendance = attendanceList || [];
      this.rawScans = rawScansList || [];
      this.auditLogs = logsRes || [];

      // Derive personnelTypeRules from real personnel types and real shifts loaded from Backend
      const allShiftIds = this.shifts.map((s) => s.id);
      const morningShift = this.shifts.find((s) => s.category === 'MORNING') || this.shifts[0];
      const afternoonShift =
        this.shifts.find((s) => s.category === 'AFTERNOON') || this.shifts[0];
      const nightShift = this.shifts.find((s) => s.category === 'NIGHT') || this.shifts[0];
      const otherShiftIds = this.shifts
        .filter(
          (s) =>
            s.id !== morningShift?.id &&
            s.id !== afternoonShift?.id &&
            s.id !== nightShift?.id
        )
        .map((s) => s.id);

      const distinctTypes = Array.from(
        new Set(this.personnel.map((p) => p.personnelType).filter(Boolean))
      );
      this.personnelTypeRules = distinctTypes.map((typeName, idx) => ({
        id: `PTR_${idx + 1}`,
        code: `TYPE_${idx + 1}`,
        name: typeName,
        description: `ประเภทบุคลากรจากข้อมูลจริง (${typeName})`,
        badgeChar: typeName.trim().charAt(0) || 'บ',
        hasMorning: Boolean(morningShift),
        morningShiftId: morningShift?.id,
        morningStart: morningShift?.startTime || '08:00',
        morningEnd: morningShift?.endTime || '16:00',
        morningLateCutoff: morningShift?.startTime || '08:00',
        morningGraceMinutes: morningShift?.graceMinutes ?? 15,
        hasAfternoon: Boolean(afternoonShift),
        afternoonShiftId: afternoonShift?.id,
        afternoonStart: afternoonShift?.startTime || '16:00',
        afternoonEnd: afternoonShift?.endTime || '24:00',
        afternoonLateCutoff: afternoonShift?.startTime || '16:00',
        afternoonGraceMinutes: afternoonShift?.graceMinutes ?? 15,
        hasNight: Boolean(nightShift),
        nightShiftId: nightShift?.id,
        nightStart: nightShift?.startTime || '00:00',
        nightEnd: nightShift?.endTime || '08:00',
        nightCrossMidnight: Boolean(nightShift?.crossMidnight),
        nightGraceMinutes: nightShift?.graceMinutes ?? 15,
        otherShiftIds,
        shiftIds: allShiftIds,
        active: true,
      }));

      this.pushHistory = (pushBatchesRes || []).map((b) => ({
        id: b.id,
        attendanceId: b.id,
        personId: 'BATCH',
        fullName: `ชุดข้อมูลเตรียมส่ง HOSOffice (${b.recordsCount} รายการ)`,
        workDate: b.pushedAt.slice(0, 10),
        status: 'NORMAL',
        target: 'HOSOffice_Attend',
        idempotencyKey: `BATCH_${b.id}`,
        pushedBy: b.pushedBy,
        pushedByName: b.pushedBy,
        pushedAt: b.pushedAt,
        responseStatus: b.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        responseSummary: b.note,
      }));

      // Derive scanner devices strictly from real rawScans machineNo values
      const distinctMachineNos = Array.from(
        new Set(this.rawScans.map((r) => r.machineNo))
      ).sort((a, b) => a - b);
      this.scanners = distinctMachineNos.map((machineNo) => {
        const machineScans = this.rawScans.filter((r) => r.machineNo === machineNo);
        return {
          id: `SC_${machineNo}`,
          machineNo,
          name: `เครื่องสแกนหมายเลข #${machineNo}`,
          ip: '-',
          port: 4370,
          location: `จุดติดตั้งเครื่องสแกน #${machineNo}`,
          enabled: true,
          autoSyncEnabled: true,
          lastSyncAt: machineScans[0]?.importedAt || null,
          lastEventAt: machineScans[0]?.scanDateTime || null,
          lastError: null,
          status: 'ONLINE',
        };
      });

      this.notifyHydrated();
    } catch (err: unknown) {
      // Never populate mock data on API failure; expose accurate error state
      this.attendance = [];
      this.rawScans = [];
      this.scanners = [];
      this.syncSchedules = [];
      this.syncRuns = [];
      this.auditLogs = [];
      this.pushHistory = [];
      this.personnel = [];
      this.shifts = [];
      this.personnelTypeRules = [];
      this.assignments = [];
      this.cancellationLogs = [];
      this.lastApiError =
        err instanceof Error
          ? err.message
          : 'ไม่สามารถดึงข้อมูลจาก Central API Gateway (/api/Sam_Att) ได้';
      this.notifyHydrated();
    } finally {
      this.isHydrating = false;
    }
  }

  // ==========================================
  // Helper: Record Audit Log
  // ==========================================
  public recordAuditLog(params: {
    actorUsername?: string;
    actorName?: string;
    actorRole?: UserRole;
    action: AuditLogEntry['action'];
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): AuditLogEntry {
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const entry: AuditLogEntry = {
      id: `AUD_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      actorUsername: params.actorUsername || 'admin',
      actorName: params.actorName || 'ผู้ดูแลระบบ (Mock Session)',
      actorRole: params.actorRole || 'ADMIN',
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      summary: params.summary,
      metadataJson: JSON.stringify(params.metadata || {}, null, 2),
    };
    this.auditLogs.unshift(entry);
    return entry;
  }

  public getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // ==========================================
  // Attendance Queries
  // ==========================================

  public getAttendance(params?: {
    workDate?: string;
    fromDate?: string;
    toDate?: string;
    personId?: string;
    department?: string;
    groupName?: string;
    personnelType?: string;
    status?: string;
    shiftCategory?: 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
    searchQuery?: string;
  }): AttendanceRecord[] {
    let list = [...this.attendance];

    if (params?.workDate) {
      list = list.filter((r) => r.workDate === params.workDate);
    }
    if (params?.fromDate) {
      list = list.filter((r) => r.workDate >= params.fromDate!);
    }
    if (params?.toDate) {
      list = list.filter((r) => r.workDate <= params.toDate!);
    }
    if (params?.personId) {
      list = list.filter((r) => r.personId === params.personId);
    }
    if (params?.department && params.department !== 'ALL') {
      list = list.filter((r) => r.department === params.department);
    }
    if (params?.groupName && params.groupName !== 'ALL') {
      list = list.filter((r) => r.groupName === params.groupName || r.department === params.groupName);
    }
    if (params?.personnelType && params.personnelType !== 'ALL') {
      list = list.filter((r) => r.personnelType === params.personnelType);
    }
    if (params?.status && params.status !== 'ALL') {
      list = list.filter((r) => r.status === params.status);
    }
    if (params?.shiftCategory && params.shiftCategory !== 'ALL') {
      list = list.filter((r) => {
        if (params.shiftCategory === 'MORNING') {
          return r.shiftId === 'SH01' || r.shiftId === 'SH04' || r.shiftStartTime.startsWith('07:') || r.shiftStartTime.startsWith('08:');
        }
        if (params.shiftCategory === 'AFTERNOON') {
          return r.shiftId === 'SH02' || r.shiftStartTime.startsWith('16:');
        }
        if (params.shiftCategory === 'NIGHT') {
          return r.shiftId === 'SH03' || r.shiftStartTime.startsWith('00:') || r.shiftStartTime.startsWith('24:');
        }
        return true;
      });
    }
    if (params?.searchQuery) {
      const q = params.searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.personId.toLowerCase().includes(q) ||
          String(r.fingleId).includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.groupName.toLowerCase().includes(q)
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
  // HR Attendance Summary Aggregation (For HR Report Page)
  // ==========================================
  public getHRSummaries(params: {
    fromDate: string;
    toDate: string;
    groupName?: string;
    personnelType?: string;
    statusFilter?: string;
    shiftCategory?: 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
    searchQuery?: string;
  }): HRPersonSummary[] {
    const recordsInRange = this.getAttendance({
      fromDate: params.fromDate,
      toDate: params.toDate,
      groupName: params.groupName,
      personnelType: params.personnelType,
      shiftCategory: params.shiftCategory,
    });

    // Group records by personId
    const byPerson = new Map<string, AttendanceRecord[]>();
    recordsInRange.forEach((rec) => {
      if (!byPerson.has(rec.personId)) {
        byPerson.set(rec.personId, []);
      }
      byPerson.get(rec.personId)!.push(rec);
    });

    // Build summary for each active personnel matching group/personnelType
    const candidatePersonnel = this.personnel.filter((p) => {
      if (!p.active) return false;
      if (params.groupName && params.groupName !== 'ALL') {
        if (p.groupName !== params.groupName && p.department !== params.groupName) return false;
      }
      if (params.personnelType && params.personnelType !== 'ALL') {
        if (p.personnelType !== params.personnelType) return false;
      }
      if (params.searchQuery) {
        const q = params.searchQuery.toLowerCase().trim();
        const fullName = `${p.prefix}${p.firstName} ${p.lastName}`.toLowerCase();
        const matches =
          fullName.includes(q) ||
          p.personId.toLowerCase().includes(q) ||
          String(p.fingleId).includes(q) ||
          (p.cidMasked || '').toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q) ||
          p.groupName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });

    const summaries: HRPersonSummary[] = [];

    for (const p of candidatePersonnel) {
      const personRecords = byPerson.get(p.personId) || [];
      // If filtering by specific shiftCategory, only include personnel who have shifts in that category (or all if shiftCategory === 'ALL')
      if (params.shiftCategory && params.shiftCategory !== 'ALL' && personRecords.length === 0) {
        continue;
      }

      const normalCount = personRecords.filter((r) => r.status === 'NORMAL').length;
      const lateRecords = personRecords.filter((r) => r.status === 'LATE');
      const lateCount = lateRecords.length;
      const totalLateMinutes = lateRecords.reduce((s, r) => s + r.lateMinutes, 0);
      const avgLateMinutesPerLateShift =
        lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0;
      const earlyCheckoutCount = personRecords.filter(
        (r) => r.status === 'EARLY_CHECKOUT' || (r.earlyCheckoutMinutes && r.earlyCheckoutMinutes > 0)
      ).length;
      const noScanCount = personRecords.filter((r) => r.status === 'NO_SCAN').length;
      const workingDaysCount = normalCount + lateCount + earlyCheckoutCount;
      // OT strictly from explicit approvedOtHours rules—never guessed from scan timestamps
      const totalOtHours = personRecords.reduce((s, r) => s + (r.approvedOtHours || 0), 0);

      const onTimeRatePercent =
        workingDaysCount > 0 ? Math.round((normalCount / workingDaysCount) * 100) : 0;

      // Apply statusFilter if selected
      if (params.statusFilter && params.statusFilter !== 'ALL') {
        if (params.statusFilter === 'HAS_SCAN' && workingDaysCount === 0) continue;
        if (params.statusFilter === 'LATE' && lateCount === 0) continue;
        if (params.statusFilter === 'NORMAL_ONLY' && (normalCount === 0 || lateCount > 0)) continue;
        if (params.statusFilter === 'NO_SCAN' && noScanCount === 0) continue;
        if (params.statusFilter === 'HAS_OT' && totalOtHours <= 0) continue;
      }

      summaries.push({
        personId: p.personId,
        fingleId: p.fingleId,
        cidMasked: p.cidMasked || '1-7208-00xxx-xx-x',
        fullName: `${p.prefix}${p.firstName} ${p.lastName}`,
        position: p.position,
        department: p.department,
        groupName: p.groupName,
        personnelType: p.personnelType,
        totalAssignedShifts: personRecords.length,
        workingDaysCount,
        normalCount,
        lateCount,
        totalLateMinutes,
        avgLateMinutesPerLateShift,
        earlyCheckoutCount,
        totalOtHours,
        onTimeRatePercent,
        noScanCount,
        records: personRecords,
      });
    }

    return summaries;
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
  // Scanner Devices & Daily Sync Schedule Management
  // ==========================================

  public getScanners(): ScannerDevice[] {
    return [...this.scanners].sort((a, b) => a.machineNo - b.machineNo);
  }

  public saveScannerDevice(device: Partial<ScannerDevice> & { machineNo: number; name: string; ip: string; port: number; location: string }): ScannerDevice {
    if (device.id) {
      const idx = this.scanners.findIndex((s) => s.id === device.id);
      if (idx !== -1) {
        this.scanners[idx] = {
          ...this.scanners[idx],
          ...device,
        };
        this.recordAuditLog({
          action: 'MANAGE_SCANNER',
          entityType: 'ScannerDevice',
          entityId: this.scanners[idx].id,
          summary: `แก้ไขการตั้งค่าเครื่องสแกน #${device.machineNo} (${device.name})`,
          metadata: { device: this.scanners[idx] },
        });
        return this.scanners[idx];
      }
    }

    const created: ScannerDevice = {
      id: `SC0${this.scanners.length + 1}_${Date.now().toString().slice(-3)}`,
      machineNo: device.machineNo,
      name: device.name,
      ip: device.ip,
      port: device.port,
      location: device.location,
      enabled: device.enabled ?? true,
      autoSyncEnabled: device.autoSyncEnabled ?? true,
      status: 'ONLINE',
      lastSyncAt: null,
      lastEventAt: null,
      lastError: null,
    };
    this.scanners.push(created);
    this.recordAuditLog({
      action: 'MANAGE_SCANNER',
      entityType: 'ScannerDevice',
      entityId: created.id,
      summary: `เพิ่มเครื่องสแกนใหม่ #${created.machineNo} (${created.name}) IP: ${created.ip}:${created.port}`,
      metadata: { device: created },
    });
    return created;
  }

  public deleteScannerDevice(id: string): void {
    const target = this.scanners.find((s) => s.id === id);
    this.scanners = this.scanners.filter((s) => s.id !== id);
    if (target) {
      this.recordAuditLog({
        action: 'MANAGE_SCANNER',
        entityType: 'ScannerDevice',
        entityId: id,
        summary: `ลบเครื่องสแกน #${target.machineNo} (${target.name}) ออกจากรายการจำลอง`,
        metadata: { deletedScanner: target },
      });
    }
  }

  public toggleScannerEnabled(id: string): ScannerDevice | undefined {
    const sc = this.scanners.find((s) => s.id === id);
    if (sc) {
      sc.enabled = !sc.enabled;
      sc.status = sc.enabled ? 'ONLINE' : 'OFFLINE';
      this.recordAuditLog({
        action: 'MANAGE_SCANNER',
        entityType: 'ScannerDevice',
        entityId: id,
        summary: `${sc.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} เครื่องสแกน #${sc.machineNo} (${sc.name})`,
      });
    }
    return sc;
  }

  public getSyncSchedules(): SyncScheduleSlot[] {
    return [...this.syncSchedules].sort((a, b) => a.time.localeCompare(b.time));
  }

  public saveSyncSchedule(slot: { id?: string; time: string; label: string; enabled: boolean }): SyncScheduleSlot {
    if (slot.id) {
      const idx = this.syncSchedules.findIndex((s) => s.id === slot.id);
      if (idx !== -1) {
        this.syncSchedules[idx] = {
          ...this.syncSchedules[idx],
          time: slot.time,
          label: slot.label,
          enabled: slot.enabled,
        };
        this.recordAuditLog({
          action: 'MANAGE_SYNC_SCHEDULE',
          entityType: 'SyncScheduleSlot',
          entityId: slot.id,
          summary: `แก้ไขรอบเวลา Sync อัตโนมัติเป็น ${slot.time} น. (${slot.label})`,
          metadata: { slot: this.syncSchedules[idx] },
        });
        return this.syncSchedules[idx];
      }
    }

    const created: SyncScheduleSlot = {
      id: `SCHED_${Date.now()}`,
      time: slot.time,
      label: slot.label,
      timezone: 'Asia/Bangkok',
      enabled: slot.enabled,
    };
    this.syncSchedules.push(created);
    this.recordAuditLog({
      action: 'MANAGE_SYNC_SCHEDULE',
      entityType: 'SyncScheduleSlot',
      entityId: created.id,
      summary: `เพิ่มรอบเวลา Sync อัตโนมัติเวลา ${created.time} น. (Asia/Bangkok)`,
      metadata: { slot: created },
    });
    return created;
  }

  public deleteSyncSchedule(id: string): void {
    const target = this.syncSchedules.find((s) => s.id === id);
    this.syncSchedules = this.syncSchedules.filter((s) => s.id !== id);
    if (target) {
      this.recordAuditLog({
        action: 'MANAGE_SYNC_SCHEDULE',
        entityType: 'SyncScheduleSlot',
        entityId: id,
        summary: `ลบรอบเวลา Sync อัตโนมัติ ${target.time} น.`,
      });
    }
  }

  public toggleSyncSchedule(id: string): void {
    const target = this.syncSchedules.find((s) => s.id === id);
    if (target) {
      target.enabled = !target.enabled;
      this.recordAuditLog({
        action: 'MANAGE_SYNC_SCHEDULE',
        entityType: 'SyncScheduleSlot',
        entityId: id,
        summary: `${target.enabled ? 'เปิด' : 'ปิด'}ใช้งานรอบเวลา Sync ${target.time} น.`,
      });
    }
  }

  // ==========================================
  // Scanner Raw Scan Ingestion & Deduplication
  // ==========================================

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
  ): {
    totalRead: number;
    newScans: number;
    duplicateScans: number;
    unmappedScans: number;
    totalEventsAfterSync: number;
  } {
    let newCount = 0;
    let duplicateCount = 0;
    let unmappedCount = 0;
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Event identity deduplication strictly uses machineNo + enrollNumber + scanDateTime
    // NEVER collapses different timestamps of the same person on the same day.
    const existingKeys = new Set(this.rawScans.map((s) => s.dedupeKey));
    const activeFingleIds = new Set(this.personnel.filter((p) => p.active).map((p) => p.fingleId));

    for (const scan of incomingScans) {
      const validation = ScannerAdapter.validateScanRecord(scan);
      if (!validation.valid) {
        continue;
      }
      const validScan = validation.value;
      const dedupeKey = ScannerAdapter.generateDedupeKey(
        validScan.machineNo,
        validScan.enrollNumber,
        validScan.scanDateTime
      );
      const isMapped = activeFingleIds.has(validScan.enrollNumber);
      if (!isMapped) {
        unmappedCount++;
      }

      if (existingKeys.has(dedupeKey)) {
        duplicateCount++;
        continue;
      }

      const newEvent: RawScanEvent = Object.freeze({
        id: `RAW_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        machineNo: validScan.machineNo,
        enrollNumber: validScan.enrollNumber,
        scanDateTime: validScan.scanDateTime,
        verifyMode: validScan.verifyMode,
        inOutMode: validScan.inOutMode,
        workCode: validScan.workCode,
        importedAt: nowIso,
        dedupeKey,
        isNew: true,
      });

      existingKeys.add(dedupeKey);
      this.rawScans.unshift(newEvent);
      newCount++;
    }

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

    this.recordAuditLog({
      action: 'SYNC_SCANNERS',
      entityType: 'SyncRunLog',
      entityId: syncLog.id,
      summary: `ดึงสแกนดิบ (${mode}): อ่าน ${incomingScans.length} รายการ (ใหม่ +${newCount}, ข้ามซ้ำ ${duplicateCount}, ไม่พบ Mapping ${unmappedCount}, รวมในระบบ ${this.rawScans.length} รายการ)`,
      metadata: { syncLog, totalEventsAfterSync: this.rawScans.length },
    });

    if (incomingScans.length > 0) {
      void apiAttendanceAdapter
        .syncScanners(incomingScans)
        .then(() => this.hydrateFromRealApi('ADMIN'))
        .catch(() => {});
    }

    return {
      totalRead: incomingScans.length,
      newScans: newCount,
      duplicateScans: duplicateCount,
      unmappedScans: unmappedCount,
      totalEventsAfterSync: this.rawScans.length,
    };
  }

  public triggerMockScannerSync(_machineNo?: number): {
    totalRead: number;
    newScans: number;
    duplicateScans: number;
    unmappedScans: number;
    totalEventsAfterSync: number;
  } {
    void this.hydrateFromRealApi('ADMIN');
    return {
      totalRead: this.rawScans.length,
      newScans: 0,
      duplicateScans: 0,
      unmappedScans: 0,
      totalEventsAfterSync: this.rawScans.length,
    };
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
    return this.saveAttendanceHRReview({
      attendanceId,
      reasonCode,
      reasonLabel,
      note,
      hrReviewStatus: 'REVIEWED',
      authorUserId,
      authorName,
    });
  }

  /**
   * Save or update HR Review status and note for an attendance shift item (§4 & §6.C).
   * - Never alters the underlying AttendanceStatus (e.g. MISSING_CHECKOUT stays MISSING_CHECKOUT, NO_SCAN stays NO_SCAN).
   * - Never fabricates a RawScanEvent.
   * - Preserves full noteHistory for auditability.
   */
  public saveAttendanceHRReview(params: {
    attendanceId: string;
    reasonCode: NoScanReasonCode;
    reasonLabel: string;
    note: string;
    hrReviewStatus: HRReviewStatus;
    authorUserId: string;
    authorName: string;
    fallbackRecordData?: Omit<AttendanceRecord, 'id' | 'computedAt'>;
  }): AttendanceRecord {
    let record = this.attendance.find((a) => a.id === params.attendanceId);
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (!record && params.fallbackRecordData) {
      record = {
        ...params.fallbackRecordData,
        id: params.attendanceId,
        computedAt: nowIso,
      };
      this.attendance.unshift(record);
    }

    if (!record) {
      throw new Error('Record not found');
    }

    const prevCreatedAt = record.notes?.createdAt || nowIso;
    record.hrReviewStatus = params.hrReviewStatus;
    record.notes = {
      id: record.notes?.id || `NOTE_${Date.now()}`,
      attendanceId: record.id,
      reasonCode: params.reasonCode,
      reasonLabel: params.reasonLabel,
      note: params.note,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      createdAt: prevCreatedAt,
      updatedAt: nowIso,
    };

    if (!record.noteHistory) {
      record.noteHistory = [];
    }
    record.noteHistory.unshift({
      id: `NH_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      reasonCode: params.reasonCode,
      reasonLabel: params.reasonLabel,
      note: params.note,
      hrReviewStatus: params.hrReviewStatus,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      timestamp: nowIso,
    });

    if (record.isPushedToHosOffice) {
      record.modifiedAfterPush = true;
    }

    this.recordAuditLog({
      actorName: params.authorName,
      action: 'SET_NO_SCAN_NOTE',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      summary: `บันทึกผลตรวจสอบ HR (${
        params.hrReviewStatus === 'REVIEWED' ? 'ตรวจสอบแล้ว' : 'รอตรวจสอบ'
      } · ${params.reasonLabel}) ของ ${record.fullName} วันที่ ${
        record.workDate
      } (คงสถานะ Attendance: ${record.status})`,
      metadata: {
        attendanceId: record.id,
        attendanceStatus: record.status,
        hrReviewStatus: params.hrReviewStatus,
        reasonCode: params.reasonCode,
        reasonLabel: params.reasonLabel,
        note: params.note,
      },
    });

    void apiAttendanceAdapter
      .saveHRReviewNote({
        attendanceId: record.id,
        reasonCode: params.reasonCode,
        reasonLabel: params.reasonLabel,
        note: params.note,
        hrReviewStatus: params.hrReviewStatus,
      })
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});

    return record;
  }

  /**
   * Preview how many shift/attendance records and raw scans will be evaluated by Reprocess (§7)
   */
  public previewReprocessImpact(params: {
    fromDate: string;
    toDate: string;
    groupName?: string;
    personId?: string;
  }): {
    targetAttendanceCount: number;
    matchingRawScansCount: number;
    unmappedScansCount: number;
    futureSkippedCount: number;
  } {
    const activeFingleIds = new Set(
      this.personnel.filter((p) => p.active).map((p) => p.fingleId)
    );

    const targetAtt = this.attendance.filter((att) => {
      if (att.workDate < params.fromDate || att.workDate > params.toDate) {
        return false;
      }
      if (
        params.groupName &&
        params.groupName !== 'ALL' &&
        att.groupName !== params.groupName &&
        att.department !== params.groupName
      ) {
        return false;
      }
      if (
        params.personId &&
        params.personId !== 'ALL' &&
        att.personId !== params.personId
      ) {
        return false;
      }
      return true;
    });

    const futureAssignments = this.assignments.filter(
      (a) =>
        a.workDate >= params.fromDate &&
        a.workDate <= params.toDate &&
        a.workDate > CURRENT_SYSTEM_DATE
    );

    const rawInRange = this.rawScans.filter((raw) => {
      const d = raw.scanDateTime.slice(0, 10);
      return d >= params.fromDate && d <= params.toDate;
    });

    const unmapped = rawInRange.filter(
      (r) => !activeFingleIds.has(r.enrollNumber)
    ).length;

    return {
      targetAttendanceCount: targetAtt.length,
      matchingRawScansCount: rawInRange.length,
      unmappedScansCount: unmapped,
      futureSkippedCount: futureAssignments.length,
    };
  }

  public reprocessAttendance(
    fromDate: string,
    toDate: string,
    options?: { groupName?: string; personId?: string }
  ): {
    reprocessedCount: number;
    updatedCount: number;
    unchangedCount: number;
    errorsCount: number;
    skippedCount: number;
    skippedReasons: Array<{ label: string; reason: string }>;
    changes: Array<{
      id: string;
      fullName: string;
      workDate: string;
      shiftName: string;
      oldStatus: string;
      newStatus: string;
    }>;
  } {
    let reprocessed = 0;
    let updated = 0;
    let unchanged = 0;
    const skippedReasons: Array<{ label: string; reason: string }> = [];
    const changes: Array<{
      id: string;
      fullName: string;
      workDate: string;
      shiftName: string;
      oldStatus: string;
      newStatus: string;
    }> = [];

    const activeFingleIds = new Set(
      this.personnel.filter((p) => p.active).map((p) => p.fingleId)
    );

    const filteredRaw = this.rawScans.filter((raw) => {
      const rawDate = raw.scanDateTime.slice(0, 10);
      return rawDate >= fromDate && rawDate <= toDate;
    });

    // Track unmapped raw scans in range as skipped reasons
    filteredRaw.forEach((raw) => {
      if (!activeFingleIds.has(raw.enrollNumber)) {
        skippedReasons.push({
          label: `enrollNumber #${raw.enrollNumber} (${raw.scanDateTime})`,
          reason: 'ยังไม่พบ FINGLE_ID Mapping กับบุคลากรใน HOSOffice.hr_person',
        });
      }
    });

    // Also check future assignments in range that cannot be evaluated yet
    this.assignments.forEach((asgn) => {
      if (
        asgn.workDate >= fromDate &&
        asgn.workDate <= toDate &&
        asgn.workDate > CURRENT_SYSTEM_DATE
      ) {
        const p = this.personnel.find((x) => x.personId === asgn.personId);
        if (
          options?.groupName &&
          options.groupName !== 'ALL' &&
          p?.groupName !== options.groupName &&
          p?.department !== options.groupName
        ) {
          return;
        }
        if (
          options?.personId &&
          options.personId !== 'ALL' &&
          asgn.personId !== options.personId
        ) {
          return;
        }
        skippedReasons.push({
          label: `${p ? `${p.prefix}${p.firstName} ${p.lastName}` : asgn.personId} (${asgn.workDate} · ${asgn.shiftName})`,
          reason: 'กะในอนาคตยังไม่ถึงเวลาปฏิบัติงาน (ไม่นับเป็น NO_SCAN)',
        });
      }
    });

    const rawByPersonDate = new Map<string, RawScanEvent[]>();
    filteredRaw.forEach((raw) => {
      const rawDate = raw.scanDateTime.slice(0, 10);
      const key = `${raw.enrollNumber}_${rawDate}`;
      if (!rawByPersonDate.has(key)) rawByPersonDate.set(key, []);
      rawByPersonDate.get(key)!.push(raw);
    });

    this.attendance.forEach((att) => {
      if (att.workDate < fromDate || att.workDate > toDate) return;
      if (
        options?.groupName &&
        options.groupName !== 'ALL' &&
        att.groupName !== options.groupName &&
        att.department !== options.groupName
      ) {
        return;
      }
      if (
        options?.personId &&
        options.personId !== 'ALL' &&
        att.personId !== options.personId
      ) {
        return;
      }

      if (att.workDate > CURRENT_SYSTEM_DATE) {
        return;
      }

      reprocessed++;

      // Resolve shift configuration and compute exact shift window (supports multi-shift & cross-midnight)
      const shift =
        this.shifts.find((s) => s.id === att.shiftId) || this.shifts[3];
      const shiftStart = att.shiftStartTime || shift.startTime;
      const shiftEnd = att.shiftEndTime || shift.endTime;
      const graceMins = att.graceMinutes ?? shift.graceMinutes ?? 15;
      const crossMidnight = Boolean(att.crossMidnight ?? shift.crossMidnight);

      const shiftWindow = AttendanceCalculator.computeShiftWindow(att.workDate, {
        startTime: shiftStart,
        endTime: shiftEnd,
        crossMidnight,
        graceMinutes: graceMins,
        earlyScanWindowMinutes: shift.earlyScanWindowMinutes ?? 180,
        lateScanWindowMinutes: shift.lateScanWindowMinutes ?? 240,
      });

      // Match raw scans for this person that fall inside THIS shift's real epoch window
      const personScansInWindow = this.rawScans
        .filter((raw) => {
          if (raw.enrollNumber !== att.fingleId) return false;
          const epochMs = ScannerAdapter.parseScanDateTimeToEpochMs(raw.scanDateTime);
          if (epochMs === null) return false;
          return (
            epochMs >= shiftWindow.earlyCheckInStartMs &&
            epochMs <= shiftWindow.lateCheckOutEndMs
          );
        })
        .sort((a, b) => a.scanDateTime.localeCompare(b.scanDateTime));

      if (personScansInWindow.length > 0) {
        const checkInCandidates = personScansInWindow.filter((s) => {
          const ms = ScannerAdapter.parseScanDateTimeToEpochMs(s.scanDateTime)!;
          return ms <= shiftWindow.lateCheckInMaxMs;
        });
        const firstScan = checkInCandidates[0] || personScansInWindow[0];
        const firstScanMs = ScannerAdapter.parseScanDateTimeToEpochMs(
          firstScan.scanDateTime
        )!;

        // Avoid treating a rapid second tap within 20 minutes of check-in as check-out
        const checkOutCandidates = personScansInWindow.filter((s) => {
          if (s.id === firstScan.id) return false;
          const ms = ScannerAdapter.parseScanDateTimeToEpochMs(s.scanDateTime)!;
          return ms - firstScanMs >= 20 * 60000;
        });
        const lastScan =
          checkOutCandidates.length > 0
            ? checkOutCandidates[checkOutCandidates.length - 1]
            : null;

        const checkInTime =
          att.checkInAt || firstScan.scanDateTime.split(' ')[1];
        const checkOutTime =
          att.checkOutAt ||
          (lastScan ? lastScan.scanDateTime.split(' ')[1] : null);

        const lateCalc = AttendanceCalculator.calculateLate(checkInTime, {
          startTime: shiftStart,
          endTime: shiftEnd,
          graceMinutes: graceMins,
          crossMidnight,
        });
        const previousStatus = att.status;
        const previousCheckOut = att.checkOutAt;

        att.checkInAt = checkInTime;
        if (checkOutTime) {
          att.checkOutAt = checkOutTime;
          att.rawScanOutId = lastScan?.id || att.rawScanOutId;
        }
        att.lateMinutes = lateCalc.lateMinutes;
        att.rawScanInId = att.rawScanInId || firstScan.id;

        if (!att.checkOutAt) {
          att.hasMissingCheckout = true;
          att.status = lateCalc.isLate ? 'LATE' : 'MISSING_CHECKOUT';
        } else {
          att.hasMissingCheckout = false;
          att.status = lateCalc.isLate ? 'LATE' : 'NORMAL';
        }

        att.computedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

        if (
          previousStatus !== att.status ||
          previousCheckOut !== att.checkOutAt
        ) {
          updated++;
          changes.push({
            id: att.id,
            fullName: att.fullName,
            workDate: att.workDate,
            shiftName: att.shiftName,
            oldStatus: previousStatus,
            newStatus: att.status,
          });
          if (att.isPushedToHosOffice) {
            att.modifiedAfterPush = true;
          }
        } else {
          unchanged++;
        }
      } else {
        unchanged++;
      }
    });

    this.recordAuditLog({
      action: 'REPROCESS_ATTENDANCE',
      entityType: 'AttendanceRecord',
      entityId: `${fromDate}_to_${toDate}`,
      summary: `สั่งคำนวณเวลาปฏิบัติงานใหม่ (Reprocess) ช่วง ${fromDate} ถึง ${toDate}: ประมวลผล ${reprocessed} รายการ, เปลี่ยนสถานะ ${updated} รายการ, ไม่เปลี่ยนแปลง ${unchanged} รายการ, ข้าม ${skippedReasons.length} รายการ`,
      metadata: {
        fromDate,
        toDate,
        options,
        reprocessed,
        updated,
        unchanged,
        skippedCount: skippedReasons.length,
      },
    });

    void apiAttendanceAdapter
      .executeReprocess({
        fromDate,
        toDate,
        groupName: options?.groupName,
        personId: options?.personId,
      })
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});

    return {
      reprocessedCount: reprocessed,
      updatedCount: updated,
      unchangedCount: unchanged,
      errorsCount: 0,
      skippedCount: skippedReasons.length,
      skippedReasons,
      changes,
    };
  }

  // ==========================================
  // HOSOffice Manual Direct Push
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
            ? `[Phase 2 Preview / Dry-Run] ตรวจสอบ Payload หมายเหตุ (${att.notes.reasonLabel}) สำเร็จ (ยังไม่ได้เขียนลง HOSOffice จริง)`
            : `[Phase 2 Preview / Dry-Run] ตรวจสอบ Payload เวลาเข้า (${att.checkInAt || 'ไม่มี'}) สถานะ ${att.status} สำเร็จ (ยังไม่ได้เขียนลง HOSOffice จริง)`,
      };

      att.isPushedToHosOffice = true;
      att.lastPushedAt = nowIso;
      att.modifiedAfterPush = false;

      this.pushHistory.unshift(historyItem);
      items.push(historyItem);
      successCount++;
    });

    void apiAttendanceAdapter
      .previewHosOfficePush(attendanceIds)
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});

    this.recordAuditLog({
      actorName: pushedByName,
      action: 'PUSH_HOSOFFICE',
      entityType: 'HOSOffice_Attend',
      entityId: `BATCH_${Date.now()}`,
      summary: `ตรวจสอบเตรียมส่งข้อมูลเข้า HOSOffice สำเร็จ ${successCount} รายการ`,
      metadata: { attendanceIds, successCount },
    });

    return {
      successCount,
      failureCount: 0,
      items,
    };
  }

  // ==========================================
  // Personnel, Shifts & PersonnelTypeScheduleRules
  // ==========================================

  public getPersonnel(): Personnel[] {
    return [...this.personnel];
  }

  public getPersonById(personId: string): Personnel | undefined {
    return this.personnel.find((p) => p.personId === personId);
  }

  public syncPersonnelFromHosOffice(): { updatedCount: number; newCount: number } {
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    this.personnel.forEach((p) => {
      p.lastHosOfficeSync = nowIso;
    });
    void apiAttendanceAdapter
      .syncPersonnelFromHosOffice(nowIso.slice(0, 10))
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});
    this.recordAuditLog({
      action: 'SYNC_HOSOFFICE_HR',
      entityType: 'Personnel',
      entityId: 'ALL',
      summary: `อัปเดตรายชื่อบุคลากรและ FINGLE_ID จากฐานข้อมูล HOSOffice (${this.personnel.length} ท่าน)`,
    });
    return {
      updatedCount: this.personnel.length,
      newCount: 0,
    };
  }

  public getPersonnelTypeRules(): PersonnelTypeScheduleRule[] {
    return [...this.personnelTypeRules];
  }

  public savePersonnelTypeRule(rule: Partial<PersonnelTypeScheduleRule> & { name: string; code: string }): PersonnelTypeScheduleRule {
    if (rule.id) {
      const idx = this.personnelTypeRules.findIndex((r) => r.id === rule.id);
      if (idx !== -1) {
        this.personnelTypeRules[idx] = {
          ...this.personnelTypeRules[idx],
          ...rule,
        };
        this.recordAuditLog({
          action: 'MANAGE_SHIFT_MATRIX',
          entityType: 'PersonnelTypeScheduleRule',
          entityId: rule.id,
          summary: `แก้ไขกติกาเวลากะของประเภทบุคลากร "${rule.name}" (เช้า ${this.personnelTypeRules[idx].morningStart}-${this.personnelTypeRules[idx].morningEnd})`,
          metadata: { rule: this.personnelTypeRules[idx] },
        });
        return this.personnelTypeRules[idx];
      }
    }

    const created: PersonnelTypeScheduleRule = {
      id: `PT_${Date.now()}`,
      code: rule.code,
      name: rule.name,
      description: rule.description || rule.name,
      badgeChar: rule.badgeChar || rule.name.charAt(0) || 'บ',
      morningStart: rule.morningStart || '08:15',
      morningEnd: rule.morningEnd || '16:00',
      morningLateCutoff: rule.morningLateCutoff || rule.morningStart || '08:15',
      afternoonStart: rule.afternoonStart || '16:00',
      afternoonEnd: rule.afternoonEnd || '24:00',
      afternoonLateCutoff: rule.afternoonLateCutoff || '16:00',
      nightStart: rule.nightStart || '00:00',
      nightEnd: rule.nightEnd || '08:00',
      nightCrossMidnight: rule.nightCrossMidnight ?? true,
      active: rule.active ?? true,
    };
    this.personnelTypeRules.push(created);
    this.recordAuditLog({
      action: 'MANAGE_SHIFT_MATRIX',
      entityType: 'PersonnelTypeScheduleRule',
      entityId: created.id,
      summary: `เพิ่มประเภทบุคลากรและกติกากะใหม่ "${created.name}" ใน Sam_Att`,
      metadata: { rule: created },
    });
    return created;
  }

  public deletePersonnelTypeRule(id: string): void {
    const target = this.personnelTypeRules.find((r) => r.id === id);
    this.personnelTypeRules = this.personnelTypeRules.filter((r) => r.id !== id);
    if (target) {
      this.recordAuditLog({
        action: 'MANAGE_SHIFT_MATRIX',
        entityType: 'PersonnelTypeScheduleRule',
        entityId: id,
        summary: `ลบกติกากะของประเภทบุคลากร "${target.name}" ออกจาก Sam_Att`,
      });
    }
  }

  public resetPersonnelTypeRulesToDefault(): PersonnelTypeScheduleRule[] {
    void this.hydrateFromRealApi('ADMIN');
    return [...this.personnelTypeRules];
  }

  public getShifts(): Shift[] {
    return [...this.shifts];
  }

  /**
   * Resolve all shifts (active & inactive) linked to a specific PersonnelTypeScheduleRule
   * so the "รายละเอียดกติกาเวลากะ" modal can show a single Unified Compact Table of all shift types.
   */
  public getShiftsForPersonnelTypeRule(ruleId: string): Shift[] {
    const rule = this.personnelTypeRules.find((r) => r.id === ruleId);
    if (!rule) return [...this.shifts];

    const linkedIds = new Set<string>(rule.shiftIds || []);
    if (rule.morningShiftId) linkedIds.add(rule.morningShiftId);
    else if (rule.hasMorning !== false) linkedIds.add(rule.id === 'PT06' ? 'SH10' : 'SH01');

    if (rule.afternoonShiftId) linkedIds.add(rule.afternoonShiftId);
    else if (rule.hasAfternoon !== false) linkedIds.add('SH02');

    if (rule.nightShiftId) linkedIds.add(rule.nightShiftId);
    else if (rule.hasNight !== false) linkedIds.add('SH03');

    (rule.otherShiftIds || []).forEach((id) => linkedIds.add(id));

    // Also include any custom shifts created specifically for this rule
    this.shifts.forEach((s) => {
      if (s.personnelTypeRuleId === rule.id) {
        linkedIds.add(s.id);
      }
    });

    const result: Shift[] = [];
    linkedIds.forEach((sid) => {
      const sh = this.shifts.find((s) => s.id === sid);
      if (sh) {
        result.push(sh);
      }
    });

    return result.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name, 'th'));
  }

  /**
   * Sync summary fields on a PersonnelTypeScheduleRule when a shift is added, edited, or deactivated.
   */
  private syncRuleSummaryFromShifts(ruleId: string): void {
    const rule = this.personnelTypeRules.find((r) => r.id === ruleId);
    if (!rule) return;

    const ruleShifts = this.getShiftsForPersonnelTypeRule(ruleId);
    const activeMorning = ruleShifts.find((s) => s.category === 'MORNING' && s.active);
    const anyMorning = ruleShifts.find((s) => s.category === 'MORNING');
    if (activeMorning) {
      rule.hasMorning = true;
      rule.morningShiftId = activeMorning.id;
      rule.morningStart = activeMorning.startTime;
      rule.morningEnd = activeMorning.endTime;
      rule.morningLateCutoff = activeMorning.startTime;
      rule.morningGraceMinutes = activeMorning.graceMinutes;
    } else if (anyMorning) {
      rule.hasMorning = false;
      rule.morningShiftId = anyMorning.id;
    }

    const activeAfternoon = ruleShifts.find((s) => s.category === 'AFTERNOON' && s.active);
    const anyAfternoon = ruleShifts.find((s) => s.category === 'AFTERNOON');
    if (activeAfternoon) {
      rule.hasAfternoon = true;
      rule.afternoonShiftId = activeAfternoon.id;
      rule.afternoonStart = activeAfternoon.startTime;
      rule.afternoonEnd = activeAfternoon.endTime === '00:00' ? '24:00' : activeAfternoon.endTime;
      rule.afternoonLateCutoff = activeAfternoon.startTime;
      rule.afternoonGraceMinutes = activeAfternoon.graceMinutes;
    } else if (anyAfternoon) {
      rule.hasAfternoon = false;
      rule.afternoonShiftId = anyAfternoon.id;
    }

    const activeNight = ruleShifts.find((s) => s.category === 'NIGHT' && s.active);
    const anyNight = ruleShifts.find((s) => s.category === 'NIGHT');
    if (activeNight) {
      rule.hasNight = true;
      rule.nightShiftId = activeNight.id;
      rule.nightStart = activeNight.startTime;
      rule.nightEnd = activeNight.endTime;
      rule.nightCrossMidnight = activeNight.crossMidnight;
      rule.nightGraceMinutes = activeNight.graceMinutes;
    } else if (anyNight) {
      rule.hasNight = false;
      rule.nightShiftId = anyNight.id;
    }

    rule.otherShiftIds = ruleShifts
      .filter((s) => !['MORNING', 'AFTERNOON', 'NIGHT'].includes(s.category || 'OTHER'))
      .map((s) => s.id);
    rule.shiftIds = ruleShifts.map((s) => s.id);
  }

  /**
   * Look up future ShiftAssignment records (workDate >= CURRENT_SYSTEM_DATE) that reference a shiftId.
   * Used before editing or deactivating a shift in Shift Configuration (§11 & §12).
   */
  public getFutureAssignmentsByShift(shiftId: string): Array<{
    assignment: ShiftAssignment;
    personName: string;
    department: string;
  }> {
    return this.assignments
      .filter((a) => a.shiftId === shiftId && a.workDate >= CURRENT_SYSTEM_DATE)
      .map((assignment) => {
        const p = this.personnel.find((x) => x.personId === assignment.personId);
        return {
          assignment,
          personName: p ? `${p.prefix}${p.firstName} ${p.lastName}` : assignment.personId,
          department: p?.department || '-',
        };
      })
      .sort((a, b) => a.assignment.workDate.localeCompare(b.assignment.workDate));
  }

  /**
   * Save (create or edit) a Shift in Shift Configuration.
   * - Never alters past ShiftAssignment snapshots or past AttendanceRecord items (workDate < CURRENT_SYSTEM_DATE).
   * - Optionally updates future ShiftAssignment snapshots if updateFutureAssignments === true.
   * - Links the shift to the specified PersonnelTypeScheduleRule (ruleId) if provided.
   */
  public saveShift(
    shift: Partial<Shift> & { code: string; name: string; startTime: string; endTime: string },
    options?: { ruleId?: string; updateFutureAssignments?: boolean }
  ): Shift {
    const resolvedCategory: ShiftVisualCategory = shift.category || 'OTHER';

    if (shift.id) {
      const idx = this.shifts.findIndex((s) => s.id === shift.id);
      if (idx !== -1) {
        const prev = this.shifts[idx];
        // Ensure past assignments keep their original snapshotted values before modifying the shift template
        this.assignments.forEach((a) => {
          if (a.shiftId === prev.id) {
            if (this.isPastWorkDate(a.workDate)) {
              if (!a.shiftStartTime) a.shiftStartTime = prev.startTime;
              if (!a.shiftEndTime) a.shiftEndTime = prev.endTime;
              if (a.crossMidnight === undefined) a.crossMidnight = prev.crossMidnight;
              if (a.graceMinutes === undefined) a.graceMinutes = prev.graceMinutes;
              if (!a.shiftCategory) a.shiftCategory = prev.category || 'OTHER';
            } else if (options?.updateFutureAssignments !== false) {
              // Update future assignment snapshot to reflect updated template
              a.shiftName = shift.name;
              a.shiftStartTime = shift.startTime;
              a.shiftEndTime = shift.endTime;
              a.crossMidnight = shift.crossMidnight ?? prev.crossMidnight;
              a.graceMinutes = shift.graceMinutes ?? prev.graceMinutes;
              a.shiftCategory = resolvedCategory;
            }
          }
        });

        this.shifts[idx] = {
          ...prev,
          ...shift,
          category: resolvedCategory,
        };

        if (options?.ruleId) {
          const targetRule = this.personnelTypeRules.find((r) => r.id === options.ruleId);
          if (targetRule) {
            const setIds = new Set(targetRule.shiftIds || []);
            setIds.add(shift.id);
            targetRule.shiftIds = Array.from(setIds);
            this.syncRuleSummaryFromShifts(targetRule.id);
          }
        } else {
          // Sync all rules that reference this shift
          this.personnelTypeRules.forEach((r) => {
            if ((r.shiftIds || []).includes(shift.id!) || (r.otherShiftIds || []).includes(shift.id!)) {
              this.syncRuleSummaryFromShifts(r.id);
            }
          });
        }

        this.recordAuditLog({
          action: 'MANAGE_SHIFT_MATRIX',
          entityType: 'Shift',
          entityId: shift.id,
          summary: `แก้ไขกะเวลา "${shift.name}" (${shift.startTime} - ${shift.endTime} · Grace ${this.shifts[idx].graceMinutes} นาที) โดยไม่แก้ไขกะย้อนหลัง`,
          metadata: { shift: this.shifts[idx], ruleId: options?.ruleId },
        });
        void apiAttendanceAdapter
          .saveShift(this.shifts[idx])
          .then(() => this.hydrateFromRealApi('ADMIN'))
          .catch(() => {});
        return this.shifts[idx];
      }
    }

    const created: Shift = {
      id: `SH_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      code: shift.code,
      name: shift.name,
      category: resolvedCategory,
      startTime: shift.startTime,
      endTime: shift.endTime,
      crossMidnight: shift.crossMidnight ?? false,
      graceMinutes: shift.graceMinutes ?? 15,
      earlyScanWindowMinutes: shift.earlyScanWindowMinutes ?? 60,
      lateScanWindowMinutes: shift.lateScanWindowMinutes ?? 120,
      active: shift.active ?? true,
      personnelTypeRuleId: options?.ruleId,
    };
    this.shifts.push(created);

    if (options?.ruleId) {
      const targetRule = this.personnelTypeRules.find((r) => r.id === options.ruleId);
      if (targetRule) {
        const setIds = new Set(targetRule.shiftIds || []);
        setIds.add(created.id);
        targetRule.shiftIds = Array.from(setIds);
        if (!['MORNING', 'AFTERNOON', 'NIGHT'].includes(resolvedCategory)) {
          const otherSet = new Set(targetRule.otherShiftIds || []);
          otherSet.add(created.id);
          targetRule.otherShiftIds = Array.from(otherSet);
        }
        this.syncRuleSummaryFromShifts(targetRule.id);
      }
    }

    this.recordAuditLog({
      action: 'MANAGE_SHIFT_MATRIX',
      entityType: 'Shift',
      entityId: created.id,
      summary: `เพิ่มกะเวลาใหม่ "${created.name}" (${created.startTime} - ${created.endTime} · ประเภท ${created.category})`,
      metadata: { shift: created, ruleId: options?.ruleId },
    });
    void apiAttendanceAdapter
      .saveShift(created)
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});
    return created;
  }

  public deactivateShiftInConfig(params: {
    shiftId: string;
    ruleId?: string;
    reason: string;
    actorName?: string;
  }): {
    shift: Shift | undefined;
    futureAffectedCount: number;
    logEntry?: ShiftConfigDeactivationLog;
  } {
    const target = this.shifts.find((s) => s.id === params.shiftId);
    if (!target) {
      return { shift: undefined, futureAffectedCount: 0 };
    }

    const futureList = this.getFutureAssignmentsByShift(params.shiftId);
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    target.active = false;
    target.deactivatedAt = nowIso;
    target.deactivatedReason = params.reason || 'ยกเลิกการใช้งานกะในตารางกติกากะ';

    const rule = params.ruleId
      ? this.personnelTypeRules.find((r) => r.id === params.ruleId)
      : undefined;

    if (rule) {
      this.syncRuleSummaryFromShifts(rule.id);
    } else {
      this.personnelTypeRules.forEach((r) => this.syncRuleSummaryFromShifts(r.id));
    }

    const logEntry: ShiftConfigDeactivationLog = {
      id: `SH_DEACT_${Date.now()}`,
      shiftId: target.id,
      shiftCode: target.code,
      shiftName: target.name,
      personnelTypeRuleId: rule?.id,
      personnelTypeName: rule?.name,
      futureAffectedCount: futureList.length,
      deactivatedAt: nowIso,
      deactivatedBy: params.actorName || 'เจ้าหน้าที่ HR (Sam_Att)',
      reason: params.reason || 'ยกเลิกการใช้งานกะเวลา',
    };
    this.shiftConfigDeactivationLogs.unshift(logEntry);

    this.recordAuditLog({
      actorName: params.actorName,
      action: 'MANAGE_SHIFT_MATRIX',
      entityType: 'Shift',
      entityId: target.id,
      summary: `ยกเลิกการใช้งานกะ "${target.name}" (${target.startTime}–${target.endTime}) สถานะ Inactive · มีผู้ถูกผูกกะนี้ล่วงหน้า ${futureList.length} รายการ (ไม่ลบข้อมูลเดิม)`,
      metadata: { logEntry },
    });

    void apiAttendanceAdapter
      .saveShift(target)
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});

    return {
      shift: target,
      futureAffectedCount: futureList.length,
      logEntry,
    };
  }

  public reactivateShiftInConfig(shiftId: string, ruleId?: string): Shift | undefined {
    const target = this.shifts.find((s) => s.id === shiftId);
    if (!target) return undefined;
    target.active = true;
    target.deactivatedAt = undefined;
    target.deactivatedReason = undefined;

    if (ruleId) {
      this.syncRuleSummaryFromShifts(ruleId);
    } else {
      this.personnelTypeRules.forEach((r) => this.syncRuleSummaryFromShifts(r.id));
    }

    this.recordAuditLog({
      action: 'MANAGE_SHIFT_MATRIX',
      entityType: 'Shift',
      entityId: target.id,
      summary: `เปิดใช้งานกะเวลา "${target.name}" (${target.startTime}–${target.endTime}) อีกครั้ง (Active)`,
    });
    void apiAttendanceAdapter
      .saveShift(target)
      .then(() => this.hydrateFromRealApi('ADMIN'))
      .catch(() => {});
    return target;
  }

  public getShiftConfigDeactivationLogs(): ShiftConfigDeactivationLog[] {
    return [...this.shiftConfigDeactivationLogs];
  }

  public deleteShift(id: string): void {
    this.deactivateShiftInConfig({
      shiftId: id,
      reason: 'ยกเลิกการใช้งานแม่แบบกะเวลา',
    });
  }

  /**
   * Determine the exact No-Shift status for a person on a given workDate (§5):
   * 1. 'SHIFT_CANCELLED' (กะถูกยกเลิก)
   * 2. 'SCHEDULED_DAY_OFF' (วันหยุดตามตาราง)
   * 3. 'UNASSIGNED' (ยังไม่ได้กำหนดกะ)
   */
  public getNoShiftStatus(
    personId: string,
    workDate: string
  ): {
    status: NoShiftStatusType;
    label: string;
    detail: string;
    cancelledLog?: ShiftCancellationLog;
  } {
    const cancelledLog = this.cancellationLogs.find(
      (c) => c.personId === personId && c.workDate === workDate
    );
    if (cancelledLog) {
      return {
        status: 'SHIFT_CANCELLED',
        label: 'กะถูกยกเลิก',
        detail: `ยกเลิก "${cancelledLog.shiftName}" เมื่อ ${cancelledLog.cancelledAt} (${cancelledLog.reason})`,
        cancelledLog,
      };
    }

    const dayOff = this.scheduledDayOffs.find(
      (d) => d.personId === personId && d.workDate === workDate
    );
    if (dayOff) {
      return {
        status: 'SCHEDULED_DAY_OFF',
        label: 'วันหยุดตามตาราง',
        detail: dayOff.note,
      };
    }

    return {
      status: 'UNASSIGNED',
      label: 'ยังไม่ได้กำหนดกะ',
      detail: 'ยังไม่ได้ผูกตารางกะในวันที่เลือก (ไม่ถือว่าขาดงานหรือ NO_SCAN)',
    };
  }

  public getShiftAssignments(workDate?: string): ShiftAssignment[] {
    if (!workDate) return [...this.assignments];
    return this.assignments.filter((a) => a.workDate === workDate);
  }

  public getPersonShiftAssignments(personId: string): ShiftAssignment[] {
    return this.assignments
      .filter((a) => a.personId === personId)
      .sort((a, b) => {
        const dateCmp = b.workDate.localeCompare(a.workDate);
        if (dateCmp !== 0) return dateCmp;
        const shiftA = this.shifts.find((s) => s.id === a.shiftId);
        const shiftB = this.shifts.find((s) => s.id === b.shiftId);
        const startA = a.shiftStartTime || shiftA?.startTime || '00:00';
        const startB = b.shiftStartTime || shiftB?.startTime || '00:00';
        return startA.localeCompare(startB);
      });
  }

  /**
   * Compute absolute epoch-minute interval [startEpochMin, endEpochMin) for a shift on a given workDate (YYYY-MM-DD).
   * - If endTime === '00:00' or '24:00' and startTime > '00:00', it ends at midnight (24:00) of workDate.
   * - If crossMidnight or endMin <= startMin (e.g., 16:00-08:00), it ends at endTime on the NEXT calendar day (workDate + 1 day).
   * - Because interval is half-open [start, end), a shift ending at 16:00 does NOT overlap with a shift starting at 16:00.
   */
  public getAbsoluteShiftInterval(workDate: string, shift: Shift): [number, number] {
    const baseMs = Date.parse(`${workDate}T00:00:00Z`);
    const baseMin = Math.floor(baseMs / 60000);
    const toMin = (t: string) => {
      if (t === '24:00') return 1440;
      const [h, m] = t.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const s = toMin(shift.startTime);
    let e = toMin(shift.endTime);

    if (e === 0 && s > 0) {
      e = 1440;
    } else if (e <= s || (shift.crossMidnight && e < 1440)) {
      e = 1440 + e;
    }
    return [baseMin + s, baseMin + e];
  }

  /**
   * Check whether two shifts on the same day overlap in time.
   * Note: Touching boundaries (endA === startB, e.g., 08:00-16:00 and 16:00-00:00) do NOT overlap.
   */
  public doShiftsOverlap(shiftA: Shift, shiftB: Shift, dateA = '2026-11-06', dateB = '2026-11-06'): boolean {
    if (dateA === dateB && shiftA.id === shiftB.id) return true;
    const [startA, endA] = this.getAbsoluteShiftInterval(dateA, shiftA);
    const [startB, endB] = this.getAbsoluteShiftInterval(dateB, shiftB);
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  /**
   * Check whether a workDate is in the past (before CURRENT_SYSTEM_DATE).
   * Per Grill-Me Rule #8 (§4.6): Retroactive shift addition, editing, or cancellation is prohibited.
   */
  public isPastWorkDate(workDate: string): boolean {
    return workDate < CURRENT_SYSTEM_DATE;
  }

  /**
   * Assign multiple shifts (via Checkbox Multi-Select) to one or multiple personnel across a date range
   * or specific selected dates.
   * - Validates against past dates (Grill-Me Rule #8).
   * - Checks overlaps against existing shifts (including adjacent day cross-midnight shifts) AND within the new batch.
   * - Saves valid non-overlapping shifts, skips conflicting/duplicate items without deleting existing shifts.
   */
  public assignMultipleShiftsToPersonnel(params: {
    personIds: string[];
    shiftIds: string[];
    fromDate?: string;
    toDate?: string;
    specificDates?: string[];
    assignmentType: 'DAILY' | 'RECURRING' | 'STANDARD_FALLBACK';
    replaceExistingOnDay?: boolean;
  }): {
    assignedCount: number;
    skippedCount: number;
    conflicts: string[];
    assignedItems: Array<{ personId: string; personName: string; workDate: string; shiftName: string }>;
  } {
    // Resolve ordered list of active shifts
    const selectedShifts = params.shiftIds
      .map((id) => this.shifts.find((s) => s.id === id))
      .filter((s): s is Shift => !!s && s.active !== false);

    if (selectedShifts.length === 0) {
      return { assignedCount: 0, skippedCount: 0, conflicts: [], assignedItems: [] };
    }

    // Resolve target dates
    let dates: string[] = [];
    if (params.specificDates && params.specificDates.length > 0) {
      dates = Array.from(new Set(params.specificDates)).sort();
    } else if (params.fromDate && params.toDate) {
      const start = new Date(params.fromDate);
      const end = new Date(params.toDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        const curr = new Date(start);
        let safety = 0;
        while (curr <= end && safety < 62) {
          dates.push(curr.toISOString().slice(0, 10));
          curr.setDate(curr.getDate() + 1);
          safety++;
        }
      } else {
        dates.push(params.fromDate);
      }
    }

    let assignedCount = 0;
    let skippedCount = 0;
    const conflicts: string[] = [];
    const assignedItems: Array<{ personId: string; personName: string; workDate: string; shiftName: string }> = [];

    for (const pid of params.personIds) {
      const person = this.personnel.find((p) => p.personId === pid);
      const personLabel = person ? `${person.prefix}${person.firstName} ${person.lastName}` : pid;

      for (const d of dates) {
        // Rule #8: Cannot add/edit shifts retroactively in the past
        if (this.isPastWorkDate(d)) {
          for (const sh of selectedShifts) {
            skippedCount++;
            conflicts.push(
              `${personLabel} (${d} · ${sh.name}): ไม่อนุญาตให้จัดกะย้อนหลัง (ข้อมูลวันที่ผ่านไปแล้วเป็น Read-Only)`
            );
          }
          continue;
        }

        if (params.replaceExistingOnDay) {
          this.assignments = this.assignments.filter(
            (a) => !(a.personId === pid && a.workDate === d)
          );
        }

        for (const shift of selectedShifts) {
          // Compare against all existing assignments of this person (on same day or adjacent day for cross-midnight)
          const personExisting = this.assignments.filter((a) => a.personId === pid);
          let conflictMsg: string | null = null;

          for (const ex of personExisting) {
            // Only need to check if workDate is within 1 day difference
            const dayDiff = Math.abs(Date.parse(ex.workDate) - Date.parse(d)) / 86400000;
            if (dayDiff > 1.5) continue;

            if (ex.workDate === d && ex.shiftId === shift.id) {
              conflictMsg = `${personLabel} (${d}): มีกะ "${shift.name}" (${shift.startTime}–${shift.endTime}) อยู่แล้ว`;
              break;
            }
            const exShift = this.shifts.find((s) => s.id === ex.shiftId);
            if (exShift && this.doShiftsOverlap(exShift, shift, ex.workDate, d)) {
              const dateNote = ex.workDate !== d ? ` ของวันที่ ${ex.workDate}` : '';
              conflictMsg = `${personLabel} (${d}): กะ "${shift.name}" (${shift.startTime}–${shift.endTime}) เวลาทับซ้อนกับ "${exShift.name}" (${exShift.startTime}–${exShift.endTime})${dateNote}`;
              break;
            }
          }

          if (conflictMsg) {
            skippedCount++;
            conflicts.push(conflictMsg);
            continue;
          }

          // Valid non-overlapping shift -> add to this.assignments immediately with snapshotted fields!
          const createdAssignment: ShiftAssignment = {
            id: `SA_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            personId: pid,
            workDate: d,
            shiftId: shift.id,
            shiftName: shift.name,
            assignmentType: params.assignmentType,
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            crossMidnight: shift.crossMidnight,
            graceMinutes: shift.graceMinutes,
            shiftCategory: shift.category || 'OTHER',
          };
          this.assignments.unshift(createdAssignment);

          void apiAttendanceAdapter
            .assignShift({
              personId: pid,
              workDate: d,
              shiftId: shift.id,
              assignmentType: params.assignmentType === 'RECURRING' ? 'MONTHLY' : 'DAILY',
            })
            .catch(() => {});

          // Update attendance record if present on that date
          const att = this.attendance.find((a) => a.personId === pid && a.workDate === d);
          if (att) {
            att.shiftId = shift.id;
            att.shiftName = shift.name;
            att.shiftStartTime = shift.startTime;
            att.shiftEndTime = shift.endTime;
            if (att.checkInAt) {
              const calc = this.calculateLate(att.checkInAt, shift.startTime, shift.graceMinutes);
              att.lateMinutes = calc.lateMinutes;
              att.status = calc.isLate ? 'LATE' : 'NORMAL';
            }
          }

          assignedCount++;
          assignedItems.push({
            personId: pid,
            personName: personLabel,
            workDate: d,
            shiftName: `${shift.name} (${shift.startTime}–${shift.endTime})`,
          });
        }
      }
    }

    if (assignedCount > 0 || skippedCount > 0) {
      this.recordAuditLog({
        action: 'ASSIGN_SHIFT',
        entityType: 'ShiftAssignment',
        entityId: `${params.personIds.join(',')}`,
        summary: `กำหนดตารางกะ (${selectedShifts.map((s) => s.name).join(', ')}) ให้บุคลากร ${params.personIds.length} ท่าน: สำเร็จ ${assignedCount} รายการ, ข้ามรายการซ้ำ/เวลาทับซ้อน ${skippedCount} รายการ`,
        metadata: { ...params, assignedCount, skippedCount, conflicts },
      });
    }

    return { assignedCount, skippedCount, conflicts, assignedItems };
  }

  /**
   * Backward-compatible single shift wrapper
   */
  public assignShiftsToPersonnel(params: {
    personIds: string[];
    shiftId: string;
    fromDate: string;
    toDate: string;
    assignmentType: 'DAILY' | 'RECURRING' | 'STANDARD_FALLBACK';
  }): { assignedCount: number; skippedCount: number; conflicts: string[] } {
    return this.assignMultipleShiftsToPersonnel({
      personIds: params.personIds,
      shiftIds: [params.shiftId],
      fromDate: params.fromDate,
      toDate: params.toDate,
      assignmentType: params.assignmentType,
    });
  }

  /**
   * Cancel one or multiple shift assignments with confirmation reason & history logging.
   * Blocks retroactive cancellation of past shifts (< CURRENT_SYSTEM_DATE).
   * Never deletes Raw Scan events.
   */
  public cancelShiftAssignments(params: {
    assignmentIds: string[];
    reason: string;
    cancelledBy?: string;
  }): {
    cancelledCount: number;
    blockedPastCount: number;
    errors: string[];
  } {
    let cancelledCount = 0;
    let blockedPastCount = 0;
    const errors: string[] = [];
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const actor = params.cancelledBy || 'เจ้าหน้าที่ผู้รับผิดชอบ (Sam_Att)';

    for (const id of params.assignmentIds) {
      const target = this.assignments.find((a) => a.id === id);
      if (!target) continue;

      const person = this.personnel.find((p) => p.personId === target.personId);
      const personName = person ? `${person.prefix}${person.firstName} ${person.lastName}` : target.personId;

      if (this.isPastWorkDate(target.workDate)) {
        blockedPastCount++;
        errors.push(
          `ไม่อนุญาตให้ยกเลิกกะย้อนหลัง: ${personName} วันที่ ${target.workDate} (${target.shiftName})`
        );
        continue;
      }

      this.assignments = this.assignments.filter((a) => a.id !== id);
      this.cancellationLogs.unshift({
        id: `CANC_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        assignmentId: target.id,
        personId: target.personId,
        personName,
        workDate: target.workDate,
        shiftId: target.shiftId,
        shiftName: target.shiftName,
        cancelledAt: nowIso,
        cancelledBy: actor,
        reason: params.reason || 'ยกเลิกตารางกะตามคำสั่งหัวหน้ากลุ่มงาน',
      });
      void apiAttendanceAdapter
        .cancelShiftAssignment(target.id, params.reason || 'ยกเลิกตารางกะตามคำสั่งหัวหน้ากลุ่มงาน')
        .catch(() => {});
      cancelledCount++;
    }

    if (cancelledCount > 0) {
      this.recordAuditLog({
        action: 'ASSIGN_SHIFT',
        entityType: 'ShiftCancellation',
        entityId: params.assignmentIds.join(','),
        summary: `ยกเลิกการกำหนดกะ ${cancelledCount} รายการ (เหตุผล: ${params.reason || 'ปรับตารางเวร'})`,
        metadata: { ...params, cancelledCount, blockedPastCount },
      });
    }

    return { cancelledCount, blockedPastCount, errors };
  }

  public getShiftCancellationLogs(personId?: string): ShiftCancellationLog[] {
    if (!personId) return [...this.cancellationLogs];
    return this.cancellationLogs.filter((c) => c.personId === personId);
  }

  public deleteShiftAssignment(assignmentId: string, reason = 'ยกเลิกตารางเวร'): {
    cancelledCount: number;
    blockedPastCount: number;
    errors: string[];
  } {
    return this.cancelShiftAssignments({ assignmentIds: [assignmentId], reason });
  }

  /**
   * Copy shift schedule across months either by matching day-of-month ('BY_DATE')
   * or matching day-of-week pattern ('BY_WEEKDAY').
   */
  public copyShiftsAcrossMonth(params: {
    personIds: string[];
    sourceMonth: string; // YYYY-MM (e.g. '2026-11')
    targetMonth: string; // YYYY-MM (e.g. '2026-12')
    copyMode: 'BY_DATE' | 'BY_WEEKDAY';
  }): { assignedCount: number; skippedCount: number; conflicts: string[] } {
    const [srcY, srcM] = params.sourceMonth.split('-').map(Number);
    const [tgtY, tgtM] = params.targetMonth.split('-').map(Number);
    const daysInTarget = new Date(tgtY, tgtM, 0).getDate();

    let totalAssigned = 0;
    let totalSkipped = 0;
    const allConflicts: string[] = [];

    for (const pid of params.personIds) {
      const sourceAssigns = this.assignments.filter(
        (a) => a.personId === pid && a.workDate.startsWith(`${params.sourceMonth}-`)
      );
      if (sourceAssigns.length === 0) continue;

      for (let d = 1; d <= daysInTarget; d++) {
        const targetDateStr = `${params.targetMonth}-${String(d).padStart(2, '0')}`;
        if (this.isPastWorkDate(targetDateStr)) continue;

        let matchingSourceAssigns: ShiftAssignment[] = [];
        if (params.copyMode === 'BY_DATE') {
          const srcDateStr = `${params.sourceMonth}-${String(d).padStart(2, '0')}`;
          matchingSourceAssigns = sourceAssigns.filter((a) => a.workDate === srcDateStr);
        } else {
          // Match by day of week (Sunday=0 .. Saturday=6)
          const targetDow = new Date(tgtY, tgtM - 1, d).getDay();
          matchingSourceAssigns = sourceAssigns.filter((a) => {
            const [y, m, day] = a.workDate.split('-').map(Number);
            return new Date(y, m - 1, day).getDay() === targetDow;
          });
          // Deduplicate shiftIds for that weekday template
          const uniqueShiftIds = Array.from(new Set(matchingSourceAssigns.map((a) => a.shiftId)));
          matchingSourceAssigns = uniqueShiftIds.map(
            (sid) => matchingSourceAssigns.find((a) => a.shiftId === sid)!
          );
        }

        if (matchingSourceAssigns.length > 0) {
          const shiftIds = matchingSourceAssigns.map((a) => a.shiftId);
          const res = this.assignMultipleShiftsToPersonnel({
            personIds: [pid],
            shiftIds,
            specificDates: [targetDateStr],
            assignmentType: 'RECURRING',
          });
          totalAssigned += res.assignedCount;
          totalSkipped += res.skippedCount;
          allConflicts.push(...res.conflicts);
        }
      }
    }

    return {
      assignedCount: totalAssigned,
      skippedCount: totalSkipped,
      conflicts: allConflicts,
    };
  }

  // ==========================================
  // Dashboard & Reports Metrics
  // ==========================================

  public getDashboardSummary(workDate: string = '2026-11-06'): DashboardSummary {
    const dayRecords = this.attendance.filter((r) => r.workDate === workDate);

    const totalPersonnel = this.personnel.filter((p) => p.active).length;
    const totalShiftsToday = dayRecords.length;
    const normalCount = dayRecords.filter((r) => r.status === 'NORMAL').length;

    const lateRecords = dayRecords.filter((r) => r.status === 'LATE');
    const distinctLatePeopleSet = new Set(lateRecords.map((r) => r.personId));
    const distinctLatePeople = distinctLatePeopleSet.size;
    const totalLateOccurrences = lateRecords.length;

    const noScanCount = dayRecords.filter((r) => r.status === 'NO_SCAN').length;
    const missingCheckoutCount = dayRecords.filter((r) => r.status === 'MISSING_CHECKOUT').length;

    const totalLateMinutes = lateRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    const avgLateMinutesPerLateShift =
      totalLateOccurrences > 0 ? Math.round(totalLateMinutes / totalLateOccurrences) : 0;

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
    order: 'DESC' | 'ASC';
    department?: string;
  }): Array<{
    personId: string;
    fingleId: number;
    fullName: string;
    department: string;
    groupName: string;
    personnelType: string;
    lateOccurrences: number;
    totalLateMinutes: number;
    avgLateMinutes: number;
  }> {
    const records = this.attendance.filter(
      (r) =>
        r.workDate >= params.fromDate &&
        r.workDate <= params.toDate &&
        (params.department && params.department !== 'ALL'
          ? r.department === params.department || r.groupName === params.department
          : true)
    );

    const aggMap = new Map<
      string,
      {
        personId: string;
        fingleId: number;
        fullName: string;
        department: string;
        groupName: string;
        personnelType: string;
        lateOccurrences: number;
        totalLateMinutes: number;
      }
    >();

    records.forEach((r) => {
      if (!aggMap.has(r.personId)) {
        aggMap.set(r.personId, {
          personId: r.personId,
          fingleId: r.fingleId,
          fullName: r.fullName,
          department: r.department,
          groupName: r.groupName,
          personnelType: r.personnelType,
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
