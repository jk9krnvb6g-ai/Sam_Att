/**
 * Sam_Att V2 — Production Real API Gateway Adapter (`/api/Sam_Att/*`)
 * Phase A25 — Real Database Integration (No Mock Data / No Dev Header Fallback)
 *
 * Connects the React Frontend (`:3001/Sam_Att/`) to the Central API Gateway (`:3002/api/Sam_Att/`).
 * Strictly operates in REAL API Mode using signed Bearer session tokens.
 */

import {
  AttendanceRecord,
  AuditLogEntry,
  HosOfficePushBatch,
  HRReviewStatus,
  NoteReasonCode,
  Personnel,
  RawScanEvent,
  Shift,
  ShiftAssignment,
  ShiftCancellationLog,
  User,
} from '../types/attendance';
import {
  DeploymentCenterStatusPayload,
  DeploymentHistoryItem,
} from '../types/deploymentCenter';

export type DataSourceMode = 'API';

const AUTH_TOKEN_STORAGE_KEY = 'sam_att_v2_auth_token';

export interface BackendAuthenticatedUser {
  id?: string;
  userId: string;
  username: string;
  fullName: string;
  role: User['role'];
  personId: string | null;
  department?: string;
  position?: string;
}

export interface DashboardSummaryResponse {
  success: boolean;
  workDate: string;
  totalPersonnel: number;
  totalShiftsToday: number;
  totalActivePersonnel: number;
  assignedShiftsToday: number;
  normalCount: number;
  lateCount: number;
  distinctLatePeople: number;
  totalLateOccurrences: number;
  totalLateMinutes: number;
  avgLateMinutesPerLateShift: number;
  missingCheckoutCount: number;
  noScanCount: number;
  pendingReviewCount: number;
  unmappedRawScansCount: number;
  disputedMappingsCount: number;
  rawScansTotalCount: number;
}

export interface ConnectionSettingsResponse {
  success: boolean;
  repositoryMode: string;
  gateway: {
    frontendPort: number;
    frontendBase: string;
    apiGatewayPort: number;
    apiMount: string;
    isolatedDatabase: string;
  };
  samchukDb: {
    configured: boolean;
    host: string;
    port: number;
    database: string;
    engine: string;
    status: string;
  };
  hosofficeDb: {
    configured: boolean;
    configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
    host: string;
    port: number;
    database: string;
    sourceTable: string;
    mode: string;
    statusMessage: string;
    pushEnabled: boolean;
  };
}

class ApiAttendanceAdapter {
  private baseUrl = '/api/Sam_Att';

  public getDataSourceMode(): DataSourceMode {
    return 'API';
  }

  public getAuthToken(): string | null {
    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public setAuthToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }

  private buildHeaders(includeJsonContentType = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (includeJsonContentType) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async requestJson<T>(
    endpoint: string,
    init?: RequestInit,
    suppressUnauthorizedEvent = false
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        ...this.buildHeaders(init?.body !== undefined),
        ...(init?.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && !suppressUnauthorizedEvent) {
      this.setAuthToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sam-att-auth-unauthorized'));
      }
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.error || `HTTP ${res.status}: คำร้องขอ API ล้มเหลว`);
    }

