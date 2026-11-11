/**
 * HOSOffice Authoritative Personnel Adapter & Phase 2 Push Interface (§8 & §11)
 *
 * CRITICAL RULES (§8):
 * 1. HOSOffice is the authoritative source for PERSON_ID, FINGLE_ID, full name, position, department, personnelType, and active status.
 * 2. Read-only access from Backend only; NEVER modify HOSOffice tables.
 * 3. Use PERSON_ID as primary identifier; NEVER match personnel by firstName + lastName alone (§8.9).
 * 4. Use FINGLE_ID for matching scanner events; preserve historical raw scans when FINGLE_ID changes (§8.8).
 * 5. Report duplicate/ambiguous FINGLE_ID or missing PERSON_ID as mapping issues requiring inspection (§8.10).
 * 6. If real HOSOffice DB connection/credentials are not configured, return `AWAITING_REAL_CREDENTIALS` — NEVER fake a live sync success!
 *
 * CRITICAL RULES (§11 — HOSOffice Push):
 * 1. Phase 2 prepares the Interface, Data Mapping, Validation, Preview Payload, and Push History Model.
 * 2. Do NOT send live writes to HOSOffice until Contract, permissions, and schema are verified with the hospital.
 * 3. NEVER report a live Push as "SUCCESS" when running in Mock or Phase 2 Preview mode.
 */

import mysql, { RowDataPacket } from 'mysql2/promise';
import {
  EngineAttendanceRecord,
  EnginePersonnel,
} from '../types';
import { ISamAttRepository } from '../repositories/interfaces';
import { RepositoryPushHistory } from '../repositories/samAttRepository';

export interface RawHosOfficePersonRow {
  PERSON_ID?: string | number | null;
  FINGLE_ID?: string | number | null;
  HR_PREFIX?: string | null;
  HR_FNAME?: string | null;
  HR_LNAME?: string | null;
  HR_POSITION?: string | null;
  HR_DEPARTMENT?: string | null;
  HR_GROUP_NAME?: string | null;
  HR_PERSON_TYPE?: string | null;
  HR_STATUS?: string | number | boolean | null;
}

export interface HosOfficeMappingIssue {
  issueType:
    | 'MISSING_PERSON_ID'
    | 'MISSING_FINGLE_ID'
    | 'DUPLICATE_FINGLE_ID'
    | 'NAME_ONLY_REJECTED';
  personId: string | null;
  fingleId: number | null;
  fullName: string;
  detail: string;
}

export interface HosOfficeSyncResult {
  connected: boolean;
  mode: 'LIVE_MYSQL' | 'AWAITING_CONFIGURATION' | 'AWAITING_REAL_CREDENTIALS' | 'TEST_FIXTURE';
  status:
    | 'SUCCESS'
    | 'PARTIAL_WITH_ISSUES'
    | 'AWAITING_CONFIGURATION'
    | 'AWAITING_REAL_CREDENTIALS'
    | 'FAILED';
  configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
  message: string;
  totalRead: number;
  insertedCount: number;
  updatedCount: number;
  fingleIdChangedCount: number;
  mappingIssues: HosOfficeMappingIssue[];
}

export interface HosOfficePushPayloadItem {
  idempotencyKey: string;
  attendanceId: string;
  personId: string;
  fingleId: number;
  workDate: string;
  shiftId: string;
  shiftName: string;
  checkInDateTime: string | null;
  checkOutDateTime: string | null;
  attendanceStatus: string;
  lateMinutes: number;
  hrReviewStatus: string;
  hrReasonCode: string | null;
  hrNote: string | null;
}

export interface HosOfficePushPreviewResult {
  canExecuteLivePush: boolean;
  phaseStatus: 'PHASE2_PREVIEW_ONLY_AWAITING_CONTRACT' | 'AWAITING_CONFIGURATION';
  configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
  message: string;
  validCount: number;
  invalidCount: number;
  validationErrors: Array<{ attendanceId: string; reason: string }>;
  previewPayloads: HosOfficePushPayloadItem[];
  recordedPreviewHistory: RepositoryPushHistory[];
}

