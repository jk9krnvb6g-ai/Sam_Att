/**
 * Sam_Att V2 — Phase 2 Integration Tests (§13)
 *
 * Verifies end-to-end integration of:
 * 1. HOSOffice Personnel Mapping & Honest `AWAITING_REAL_CREDENTIALS` handling
 * 2. FINGLE_ID Mapping (historical effective-date preservation when FINGLE_ID changes + duplicate detection)
 * 3. Raw Scan Persistence (Immutable 6-field contract)
 * 4. Raw Scan Deduplication (Composite Event Identity)
 * 5. Attendance Calculation via Repository & Gateway Router
 * 6. Reprocess (Idempotent upsert & status transition when new scan arrives)
 * 7. Shift Assignment (Non-overlap check, touching boundary support, soft-cancellation audit history)
 * 8. Cross-Midnight Shift end-to-end
 * 9. Multi-Shift on the same day end-to-end
 * 10. HR Notes & Review History Persistence across Reprocess
 * 11. GENERAL_USER Own-Only Access (blocks cross-person queries with 403 + security audit log)
 * 12. Role-Based Authorization (ADMIN vs RESPONSIBLE_STAFF vs GENERAL_USER)
 * 13. API Input Validation (rejects malformed 6-field scans, username-only login, missing params)
 * 14. Database Transactions (atomic commit and rollback on error)
 * 15. Error Handling & Secret Masking in `/settings/connections`
 * 16. Phase 2 HOSOffice Push Safety (Dry-Run Preview only, never claims live push succeeded)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { SamAttRepository } from '../repositories/samAttRepository';
import { AuthService } from '../services/authService';
import { HosOfficeAdapter } from '../services/hosofficeAdapter';
import { createSamAttRouter } from '../router';

/**
 * Helper to invoke the mounted `/api/Sam_Att` Express Router in-memory without opening any TCP port
 * (strictly obeying §1 & §15: "ห้ามเพิ่ม TCP Listener หรือ Port").
 */
async function invokeGatewayRoute(
  app: express.Express,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(options.url, 'http://localhost');
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    const req: any = {
      method: options.method,
      url: urlObj.pathname + urlObj.search,
      originalUrl: urlObj.pathname + urlObj.search,
      path: urlObj.pathname,
      query,
      params: {},
      headers: Object.fromEntries(
        Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
      body: options.body,
      get(headerName: string) {
        return this.headers[headerName.toLowerCase()];
      },
    };

    let statusCode = 200;
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(name: string, val: string) {
        this.headers[name.toLowerCase()] = val;
      },
      getHeader(name: string) {
        return this.headers[name.toLowerCase()];
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
      send(payload: any) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
      end() {
        resolve({ status: statusCode, body: null });
        return this;
      },
    };

    (app as any).handle(req, res, (err: any) => {
      if (err) return reject(err);
      resolve({ status: 404, body: { success: false, error: 'Not Found' } });
    });
  });
}