    return data as T;
  }

  // ==========================================
  // 1. Authentication (`/auth/*`)
  // ==========================================
  public async login(
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    token?: string;
    user?: BackendAuthenticatedUser;
    error?: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `เข้าสู่ระบบไม่สำเร็จ (HTTP ${res.status})`,
        };
      }
      if (data.token) {
        this.setAuthToken(data.token);
      }
      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Authentication ได้',
      };
    }
  }

  public async fetchCurrentUser(): Promise<BackendAuthenticatedUser> {
    const data = await this.requestJson<{
      success: boolean;
      user: BackendAuthenticatedUser;
    }>('/auth/me', { method: 'GET' });
    return data.user;
  }

  public async logout(): Promise<void> {
    const token = this.getAuthToken();
    try {
      if (token) {
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: this.buildHeaders(false),
        });
      }
    } catch {
      // Proceed with local token cleanup even if network fails
    } finally {
      this.setAuthToken(null);
    }
  }

  // ==========================================
  // 2. Read-Only Gateway & Database Connectivity Verification (`/settings/connections/health` + `/settings/connections`)
  // ==========================================
  public async checkHealth(): Promise<{
    success: boolean;
    ok: boolean;
    healthy: boolean;
    repositoryMode: string;
    engine: string;
    status: string;
    database: string;
    message: string;
    error?: string;
    hosofficeDb?: {
      configured: boolean;
      connected: boolean;
      configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
      host: string;
      port: number;
      database: string;
      sourceTable: string;
      message: string;
      error?: string;
    };
  }> {
    const [healthRes, connSettings, shifts] = await Promise.all([
      this.requestJson<{
        success: boolean;
        ok: boolean;
        healthy: boolean;
        repositoryMode: string;
        database: string;
        message: string;
        error?: string;
        samchukAttendanceDb?: {
          configured: boolean;
          healthy: boolean;
          host: string;
          port: number;
          database: string;
          mode: string;
          message: string;
          error?: string;
        };
        hosofficeDb?: {
          configured: boolean;
          connected: boolean;
          configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
          host: string;
          port: number;
          database: string;
          sourceTable: string;
          message: string;
          error?: string;
        };
      }>('/settings/connections/health', { method: 'GET' }).catch(() => null),
      this.fetchConnectionSettings(),
      this.fetchShifts(),
    ]);

    const resolvedDb =
      healthRes?.database ||
      connSettings.samchukDb.database ||
      connSettings.gateway.isolatedDatabase ||
      'samchuk_attendance_v2';

    const gatewayReachable = Boolean(connSettings.success && Array.isArray(shifts));
    const isRealMySql = healthRes
      ? Boolean(healthRes.healthy && healthRes.repositoryMode === 'REAL')
      : Boolean(connSettings.repositoryMode === 'REAL' && connSettings.samchukDb.configured);

    return {
      success: gatewayReachable,
      ok: gatewayReachable && isRealMySql,
      healthy: gatewayReachable && isRealMySql,
      repositoryMode: healthRes?.repositoryMode || connSettings.repositoryMode || 'UNKNOWN',
      engine: connSettings.samchukDb.engine || connSettings.repositoryMode || 'UNKNOWN',
      status: !gatewayReachable
        ? 'GATEWAY_UNREACHABLE'
        : isRealMySql
        ? `CONNECTED_REAL_MYSQL (${shifts.length} shifts)`
        : `NON_PRODUCTION_MODE (${connSettings.repositoryMode} / DB Configured: ${connSettings.samchukDb.configured})`,
      database: resolvedDb,
      message: !gatewayReachable
        ? 'ไม่สามารถติดต่อ Central API Gateway (/api/Sam_Att) ได้'
        : isRealMySql
        ? healthRes?.message ||
          `เชื่อมต่อฐานข้อมูลจริง ${resolvedDb} (${connSettings.samchukDb.host}:${connSettings.samchukDb.port}) ผ่าน Central API Gateway สำเร็จ (อ่านกติกากะ ${shifts.length} รายการ)`
        : healthRes?.message ||
          `ติดต่อ API สำเร็จในโหมด ${connSettings.repositoryMode} (ยังไม่ได้เชื่อมต่อไปยัง MySQL จริงบน ${connSettings.samchukDb.host}:${connSettings.samchukDb.port})`,
      error: !isRealMySql
        ? healthRes?.error ||
          `Repository mode is ${connSettings.repositoryMode} (configured=${connSettings.samchukDb.configured}) — Live MySQL connectivity is NOT VERIFIED`
        : undefined,
      hosofficeDb: healthRes?.hosofficeDb,
    };
  }

  public async fetchConnectionSettings(): Promise<ConnectionSettingsResponse> {
    const raw = await this.requestJson<{
      success: boolean;
      repositoryMode: string;
      architecture: {
        frontendPort: number;
        frontendPath: string;
        gatewayPort: number;
        gatewayPath: string;
        isolatedDatabase: string;
      };
      samchukAttendanceDb: {
        configured: boolean;
        host: string;
        port: number;
        database: string;
        user: string;
        passwordMasked: string;
      };
      hosofficeDb: {
        configured: boolean;
        configurationStatus?: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
        host: string;
        port: number;
        database: string;
        sourceTable?: string;
        targetWriteTable?: string;
        user: string;
        passwordMasked: string;
        statusMessage?: string;
      };
    }>('/settings/connections', { method: 'GET' });

    const resolvedDatabase =
      raw.samchukAttendanceDb?.database ||
      raw.architecture?.isolatedDatabase ||
      'samchuk_attendance_v2';
    const hosConfigured = Boolean(raw.hosofficeDb?.configured);
    const hosConfigStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION' =
      raw.hosofficeDb?.configurationStatus ||
      (hosConfigured ? 'CONFIGURED' : 'AWAITING_CONFIGURATION');

    return {
      success: raw.success,
      repositoryMode: raw.repositoryMode,
      gateway: {
        frontendPort: raw.architecture?.frontendPort || 3001,
        frontendBase: raw.architecture?.frontendPath || '/Sam_Att/',
        apiGatewayPort: raw.architecture?.gatewayPort || 3002,
        apiMount: raw.architecture?.gatewayPath || '/api/Sam_Att/',
        isolatedDatabase: raw.architecture?.isolatedDatabase || resolvedDatabase,
      },
      samchukDb: {
        configured: Boolean(raw.samchukAttendanceDb?.configured),
        host: raw.samchukAttendanceDb?.host || 'ยังไม่ได้ตั้งค่า (Awaiting SAM_ATT_DB_HOST)',
        port: raw.samchukAttendanceDb?.port || 3306,
        database: resolvedDatabase,
        engine: raw.repositoryMode || 'MYSQL',
        status: raw.samchukAttendanceDb?.configured ? 'CONFIGURED' : 'AWAITING_CONFIGURATION',
      },
      hosofficeDb: {
        configured: hosConfigured,
        configurationStatus: hosConfigStatus,
        host: raw.hosofficeDb?.host || 'ยังไม่ได้ตั้งค่า (AWAITING_CONFIGURATION)',
        port: raw.hosofficeDb?.port || 3306,
        database: raw.hosofficeDb?.database || 'hosoffice',
        sourceTable: raw.hosofficeDb?.sourceTable || 'hr_person',
        mode: hosConfigured ? 'READ_ONLY_PERSONNEL_LIVE_SYNC' : 'AWAITING_CONFIGURATION',
        statusMessage:
          raw.hosofficeDb?.statusMessage ||
          (hosConfigured
            ? 'ตั้งค่าการเชื่อมต่อ HOSOffice จาก Environment Variables เรียบร้อยแล้ว'
            : 'AWAITING_CONFIGURATION: ยังไม่ได้กำหนดค่าการเชื่อมต่อฐานข้อมูล HOSOffice ใน Environment Variables'),
        pushEnabled: false,
      },
    };
  }

  public async fetchSystemLogs(limit = 100): Promise<AuditLogEntry[]> {
    const data = await this.requestJson<{
      success: boolean;
      logs: Array<{
        id: string;
        actor: string;
        actorName: string;
        actorRole: User['role'];
        action: string;
        entityType: string;
        entityId: string;
        summary: string;
        timestamp: string;
        metadata?: Record<string, unknown>;
      }>;
    }>(`/system-logs?limit=${encodeURIComponent(String(limit))}`, { method: 'GET' });

    return (data.logs || []).map((l) => ({
      id: l.id,
      actor: l.actorName || l.actor,
      actorUsername: l.actor,
      actorName: l.actorName || l.actor,
      actorRole: l.actorRole || 'RESPONSIBLE_STAFF',
      role: l.actorRole || 'RESPONSIBLE_STAFF',
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      summary: l.summary,
      timestamp: l.timestamp,
      metadataJson: JSON.stringify(l.metadata || {}),
    }));
  }

  // ==========================================
  // 3. My Attendance (`GENERAL_USER` Own-Only Endpoints — `/me/*`)
  // ==========================================
  public async fetchMyAttendance(params?: {
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    personId: string;
    total: number;
    records: AttendanceRecord[];
  }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));

    const data = await this.requestJson<{
      success: boolean;
      personId: string;
      total: number;
      records: AttendanceRecord[];
    }>(`/me/attendance?${qs.toString()}`, { method: 'GET' });

    return {
      personId: data.personId,
      total: data.total || 0,
      records: data.records || [],
    };
  }

  public async fetchMyShifts(params?: {
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    personId: string;
    person: Personnel | null;
    assignments: ShiftAssignment[];
    shifts: Shift[];
  }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);

    const data = await this.requestJson<{
      success: boolean;
      personId: string;
      person?: Personnel | null;
      assignments: ShiftAssignment[];
      shifts?: Shift[];
    }>(`/me/shifts?${qs.toString()}`, { method: 'GET' });

    return {
      personId: data.personId,
      person: data.person || null,
      assignments: data.assignments || [],
      shifts: data.shifts || [],
    };
  }

  public async fetchMyRawScans(params?: {
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    personId: string;
    total: number;
    scans: RawScanEvent[];
  }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));

    const data = await this.requestJson<{
      success: boolean;
      personId: string;
      total: number;
      scans: RawScanEvent[];
    }>(`/me/raw-scans?${qs.toString()}`, { method: 'GET' });

    return {
      personId: data.personId,
      total: data.total || 0,
      scans: data.scans || [],
    };
  }

  public async fetchAllMyAttendance(params?: {
    fromDate?: string;
    toDate?: string;
    maxPages?: number;
  }): Promise<AttendanceRecord[]> {
    const pageSize = 200;
    const maxPages = params?.maxPages ?? 50;
    const all: AttendanceRecord[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.fetchMyAttendance({
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        page,
        pageSize,
      });
      all.push(...res.records);
      if (all.length >= res.total || res.records.length < pageSize) {
        break;
      }
    }
    return all;
  }

  public async fetchAllMyRawScans(params?: {
    fromDate?: string;
    toDate?: string;
    maxPages?: number;
  }): Promise<RawScanEvent[]> {
    const pageSize = 200;
    const maxPages = params?.maxPages ?? 50;
    const all: RawScanEvent[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.fetchMyRawScans({
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        page,
        pageSize,
      });
      all.push(...res.scans);
      if (all.length >= res.total || res.scans.length < pageSize) {
        break;
      }
    }
    return all;
  }

  // ==========================================
  // 4. Dashboard Summary (`/dashboard/summary`)
  // ==========================================
  public async fetchDashboardSummary(workDate: string): Promise<DashboardSummaryResponse> {
    const raw = await this.requestJson<{
      success: boolean;
      summary?: {
        workDate: string;
        totalPersonnel: number;
        totalShiftsToday: number;
        normalCount: number;
        distinctLatePeople: number;
        totalLateOccurrences: number;
        noScanCount: number;
        missingCheckoutCount: number;
        pendingReviewCount: number;
        totalLateMinutes: number;
        avgLateMinutesPerLateShift: number;
      };
      workDate?: string;
      totalPersonnel?: number;
      totalShiftsToday?: number;
      normalCount?: number;
      distinctLatePeople?: number;
      totalLateOccurrences?: number;
      noScanCount?: number;
      missingCheckoutCount?: number;
      pendingReviewCount?: number;
      totalLateMinutes?: number;
      avgLateMinutesPerLateShift?: number;
    }>(`/dashboard/summary?workDate=${encodeURIComponent(workDate)}`, { method: 'GET' });

    const s = raw.summary || raw;
    const totalPersonnel = Number(s.totalPersonnel ?? 0);
    const totalShiftsToday = Number(s.totalShiftsToday ?? 0);
    const totalLateOccurrences = Number(s.totalLateOccurrences ?? 0);

    return {
      success: Boolean(raw.success),
      workDate: s.workDate || workDate,
      totalPersonnel,
      totalShiftsToday,
      totalActivePersonnel: totalPersonnel,
      assignedShiftsToday: totalShiftsToday,
      normalCount: Number(s.normalCount ?? 0),
      lateCount: totalLateOccurrences,
      distinctLatePeople: Number(s.distinctLatePeople ?? 0),
      totalLateOccurrences,
      totalLateMinutes: Number(s.totalLateMinutes ?? 0),
      avgLateMinutesPerLateShift: Number(s.avgLateMinutesPerLateShift ?? 0),
      missingCheckoutCount: Number(s.missingCheckoutCount ?? 0),
      noScanCount: Number(s.noScanCount ?? 0),
      pendingReviewCount: Number(s.pendingReviewCount ?? 0),
      unmappedRawScansCount: 0,
      disputedMappingsCount: 0,
      rawScansTotalCount: 0,
    };
  }

  // ==========================================
  // 5. Personnel & HOSOffice Sync (`/personnel/*`)
  // ==========================================
  public async fetchPersonnel(params?: {
    search?: string;
    department?: string;
    personnelType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    total: number;
    personnel: Personnel[];
  }> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.department) qs.set('department', params.department);
    if (params?.personnelType) qs.set('personnelType', params.personnelType);
    if (params?.page) qs.set('page', String(params.page));
    qs.set('pageSize', String(params?.pageSize || 500));

    const data = await this.requestJson<{
      success: boolean;
      total: number;
      personnel: Personnel[];
    }>(`/personnel?${qs.toString()}`, { method: 'GET' });

    return {
      total: data.total || 0,
      personnel: data.personnel || [],
    };
  }

  public async fetchAllPersonnel(params?: {
    search?: string;
    department?: string;
    personnelType?: string;
    maxPages?: number;
  }): Promise<Personnel[]> {
    const pageSize = 500;
    const maxPages = params?.maxPages ?? 50;
    const all: Personnel[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.fetchPersonnel({
        search: params?.search,
        department: params?.department,
        personnelType: params?.personnelType,
        page,
        pageSize,
      });
      all.push(...res.personnel);
      if (all.length >= res.total || res.personnel.length < pageSize) {
        break;
      }
    }
    return all;
  }

  public async fetchPersonnelMappingIssues() {
    return this.requestJson<{
      success: boolean;
      disputedMappings: Array<{
        id: string;
        personId: string;
        fingleId: number;
        effectiveFrom: string;
        effectiveTo: string | null;
        status: string;
      }>;
      unmappedRawScansCount: number;
      unmappedRawScansSample: RawScanEvent[];
    }>('/personnel/mapping-issues', { method: 'GET' });
  }

  public async syncPersonnelFromHosOffice(syncDateStr?: string) {
    return this.requestJson<{
      success: boolean;
      status: string;
      mode: string;
      sourceDatabase: string;
      sourceTable: string;
      insertedCount: number;
      updatedCount: number;
      fingleIdChangedCount: number;
      disputedMappings: Array<{ fingleId: number; personIds: string[]; reason: string }>;
      message: string;
    }>('/personnel/sync', {
      method: 'POST',
      body: JSON.stringify({ syncDateStr }),
    });
  }

  // ==========================================
  // 6. Shifts & Shift Assignments (`/shifts`, `/shift-assignments`, `/shift-cancellations`)
  // ==========================================
  public async fetchShifts(): Promise<Shift[]> {
    const data = await this.requestJson<{
      success: boolean;
      shifts: Shift[];
    }>('/shifts', { method: 'GET' });
    return data.shifts || [];
  }

  public async saveShift(shift: Partial<Shift> & { code: string; name: string; startTime: string; endTime: string }): Promise<Shift> {
    const data = await this.requestJson<{
      success: boolean;
      shift: Shift;
    }>('/shifts', {
      method: 'POST',
      body: JSON.stringify(shift),
    });
    return data.shift;
  }

  public async fetchShiftAssignments(params?: {
    personId?: string;
    workDate?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ShiftAssignment[]> {
    const qs = new URLSearchParams();
    if (params?.personId) qs.set('personId', params.personId);
    if (params?.workDate) qs.set('workDate', params.workDate);
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);

    const data = await this.requestJson<{
      success: boolean;
      total: number;
      assignments: ShiftAssignment[];
    }>(`/shift-assignments?${qs.toString()}`, { method: 'GET' });

    return data.assignments || [];
  }

  public async assignShift(payload: {
    personId: string;
    workDate: string;
    shiftId: string;
    assignmentType?: 'DAILY' | 'MONTHLY' | 'CUSTOM_RANGE';
  }): Promise<ShiftAssignment> {
    const data = await this.requestJson<{
      success: boolean;
      assignment: ShiftAssignment;
    }>('/shift-assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.assignment;
  }

  public async cancelShiftAssignment(
    assignmentId: string,
    reason: string
  ): Promise<ShiftCancellationLog> {
    const data = await this.requestJson<{
      success: boolean;
      cancellationLog: ShiftCancellationLog;
    }>(`/shift-assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    return data.cancellationLog;
  }

  // ==========================================
  // 7. Scanners & Raw Scans (`/scanners/sync`, `/raw-scans`)
  // ==========================================
  public async syncScanners(scansPayload: unknown[]) {
    return this.requestJson<{
      success: boolean;
      totalRead: number;
      newScansCount: number;
      duplicateScansCount: number;
      unmappedScansCount: number;
      disputedScansCount: number;
      invalidScansCount: number;
      reprocessedShiftsCount: number;
      updatedShiftsCount: number;
    }>('/scanners/sync', {
      method: 'POST',
      body: JSON.stringify({ scans: scansPayload }),
    });
  }

  public async fetchRawScans(params?: {
    fromDate?: string;
    toDate?: string;
    machineNo?: number;
    enrollNumber?: number;
    personId?: string;
    mappingStatus?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    total: number;
    items: RawScanEvent[];
  }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.machineNo !== undefined) qs.set('machineNo', String(params.machineNo));
    if (params?.enrollNumber !== undefined) qs.set('enrollNumber', String(params.enrollNumber));
    if (params?.personId) qs.set('personId', params.personId);
    if (params?.mappingStatus) qs.set('mappingStatus', params.mappingStatus);
    if (params?.page) qs.set('page', String(params.page));
    qs.set('pageSize', String(params?.pageSize || 500));

    const data = await this.requestJson<{
      success: boolean;
      total: number;
      items: RawScanEvent[];
    }>(`/raw-scans?${qs.toString()}`, { method: 'GET' });

    return {
      total: data.total || 0,
      items: data.items || [],
    };
  }

  // ==========================================
  // 8. Attendance, Review, Reprocess & HR Notes (`/attendance*`, `/attendance-review`)
  // ==========================================
  public async fetchAttendance(params?: {
    fromDate?: string;
    toDate?: string;
    department?: string;
    personnelType?: string;
    shiftId?: string;
    status?: string;
    hrReviewStatus?: string;
    personId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    total: number;
    items: AttendanceRecord[];
  }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.department) qs.set('department', params.department);
    if (params?.personnelType) qs.set('personnelType', params.personnelType);
    if (params?.shiftId) qs.set('shiftId', params.shiftId);
    if (params?.status) qs.set('status', params.status);
    if (params?.hrReviewStatus) qs.set('hrReviewStatus', params.hrReviewStatus);
    if (params?.personId) qs.set('personId', params.personId);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    qs.set('pageSize', String(params?.pageSize || 500));

    const data = await this.requestJson<{
      success: boolean;
      total: number;
      items: AttendanceRecord[];
    }>(`/attendance?${qs.toString()}`, { method: 'GET' });

    return {
      total: data.total || 0,
      items: data.items || [],
    };
  }

  public async fetchAllRawScans(params?: {
    fromDate?: string;
    toDate?: string;
    machineNo?: number;
    enrollNumber?: number;
    personId?: string;
    mappingStatus?: string;
    maxPages?: number;
  }): Promise<RawScanEvent[]> {
    const pageSize = 500;
    const maxPages = params?.maxPages ?? 100;
    const all: RawScanEvent[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.fetchRawScans({
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        machineNo: params?.machineNo,
        enrollNumber: params?.enrollNumber,
        personId: params?.personId,
        mappingStatus: params?.mappingStatus,
        page,
        pageSize,
      });
      all.push(...res.items);
      if (all.length >= res.total || res.items.length < pageSize) {
        break;
      }
    }
    return all;
  }

  public async fetchAllAttendance(params?: {
    fromDate?: string;
    toDate?: string;
    department?: string;
    personnelType?: string;
    shiftId?: string;
    status?: string;
    hrReviewStatus?: string;
    personId?: string;
    search?: string;
    maxPages?: number;
  }): Promise<AttendanceRecord[]> {
    const pageSize = 500;
    const maxPages = params?.maxPages ?? 100;
    const all: AttendanceRecord[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const res = await this.fetchAttendance({
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        department: params?.department,
        personnelType: params?.personnelType,
        shiftId: params?.shiftId,
        status: params?.status,
        hrReviewStatus: params?.hrReviewStatus,
        personId: params?.personId,
        search: params?.search,
        page,
        pageSize,
      });
      all.push(...res.items);
      if (all.length >= res.total || res.items.length < pageSize) {
        break;
      }
    }
    return all;
  }

  public async fetchAttendanceReview(params?: {
    fromDate?: string;
    toDate?: string;
    department?: string;
    personnelType?: string;
    status?: string;
    hrReviewStatus?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.department) qs.set('department', params.department);
    if (params?.personnelType) qs.set('personnelType', params.personnelType);
    if (params?.status) qs.set('status', params.status);
    if (params?.hrReviewStatus) qs.set('hrReviewStatus', params.hrReviewStatus);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    qs.set('pageSize', String(params?.pageSize || 500));

    return this.requestJson<{
      success: boolean;
      kpi: {
        totalShifts: number;
        normalCount: number;
        lateCount: number;
        totalLateMinutes: number;
        missingCheckoutCount: number;
        noScanCount: number;
        pendingReviewCount: number;
        reviewedCount: number;
      };
      total: number;
      items: AttendanceRecord[];
    }>(`/attendance-review?${qs.toString()}`, { method: 'GET' });
  }

  public async previewReprocess(params: {
    fromDate: string;
    toDate: string;
    groupName?: string;
    personId?: string;
  }) {
    return this.requestJson<{
      success: boolean;
      targetShiftCount: number;
      targetPersonCount: number;
      estimatedChangesCount: number;
      changes: Array<{
        personId: string;
        fullName: string;
        workDate: string;
        shiftId: string;
        shiftName: string;
        previousStatus: string | null;
        newStatus: string;
        previousLateMinutes: number | null;
        newLateMinutes: number;
        hasPreservedHRNote: boolean;
      }>;
    }>('/attendance/reprocess/preview', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async executeReprocess(params: {
    fromDate: string;
    toDate: string;
    groupName?: string;
    personId?: string;
  }) {
    return this.requestJson<{
      success: boolean;
      reprocessedCount: number;
      updatedCount: number;
      unchangedCount: number;
      skippedCount: number;
      records: AttendanceRecord[];
    }>('/attendance/reprocess', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async saveHRReviewNote(params: {
    attendanceId: string;
    reasonCode: NoteReasonCode;
    reasonLabel: string;
    note: string;
    hrReviewStatus: HRReviewStatus;
  }): Promise<AttendanceRecord> {
    const data = await this.requestJson<{
      success: boolean;
      record: AttendanceRecord;
    }>(`/attendance/${encodeURIComponent(params.attendanceId)}/review`, {
      method: 'POST',
      body: JSON.stringify({
        reasonCode: params.reasonCode,
        reasonLabel: params.reasonLabel,
        note: params.note,
        hrReviewStatus: params.hrReviewStatus,
      }),
    });
    return data.record;
  }

  // ==========================================
  // 9. Lateness Reports & HOSOffice Push Preview (`/reports/lateness`, `/hosoffice/*`)
  // ==========================================
  public async fetchLatenessReport(params: {
    fromDate?: string;
    toDate?: string;
    department?: string;
  }) {
    const qs = new URLSearchParams();
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.department) qs.set('department', params.department);

    return this.requestJson<{
      success: boolean;
      fromDate?: string;
      toDate?: string;
      rankings: Array<{
        personId: string;
        fingleId: number;
        fullName: string;
        department: string;
        groupName: string;
        personnelType: string;
        totalShifts: number;
        lateOccurrences: number;
        totalLateMinutes: number;
        missingCheckoutCount: number;
        noScanCount: number;
      }>;
    }>(`/reports/lateness?${qs.toString()}`, { method: 'GET' });
  }

  public async previewHosOfficePush(attendanceIds: string[]) {
    return this.requestJson<{
      success: boolean;
      livePushExecuted: boolean;
      status: string;
      targetDatabase: string;
      targetTable: string;
      totalSelected: number;
      readyToPushCount: number;
      alreadyPushedSkippedCount: number;
      modifiedAfterPushBlockedCount: number;
      validationErrorCount: number;
      message: string;
    }>('/hosoffice/push/preview', {
      method: 'POST',
      body: JSON.stringify({ attendanceIds }),
    });
  }

  public async fetchPushHistory(): Promise<HosOfficePushBatch[]> {
    const data = await this.requestJson<{
      success: boolean;
      history: Array<{
        id: string;
        pushedAt: string;
        pushedBy: string;
        mode: string;
        recordsCount: number;
        skippedDuplicateCount: number;
        status: string;
        note: string;
      }>;
    }>('/hosoffice/push-history', { method: 'GET' });

    return (data.history || []).map((h) => ({
      id: h.id,
      pushedAt: h.pushedAt,
      pushedBy: h.pushedBy,
      recordsCount: h.recordsCount,
      skippedDuplicateCount: h.skippedDuplicateCount,
      status:
        h.status === 'READY_TO_PUSH' || h.status === 'SUCCESS'
          ? 'SUCCESS'
          : h.status === 'BLOCKED_VALIDATION' || h.status === 'FAILED'
          ? 'FAILED'
          : 'PARTIAL',
      note: h.note,
    }));
  }

  // ==========================================
  // 10. Deployment Center (`/deployment/*` — ADMIN Only)
  // ==========================================
  public async fetchDeploymentStatus(): Promise<DeploymentCenterStatusPayload> {
    return this.requestJson<DeploymentCenterStatusPayload>('/deployment/status', {
      method: 'GET',
    });
  }

  public async checkDeploymentUpdates(): Promise<DeploymentCenterStatusPayload> {
    return this.requestJson<DeploymentCenterStatusPayload>('/deployment/check-updates', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async runDeploymentPreflight(): Promise<DeploymentCenterStatusPayload> {
    return this.requestJson<DeploymentCenterStatusPayload>('/deployment/preflight', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async fetchDeploymentHistory(limit = 30): Promise<DeploymentHistoryItem[]> {
    const data = await this.requestJson<{
      success: boolean;
      history: DeploymentHistoryItem[];
    }>(`/deployment/history?limit=${encodeURIComponent(String(limit))}`, {
      method: 'GET',
    });
    return data.history || [];
  }
}

export const apiAttendanceAdapter = new ApiAttendanceAdapter();