export class HosOfficeAdapter {
  /**
   * Check whether real HOSOffice DB credentials are configured in environment variables.
   * Never exposes passwords or secrets (§4 & §6).
   */
  public static getConnectionConfigStatus(): {
    configured: boolean;
    configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
    host: string;
    port: number;
    database: string;
    sourceTable: string;
    user: string;
    passwordMasked: string;
    statusMessage: string;
  } {
    const host = (process.env.HOSOFFICE_DB_HOST || '').trim();
    const port = Number(process.env.HOSOFFICE_DB_PORT || 3306);
    const database = (process.env.HOSOFFICE_DB_NAME || 'hosoffice').trim() || 'hosoffice';
    const sourceTable =
      (process.env.HOSOFFICE_HR_PERSON_TABLE || 'hr_person').trim() || 'hr_person';
    const user = (process.env.HOSOFFICE_DB_USER || '').trim();
    const password = process.env.HOSOFFICE_DB_PASSWORD || '';

    const configured = Boolean(host && user && password.length > 0);

    return {
      configured,
      configurationStatus: configured ? 'CONFIGURED' : 'AWAITING_CONFIGURATION',
      host: host || 'ยังไม่ได้ตั้งค่า (AWAITING_CONFIGURATION)',
      port,
      database,
      sourceTable,
      user: user || 'ยังไม่ได้ตั้งค่า (AWAITING_CONFIGURATION)',
      passwordMasked: password.length > 0 ? '••••••••••••' : 'ยังไม่ได้ตั้งค่า',
      statusMessage: configured
        ? `ตั้งค่าการเชื่อมต่อ HOSOffice (${host}:${port}/${database}) จาก Environment Variables เรียบร้อยแล้ว`
        : 'AWAITING_CONFIGURATION: ยังไม่ได้กำหนดค่า HOSOFFICE_DB_HOST, HOSOFFICE_DB_USER หรือ HOSOFFICE_DB_PASSWORD ใน Environment Variables',
    };
  }

  /**
   * Perform a real MySQL connectivity test (`SELECT 1`) against HOSOffice when configured.
   * If not configured, honestly reports `AWAITING_CONFIGURATION` without faking connectivity.
   */
  public static async testDatabaseConnection(): Promise<{
    configured: boolean;
    connected: boolean;
    configurationStatus: 'CONFIGURED' | 'AWAITING_CONFIGURATION';
    host: string;
    port: number;
    database: string;
    sourceTable: string;
    message: string;
    error?: string;
  }> {
    const config = this.getConnectionConfigStatus();
    if (!config.configured) {
      return {
        configured: false,
        connected: false,
        configurationStatus: 'AWAITING_CONFIGURATION',
        host: config.host,
        port: config.port,
        database: config.database,
        sourceTable: config.sourceTable,
        message: config.statusMessage,
      };
    }

    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection({
        host: (process.env.HOSOFFICE_DB_HOST || '').trim(),
        port: config.port,
        user: (process.env.HOSOFFICE_DB_USER || '').trim(),
        password: process.env.HOSOFFICE_DB_PASSWORD || '',
        database: config.database,
        connectTimeout: 5000,
      });
      await conn.execute('SELECT 1 AS ok');
      return {
        configured: true,
        connected: true,
        configurationStatus: 'CONFIGURED',
        host: config.host,
        port: config.port,
        database: config.database,
        sourceTable: config.sourceTable,
        message: `เชื่อมต่อฐานข้อมูล HOSOffice (${config.host}:${config.port}/${config.database}) สำเร็จ`,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown MySQL connection error';
      return {
        configured: true,
        connected: false,
        configurationStatus: 'CONFIGURED',
        host: config.host,
        port: config.port,
        database: config.database,
        sourceTable: config.sourceTable,
        message: `ตั้งค่า HOSOffice แล้ว แต่ไม่สามารถเชื่อมต่อฐานข้อมูล (${config.host}:${config.port}/${config.database}): ${errMsg}`,
        error: errMsg,
      };
    } finally {
      if (conn) {
        await conn.end().catch(() => {});
      }
    }
  }