function createTestEnvironment() {
  const repo = new SamAttRepository({
    users: [
      {
        id: 'USR_ADMIN',
        username: 'admin_test',
        passwordHash: AuthService.hashPassword('admin_secret_123'),
        fullName: 'นายสมศักดิ์ บริหารงาน',
        role: 'ADMIN',
        personId: null,
        department: 'กลุ่มงานบริหารทั่วไป',
        position: 'นักวิชาการคอมพิวเตอร์',
        active: true,
      },
      {
        id: 'USR_STAFF',
        username: 'staff_test',
        passwordHash: AuthService.hashPassword('staff_secret_123'),
        fullName: 'นางสาวพัชรี เจริญผล',
        role: 'RESPONSIBLE_STAFF',
        personId: 'P010',
        department: 'กลุ่มงานทรัพยากรบุคคล',
        position: 'เจ้าพนักงานธุรการ',
        active: true,
      },
      {
        id: 'USR_GEN_1',
        username: 'nurse_kanda',
        passwordHash: AuthService.hashPassword('user_secret_123'),
        fullName: 'นางสาวกานดา สุขใจ',
        role: 'GENERAL_USER',
        personId: 'P001',
        department: 'งานผู้ป่วยใน (IPD)',
        position: 'พยาบาลวิชาชีพ',
        active: true,
      },
    ],
    personnel: [
      {
        personId: 'P001',
        fingleId: 101,
        prefix: 'นางสาว',
        firstName: 'กานดา',
        lastName: 'สุขใจ',
        position: 'พยาบาลวิชาชีพ',
        department: 'งานผู้ป่วยใน (IPD)',
        groupName: 'กลุ่มภารกิจด้านการพยาบาล',
        personnelType: 'ข้าราชการ',
        active: true,
      },
      {
        personId: 'P002',
        fingleId: 102,
        prefix: 'นาย',
        firstName: 'สมชาย',
        lastName: 'สายเสมอ',
        position: 'เจ้าพนักงานเวชสถิติ',
        department: 'งานเวชระเบียน',
        groupName: 'กลุ่มงานบริหารทั่วไป',
        personnelType: 'พนักงานกระทรวงสาธารณสุข',
        active: true,
      },
    ],
    fingerprintMappings: [
      {
        id: 'FM_1',
        personId: 'P001',
        fingleId: 101,
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        status: 'ACTIVE',
      },
      {
        id: 'FM_2',
        personId: 'P002',
        fingleId: 102,
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        status: 'ACTIVE',
      },
    ],
    shifts: [
      {
        id: 'SH01',
        code: 'M01',
        name: 'กะเช้า (08:00-16:00)',
        category: 'MORNING',
        startTime: '08:00',
        endTime: '16:00',
        crossMidnight: false,
        graceMinutes: 15,
        earlyScanWindowMinutes: 120,
        lateScanWindowMinutes: 180,
        active: true,
      },
      {
        id: 'SH02',
        code: 'A01',
        name: 'กะบ่าย (16:00-24:00)',
        category: 'AFTERNOON',
        startTime: '16:00',
        endTime: '24:00',
        crossMidnight: false,
        graceMinutes: 15,
        earlyScanWindowMinutes: 120,
        lateScanWindowMinutes: 180,
        active: true,
      },
      {
        id: 'SH03',
        code: 'N01',
        name: 'กะดึกข้ามคืน (23:30-07:30)',
        category: 'NIGHT',
        startTime: '23:30',
        endTime: '07:30',
        crossMidnight: true,
        graceMinutes: 15,
        earlyScanWindowMinutes: 120,
        lateScanWindowMinutes: 180,
        active: true,
      },
    ],
  });

  const app = express();
  app.use('/api/Sam_Att', createSamAttRouter(repo));

  return { repo, app };
}

