/**
 * Sam_Att V2 — Phase 1+2 Hardening Integration Tests (§8)
 *
 * Verifies end-to-end integration of:
 * 1. HOSOffice Personnel Mapping & Honest `AWAITING_CONFIGURATION` / `AWAITING_REAL_CREDENTIALS` handling
 * 2. FINGLE_ID Mapping (historical effective-date preservation when FINGLE_ID changes + duplicate detection)
 * 3. Raw Scan Persistence (Immutable 6-field contract)
 * 4. Raw Scan Deduplication (Composite Event Identity)
 * 5. Attendance Calculation via Repository & Gateway Router
 * 6. Reprocess (Idempotent upsert & status transition when new scan arrives)
 * 7. Shift Assignment (Non-overlap check, touching boundary support, soft-cancellation audit history)
 * 8. Cross-Midnight Shift & Multi-Shift on the same day end-to-end
 * 9. HR Notes & Review History Persistence across Reprocess
 * 10. GENERAL_USER Own-Only Access (blocks cross-person queries, Reprocess, and Personnel with 403 + security audit log)
 * 11. Role-Based Authorization (ADMIN vs RESPONSIBLE_STAFF vs GENERAL_USER)
 * 12. API Input Validation, Pagination & Filtering
 * 13. Database Transactions (atomic commit, rollback on error, and concurrent update serialization)
 * 14. Persistence After Restart (disk-backed TEST repository survives process restart)
 * 15. Real MySQL Repository (`MySqlSamAttRepository`) parameterized SQL execution, `beginTransaction`/`commit`/`rollback`, `FOR UPDATE` row locking, and HTTP 503 `DatabaseUnavailableError` (zero Mock fallback)
 * 16. Hardened Authentication: Bcrypt hashing, Legacy SHA-256 auto-migration, Expired Token, Revoked Session (`POST /auth/logout`), Brute-Force Rate Limiting (HTTP 429), Missing Secret refusal in `REAL` mode, and Mock/Real mode separation
 * 17. MySQL Migration Compatibility (`001_phase1_phase2_safe_migration.sql` uses `INFORMATION_SCHEMA.COLUMNS` Stored Procedure, compatible with Oracle MySQL 8.0+ and MariaDB)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import {
  SamAttRepository,
  createRepositoryForMode,
  ProductionRepositoryConfigurationError,
} from '../repositories/samAttRepository';
import {
  MySqlSamAttRepository,
  DatabaseUnavailableError,
  SqlConnectionPool,
  SqlQueryableConnection,
} from '../repositories/mysqlSamAttRepository';
import { createDefaultSeededRepository } from '../repositories/defaultRepositorySeed';
import { AuthService } from '../services/authService';
import { createSamAttRouter } from '../router';

/**
 * Helper to invoke the mounted `/api/Sam_Att` Express Router in-memory without opening any TCP port
 * (strictly obeying §1 & §9: "ห้ามเพิ่ม TCP Listener หรือ Port").
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
      ip: options.headers?.['x-forwarded-for'] || '127.0.0.1',
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

function createTestEnvironment(mode: 'MOCK' | 'TEST' = 'TEST', persistenceFilePath?: string) {
  const repo = new SamAttRepository(
    {
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
    },
    { mode, persistenceFilePath }
  );

  const app = express();
  app.use('/api/Sam_Att', createSamAttRouter(repo));

  return { repo, app };
}

describe('Sam_Att V2 Phase 1+2 Hardening — Database, Security, Repository & API Integration Tests (§8)', () => {
  beforeEach(() => {
    AuthService.resetSecurityStateForTests();
  });

  it('Scenario 1 & 2: HOSOffice Personnel Mapping, AWAITING_CONFIGURATION Status, Historical FINGLE_ID Change & Duplicate Detection', async () => {
    const { repo, app } = createTestEnvironment();

    // 1A: Without real credentials or testFixtureRows, returns honest AWAITING_CONFIGURATION / AWAITING_REAL_CREDENTIALS (never fakes success)
    const honestRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/personnel/sync',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: {},
    });
    assert.equal(honestRes.status, 200);
    assert.equal(honestRes.body.status, 'AWAITING_REAL_CREDENTIALS');
    assert.equal(honestRes.body.configurationStatus, 'AWAITING_CONFIGURATION');
    assert.equal(honestRes.body.connected, false);

    // 1B: Ingest historical scan for P001 using FINGLE_ID 101 on 2026-11-01
    repo.ingestRawScans([
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-01 07:50:00', verifyMode: 1, inOutMode: 1, workCode: null },
      { machineNo: 1, enrollNumber: 101, scanDateTime: '2026-11-01 16:05:00', verifyMode: 1, inOutMode: 2, workCode: null },
    ]);
    repo.assignShift({ personId: 'P001', workDate: '2026-11-01', shiftId: 'SH01', assignmentType: 'DAILY' });

    // 1C: Sync HOSOffice fixture (using synthetic test fixtures only — zero real PII in logs per §6)
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

  it('Scenario 3, 4, 5 & 6: Raw Scan Persistence, Deduplication, Attendance Calculation, Pagination & Filtering', async () => {
    const { app } = createTestEnvironment();

    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH01' },
    });

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

    await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06', referenceDateTime: '2026-11-06 18:00:00' },
    });

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

    // Verify Pagination & Filtering on `/attendance` and `/raw-scans`
    const attList = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/attendance?workDate=2026-11-06&status=NORMAL&page=1&pageSize=10',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    assert.equal(attList.body.total, 1);
    assert.equal(attList.body.page, 1);
    assert.equal(attList.body.pageSize, 10);
    assert.equal(attList.body.items[0].status, 'NORMAL');

    const rawListPage1 = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/raw-scans?fromDate=2026-11-06&toDate=2026-11-06&page=1&pageSize=1',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
    });
    assert.equal(rawListPage1.body.total, 2);
    assert.equal(rawListPage1.body.items.length, 1);
  });

  it('Scenario 7, 8, 9 & 10: Shift Overlap Rejection, Soft Cancellation & HR Notes Preservation across Reprocess', async () => {
    const { app } = createTestEnvironment();

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

    // Overlapping Night shift rejected with 409
    const sOverlap = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/shift-assignments',
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { personId: 'P001', workDate: '2026-11-06', shiftId: 'SH03' },
    });
    assert.equal(sOverlap.status, 409);

    // Soft-cancel SH02
    const cancelRes = await invokeGatewayRoute(app, {
      method: 'DELETE',
      url: `/api/Sam_Att/shift-assignments/${s2.body.assignment.id}`,
      headers: { 'x-sam-att-dev-user-id': 'USR_STAFF' },
      body: { reason: 'แลกเวรตามคำสั่งหัวหน้าตึก' },
    });
    assert.equal(cancelRes.status, 200);

    // Reprocess SH01 with 0 scans -> NO_SCAN
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
    assert.equal(noteRes.body.record.status, 'NO_SCAN');

    // Reprocess again -> Note and Review History survive
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
    assert.equal(list2.body.items[0].notes.reasonCode, 'SICK_LEAVE');
    assert.equal(list2.body.items[0].noteHistory.length, 1);
  });

  it('Scenario 11 & 12: Security Tests — Bcrypt, Legacy SHA-256 Auto-Upgrade, Invalid/Expired Token, Revoked Session, Rate Limit (429), Missing Secret & RBAC (§4 & §8)', async () => {
    const { app, repo } = createTestEnvironment();

    // 1. Verify Bcrypt hash format ($2a$ or $2b$) and plaintext rejection
    const adminUser = repo.findUserByUsername('admin_test')!;
    assert.ok(adminUser.passwordHash.startsWith('$2'));
    assert.equal(AuthService.verifyPassword('wrong_pass', adminUser.passwordHash).valid, false);
    assert.equal(AuthService.verifyPassword('admin_secret_123', 'admin_secret_123').valid, false); // Plaintext stored hash is rejected!

    // 2. Legacy SHA-256 migration (`legacy_sha256$<hex>` -> verified via timingSafeEqual and auto-upgraded to Bcrypt)
    const legacyPlain = 'legacy_hospital_pass_99';
    const legacyHex = crypto.createHash('sha256').update(legacyPlain).digest('hex');
    const legacyEnv = new SamAttRepository(
      {
        users: [
          {
            id: 'USR_LEGACY',
            username: 'legacy_staff',
            passwordHash: `legacy_sha256$${legacyHex}`,
            fullName: 'เจ้าหน้าที่ระบบเดิม',
            role: 'RESPONSIBLE_STAFF',
            personId: 'P099',
            department: 'HR',
            position: 'HR',
            active: true,
          },
        ],
      },
      { mode: 'TEST' }
    );
    const legacyLogin = await AuthService.authenticateCredentials(
      legacyEnv,
      'legacy_staff',
      legacyPlain,
      '10.2.0.50'
    );
    assert.equal(legacyLogin.success, true);
    assert.equal(legacyLogin.passwordUpgradedToBcrypt, true);
    const upgradedUser = legacyEnv.findUserByUsername('legacy_staff')!;
    assert.ok(upgradedUser.passwordHash.startsWith('$2')); // Upgraded to Bcrypt in DB!

    // 3. Missing Password -> 401, Invalid Password -> 401
    const noPass = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/login',
      body: { username: 'nurse_kanda' },
    });
    assert.equal(noPass.status, 401);

    // 4. Brute-Force Rate Limit Protection -> 5 failed attempts locks out with HTTP 429
    for (let attempt = 1; attempt <= 5; attempt++) {
      const bad = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '192.168.99.88' },
        body: { username: 'admin_test', password: `wrong_attempt_${attempt}` },
      });
      if (attempt < 5) {
        assert.equal(bad.status, 401);
      } else {
        assert.equal(bad.status, 429);
        assert.ok(bad.body.retryAfterSeconds > 0);
      }
    }

    // Subsequent attempt from locked-out IP+username even with right password returns 429 until window expires
    const lockedAttempt = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/login',
      headers: { 'x-forwarded-for': '192.168.99.88' },
      body: { username: 'admin_test', password: 'admin_secret_123' },
    });
    assert.equal(lockedAttempt.status, 429);

    // 5. Valid Login as GENERAL_USER (`nurse_kanda`) from clean IP
    const loginRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/login',
      headers: { 'x-forwarded-for': '192.168.1.10' },
      body: { username: 'nurse_kanda', password: 'user_secret_123' },
    });
    assert.equal(loginRes.status, 200);
    const userToken = loginRes.body.token;

    // 6. GENERAL_USER Own-Only Access & Unauthorized Reprocess / Personnel Access
    const ownRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(ownRes.status, 200);
    assert.equal(ownRes.body.personId, 'P001');

    const crossPersonRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance?personId=P002',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(crossPersonRes.status, 403);

    // Also block uppercase/snake_case query (`PERSON_ID=P002`) and Request Body (`{ person_id: 'P002' }`)
    const crossPersonUpperRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance?PERSON_ID=P002',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(crossPersonUpperRes.status, 403);

    const crossPersonBodyRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/raw-scans',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { person_id: 'P002' },
    });
    assert.equal(crossPersonBodyRes.status, 403);

    const unauthReprocess = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/attendance/reprocess',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { fromDate: '2026-11-06', toDate: '2026-11-06' },
    });
    assert.equal(unauthReprocess.status, 403);

    const unauthPersonnel = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/personnel',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(unauthPersonnel.status, 403);

    // 7. Invalid Token & Expired Token -> 401
    const tamperedRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance',
      headers: { Authorization: `Bearer ${userToken}tampered` },
    });
    assert.equal(tamperedRes.status, 401);

    const expiredToken = AuthService.issueSignedToken(
      {
        id: 'USR_GEN_1',
        username: 'nurse_kanda',
        passwordHash: '',
        fullName: 'นางสาวกานดา สุขใจ',
        role: 'GENERAL_USER',
        personId: 'P001',
        department: 'IPD',
        position: 'พยาบาลวิชาชีพ',
        active: true,
      },
      -60, // Already expired 60 seconds ago
      'TEST'
    );
    const expiredRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredRes.status, 401);

    // 8. Session Revocation (`POST /auth/logout`) -> Token immediately rejected with 401
    const logoutRes = await invokeGatewayRoute(app, {
      method: 'POST',
      url: '/api/Sam_Att/auth/logout',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutRes = await invokeGatewayRoute(app, {
      method: 'GET',
      url: '/api/Sam_Att/me/attendance',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(afterLogoutRes.status, 401);

    // 9. Missing Secret in `REAL` mode refuses startup
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    try {
      delete process.env.SAM_ATT_JWT_SECRET;
      assert.throws(() => {
        AuthService.assertRealModeSecretConfigured('REAL');
      }, /SAM_ATT_JWT_SECRET/);
    } finally {
      if (origSecret !== undefined) {
        process.env.SAM_ATT_JWT_SECRET = origSecret;
      }
    }
  });

  it('Scenario 13 & 14: Atomic Transaction Rollback, Concurrent Updates Serialization & Persistence After Restart (including Session Revocation & Rate Limits) (§2, §8 & §9)', async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `sam_att_persist_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.json`
    );

    try {
      // 1. Create Instance #1 backed by `tempFile`
      const { repo: repo1, app: app1 } = createTestEnvironment('TEST', tempFile);

      // 2. Concurrent Updates Test: Run 5 concurrent shift creations via `Promise.all`
      await Promise.all(
        [1, 2, 3, 4, 5].map((idx) =>
          repo1.withTransaction((tx) =>
            tx.saveShift(
              {
                id: `SH_CONC_${idx}`,
                code: `C0${idx}`,
                name: `กะทดสอบพร้อมกัน ${idx}`,
                category: 'SPECIAL',
                startTime: '08:00',
                endTime: '12:00',
                crossMidnight: false,
                graceMinutes: 10,
                earlyScanWindowMinutes: 60,
                lateScanWindowMinutes: 60,
                active: true,
              },
              'admin_test'
            )
          )
        )
      );

      assert.equal(repo1.getShifts().length, 3 + 5);

      // 3. Transaction Rollback Test: Error inside `withTransaction` rolls back changes and does not corrupt disk state
      await assert.rejects(async () => {
        await repo1.withTransaction((tx) => {
          tx.saveShift({
            id: 'SH_ABORTED',
            code: 'ABT',
            name: 'กะที่ต้องถูก Rollback',
            category: 'SPECIAL',
            startTime: '13:00',
            endTime: '17:00',
            crossMidnight: false,
            graceMinutes: 10,
            earlyScanWindowMinutes: 60,
            lateScanWindowMinutes: 60,
            active: true,
          });
          throw new Error('Simulated transaction failure');
        });
      });
      assert.equal(repo1.getShifts().length, 8);

      // 4. Write Raw Scan, Shift Assignment, Reprocess, and HR Note before simulated restart
      await repo1.withTransaction((tx) => {
        tx.assignShift({
          personId: 'P001',
          workDate: '2026-11-06',
          shiftId: 'SH01',
          assignmentType: 'DAILY',
        });
        tx.ingestRawScans([
          {
            machineNo: 1,
            enrollNumber: 101,
            scanDateTime: '2026-11-06 08:25:00',
            verifyMode: 1,
            inOutMode: 1,
            workCode: null,
          },
          {
            machineNo: 1,
            enrollNumber: 101,
            scanDateTime: '2026-11-06 16:05:00',
            verifyMode: 1,
            inOutMode: 2,
            workCode: null,
          },
        ]);
        const rep = tx.executeReprocess({
          fromDate: '2026-11-06',
          toDate: '2026-11-06',
          referenceDateTime: '2026-11-06 18:00:00',
        });
        tx.saveHRReviewAndNote({
          attendanceId: rep.records[0].id,
          reasonCode: 'TRAFFIC_DELAY',
          reasonLabel: 'จราจรติดขัด',
          note: 'ฝนตกหนักหน้า รพ.สามชุก',
          hrReviewStatus: 'REVIEWED',
          authorUserId: 'USR_STAFF',
          authorName: 'นางสาวพัชรี เจริญผล',
        });
      });

      // 4B. Also login & revoke a session token AND trigger a brute-force rate limit lockout on Instance #1 before restart
      const loginBeforeRestart = await invokeGatewayRoute(app1, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.77' },
        body: { username: 'nurse_kanda', password: 'user_secret_123' },
      });
      assert.equal(loginBeforeRestart.status, 200);
      const revokedTokenBeforeRestart = loginBeforeRestart.body.token;

      const logoutBeforeRestart = await invokeGatewayRoute(app1, {
        method: 'POST',
        url: '/api/Sam_Att/auth/logout',
        headers: { Authorization: `Bearer ${revokedTokenBeforeRestart}` },
      });
      assert.equal(logoutBeforeRestart.status, 200);

      for (let i = 1; i <= 5; i++) {
        await invokeGatewayRoute(app1, {
          method: 'POST',
          url: '/api/Sam_Att/auth/login',
          headers: { 'x-forwarded-for': '10.2.0.88' },
          body: { username: 'staff_test', password: `wrong_${i}` },
        });
      }

      // 5. Simulate Backend Process Restart: Clear in-memory AuthService caches and instantiate a brand-new SamAttRepository + Express Router from `tempFile`
      AuthService.resetSecurityStateForTests();
      const repoAfterRestart = new SamAttRepository(
        {},
        { mode: 'TEST', persistenceFilePath: tempFile }
      );
      const appAfterRestart = express();
      appAfterRestart.use('/api/Sam_Att', createSamAttRouter(repoAfterRestart));

      assert.equal(repoAfterRestart.getShifts().length, 8);
      assert.equal(repoAfterRestart.getRawScans({}).total, 2);
      const attAfterRestart = repoAfterRestart.getAttendance({ workDate: '2026-11-06' });
      assert.equal(attAfterRestart.total, 1);
      assert.equal(attAfterRestart.items[0].status, 'LATE');
      assert.equal(attAfterRestart.items[0].lateMinutes, 10);
      assert.equal(attAfterRestart.items[0].hrReviewStatus, 'REVIEWED');
      assert.equal(attAfterRestart.items[0].notes?.reasonCode, 'TRAFFIC_DELAY');
      assert.equal(attAfterRestart.items[0].noteHistory?.length, 1);

      // Verify revoked session token is STILL rejected with 401 after backend restart!
      const replayRevokedAfterRestart = await invokeGatewayRoute(appAfterRestart, {
        method: 'GET',
        url: '/api/Sam_Att/me/attendance',
        headers: { Authorization: `Bearer ${revokedTokenBeforeRestart}` },
      });
      assert.equal(replayRevokedAfterRestart.status, 401);

      // Verify brute-force rate limit lockout is STILL enforced with 429 after backend restart!
      const bruteForceAfterRestart = await invokeGatewayRoute(appAfterRestart, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.88' },
        body: { username: 'staff_test', password: 'staff_secret_123' },
      });
      assert.equal(bruteForceAfterRestart.status, 429);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('Scenario 15 & 16: Real MySQL Repository (`MySqlSamAttRepository`) Parameterized SQL, SQL-Level WHERE Filtering, Transactions, Row Locks (`FOR UPDATE`), and HTTP 503 When MySQL Unavailable (Zero Mock Fallback)', async () => {
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    process.env.SAM_ATT_JWT_SECRET =
      'samchuk_hospital_test_jwt_secret_key_at_least_32_chars_long';

    try {
      // 15A: When MySQL is unreachable/unconfigured in REAL mode, API returns HTTP 503 Service Unavailable and NEVER falls back to Mock Data!
      const unavailablePool: SqlConnectionPool = {
        async execute() {
          throw new DatabaseUnavailableError(
            'ECONNREFUSED 10.2.0.201:3306 — MySQL samchuk_attendance is unreachable'
          );
        },
        async getConnection() {
          throw new DatabaseUnavailableError(
            'ECONNREFUSED 10.2.0.201:3306 — MySQL samchuk_attendance is unreachable'
          );
        },
        async end() {},
      };

      const realRepoUnavailable = new MySqlSamAttRepository(unavailablePool);
      assert.equal(realRepoUnavailable.mode, 'REAL');

      const appUnavailable = express();
      appUnavailable.use('/api/Sam_Att', createSamAttRouter(realRepoUnavailable));

      // Verify Dev Persona Mock Header (`x-sam-att-dev-user-id`) is strictly disabled in REAL mode (returns 401)
      const mockHeaderInRealRes = await invokeGatewayRoute(appUnavailable, {
        method: 'GET',
        url: '/api/Sam_Att/shifts',
        headers: { 'x-sam-att-dev-user-id': 'USR_ADMIN' },
      });
      assert.equal(mockHeaderInRealRes.status, 401);

      // Login attempt when MySQL is down returns 503 Service Unavailable (never logs in with fake mock users)
      const loginWhenDbDown = await invokeGatewayRoute(appUnavailable, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        body: { username: 'admin_test', password: 'admin_secret_123' },
      });
      assert.equal(loginWhenDbDown.status, 503);
      assert.equal(loginWhenDbDown.body.code, 'SAM_ATT_MYSQL_UNAVAILABLE');
      assert.equal(loginWhenDbDown.body.repositoryMode, 'REAL');

      // 15B: Verify `MySqlSamAttRepository` executes real parameterized SQL (`?`), `beginTransaction`, `commit`, `rollback`, and `FOR UPDATE` row locking
      const executedQueries: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
      let txBegun = 0;
      let txCommitted = 0;
      let txRolledBack = 0;

      const mockSqlConn: SqlQueryableConnection = {
        async beginTransaction() {
          txBegun++;
        },
        async commit() {
          txCommitted++;
        },
        async rollback() {
          txRolledBack++;
        },
        release() {},
        async execute<T = any>(sql: string, params: ReadonlyArray<unknown> = []): Promise<[T, any]> {
          executedQueries.push({ sql: sql.trim(), params });
          if (sql.includes('FROM attendance WHERE id = ? FOR UPDATE')) {
            return [
              [
                {
                  id: 'ATT_SQL_1',
                  status: 'NO_SCAN',
                  is_pushed_to_hosoffice: 0,
                },
              ] as unknown as T,
              [],
            ];
          }
          if (sql.includes('FROM attendance a')) {
            return [
              [
                {
                  id: 'ATT_SQL_1',
                  person_id: 'P001',
                  work_date: '2026-11-06',
                  shift_id: 'SH_SQL_1',
                  shift_name: 'กะเช้า MySQL',
                  shift_start_time: '08:00',
                  shift_end_time: '16:00',
                  cross_midnight: 0,
                  grace_minutes: 15,
                  shift_category: 'MORNING',
                  checkin_at: null,
                  checkout_at: null,
                  checkin_datetime: null,
                  checkout_datetime: null,
                  late_minutes: 0,
                  early_checkout_minutes: 0,
                  has_missing_checkout: 0,
                  status: 'NO_SCAN',
                  evaluation_state: 'EVALUATED',
                  hr_review_status: 'REVIEWED',
                  ambiguous_scan_flag: 0,
                  evaluation_note: null,
                  computed_at: '2026-11-06 18:00:00',
                  raw_scan_in_id: null,
                  raw_scan_out_id: null,
                  related_raw_scan_ids: '[]',
                  is_pushed_to_hosoffice: 0,
                  last_pushed_at: null,
                  modified_after_push: 0,
                  fingle_id_current: 101,
                  prefix: 'นางสาว',
                  first_name: 'กานดา',
                  last_name: 'สุขใจ',
                  department: 'IPD',
                  group_name: 'IPD',
                  personnel_type: 'ข้าราชการ',
                },
              ] as unknown as T,
              [],
            ];
          }
          if (sql.includes('FROM attendance_notes')) {
            return [
              [
                {
                  id: 'NOTE_SQL_1',
                  attendance_id: 'ATT_SQL_1',
                  reason_code: 'OFFICIAL_DUTY',
                  reason_label: 'ไปราชการ',
                  note: 'ประชุมกระทรวง',
                  author_user_id: 'USR_STAFF',
                  author_name: 'นางสาวพัชรี เจริญผล',
                  created_at: '2026-11-06 18:05:00',
                  updated_at: '2026-11-06 18:05:00',
                },
              ] as unknown as T,
              [],
            ];
          }
          if (sql.includes('FROM hr_review_history')) {
            return [
              [
                {
                  id: 'NH_SQL_1',
                  attendance_id: 'ATT_SQL_1',
                  reason_code: 'OFFICIAL_DUTY',
                  reason_label: 'ไปราชการ',
                  note: 'ประชุมกระทรวง',
                  hr_review_status: 'REVIEWED',
                  author_user_id: 'USR_STAFF',
                  author_name: 'นางสาวพัชรี เจริญผล',
                  created_at: '2026-11-06 18:05:00',
                },
              ] as unknown as T,
              [],
            ];
          }
          return [[] as unknown as T, []];
        },
      };

      const recordingPool: SqlConnectionPool = {
        async execute<T = any>(sql: string, params: ReadonlyArray<unknown> = []) {
          return mockSqlConn.execute<T>(sql, params);
        },
        async getConnection() {
          return mockSqlConn;
        },
        async end() {},
      };

      const mysqlRepo = new MySqlSamAttRepository(recordingPool);

      // Verify `getAttendance` pushes parameterized SQL WHERE clauses directly to MySQL
      const filteredSqlResult = await mysqlRepo.getAttendance({
        workDate: '2026-11-06',
        personId: 'P001',
        status: 'NO_SCAN',
      });
      assert.equal(filteredSqlResult.total, 1);
      assert.ok(
        executedQueries.some(
          (q) =>
            q.sql.includes('WHERE a.work_date = ? AND a.person_id = ? AND a.status = ?') &&
            q.params[0] === '2026-11-06' &&
            q.params[1] === 'P001' &&
            q.params[2] === 'NO_SCAN'
        ),
        'MySqlSamAttRepository.getAttendance must push parameterized WHERE clauses to SQL'
      );

      // Execute transactional HR Review update via MySqlSamAttRepository
      const updatedAtt = await mysqlRepo.withTransaction((tx) =>
        tx.saveHRReviewAndNote({
          attendanceId: 'ATT_SQL_1',
          reasonCode: 'OFFICIAL_DUTY',
          reasonLabel: 'ไปราชการ',
          note: 'ประชุมกระทรวง',
          hrReviewStatus: 'REVIEWED',
          authorUserId: 'USR_STAFF',
          authorName: 'นางสาวพัชรี เจริญผล',
        })
      );

      assert.equal(txBegun, 1);
      assert.equal(txCommitted, 1);
      assert.equal(txRolledBack, 0);
      assert.equal(updatedAtt.status, 'NO_SCAN'); // Abnormal status never overwritten to NORMAL!
      assert.equal(updatedAtt.hrReviewStatus, 'REVIEWED');
      assert.equal(updatedAtt.notes?.reasonCode, 'OFFICIAL_DUTY');
      assert.ok(
        executedQueries.some((q) =>
          q.sql.includes('FROM attendance WHERE id = ? FOR UPDATE')
        )
      );

      // Verify rollback on failure in MySqlSamAttRepository
      await assert.rejects(async () => {
        await mysqlRepo.withTransaction(async () => {
          throw new Error('Simulated SQL transaction failure');
        });
      });
      assert.equal(txRolledBack, 1);
    } finally {
      if (origSecret !== undefined) {
        process.env.SAM_ATT_JWT_SECRET = origSecret;
      } else {
        delete process.env.SAM_ATT_JWT_SECRET;
      }
    }
  });

  it('Scenario 17: MySQL Migration Compatibility Check (`001_phase1_phase2_safe_migration.sql`) (§3 & §8)', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'database/migrations/001_phase1_phase2_safe_migration.sql'
    );
    const rollbackPlanPath = path.resolve(
      process.cwd(),
      'database/migrations/BACKUP_AND_ROLLBACK_PLAN.md'
    );

    assert.ok(fs.existsSync(migrationPath), 'Migration SQL file must exist');
    assert.ok(fs.existsSync(rollbackPlanPath), 'Backup and Rollback Plan must exist');

    const sqlContent = fs.readFileSync(migrationPath, 'utf8');
    const executableSqlOnly = sqlContent
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    // Must check version and use INFORMATION_SCHEMA.COLUMNS Stored Procedure instead of MariaDB-only ADD COLUMN IF NOT EXISTS
    assert.ok(executableSqlOnly.includes('SELECT VERSION()'));
    assert.ok(executableSqlOnly.includes('INFORMATION_SCHEMA.COLUMNS'));
    assert.ok(executableSqlOnly.includes('sam_att_add_column_if_missing'));
    assert.equal(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(executableSqlOnly),
      false,
      'Migration must NOT use MariaDB-only ADD COLUMN IF NOT EXISTS syntax in executable SQL'
    );
  });

  it('Scenario 18: FIX #1 — Prevent Production Mock Repository Fallback (All 8 Required Production/Dev/Test Cases) (§2)', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origRepoMode = process.env.SAM_ATT_REPO_MODE;
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    const origDbHost = process.env.SAM_ATT_DB_HOST;
    const origDbUser = process.env.SAM_ATT_DB_USER;

    process.env.SAM_ATT_JWT_SECRET =
      'samchuk_hospital_production_jwt_secret_key_min_32_characters';

    // Create mock and test repositories BEFORE switching NODE_ENV to 'production'
    process.env.NODE_ENV = 'test';
    const mockRepo = new SamAttRepository({}, { mode: 'MOCK' });
    const testRepo = new SamAttRepository({}, { mode: 'TEST' });

    const unavailablePool: SqlConnectionPool = {
      async execute() {
        throw new DatabaseUnavailableError(
          'ECONNREFUSED 10.2.0.201:3306 — MySQL samchuk_attendance is unreachable in Production'
        );
      },
      async getConnection() {
        throw new DatabaseUnavailableError(
          'ECONNREFUSED 10.2.0.201:3306 — MySQL samchuk_attendance is unreachable in Production'
        );
      },
      async end() {},
    };
    const realRepo = new MySqlSamAttRepository(unavailablePool);

    try {
      // 1. Production + REAL Repository → Allowed
      process.env.NODE_ENV = 'production';
      process.env.SAM_ATT_REPO_MODE = 'REAL';
      const prodRealRouter = createSamAttRouter(realRepo);
      assert.ok(prodRealRouter, 'Production + REAL Repository must be allowed');

      // 2. Production + MOCK Repository → Rejected
      process.env.NODE_ENV = 'production';
      process.env.SAM_ATT_REPO_MODE = 'MOCK';
      assert.throws(
        () => createSamAttRouter(),
        (err: any) =>
          err instanceof ProductionRepositoryConfigurationError &&
          err.code === 'SAM_ATT_PRODUCTION_REPO_CONFIG_ERROR',
        'Production + SAM_ATT_REPO_MODE=MOCK must be rejected'
      );
      process.env.SAM_ATT_REPO_MODE = 'REAL';
      assert.throws(
        () => createSamAttRouter(mockRepo),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'Production + injected MOCK repository must be rejected'
      );
      assert.throws(
        () => new SamAttRepository({}, { mode: 'MOCK' }),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'Direct SamAttRepository(MOCK) instantiation in Production must be rejected'
      );
      assert.throws(
        () => createDefaultSeededRepository(),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'createDefaultSeededRepository() in Production must be rejected'
      );

      // 3. Production + TEST Repository → Rejected
      process.env.NODE_ENV = 'production';
      process.env.SAM_ATT_REPO_MODE = 'TEST';
      assert.throws(
        () => createSamAttRouter(),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'Production + SAM_ATT_REPO_MODE=TEST must be rejected'
      );
      process.env.SAM_ATT_REPO_MODE = 'REAL';
      assert.throws(
        () => createSamAttRouter(testRepo),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'Production + injected TEST repository must be rejected'
      );
      assert.throws(
        () => createRepositoryForMode({ mode: 'TEST' }),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'createRepositoryForMode({ mode: TEST }) in Production must be rejected'
      );

      // 4. Production + Missing Repository Mode → Rejected
      process.env.NODE_ENV = 'production';
      delete process.env.SAM_ATT_REPO_MODE;
      assert.throws(
        () => createSamAttRouter(),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'Production + Missing SAM_ATT_REPO_MODE must be rejected'
      );
      assert.throws(
        () => createRepositoryForMode(),
        (err: any) => err instanceof ProductionRepositoryConfigurationError,
        'createRepositoryForMode() with missing SAM_ATT_REPO_MODE in Production must be rejected'
      );

      // 5. Development + MOCK Repository → Allowed
      process.env.NODE_ENV = 'development';
      process.env.SAM_ATT_REPO_MODE = 'MOCK';
      const devMockRouter = createSamAttRouter(mockRepo);
      assert.ok(devMockRouter, 'Development + MOCK Repository must be allowed');

      // 6. Test + TEST Repository → Allowed
      process.env.NODE_ENV = 'test';
      process.env.SAM_ATT_REPO_MODE = 'TEST';
      const testModeRouter = createSamAttRouter(testRepo);
      assert.ok(testModeRouter, 'Test + TEST Repository must be allowed');

      // 7 & 8. Production + MySQL Unavailable → HTTP 503 & No Silent Mock Fallback
      process.env.NODE_ENV = 'production';
      process.env.SAM_ATT_REPO_MODE = 'REAL';
      delete process.env.SAM_ATT_DB_HOST;
      delete process.env.SAM_ATT_DB_USER;

      // Mount default router in Production with no arguments (unconfigured/unavailable MySQL)
      const prodApp = express();
      prodApp.use('/api/Sam_Att', createSamAttRouter());

      const prodLoginRes = await invokeGatewayRoute(prodApp, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        body: { username: 'admin_test', password: 'admin_secret_123' },
      });
      assert.equal(prodLoginRes.status, 503);
      assert.equal(prodLoginRes.body.code, 'SAM_ATT_MYSQL_UNAVAILABLE');
      assert.equal(prodLoginRes.body.repositoryMode, 'REAL');

      // Issue a valid signed token and query `/api/Sam_Att/attendance` in Production when MySQL is unavailable -> HTTP 503, NEVER Mock Data!
      const validProdToken = AuthService.issueSignedToken(
        {
          id: 'USR_ADMIN',
          username: 'admin_test',
          passwordHash: '',
          fullName: 'นายสมศักดิ์ บริหารงาน',
          role: 'ADMIN',
          personId: null,
          department: 'HR',
          position: 'Admin',
          active: true,
        },
        3600,
        'REAL'
      );

      const prodAttRes = await invokeGatewayRoute(prodApp, {
        method: 'GET',
        url: '/api/Sam_Att/attendance',
        headers: { Authorization: `Bearer ${validProdToken}` },
      });
      assert.equal(prodAttRes.status, 503);
      assert.equal(prodAttRes.body.code, 'SAM_ATT_MYSQL_UNAVAILABLE');
      assert.equal(prodAttRes.body.repositoryMode, 'REAL');
      assert.equal(prodAttRes.body.items, undefined);
    } finally {
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
      else delete process.env.NODE_ENV;
      if (origRepoMode !== undefined) process.env.SAM_ATT_REPO_MODE = origRepoMode;
      else delete process.env.SAM_ATT_REPO_MODE;
      if (origSecret !== undefined) process.env.SAM_ATT_JWT_SECRET = origSecret;
      else delete process.env.SAM_ATT_JWT_SECRET;
      if (origDbHost !== undefined) process.env.SAM_ATT_DB_HOST = origDbHost;
      else delete process.env.SAM_ATT_DB_HOST;
      if (origDbUser !== undefined) process.env.SAM_ATT_DB_USER = origDbUser;
      else delete process.env.SAM_ATT_DB_USER;
    }
  });

  it('Scenario 19: FIX #2 — Multi-Process Session Revocation, Atomic Distributed Rate Limiting & Fail-Closed Repository Tests (Fake SQL Pool & Multi-Process Simulation) (§3)', async () => {
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    process.env.SAM_ATT_JWT_SECRET =
      'samchuk_hospital_distributed_security_secret_key_min_32_chars';

    try {
      // Shared state simulating a shared MySQL `samchuk_attendance` database accessed by Process A and Process B
      const sharedRevokedJtis = new Map<string, { userId: string; expiresAtSec: number }>();
      const sharedRateLimits = new Map<
        string,
        { failedAttempts: number; firstFailedAtMs: number; lockedUntilMs: number | null }
      >();
      const sharedAuditLogs: Array<{ action: string; summary: string; metadata: string }> = [];
      let simulateRevocationRepoDown = false;
      let simulateRateLimitRepoDown = false;
      let sharedTxChain: Promise<unknown> = Promise.resolve();

      const adminPasswordHash = AuthService.hashPassword('admin_secret_123');
      const nursePasswordHash = AuthService.hashPassword('user_secret_123');

      function createSharedFakeMySqlPool(): SqlConnectionPool {
        const executeSql = async <T = any>(
          sql: string,
          params: ReadonlyArray<unknown> = []
        ): Promise<[T, any]> => {
          const norm = sql.trim();

          if (norm.includes('revoked_sessions')) {
            if (simulateRevocationRepoDown) {
              throw new DatabaseUnavailableError(
                'Revocation table query failed: MySQL connection lost (Fail Closed)'
              );
            }
            if (norm.startsWith('INSERT INTO revoked_sessions')) {
              const [jti, userId, expiresAtSec] = params as [string, string, number];
              sharedRevokedJtis.set(String(jti), {
                userId: String(userId),
                expiresAtSec: Number(expiresAtSec),
              });
              return [{ affectedRows: 1 } as unknown as T, []];
            }
            if (norm.startsWith('SELECT jti FROM revoked_sessions')) {
              const [jti] = params as [string];
              const found = sharedRevokedJtis.has(String(jti));
              return [(found ? [{ jti }] : []) as unknown as T, []];
            }
            if (norm.startsWith('SELECT expires_at_sec FROM revoked_sessions')) {
              const [sentinelJti] = params as [string];
              const entry = sharedRevokedJtis.get(String(sentinelJti));
              return [
                (entry ? [{ expires_at_sec: entry.expiresAtSec }] : []) as unknown as T,
                [],
              ];
            }
          }

          if (norm.includes('auth_rate_limits')) {
            if (simulateRateLimitRepoDown) {
              throw new DatabaseUnavailableError(
                'Rate limit table query failed: MySQL connection lost (Fail Closed)'
              );
            }
            if (norm.startsWith('SELECT rate_key, failed_attempts')) {
              const [rateKey] = params as [string];
              const entry = sharedRateLimits.get(String(rateKey));
              if (!entry) return [[] as unknown as T, []];
              return [
                [
                  {
                    rate_key: String(rateKey),
                    failed_attempts: entry.failedAttempts,
                    first_failed_at_ms: entry.firstFailedAtMs,
                    locked_until_ms: entry.lockedUntilMs,
                  },
                ] as unknown as T,
                [],
              ];
            }
            if (norm.startsWith('INSERT INTO auth_rate_limits')) {
              // Simulate MySQL InnoDB atomic `INSERT ... ON DUPLICATE KEY UPDATE`
              const rateKey = String(params[0]);
              const nowMs = Number(params[1]);
              const lockedUntilIfFirst =
                params[2] !== null && params[2] !== undefined ? Number(params[2]) : null;
              const windowMs = Number(params[4]);
              const maxAttempts = Number(params[11]);
              const lockedUntilIfIncrement = Number(params[12]);

              const existing = sharedRateLimits.get(rateKey);
              if (!existing || nowMs - existing.firstFailedAtMs > windowMs) {
                sharedRateLimits.set(rateKey, {
                  failedAttempts: 1,
                  firstFailedAtMs: nowMs,
                  lockedUntilMs: lockedUntilIfFirst,
                });
              } else {
                const nextAttempts = existing.failedAttempts + 1;
                const nextLocked =
                  nextAttempts >= maxAttempts
                    ? existing.lockedUntilMs ?? lockedUntilIfIncrement
                    : existing.lockedUntilMs;
                sharedRateLimits.set(rateKey, {
                  failedAttempts: nextAttempts,
                  firstFailedAtMs: existing.firstFailedAtMs,
                  lockedUntilMs: nextLocked,
                });
              }
              return [{ affectedRows: 1 } as unknown as T, []];
            }
            if (norm.startsWith('DELETE FROM auth_rate_limits')) {
              const [rateKey] = params as [string];
              sharedRateLimits.delete(String(rateKey));
              return [{ affectedRows: 1 } as unknown as T, []];
            }
          }

          if (norm.includes('FROM users')) {
            const param = String(params[0] || '').toLowerCase();
            if (param === 'admin_test' || param === 'usr_admin') {
              return [
                [
                  {
                    id: 'USR_ADMIN',
                    username: 'admin_test',
                    password_hash: adminPasswordHash,
                    full_name: 'นายสมศักดิ์ บริหารงาน',
                    role: 'ADMIN',
                    person_id: null,
                    department: 'บริหารทั่วไป',
                    position: 'นักวิชาการคอมพิวเตอร์',
                    active: 1,
                  },
                ] as unknown as T,
                [],
              ];
            }
            if (param === 'nurse_kanda' || param === 'usr_gen_1') {
              return [
                [
                  {
                    id: 'USR_GEN_1',
                    username: 'nurse_kanda',
                    password_hash: nursePasswordHash,
                    full_name: 'นางสาวกานดา สุขใจ',
                    role: 'GENERAL_USER',
                    person_id: 'P001',
                    department: 'IPD',
                    position: 'พยาบาลวิชาชีพ',
                    active: 1,
                  },
                ] as unknown as T,
                [],
              ];
            }
            return [[] as unknown as T, []];
          }

          if (norm.startsWith('INSERT INTO audit_logs')) {
            sharedAuditLogs.push({
              action: String(params[3] || ''),
              summary: String(params[6] || ''),
              metadata: String(params[8] || ''),
            });
            return [{ affectedRows: 1 } as unknown as T, []];
          }

          return [[] as unknown as T, []];
        };

        return {
          execute: executeSql,
          async getConnection(): Promise<SqlQueryableConnection> {
            let releaseLock!: () => void;
            const prevLock = sharedTxChain;
            sharedTxChain = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await prevLock;

            return {
              execute: executeSql,
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              release() {
                releaseLock();
              },
            };
          },
          async end() {},
        };
      }

      // Instantiate Process A and Process B with two separate MySqlSamAttRepository instances (REAL mode)
      const repoProcessA = new MySqlSamAttRepository(createSharedFakeMySqlPool());
      const repoProcessB = new MySqlSamAttRepository(createSharedFakeMySqlPool());

      const appProcessA = express();
      appProcessA.use('/api/Sam_Att', createSamAttRouter(repoProcessA));

      const appProcessB = express();
      appProcessB.use('/api/Sam_Att', createSamAttRouter(repoProcessB));

      // 1. Valid Login on Process A works normally when not locked out
      const loginRes = await invokeGatewayRoute(appProcessA, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.101' },
        body: { username: 'nurse_kanda', password: 'user_secret_123' },
      });
      assert.equal(loginRes.status, 200);
      const token = loginRes.body.token;
      assert.ok(token);

      // Verify token works on Process B before logout
      const meOnB1 = await invokeGatewayRoute(appProcessB, {
        method: 'GET',
        url: '/api/Sam_Att/auth/me',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(meOnB1.status, 200);
      assert.equal(meOnB1.body.user.username, 'nurse_kanda');

      // 2. Revocation Repository Unavailable on Logout -> Fail Closed (HTTP 503, does NOT report logout success)
      simulateRevocationRepoDown = true;
      const failedLogoutOnA = await invokeGatewayRoute(appProcessA, {
        method: 'POST',
        url: '/api/Sam_Att/auth/logout',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(failedLogoutOnA.status, 503);

      // 3. Revocation Repository Unavailable on Authenticated Request -> Fail Closed (HTTP 503, NEVER trusts cache to allow token)
      const failClosedAuthOnB = await invokeGatewayRoute(appProcessB, {
        method: 'GET',
        url: '/api/Sam_Att/auth/me',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(failClosedAuthOnB.status, 503);
      simulateRevocationRepoDown = false;

      // 4. Process A Logout -> Persists to Repository -> Process B Immediately Rejects Token (401)
      const logoutOnA = await invokeGatewayRoute(appProcessA, {
        method: 'POST',
        url: '/api/Sam_Att/auth/logout',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(logoutOnA.status, 200);

      // Clear in-memory cache completely to prove REAL mode never relies on in-memory cache
      AuthService.resetSecurityStateForTests();

      const rejectedOnA = await invokeGatewayRoute(appProcessA, {
        method: 'GET',
        url: '/api/Sam_Att/auth/me',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(rejectedOnA.status, 401);

      const rejectedOnB = await invokeGatewayRoute(appProcessB, {
        method: 'GET',
        url: '/api/Sam_Att/auth/me',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(rejectedOnB.status, 401);

      // Verify raw token and secret are NEVER written to Audit Logs (§3 Problem A #6)
      assert.equal(
        sharedAuditLogs.some(
          (l) =>
            l.summary.includes(token) ||
            l.metadata.includes(token) ||
            l.summary.includes('samchuk_hospital_distributed_security_secret')
        ),
        false,
        'Audit logs must NEVER contain raw session tokens or signing secrets'
      );

      // 5. Process A and Process B see the same Distributed Rate Limit state
      // Send 2 failed attempts to Process A, 2 failed attempts to Process B, and the 5th failed attempt to Process A
      for (let i = 1; i <= 2; i++) {
        const resA = await invokeGatewayRoute(appProcessA, {
          method: 'POST',
          url: '/api/Sam_Att/auth/login',
          headers: { 'x-forwarded-for': '10.2.0.150' },
          body: { username: 'admin_test', password: `wrong_A_${i}` },
        });
        assert.equal(resA.status, 401);
      }
      for (let i = 1; i <= 2; i++) {
        const resB = await invokeGatewayRoute(appProcessB, {
          method: 'POST',
          url: '/api/Sam_Att/auth/login',
          headers: { 'x-forwarded-for': '10.2.0.150' },
          body: { username: 'admin_test', password: `wrong_B_${i}` },
        });
        assert.equal(resB.status, 401);
      }
      // 5th attempt on Process B triggers lockout (HTTP 429)
      const fifthOnB = await invokeGatewayRoute(appProcessB, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.150' },
        body: { username: 'admin_test', password: 'wrong_B_5' },
      });
      assert.equal(fifthOnB.status, 429);

      // Process A immediately sees the lockout produced on Process B (even with the correct password!)
      const blockedOnA = await invokeGatewayRoute(appProcessA, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.150' },
        body: { username: 'admin_test', password: 'admin_secret_123' },
      });
      assert.equal(blockedOnA.status, 429);

      // 6. Concurrent Failed Attempts across Process A and Process B do NOT lose increments
      const concurrentResponses = await Promise.all(
        [1, 2, 3, 4, 5].map((idx) =>
          invokeGatewayRoute(idx % 2 === 0 ? appProcessA : appProcessB, {
            method: 'POST',
            url: '/api/Sam_Att/auth/login',
            headers: { 'x-forwarded-for': '10.2.0.199' },
            body: { username: 'nurse_kanda', password: `concurrent_wrong_${idx}` },
          })
        )
      );

      const recordedEntry = sharedRateLimits.get('nurse_kanda@10.2.0.199');
      assert.ok(recordedEntry, 'Rate limit entry must exist after concurrent attempts');
      assert.equal(
        recordedEntry.failedAttempts,
        5,
        'All 5 concurrent failed attempts across Process A and Process B must be counted atomically with zero lost increments'
      );
      assert.ok(
        recordedEntry.lockedUntilMs && recordedEntry.lockedUntilMs > Date.now(),
        'Account must be locked after 5 concurrent failed attempts'
      );
      assert.ok(
        concurrentResponses.some((r) => r.status === 429),
        'At least one of the 5 concurrent requests (the 5th processed) must receive HTTP 429'
      );

      // Subsequent attempt on either process returns 429
      const postConcurrentAttempt = await invokeGatewayRoute(appProcessA, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.199' },
        body: { username: 'nurse_kanda', password: 'user_secret_123' },
      });
      assert.equal(postConcurrentAttempt.status, 429);

      // 7. Rate Limit Repository Unavailable -> Fail Closed (HTTP 503, never bypasses rate limit to allow login)
      simulateRateLimitRepoDown = true;
      const loginWhenRateLimitRepoDown = await invokeGatewayRoute(appProcessB, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        headers: { 'x-forwarded-for': '10.2.0.210' },
        body: { username: 'nurse_kanda', password: 'user_secret_123' },
      });
      assert.equal(loginWhenRateLimitRepoDown.status, 503);
      simulateRateLimitRepoDown = false;
    } finally {
      if (origSecret !== undefined) {
        process.env.SAM_ATT_JWT_SECRET = origSecret;
      } else {
        delete process.env.SAM_ATT_JWT_SECRET;
      }
    }
  });

  it('Scenario 20: Database Hub (`/settings/connections` & `/settings/connections/health`) Dynamic `SAM_ATT_DB_NAME`, Real MySQL Health Check, HOSOffice Environment Status & Secret Masking', async () => {
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    const origSamDbHost = process.env.SAM_ATT_DB_HOST;
    const origSamDbPort = process.env.SAM_ATT_DB_PORT;
    const origSamDbName = process.env.SAM_ATT_DB_NAME;
    const origSamDbUser = process.env.SAM_ATT_DB_USER;
    const origSamDbPass = process.env.SAM_ATT_DB_PASSWORD;
    const origHosHost = process.env.HOSOFFICE_DB_HOST;
    const origHosPort = process.env.HOSOFFICE_DB_PORT;
    const origHosName = process.env.HOSOFFICE_DB_NAME;
    const origHosUser = process.env.HOSOFFICE_DB_USER;
    const origHosPass = process.env.HOSOFFICE_DB_PASSWORD;
    const origHosTable = process.env.HOSOFFICE_HR_PERSON_TABLE;

    process.env.SAM_ATT_JWT_SECRET =
      'samchuk_hospital_database_hub_verification_secret_min_32_chars';

    const executedHealthQueries: string[] = [];
    let simulateMySqlDown = false;

    const fakeRealPool: SqlConnectionPool = {
      async execute<T = any>(sql: string): Promise<[T, any]> {
        const norm = sql.trim();
        executedHealthQueries.push(norm);
        if (simulateMySqlDown) {
          throw new DatabaseUnavailableError(
            'ECONNREFUSED 10.2.0.201:3306 — MySQL connection failed during health check'
          );
        }
        if (norm.startsWith('SELECT 1')) {
          return [[{ ok: 1 }] as unknown as T, []];
        }
        if (norm.includes('FROM revoked_sessions')) {
          return [[] as unknown as T, []];
        }
        if (norm.includes('FROM users')) {
          return [
            [
              {
                id: 'USR_ADMIN',
                username: 'admin',
                password_hash: AuthService.hashPassword('admin_secret_123'),
                full_name: 'ผู้ดูแลระบบ',
                role: 'ADMIN',
                person_id: null,
                department: 'IT',
                position: 'Admin',
                active: 1,
              },
            ] as unknown as T,
            [],
          ];
        }
        return [[] as unknown as T, []];
      },
      async getConnection(): Promise<SqlQueryableConnection> {
        throw new Error('Not needed for health check');
      },
      async end() {},
    };

    try {
      // 1. Configure Sam_Att V2 Production Environment (`SAM_ATT_DB_NAME=samchuk_attendance_v2`) and leave HOSOffice unconfigured
      process.env.SAM_ATT_DB_HOST = '127.0.0.1';
      process.env.SAM_ATT_DB_PORT = '3306';
      process.env.SAM_ATT_DB_NAME = 'samchuk_attendance_v2';
      process.env.SAM_ATT_DB_USER = 'sam_att_user';
      process.env.SAM_ATT_DB_PASSWORD = 'super_secret_sam_att_password_do_not_leak';

      delete process.env.HOSOFFICE_DB_HOST;
      delete process.env.HOSOFFICE_DB_USER;
      delete process.env.HOSOFFICE_DB_PASSWORD;

      const realRepo = new MySqlSamAttRepository(fakeRealPool);
      assert.equal(realRepo.getDatabaseName(), 'samchuk_attendance_v2');

      const app = express();
      app.use('/api/Sam_Att', createSamAttRouter(realRepo));

      const adminToken = AuthService.issueSignedToken(
        {
          id: 'USR_ADMIN',
          username: 'admin',
          passwordHash: '',
          fullName: 'ผู้ดูแลระบบ',
          role: 'ADMIN',
          personId: null,
          department: 'IT',
          position: 'Admin',
          active: true,
        },
        3600,
        'REAL'
      );

      // Verify GET /api/Sam_Att/settings/connections reports `samchuk_attendance_v2` in both `architecture.isolatedDatabase` and `samchukAttendanceDb.database`
      const connRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/settings/connections',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(connRes.status, 200);
      assert.equal(connRes.body.success, true);
      assert.equal(connRes.body.repositoryMode, 'REAL');
      assert.equal(connRes.body.architecture.isolatedDatabase, 'samchuk_attendance_v2');
      assert.equal(connRes.body.samchukAttendanceDb.database, 'samchuk_attendance_v2');
      assert.equal(
        connRes.body.architecture.isolatedDatabase,
        connRes.body.samchukAttendanceDb.database,
        'architecture.isolatedDatabase and samchukAttendanceDb.database must match'
      );
      assert.equal(
        connRes.body.samchukAttendanceDb.database,
        realRepo.getDatabaseName(),
        'Database Hub must report the exact database name used by the Repository'
      );
      assert.equal(connRes.body.samchukAttendanceDb.configured, true);
      assert.equal(connRes.body.samchukAttendanceDb.host, '127.0.0.1');
      assert.equal(connRes.body.samchukAttendanceDb.user, 'sam_att_user');
      assert.equal(connRes.body.samchukAttendanceDb.passwordMasked, '••••••••••••');
      assert.equal((connRes.body.samchukAttendanceDb as any).password, undefined);
      assert.ok(
        !JSON.stringify(connRes.body).includes('super_secret_sam_att_password_do_not_leak'),
        'API response must NEVER leak raw database password'
      );

      // Verify HOSOffice reports AWAITING_CONFIGURATION honestly when not configured in env
      assert.equal(connRes.body.hosofficeDb.configured, false);
      assert.equal(connRes.body.hosofficeDb.configurationStatus, 'AWAITING_CONFIGURATION');
      assert.equal(connRes.body.hosofficeDb.passwordMasked, 'ยังไม่ได้ตั้งค่า');

      // 2. Verify custom SAM_ATT_DB_NAME dynamically updates Database Hub response
      process.env.SAM_ATT_DB_NAME = 'samchuk_attendance_custom_env';
      const customConnRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/settings/connections',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(customConnRes.status, 200);
      assert.equal(
        customConnRes.body.architecture.isolatedDatabase,
        'samchuk_attendance_custom_env'
      );
      assert.equal(
        customConnRes.body.samchukAttendanceDb.database,
        'samchuk_attendance_custom_env'
      );
      assert.equal(realRepo.getDatabaseName(), 'samchuk_attendance_custom_env');

      // Restore SAM_ATT_DB_NAME to samchuk_attendance_v2
      process.env.SAM_ATT_DB_NAME = 'samchuk_attendance_v2';

      // 3. Verify GET /api/Sam_Att/settings/connections/health executes real `SELECT 1 AS ok` against MySQL
      const countBefore = executedHealthQueries.filter((q) => q.startsWith('SELECT 1')).length;
      const healthRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/settings/connections/health',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const countAfter = executedHealthQueries.filter((q) => q.startsWith('SELECT 1')).length;
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.body.ok, true);
      assert.equal(healthRes.body.healthy, true);
      assert.equal(healthRes.body.database, 'samchuk_attendance_v2');
      assert.equal(healthRes.body.samchukAttendanceDb.database, 'samchuk_attendance_v2');
      assert.equal(healthRes.body.samchukAttendanceDb.healthy, true);
      assert.ok(countAfter > countBefore, 'Health check endpoint must execute real SELECT 1 query');
      assert.equal(healthRes.body.hosofficeDb.configured, false);
      assert.equal(healthRes.body.hosofficeDb.connected, false);
      assert.equal(healthRes.body.hosofficeDb.configurationStatus, 'AWAITING_CONFIGURATION');

      // 4. Verify health check reports healthy: false when MySQL connection fails (never fakes success)
      simulateMySqlDown = true;
      const failedHealthRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/settings/connections/health',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // Note: When MySQL is down for auth middleware, it returns 503 SAM_ATT_MYSQL_UNAVAILABLE (Fail Closed)
      assert.equal(failedHealthRes.status, 503);
      simulateMySqlDown = false;

      // 5. Verify HOSOffice environment configuration is detected when HOSOFFICE_DB_* env vars are set
      process.env.HOSOFFICE_DB_HOST = '10.2.0.201';
      process.env.HOSOFFICE_DB_PORT = '3306';
      process.env.HOSOFFICE_DB_NAME = 'hosoffice';
      process.env.HOSOFFICE_DB_USER = 'hos_reader';
      process.env.HOSOFFICE_DB_PASSWORD = 'super_secret_hosoffice_password_do_not_leak';
      process.env.HOSOFFICE_HR_PERSON_TABLE = 'hr_person';

      const hosConfiguredRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/settings/connections',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(hosConfiguredRes.status, 200);
      assert.equal(hosConfiguredRes.body.hosofficeDb.configured, true);
      assert.equal(hosConfiguredRes.body.hosofficeDb.configurationStatus, 'CONFIGURED');
      assert.equal(hosConfiguredRes.body.hosofficeDb.host, '10.2.0.201');
      assert.equal(hosConfiguredRes.body.hosofficeDb.database, 'hosoffice');
      assert.equal(hosConfiguredRes.body.hosofficeDb.sourceTable, 'hr_person');
      assert.equal(hosConfiguredRes.body.hosofficeDb.user, 'hos_reader');
      assert.equal(hosConfiguredRes.body.hosofficeDb.passwordMasked, '••••••••••••');
      assert.ok(
        !JSON.stringify(hosConfiguredRes.body).includes(
          'super_secret_hosoffice_password_do_not_leak'
        ),
        'API response must NEVER leak HOSOffice database password'
      );
    } finally {
      if (origSecret !== undefined) process.env.SAM_ATT_JWT_SECRET = origSecret;
      else delete process.env.SAM_ATT_JWT_SECRET;
      if (origSamDbHost !== undefined) process.env.SAM_ATT_DB_HOST = origSamDbHost;
      else delete process.env.SAM_ATT_DB_HOST;
      if (origSamDbPort !== undefined) process.env.SAM_ATT_DB_PORT = origSamDbPort;
      else delete process.env.SAM_ATT_DB_PORT;
      if (origSamDbName !== undefined) process.env.SAM_ATT_DB_NAME = origSamDbName;
      else delete process.env.SAM_ATT_DB_NAME;
      if (origSamDbUser !== undefined) process.env.SAM_ATT_DB_USER = origSamDbUser;
      else delete process.env.SAM_ATT_DB_USER;
      if (origSamDbPass !== undefined) process.env.SAM_ATT_DB_PASSWORD = origSamDbPass;
      else delete process.env.SAM_ATT_DB_PASSWORD;
      if (origHosHost !== undefined) process.env.HOSOFFICE_DB_HOST = origHosHost;
      else delete process.env.HOSOFFICE_DB_HOST;
      if (origHosPort !== undefined) process.env.HOSOFFICE_DB_PORT = origHosPort;
      else delete process.env.HOSOFFICE_DB_PORT;
      if (origHosName !== undefined) process.env.HOSOFFICE_DB_NAME = origHosName;
      else delete process.env.HOSOFFICE_DB_NAME;
      if (origHosUser !== undefined) process.env.HOSOFFICE_DB_USER = origHosUser;
      else delete process.env.HOSOFFICE_DB_USER;
      if (origHosPass !== undefined) process.env.HOSOFFICE_DB_PASSWORD = origHosPass;
      else delete process.env.HOSOFFICE_DB_PASSWORD;
      if (origHosTable !== undefined) process.env.HOSOFFICE_HR_PERSON_TABLE = origHosTable;
      else delete process.env.HOSOFFICE_HR_PERSON_TABLE;
    }
  });

  it('Scenario 21: Sam_Att V2 Deployment Center — ADMIN-Only RBAC, 8-Item Preflight Check, Command Injection Rejection, Phase 1 Lock & Production Build No-Demo-Bypass Verification', async () => {
    const origSecret = process.env.SAM_ATT_JWT_SECRET;
    process.env.SAM_ATT_JWT_SECRET =
      'samchuk_hospital_deployment_center_verification_secret_min_32_chars';

    try {
      const { app } = createTestEnvironment();

      // Obtain real tokens for GENERAL_USER, RESPONSIBLE_STAFF, and ADMIN
      const genLogin = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        body: { username: 'nurse_kanda', password: 'user_secret_123' },
      });
      assert.equal(genLogin.status, 200);
      const genToken = genLogin.body.token as string;

      const staffLogin = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        body: { username: 'staff_test', password: 'staff_secret_123' },
      });
      assert.equal(staffLogin.status, 200);
      const staffToken = staffLogin.body.token as string;

      const adminLogin = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/auth/login',
        body: { username: 'admin_test', password: 'admin_secret_123' },
      });
      assert.equal(adminLogin.status, 200);
      const adminToken = adminLogin.body.token as string;

      // 1. Unauthenticated or fake Demo Admin requests MUST be rejected with HTTP 401
      const unauthRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/deployment/status',
      });
      assert.equal(unauthRes.status, 401);

      const fakeDemoHeaderRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/deployment/status',
        headers: {
          Authorization: 'Bearer DEMO_PREVIEW_ADMIN_ONLY',
          'x-demo-admin': 'true',
          'x-mock-role': 'ADMIN',
        },
      });
      assert.equal(
        fakeDemoHeaderRes.status,
        401,
        'Backend must NEVER allow Demo Admin header/token bypass'
      );

      // 2. GENERAL_USER and RESPONSIBLE_STAFF MUST be blocked with HTTP 403 on all /deployment/* endpoints
      const protectedEndpoints: Array<{ method: 'GET' | 'POST'; url: string }> = [
        { method: 'GET', url: '/api/Sam_Att/deployment/status' },
        { method: 'POST', url: '/api/Sam_Att/deployment/check-updates' },
        { method: 'POST', url: '/api/Sam_Att/deployment/preflight' },
        { method: 'GET', url: '/api/Sam_Att/deployment/history' },
        { method: 'POST', url: '/api/Sam_Att/deployment/approve' },
        { method: 'POST', url: '/api/Sam_Att/deployment/rollback' },
      ];

      for (const ep of protectedEndpoints) {
        const genRes = await invokeGatewayRoute(app, {
          method: ep.method,
          url: ep.url,
          headers: { Authorization: `Bearer ${genToken}` },
          body: ep.method === 'POST' ? {} : undefined,
        });
        assert.equal(
          genRes.status,
          403,
          `GENERAL_USER must be blocked with 403 on ${ep.method} ${ep.url}`
        );

        const staffRes = await invokeGatewayRoute(app, {
          method: ep.method,
          url: ep.url,
          headers: { Authorization: `Bearer ${staffToken}` },
          body: ep.method === 'POST' ? {} : undefined,
        });
        assert.equal(
          staffRes.status,
          403,
          `RESPONSIBLE_STAFF must be blocked with 403 on ${ep.method} ${ep.url}`
        );
      }

      // 3. ADMIN can access GET /api/Sam_Att/deployment/status
      const statusRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/deployment/status',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.body.success, true);
      assert.equal(statusRes.body.phase, 'PHASE_1_READ_ONLY');
      assert.equal(statusRes.body.systemStatus.samAttFrontendPort, 3001);
      assert.equal(statusRes.body.systemStatus.samAttFrontendPath, '/Sam_Att/');
      assert.equal(statusRes.body.systemStatus.backendGatewayPort, 3002);
      assert.equal(statusRes.body.systemStatus.backendGatewayPath, '/api/Sam_Att/');
      assert.equal(
        statusRes.body.systemStatus.githubRepositoryUrl,
        'https://github.com/jk9krnvb6g-ai/Sam_Att'
      );

      // Must NOT fabricate fake versions like v2.0.0 or v2.0.1
      assert.notEqual(statusRes.body.currentVersion.version, 'v2.0.0');
      assert.notEqual(statusRes.body.currentVersion.version, 'v2.0.1');
      assert.equal(statusRes.body.checklist.length, 8, 'Pre-Deployment Checklist must have 8 items');
      assert.equal(statusRes.body.deploymentAgent.phase2AgentAvailable, false);
      assert.equal(statusRes.body.deploymentAgent.approveEnabled, false);
      assert.equal(statusRes.body.deploymentAgent.rollbackEnabled, false);

      // 4. ADMIN can run POST /api/Sam_Att/deployment/preflight and Audit Log is recorded
      const preflightRes = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/deployment/preflight',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {},
      });
      assert.equal(preflightRes.status, 200);
      assert.equal(preflightRes.body.success, true);
      assert.equal(preflightRes.body.checklist.length, 8);

      const historyRes = await invokeGatewayRoute(app, {
        method: 'GET',
        url: '/api/Sam_Att/deployment/history',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(historyRes.status, 200);
      assert.equal(historyRes.body.success, true);
      assert.ok(
        Array.isArray(historyRes.body.history) && historyRes.body.history.length >= 1,
        'Deployment history must include recorded preflight check audit entry'
      );

      // 5. Reject any request payload attempting to pass shell commands, PowerShell scripts, Git URLs, or file paths (HTTP 400)
      const forbiddenPayloads = [
        { command: 'powershell -Command Get-Process' },
        { powershell: 'Invoke-Expression' },
        { script: 'deploy.ps1' },
        { gitUrl: 'https://evil.example.com/repo.git' },
        { filePath: 'C:\\Windows\\System32\\cmd.exe' },
      ];

      for (const badBody of forbiddenPayloads) {
        const badRes = await invokeGatewayRoute(app, {
          method: 'POST',
          url: '/api/Sam_Att/deployment/preflight',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: badBody,
        });
        assert.equal(
          badRes.status,
          400,
          `Payload ${JSON.stringify(badBody)} must be rejected with HTTP 400`
        );
      }

      // 6. Approve & Rollback require password re-authentication and enforce Phase 1 Read-Only Lock (HTTP 501)
      const approveWrongPass = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/deployment/approve',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { adminPassword: 'wrong_password' },
      });
      assert.equal(approveWrongPass.status, 401);

      const approveLocked = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/deployment/approve',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { adminPassword: 'admin_secret_123' },
      });
      assert.equal(approveLocked.status, 501);
      assert.equal(approveLocked.body.liveDeployExecuted, false);

      const rollbackLocked = await invokeGatewayRoute(app, {
        method: 'POST',
        url: '/api/Sam_Att/deployment/rollback',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { adminPassword: 'admin_secret_123' },
      });
      assert.equal(rollbackLocked.status, 501);
      assert.equal(rollbackLocked.body.liveRollbackExecuted, false);

      // 7. Verify Production Build bundle (`dist/assets`) does NOT contain Demo Admin authentication bypass
      const distAssetsDir = path.resolve(process.cwd(), 'dist', 'assets');
      if (fs.existsSync(distAssetsDir)) {
        const jsFiles = fs
          .readdirSync(distAssetsDir)
          .filter((f) => f.endsWith('.js'));
        for (const file of jsFiles) {
          const bundleContent = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
          assert.equal(
            bundleContent.includes('DEMO_PREVIEW_ADMIN_ONLY'),
            false,
            `Production bundle ${file} must NOT contain Demo Admin bypass identifier DEMO_PREVIEW_ADMIN_ONLY`
          );
          assert.equal(
            bundleContent.includes('demo_admin_preview'),
            false,
            `Production bundle ${file} must NOT contain demo_admin_preview account`
          );
        }
      }
    } finally {
      if (origSecret !== undefined) process.env.SAM_ATT_JWT_SECRET = origSecret;
      else delete process.env.SAM_ATT_JWT_SECRET;
    }
  });
});