  /**
   * Normalize and validate raw rows from `hosoffice.hr_person` (§6 & §8.1–§8.10).
   * - Requires PERSON_ID (never matches by name alone!).
   * - Flags missing or duplicate FINGLE_IDs as mappingIssues.
   */
  public static mapAndValidateHosOfficeRows(rows: ReadonlyArray<RawHosOfficePersonRow>): {
    validPersonnel: EnginePersonnel[];
    mappingIssues: HosOfficeMappingIssue[];
  } {
    const validPersonnel: EnginePersonnel[] = [];
    const mappingIssues: HosOfficeMappingIssue[] = [];

    for (const row of rows) {
      const firstName = String(row.HR_FNAME || '').trim();
      const lastName = String(row.HR_LNAME || '').trim();
      const prefix = String(row.HR_PREFIX || '').trim();
      const fullName = `${prefix}${firstName} ${lastName}`.trim() || 'ไม่ระบุชื่อ';

      const rawPersonId =
        row.PERSON_ID !== undefined && row.PERSON_ID !== null
          ? String(row.PERSON_ID).trim()
          : '';

      // Rule §8.6 & §8.9: Must have PERSON_ID; never match by firstName + lastName alone!
      if (!rawPersonId) {
        mappingIssues.push({
          issueType: firstName || lastName ? 'NAME_ONLY_REJECTED' : 'MISSING_PERSON_ID',
          personId: null,
          fingleId: row.FINGLE_ID ? Number(row.FINGLE_ID) : null,
          fullName,
          detail: `ปฏิเสธการจับคู่ด้วยชื่อ-นามสกุลเพียงอย่างเดียว (${fullName}): ไม่พบ PERSON_ID จาก HOSOffice`,
        });
        continue;
      }

      const parsedFingle =
        row.FINGLE_ID !== undefined && row.FINGLE_ID !== null && String(row.FINGLE_ID).trim() !== ''
          ? Number(row.FINGLE_ID)
          : 0;

      const hasValidFingle = Number.isInteger(parsedFingle) && parsedFingle > 0;
      if (!hasValidFingle) {
        mappingIssues.push({
          issueType: 'MISSING_FINGLE_ID',
          personId: rawPersonId,
          fingleId: null,
          fullName,
          detail: `บุคลากร ${rawPersonId} (${fullName}) ยังไม่มีรหัส FINGLE_ID ที่ถูกต้องใน HOSOffice`,
        });
      }

      const active =
        row.HR_STATUS === undefined ||
        row.HR_STATUS === null ||
        row.HR_STATUS === true ||
        row.HR_STATUS === 1 ||
        String(row.HR_STATUS).toUpperCase() === 'ACTIVE' ||
        String(row.HR_STATUS) === 'ปกติ';

      validPersonnel.push({
        personId: rawPersonId,
        fingleId: hasValidFingle ? parsedFingle : 0,
        prefix,
        firstName: firstName || rawPersonId,
        lastName,
        position: String(row.HR_POSITION || 'ไม่ระบุตำแหน่ง').trim(),
        department: String(row.HR_DEPARTMENT || 'ไม่ระบุหน่วยงาน').trim(),
        groupName: String(row.HR_GROUP_NAME || row.HR_DEPARTMENT || 'ไม่ระบุกลุ่มงาน').trim(),
        personnelType: String(row.HR_PERSON_TYPE || 'ข้าราชการ').trim(),
        active,
      });
    }

    // Check duplicate FINGLE_IDs across active personnel
    const byFingle = new Map<number, EnginePersonnel[]>();
    for (const p of validPersonnel) {
      if (p.active && p.fingleId > 0) {
        if (!byFingle.has(p.fingleId)) byFingle.set(p.fingleId, []);
        byFingle.get(p.fingleId)!.push(p);
      }
    }

    for (const [fingleId, list] of byFingle.entries()) {
      if (list.length > 1) {
        mappingIssues.push({
          issueType: 'DUPLICATE_FINGLE_ID',
          personId: list.map((x) => x.personId).join(','),
          fingleId,
          fullName: list.map((x) => `${x.prefix}${x.firstName} ${x.lastName}`).join(' / '),
          detail: `รหัส FINGLE_ID #${fingleId} ซ้ำซ้อนกันในบุคลากร ${list.length} ราย (${list.map((x) => x.personId).join(', ')}) ต้องตรวจสอบ`,
        });
      }
    }

    return {
      validPersonnel,
      mappingIssues,
    };
  }

