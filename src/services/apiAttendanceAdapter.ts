/**
 * Sam_Att V2 — Frontend Data Service Layer & API Adapter (Phase 2 — §12)
 *
 * Supports switching between:
 * 1. `MOCK` Adapter: UI Prototype & in-memory testing (clearly displays Mock Mode in UI).
 * 2. `API` Adapter: Calls the shared Central API Gateway at `/api/Sam_Att/`.
 *
 * CRITICAL RULES (§12):
 * - When `API` mode is active, all requests go to `/api/Sam_Att/*` with verified token/persona headers.
 * - NEVER silently fall back to Mock Data when an API request fails; surface the real error to the user.
 * - Preserves On-Demand API Loading, in-memory query cache with TTL, and pagination.
 */

import {
  AttendanceRecord,
  DashboardSummary,
  HRReviewStatus,
  NoScanReasonCode,
  Personnel,
  RawScanEvent,
  Shift,
  ShiftAssignment,
} from '../types/attendance';

export type DataSourceMode = 'MOCK' | 'API';

const DATA_SOURCE_STORAGE_KEY = 'sam_att_v2_data_source_mode';
const AUTH_TOKEN_STORAGE_KEY = 'sam_att_v2_auth_token';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class ApiAttendanceAdapter {
  private baseUrl: string =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_SAM_ATT_API_BASE || '/api/Sam_Att';
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultCacheTtlMs = 15000;

  public getDataSourceMode(): DataSourceMode {
    if (typeof window === 'undefined') return 'MOCK';
    const saved = window.localStorage.getItem(DATA_SOURCE_STORAGE_KEY);
    return saved === 'API' ? 'API' : 'MOCK';
  }

  public setDataSourceMode(mode: DataSourceMode): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DATA_SOURCE_STORAGE_KEY, mode);
      this.clearCache();
      window.dispatchEvent(
        new CustomEvent('sam-att-data-mode-changed', { detail: { mode } })
      );
    }
  }

  public getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  }

  public setAuthToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private getCurrentDevUserId(): string {
    if (typeof window === 'undefined') return 'USR002';
    try {
      const raw = window.localStorage.getItem('sam_att_current_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id) return String(parsed.id);
      }
    } catch {
      // ignore
    }
    return 'USR002';
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['x-sam-att-dev-user-id'] = this.getCurrentDevUserId();
    }
    return headers;
  }

  /**
   * Execute HTTP request against `/api/Sam_Att/*`.
   * Explicitly throws an Error if the Backend is unreachable or returns an error status
   * (NEVER falls back to Mock Data silently — §12).
   */
  public async request<T>(
    path: string,
    options?: RequestInit & { useCache?: boolean; cacheTtlMs?: number }
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const method = (options?.method || 'GET').toUpperCase();
    const cacheKey = `${method}:${url}:${this.getCurrentDevUserId()}`;

    if (method === 'GET' && options?.useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...this.buildHeaders(),
          ...(options?.headers || {}),
        },
      });
    } catch (networkErr) {
      throw new Error(
        `ไม่สามารถเชื่อมต่อ Central API Gateway (${url}): ${(networkErr as Error).message} (ระบบไม่ใช้ข้อมูล Mock แทน API Error ตามข้อกำหนด §12)`
      );
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      throw new Error(
        `API Gateway (${url}) ตอบกลับไม่ใช่รูปแบบ JSON (HTTP ${response.status})`
      );
    }

    if (!response.ok || body?.success === false) {
      throw new Error(
        body?.error || `API Error HTTP ${response.status} from ${url}`
      );
    }

    if (method === 'GET' && options?.useCache) {
      this.cache.set(cacheKey, {
        data: body,
        expiresAt: Date.now() + (options?.cacheTtlMs ?? this.defaultCacheTtlMs),
      });
    } else if (method !== 'GET') {
      this.clearCache();
    }

    return body as T;
  }

  // ==========================================
  // Typed Gateway Endpoints (`/api/Sam_Att/*`)
  // ==========================================

  public async login(username: string, password: string) {
    const res = await this.request<{
      success: boolean;
      token: string;
      user: unknown;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.token) {
      this.setAuthToken(res.token);
    }
    return res;
  }

  public async fetchDashboardSummary(workDate: string): Promise<DashboardSummary> {
    const res = await this.request<{
      success: boolean;
      summary: DashboardSummary;
    }>(`/dashboard/summary?workDate=${encodeURIComponent(workDate)}`, {
      useCache: true,
    });
    return res.summary;
  }

  public async fetchPersonnel(params?: {
    search?: string;
    department?: string;
    personnelType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ total: number; personnel: Personnel[] }> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.department) qs.set('department', params.department);
    if (params?.personnelType) qs.set('personnelType', params.personnelType);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    return this.request(`/personnel?${qs.toString()}`, { useCache: true });
  }

  public async syncPersonnelFromHosOffice() {
    return this.request<{
      success: boolean;
      connected: boolean;
      mode: string;
      status: string;
      message: string;
      totalRead: number;
      insertedCount: number;
      updatedCount: number;
      fingleIdChangedCount: number;
      mappingIssues: Array<unknown>;
    }>('/personnel/sync', { method: 'POST', body: JSON.stringify({}) });
  }

  public async fetchShifts(): Promise<{ shifts: Shift[] }> {
    return this.request('/shifts', { useCache: true });
  }

  public async fetchShiftAssignments(params?: {
    personId?: string;
    workDate?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{ total: number; assignments: ShiftAssignment[] }> {
    const qs = new URLSearchParams();
    if (params?.personId) qs.set('personId', params.personId);
    if (params?.workDate) qs.set('workDate', params.workDate);
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    return this.request(`/shift-assignments?${qs.toString()}`, { useCache: true });
  }

  public async fetchRawScans(params?: {
    fromDate?: string;
    toDate?: string;
    machineNo?: number;
    enrollNumber?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: RawScanEvent[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.machineNo !== undefined) qs.set('machineNo', String(params.machineNo));
    if (params?.enrollNumber !== undefined) qs.set('enrollNumber', String(params.enrollNumber));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    return this.request(`/raw-scans?${qs.toString()}`, { useCache: true });
  }

  public async fetchAttendance(params?: {
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
  }): Promise<{ items: AttendanceRecord[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    if (params?.workDate) qs.set('workDate', params.workDate);
    if (params?.personId) qs.set('personId', params.personId);
    if (params?.department) qs.set('department', params.department);
    if (params?.status) qs.set('status', params.status);
    if (params?.hrReviewStatus) qs.set('hrReviewStatus', params.hrReviewStatus);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    return this.request(`/attendance?${qs.toString()}`, { useCache: true });
  }

  public async previewReprocess(params: {
    fromDate: string;
    toDate: string;
    groupName?: string;
    personId?: string;
  }) {
    return this.request('/attendance/reprocess/preview', {
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
    return this.request('/attendance/reprocess', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async saveHRReviewNote(params: {
    attendanceId: string;
    reasonCode: NoScanReasonCode;
    reasonLabel: string;
    note: string;
    hrReviewStatus: HRReviewStatus;
  }) {
    return this.request(`/attendance/${encodeURIComponent(params.attendanceId)}/review`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  public async fetchMyAttendance(params?: { fromDate?: string; toDate?: string }) {
    const qs = new URLSearchParams();
    if (params?.fromDate) qs.set('fromDate', params.fromDate);
    if (params?.toDate) qs.set('toDate', params.toDate);
    return this.request<{
      success: boolean;
      personId: string;
      total: number;
      records: AttendanceRecord[];
    }>(`/me/attendance?${qs.toString()}`, { useCache: true });
  }

  public async previewHosOfficePush(attendanceIds: string[]) {
    return this.request('/hosoffice/push/preview', {
      method: 'POST',
      body: JSON.stringify({ attendanceIds }),
    });
  }

  public async fetchConnectionSettings() {
    return this.request('/settings/connections', { useCache: false });
  }
}

export const apiAttendanceAdapter = new ApiAttendanceAdapter();