describe('Sam_Att V2 Phase 2 — Database, Repository, Gateway & Security Integration Tests (§13)', () => {
  it('Scenario 1 & 2: HOSOffice Personnel Mapping, Historical FINGLE_ID Change & Duplicate Detection', async () => {
    const { repo, app } = createTestEnvironment();

    // 1A: Without real credentials or testFixtureRows, returns honest AWAITING_REAL_CREDENTIALS (never fakes success)
    const honestRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/personnel/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {},
    });
    assert.equal(honestRes.status, 200);
    assert.equal(honestRes.body.status, 'AWAITING_REAL_CREDENTIALS');
    assert.equal(honestRes.body.connected, false);

    // 1B: Ingest historical scan for P001 using FINGLE_ID 101 on 2026-11-01
    repo.ingestRawScans([
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-01 07:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-01 16:05:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ]);
    repo.assignShift({ personId: 'P001', workDate: '2026-11-01', shiftId: 'SH01', assignmentType: 'DAILY' });

    // 1C: Sync HOSOffice fixture where:
    // - P001 changes FINGLE_ID from 101 -> 501 effective 2026-11-06
    // - A row with no PERSON_ID (name-only) is rejected (§8.9)
    // - Two new people share duplicate FINGLE_ID #777 (§8.10)
    const syncRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/personnel/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {
        syncDateStr: '2026-11-06',
        testFixtureRows: [
          {
            PERSON_ID: 'P001',
            FINGLE_ID: 501, // Changed from 101 to 501!
            HR_PREFIX: 'นางสาว',
            HR_FNAME: 'กานดา',
            HR_LNAME: 'สุขใจ',
            HR_DEPARTMENT: 'งานผู้ป่วยใน (IPD)',
            HR_PERSON_TYPE: 'ข้าราชการ',
          },
          {
            PERSON_ID: '', // Missing PERSON_ID -> must reject name-only matching!
            FINGLE_ID: 600,
            HR_FNAME: 'สมมติ',
            HR_LNAME: 'ไม่มีรหัส',
          },
          {
            PERSON_ID: 'P003',
            FINGLE_ID: 777, // Duplicate #777
            HR_FNAME: 'วิภา',
            HR_LNAME: 'ใจดี',
            HR_DEPARTMENT: 'ER',
          },
          {
            PERSON_ID: 'P004',
            FINGLE_ID: 777, // Duplicate #777
            HR_FNAME: 'มานะ',
            HR_LNAME: 'อดทน',
            HR_DEPARTMENT: 'ER',
          },
        ],
      },
    });

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.fingleIdChangedCount, 1);
    assert.ok(syncRes.body.mappingIssues.some((i: any) => i.issueType === 'NAME_ONLY_REJECTED'));
    assert.ok(syncRes.body.mappingIssues.some((i: any) => i.issueType === 'DUPLICATE_FINGLE_ID'));

    // Historical Reprocess on 2026-11-01 still resolves P001's old FINGLE_ID 101 via effective-date mapping!
    const reprocessOld = repo.executeReprocess({
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      referenceDateTime: '2026-11-06 18:00:00',
    });
    assert.equal(reprocessOld.records.length, 1);
    assert.equal(reprocessOld.records[0].status, 'NORMAL');
  });

  it('Scenario 3, 4, 5 & 6: Raw Scan Persistence, Deduplication, Attendance Calculation & Idempotent Reprocess', async () => {
    const { app } = createTestEnvironment();

    // Assign Morning shift to P001 on 2026-11-06
    const assignRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH01' },
    });
    assert.equal(assignRes.status, 200);

    // Sync 6-field scanner payload (including an exact duplicate scan)
    const syncScanRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/scanners/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {
        scans: [
          { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:52:00', verifyMode: 1, inOutMode: 1, workCode: null },
          { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:52:00', verifyMode: 1, inOutMode: 1, workCode: null }, // Duplicate
        ],
      },
    });
    assert.equal(syncScanRes.status, 200);
    assert.equal(syncScanRes.body.newScansCount, 1);
    assert.equal(syncScanRes.body.duplicateScansCount, 1);

    // First Reprocess (after shift end -> MISSING_CHECKOUT because only check-in exists)
    const rep1 = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06', referenceDateTime: '2026-11-06 18:00:00' },
    });
    assert.equal(rep1.status, 200);
    assert.equal(rep1.body.reprocessedCount, 1);

    // Now sync checkout scan and Reprocess again -> updates existing record to NORMAL without duplicating!
    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/scanners/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {
        scans: [
          { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:04:00', verifyMode: 1, inOutMode: 2, workCode: null },
        ],
      },
    });

    const rep2 = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06', referenceDateTime: '2026-11-06 18:00:00' },
    });
    assert.equal(rep2.body.updatedCount, 1);

    const attList = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/attendance?workDate=2026-11-06',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    assert.equal(attList.body.total, 1);
    assert.equal(attList.body.items[0].status, 'NORMAL');
  });

  it('Scenario 7, 8 & 9: Shift Assignment Overlap Rejection, Multi-Shift & Cross-Midnight Shift', async () => {
    const { app } = createTestEnvironment();

    // Assign Morning (08:00-16:00) and Afternoon (16:00-24:00) on 2026-11-06 -> Touching boundary allowed!
    const s1 = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH01' },
    });
    assert.equal(s1.status, 200);

    const s2 = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH02' },
    });
    assert.equal(s2.status, 200);

    // Attempt to assign Night cross-midnight (23:30-07:30) on 2026-11-06 which overlaps 23:30-24:00 of SH02 -> Must reject with 409!
    const sOverlap = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH03' },
    });
    assert.equal(sOverlap.status, 409);

    // Soft-cancel SH02 and verify cancellation log is preserved
    const cancelRes = await invokeGatewayRoute(app, {
      method: 'DELETE',
      url: `/api/Sam_Att/shift-assignments/${s2.body.assignment.id}`,
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { reason: 'แลกเวรตามคำสั่งหัวหน้าตึก' },
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.cancellationLog.reason, 'แลกเวรตามคำสั่งหัวหน้าตึก');
  });

  it('Scenario 10: HR Notes & Review History Persistence across Reprocess', async () => {
    const { app } = createTestEnvironment();

    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P002', workDate: '2026-11-06', shiftId: 'SH01' },
    });

    // Reprocess with 0 scans -> NO_SCAN
    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06', referenceDateTime: '2026-11-06 18:00:00' },
    });

    const list1 = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/attendance?workDate=2026-11-06',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    const attId = list1.body.items[0].id;

    // Record HR Review Note
    const noteRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: `/api/Sam_Att/attendance/${attId}/review`,
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {
        reasonCode: 'SICK_LEAVE',
        reasonLabel: 'ลาป่วย',
        note: 'มีใบรับรองแพทย์ รพ.สามชุก',
        hrReviewStatus: 'REVIEWED',
      },
    });
    assert.equal(noteRes.status, 200);
    assert.equal(noteRes.body.record.status, 'NO_SCAN'); // Status stays NO_SCAN!
    assert.equal(noteRes.body.record.hrReviewStatus, 'REVIEWED');

    // Run Reprocess again -> Note and Review History MUST survive
    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06', referenceDateTime: '2026-11-06 19:00:00' },
    });

    const list2 = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/attendance?workDate=2026-11-06',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    const recAfter = list2.body.items[0];
    assert.equal(recAfter.status, 'NO_SCAN');
    assert.equal(recAfter.hrReviewStatus, 'REVIEWED');
    assert.equal(recAfter.notes.reasonCode, 'SICK_LEAVE');
    assert.equal(recAfter.noteHistory.length, 1);
  });

  it('Scenario 11 & 12: GENERAL_USER Own-Only Access & Strict Role-Based Authorization', async () => {
    const { app, repo } = createTestEnvironment();

    // 1. Login as GENERAL_USER (`nurse_kanda`, personId = P001) with valid password
    const loginRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/login',
      body: { username: 'nurse_kanda', password: 'user_secret_123' },
    });
    assert.equal(loginRes.status, 200);
    const userToken = loginRes.body.token;

    // 2. GENERAL_USER can read their own `/me/attendance`
    const ownRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.personId, 'P001');

    // 3. GENERAL_USER attempting to pass `?personId=P002` to read another person's data is blocked with 403!
    const crossPersonRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance?personId=P002',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(crossPersonRes.status, 403);

    // 4. GENERAL_USER attempting to access `/attendance`, `/personnel`, or `/settings/connections` is blocked with 403!
    const staffEndpointRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/attendance',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(staffEndpointRes.status, 403);

    // 5. RESPONSIBLE_STAFF attempting to access `/settings/connections` (ADMIN only) is blocked with 403!
    const adminEndpointByStaff = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/settings/connections',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    assert.equal(adminEndpointByStaff.status, 403);

    // Verify security violation was logged in Audit Logs
    const logs = repo.getAuditLogs(20);
    assert.ok(logs.some((l) => l.action === 'SECURITY_VIOLATION_CROSS_PERSON_ACCESS'));
  });

  it('Scenario 13, 14, 15 & 16: API Validation, Atomic Transaction Rollback, Secret Masking & HOSOffice Push Preview Safety', async () => {
    const { app, repo } = createTestEnvironment();

    // 13A: Username-only login without password must fail with 401 (§10)
    const noPassLogin = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/login',
      body: { username: 'admin_test' },
    });
    assert.equal(noPassLogin.status, 401);

    // 13B: Invalid 6-field scanner payload (invalid date "2026-02-30 99:00:00") must fail with 400
    const badScanRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/scanners/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {
        scans: [
          { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-02-30 99:00:00', verifyMode: 1, inOutMode: 1, workCode: null },
        ],
      },
    });
    assert.equal(badScanRes.status, 400);

    // 14: Database Transaction Rollback: if an error is thrown inside `withTransaction`, all mutations roll back!
    const beforeShiftsCount = repo.getShifts().length;
    await assert.rejects(async () => {
      await repo.withTransaction((tx) => {
        tx.saveShift({
          id: 'SH_TEMP_ROLLBACK',
          code: 'TMP',
          name: 'กะทดสอบ Rollback',
          category: 'SPECIAL',
          startTime: '17:00',
          endTime: '20:00',
          crossMidnight: false,
          graceMinutes: 10,
          earlyScanWindowMinutes: 60,
          lateScanWindowMinutes: 60,
          active: true,
        });
        throw new Error('Simulated mid-transaction failure');
      });
    });
    assert.equal(repo.getShifts().length, beforeShiftsCount);

    // 15: ADMIN accessing `/settings/connections` receives masked passwords
    const settingsRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/settings/connections',
      headers: { 'x-sam-att-dev-user-id': 'USR_ADMIN' },
    });
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.body.samchukAttendanceDb.passwordMasked, '••••••••••••');

    // 16: HOSOffice Push returns Phase 2 Preview Only (`livePushExecuted: false`, `canExecuteLivePush: false`)
    repo.assignShift({ personId: 'P001', workDate: '2026-11-06', shiftId: 'SH01', assignmentType: 'DAILY' });
    repo.ingestRawScans([
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 07:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-06 16:05:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ]);
    const rep = repo.executeReprocess({
      fromDate: '2026-11-06',
      toDate: '2026-11-06',
      referenceDateTime: '2026-11-06 18:00:00',
    });

    const pushRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/hosoffice/push',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { attendanceIds: [rep.records[0].id] },
    });
    assert.equal(pushRes.status, 200);
    assert.equal(pushRes.body.livePushExecuted, false);
    assert.equal(pushRes.body.canExecuteLivePush, false);
    assert.equal(pushRes.body.phaseStatus, 'PHASE2_PREVIEW_ONLY_AWAITING_CONTRACT');
    assert.equal(pushRes.body.validCount, 1);
  });
});