  /**
   * Synchronize personnel from HOSOffice into `ISamAttRepository` (§6 & §8).
   * - If called without `testFixtureRows` and live HOSOffice DB credentials are not configured,
   *   honestly reports `AWAITING_CONFIGURATION` / `AWAITING_REAL_CREDENTIALS` instead of faking a live sync success!
   */
  public static async syncPersonnelToRepository(params: {
    repository: ISamAttRepository;
    testFixtureRows?: ReadonlyArray<RawHosOfficePersonRow>;
    syncDateStr?: string;
    actor?: string;
  }): Promise<HosOfficeSyncResult> {
    const syncDateStr = params.syncDateStr || '2026-11-06';
    const actor = params.actor || 'STAFF';

    if (params.testFixtureRows) {
      const { validPersonnel, mappingIssues } = this.mapAndValidateHosOfficeRows(
        params.testFixtureRows
      );

      const upsertRes = await params.repository.withTransaction((repo) =>
        repo.upsertPersonnelFromHosOffice(validPersonnel, syncDateStr, actor)
      );

      return {
        connected: true,
        mode: 'TEST_FIXTURE',
        status: mappingIssues.length > 0 ? 'PARTIAL_WITH_ISSUES' : 'SUCCESS',
        configurationStatus: 'CONFIGURED',
        message: `ซิงค์ข้อมูลบุคลากรจากชุดทดสอบ (TEST_FIXTURE) สำเร็จ: เพิ่มใหม่ ${upsertRes.insertedCount}, อัปเดต ${upsertRes.updatedCount}, เปลี่ยน FINGLE_ID ${upsertRes.fingleIdChangedCount}, รายการต้องตรวจสอบ ${mappingIssues.length}`,
        totalRead: params.testFixtureRows.length,
        insertedCount: upsertRes.insertedCount,
        updatedCount: upsertRes.updatedCount,
        fingleIdChangedCount: upsertRes.fingleIdChangedCount,
        mappingIssues,
      };
    }

    const config = this.getConnectionConfigStatus();
    if (!config.configured) {
      return {
        connected: false,
        mode: 'AWAITING_REAL_CREDENTIALS',
        status: 'AWAITING_REAL_CREDENTIALS',
        configurationStatus: 'AWAITING_CONFIGURATION',
        message:
          'AWAITING_CONFIGURATION: ยังไม่ได้เชื่อมต่อฐานข้อมูล HOSOffice จริง (รอการตั้งค่า HOSOFFICE_DB_HOST / HOSOFFICE_DB_USER / HOSOFFICE_DB_PASSWORD ใน Environment Variables) — ระบบไม่สร้างผลการ Sync สำเร็จปลอมตามข้อกำหนด §6',
        totalRead: 0,
        insertedCount: 0,
        updatedCount: 0,
        fingleIdChangedCount: 0,
        mappingIssues: [],
      };
    }

    const safeTable = config.sourceTable.replace(/[^a-zA-Z0-9_]/g, '') || 'hr_person';
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection({
        host: (process.env.HOSOFFICE_DB_HOST || '').trim(),
        port: config.port,
        user: (process.env.HOSOFFICE_DB_USER || '').trim(),
        password: process.env.HOSOFFICE_DB_PASSWORD || '',
        database: config.database,
        connectTimeout: 8000,
      });

      const [rows] = await conn.execute<RowDataPacket[]>(`SELECT * FROM \`${safeTable}\``);
      const rawRows = rows as unknown as RawHosOfficePersonRow[];
      const { validPersonnel, mappingIssues } = this.mapAndValidateHosOfficeRows(rawRows);

      const upsertRes = await params.repository.withTransaction((repo) =>
        repo.upsertPersonnelFromHosOffice(validPersonnel, syncDateStr, actor)
      );

      return {
        connected: true,
        mode: 'LIVE_MYSQL',
        status: mappingIssues.length > 0 ? 'PARTIAL_WITH_ISSUES' : 'SUCCESS',
        configurationStatus: 'CONFIGURED',
        message: `ซิงค์ข้อมูลบุคลากรจากฐานข้อมูล HOSOffice (${config.database}.${safeTable}) สำเร็จ: อ่าน ${rawRows.length}, เพิ่มใหม่ ${upsertRes.insertedCount}, อัปเดต ${upsertRes.updatedCount}, เปลี่ยน FINGLE_ID ${upsertRes.fingleIdChangedCount}, รายการต้องตรวจสอบ ${mappingIssues.length}`,
        totalRead: rawRows.length,
        insertedCount: upsertRes.insertedCount,
        updatedCount: upsertRes.updatedCount,
        fingleIdChangedCount: upsertRes.fingleIdChangedCount,
        mappingIssues,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown MySQL error';
      return {
        connected: false,
        mode: 'LIVE_MYSQL',
        status: 'FAILED',
        configurationStatus: 'CONFIGURED',
        message: `ไม่สามารถอ่านตาราง ${config.database}.${safeTable} จากฐานข้อมูล HOSOffice (${config.host}:${config.port}): ${errMsg}`,
        totalRead: 0,
        insertedCount: 0,
        updatedCount: 0,
        fingleIdChangedCount: 0,
        mappingIssues: [],
      };
    } finally {
      if (conn) {
        await conn.end().catch(() => {});
      }
    }
  }

  /**
   * Phase 2 HOSOffice Push Interface, Validation & Dry-Run Preview (§6, §11 & §15).
   * - Validates each Attendance record before building the HOSOffice payload.
   * - Records `DRY_RUN_PREVIEW` in `push_history`.
   * - Never claims live production push succeeded in Phase 2!
   */
  public static async validateAndPreviewPush(params: {
    repository: ISamAttRepository;
    attendanceIds: ReadonlyArray<string>;
    actorUserId: string;
    actorName: string;
  }): Promise<HosOfficePushPreviewResult> {
    const validationErrors: Array<{ attendanceId: string; reason: string }> = [];
    const previewPayloads: HosOfficePushPayloadItem[] = [];
    const recordedPreviewHistory: RepositoryPushHistory[] = [];
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const attResult = await params.repository.getAttendance({ pageSize: 10000 });
    const allAttendance = attResult.items;

    for (const attId of params.attendanceIds) {
      const rec: EngineAttendanceRecord | undefined = allAttendance.find(
        (a) => a.id === attId
      );
      if (!rec) {
        validationErrors.push({
          attendanceId: attId,
          reason: `ไม่พบรายการ Attendance ในฐานข้อมูล ${params.repository.getDatabaseName()}`,
        });
        continue;
      }

      if (!rec.personId || rec.personId.trim() === '') {
        validationErrors.push({
          attendanceId: attId,
          reason: 'รายการไม่มี PERSON_ID ที่ถูกต้อง',
        });
        continue;
      }

      if (rec.status === 'PENDING_MAPPING' || rec.status === 'NO_SCHEDULE') {
        validationErrors.push({
          attendanceId: attId,
          reason: `ไม่อนุญาตให้ส่งรายการสถานะ ${rec.status} ไปยัง HOSOffice จนกว่าจะผูกบัตรหรือจัดตารางกะเรียบร้อย`,
        });
        continue;
      }

      if (
        (rec.status === 'NO_SCAN' || rec.status === 'MISSING_CHECKOUT') &&
        rec.hrReviewStatus !== 'REVIEWED'
      ) {
        validationErrors.push({
          attendanceId: attId,
          reason: `รายการผิดปกติ (${rec.status}) ของ ${rec.fullName} วันที่ ${rec.workDate} ยังไม่ผ่านการตรวจสอบโดยเจ้าหน้าที่ HR (ต้องตรวจสอบและบันทึกเหตุผลก่อนส่ง)`,
        });
        continue;
      }

      const idempotencyKey = `HOS_PUSH_${rec.personId}_${rec.workDate.replace(/-/g, '')}_${rec.shiftId}_${rec.status}`;
      const payloadItem: HosOfficePushPayloadItem = {
        idempotencyKey,
        attendanceId: rec.id,
        personId: rec.personId,
        fingleId: rec.fingleId,
        workDate: rec.workDate,
        shiftId: rec.shiftId,
        shiftName: rec.shiftName,
        checkInDateTime: rec.checkInDateTime,
        checkOutDateTime: rec.checkOutDateTime,
        attendanceStatus: rec.status,
        lateMinutes: rec.lateMinutes,
        hrReviewStatus: rec.hrReviewStatus,
        hrReasonCode: rec.notes?.reasonCode || null,
        hrNote: rec.notes?.note || null,
      };

      previewPayloads.push(payloadItem);

      const hosConfig = this.getConnectionConfigStatus();

      const historyEntry: RepositoryPushHistory = {
        id: `PUSH_PREV_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        attendanceId: rec.id,
        personId: rec.personId,
        fullName: rec.fullName,
        workDate: rec.workDate,
        shiftId: rec.shiftId,
        status: rec.status,
        target: 'HOSOffice_Attend (Phase 2 Preview)',
        idempotencyKey,
        pushedBy: params.actorUserId,
        pushedByName: params.actorName,
        pushedAt: nowIso,
        responseStatus: 'DRY_RUN_PREVIEW',
        responseSummary:
          `ตรวจสอบความถูกต้องและสร้าง Preview Payload สำเร็จ (${hosConfig.configurationStatus} / Phase 2: รอยืนยัน Contract และสิทธิ์เขียนข้อมูลจริงจาก HOSOffice — ยังไม่มีการส่งข้อมูลเข้า Production จริง)`,
        payloadJson: JSON.stringify(payloadItem),
      };

      await params.repository.recordPushPreviewHistory(historyEntry);
      recordedPreviewHistory.push(historyEntry);
    }

    const hosConfig = this.getConnectionConfigStatus();

    return {
      canExecuteLivePush: false,
      phaseStatus: 'PHASE2_PREVIEW_ONLY_AWAITING_CONTRACT',
      configurationStatus: hosConfig.configurationStatus,
      message:
        `${hosConfig.configurationStatus}: Phase 2 จัดเตรียม Data Mapping, Validation และ Preview Payload เรียบร้อยแล้ว (ยังไม่ได้เขียนข้อมูลจริงลง HOSOffice จนกว่าจะตรวจสอบ Contract และสิทธิ์กับโรงพยาบาลสามชุกตามข้อกำหนด §6)`,
      validCount: previewPayloads.length,
      invalidCount: validationErrors.length,
      validationErrors,
      previewPayloads,
      recordedPreviewHistory,
    };
  }
}
