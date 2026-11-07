/**
 * Sam_Att V2 — Central API Gateway Mountable Router (Phase 1 + Phase 2 Hardened)
 * Mounts at prefix: `/api/Sam_Att/` in Samchuk Hospital Central API Gateway (Port 3002)
 *
 * IMPORTANT ARCHITECTURE RULES (§1, §2, §4, §7, §9):
 * 1. DO NOT CALL `app.listen()` or `server.listen()` IN THIS FILE.
 *    The hospital's Central API Gateway handles listening on Port 3002.
 * 2. Database isolation: Connects exclusively to `samchuk_attendance`.
 * 3. Does not alter or interfere with Procurement or Cash_Cheque modules.
 * 4. Enforces strict Role-Based Authorization (`ADMIN`, `RESPONSIBLE_STAFF`, `GENERAL_USER`)
 *    and guarantees `GENERAL_USER` can only access their own `PERSON_ID`.
 * 5. In `REAL` mode, NEVER falls back to Mock Data if MySQL is unavailable; returns HTTP 503.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ISamAttRepository } from './repositories/interfaces';
import { createRepositoryForMode } from './repositories/samAttRepository';
import { DatabaseUnavailableError } from './repositories/mysqlSamAttRepository';
import { createDefaultSeededRepository } from './repositories/defaultRepositorySeed';
import { AuthService } from './services/authService';
import { ScannerAdapter } from './services/scannerAdapter';
import { HosOfficeAdapter } from './services/hosofficeAdapter';
import { AuthenticatedUser, EngineHRReviewStatus } from './types';

export function createSamAttRouter(customRepository?: ISamAttRepository): Router {
  const router = Router();
  const repo: ISamAttRepository =
    customRepository ||
    (process.env.SAM_ATT_REPO_MODE === 'REAL'
      ? createRepositoryForMode({ mode: 'REAL' })
      : createDefaultSeededRepository());

  // Enforce SAM_ATT_JWT_SECRET in REAL / production mode (§4)
  AuthService.assertRealModeSecretConfigured(repo.mode);

  const asyncRoute = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
  ) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
        if (err instanceof DatabaseUnavailableError) {
          return res.status(503).json({
            success: false,
            code: err.code,
            repositoryMode: repo.mode,
            error: err.message,
          });
        }
        return res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : 'Internal Server Error',
        });
      });
    };
  };

  // ==========================================
  // 1. Public Authentication Endpoint (`/auth/login`)
  // ==========================================
  router.post(
    '/auth/login',
    asyncRoute(async (req: Request, res: Response) => {
      const { username, password } = req.body || {};
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        '127.0.0.1';

      const authRes = await AuthService.authenticateCredentials(
        repo,
        username,
        password,
        clientIp
      );
      if (!authRes.success) {
        return res.status(authRes.statusCode).json({
          success: false,
          error: authRes.error,
          retryAfterSeconds: authRes.retryAfterSeconds,
        });
      }
      return res.json({
        success: true,
        token: authRes.token,
        user: authRes.user,
      });
    })
  );

  // ==========================================
  // Middleware: Verify Session Token / Dev Persona from Authoritative Repository
  // ==========================================
  router.use(AuthService.createAuthMiddleware(repo));

  const staffOrAdmin = AuthService.requireRoles(['ADMIN', 'RESPONSIBLE_STAFF'], repo);
  const adminOnly = AuthService.requireRoles(['ADMIN'], repo);

  router.get(
    '/auth/me',
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      res.json({
        success: true,
        user,
      });
    })
  );

  router.post(
    '/auth/logout',
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const rawToken = (req as any).rawToken as string | undefined;
      if (rawToken) {
        await AuthService.revokeToken(rawToken, repo.mode, repo);
      }
      await repo.recordAuditLog({
        actor: user.username,
        actorName: user.fullName,
        actorRole: user.role,
        action: 'AUTH_LOGOUT',
        entityType: 'User',
        entityId: user.userId,
        summary: `ผู้ใช้งาน ${user.username} ออกจากระบบและเพิกถอน Session Token`,
      });
      res.json({ success: true, message: 'Logged out and session token revoked' });
    })
  );

  // ==========================================
  // 2. My Attendance (`GENERAL_USER` strictly own-only — §4 & §10)
  // ==========================================
  router.get(
    '/me/attendance',
    asyncRoute(async (req: Request, res: Response) => {
      const check = await AuthService.verifyGeneralUserOwnAccess(req, res, repo);
      if (!check.allowed) return;

      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

      const result = await repo.getAttendance({
        personId: check.personId,
        fromDate,
        toDate,
        page,
        pageSize,
      });

      res.json({
        success: true,
        personId: check.personId,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        records: result.items,
      });
    })
  );

  router.get(
    '/me/shifts',
    asyncRoute(async (req: Request, res: Response) => {
      const check = await AuthService.verifyGeneralUserOwnAccess(req, res, repo);
      if (!check.allowed) return;

      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;

      const assignments = await repo.getShiftAssignments({
        personId: check.personId,
        fromDate,
        toDate,
      });

      res.json({
        success: true,
        personId: check.personId,
        assignments,
      });
    })
  );

  router.get(
    '/me/raw-scans',
    asyncRoute(async (req: Request, res: Response) => {
      const check = await AuthService.verifyGeneralUserOwnAccess(req, res, repo);
      if (!check.allowed) return;

      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));

      const scans = await repo.getRawScans({
        personId: check.personId,
        fromDate,
        toDate,
        page,
        pageSize,
      });

      res.json({
        success: true,
        personId: check.personId,
        total: scans.total,
        page: scans.page,
        pageSize: scans.pageSize,
        scans: scans.items,
      });
    })
  );

  // ==========================================
  // 3. Dashboard Summary (`STAFF`, `ADMIN` — §7: Does NOT fetch all raw scans)
  // ==========================================
  router.get(
    '/dashboard/summary',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const workDate = (req.query.workDate as string) || '2026-11-06';
      const dayAttendance = await repo.getAttendance({ workDate, pageSize: 5000 });
      const dayRecords = dayAttendance.items;
      const activePersonnel = await repo.getPersonnel({ activeOnly: true });

      const normalCount = dayRecords.filter((r) => r.status === 'NORMAL').length;
      const lateRecords = dayRecords.filter((r) => r.status === 'LATE');
      const distinctLatePeople = new Set(lateRecords.map((r) => r.personId)).size;
      const noScanCount = dayRecords.filter((r) => r.status === 'NO_SCAN').length;
      const missingCheckoutCount = dayRecords.filter(
        (r) => r.status === 'MISSING_CHECKOUT' || r.hasMissingCheckout
      ).length;
      const pendingReviewCount = dayRecords.filter(
        (r) => r.hrReviewStatus === 'PENDING_REVIEW'
      ).length;
      const totalLateMinutes = lateRecords.reduce((s, r) => s + r.lateMinutes, 0);

      res.json({
        success: true,
        summary: {
          workDate,
          totalPersonnel: activePersonnel.length,
          totalShiftsToday: dayRecords.length,
          normalCount,
          distinctLatePeople,
          totalLateOccurrences: lateRecords.length,
          noScanCount,
          missingCheckoutCount,
          pendingReviewCount,
          totalLateMinutes,
          avgLateMinutesPerLateShift:
            lateRecords.length > 0 ? Math.round(totalLateMinutes / lateRecords.length) : 0,
        },
      });
    })
  );

  // ==========================================
  // 4. Personnel & HOSOffice Authoritative Sync (§6, §7)
  // ==========================================
  router.get(
    '/personnel',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const search = req.query.search as string | undefined;
      const department = req.query.department as string | undefined;
      const personnelType = req.query.personnelType as string | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

      const all = await repo.getPersonnel({
        search,
        department,
        personnelType,
        activeOnly: false,
      });
      const start = (page - 1) * pageSize;

      res.json({
        success: true,
        total: all.length,
        page,
        pageSize,
        personnel: all.slice(start, start + pageSize),
      });
    })
  );

  router.get(
    '/personnel/mapping-issues',
    staffOrAdmin,
    asyncRoute(async (_req: Request, res: Response) => {
      const mappings = await repo.getFingerprintMappings();
      const disputed = mappings.filter((m) => m.status === 'DISPUTED');
      const unmappedScans = await repo.getRawScans({
        mappingStatus: 'PENDING_MAPPING',
        pageSize: 100,
      });

      res.json({
        success: true,
        disputedMappings: disputed,
        unmappedRawScansCount: unmappedScans.total,
        unmappedRawScansSample: unmappedScans.items,
      });
    })
  );

  router.post(
    '/personnel/sync',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const testFixtureRows = Array.isArray(req.body?.testFixtureRows)
        ? req.body.testFixtureRows
        : undefined;
      const syncDateStr = (req.body?.syncDateStr as string) || '2026-11-06';

      const syncResult = await HosOfficeAdapter.syncPersonnelToRepository({
        repository: repo,
        testFixtureRows,
        syncDateStr,
        actor: user.username,
      });

      res.json({
        success: syncResult.status !== 'FAILED',
        ...syncResult,
      });
    })
  );

  // ==========================================
  // 5. Shifts & Shift Assignments (§5 & §7)
  // ==========================================
  router.get(
    '/shifts',
    staffOrAdmin,
    asyncRoute(async (_req: Request, res: Response) => {
      const shifts = await repo.getShifts();
      res.json({
        success: true,
        shifts,
      });
    })
  );

  router.post(
    '/shifts',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const { id, code, name, category, startTime, endTime, crossMidnight, graceMinutes } =
        req.body || {};

      if (!code || !name || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุ code, name, startTime และ endTime ของกะเวลา',
        });
      }

      const saved = await repo.withTransaction((tx) =>
        tx.saveShift(
          {
            id: id || `SH_${Date.now()}`,
            code,
            name,
            category: category || 'MORNING',
            startTime,
            endTime,
            crossMidnight: Boolean(crossMidnight),
            graceMinutes: Number(graceMinutes ?? 15),
            earlyScanWindowMinutes: 180,
            lateScanWindowMinutes: 240,
            active: true,
          },
          user.username
        )
      );

      res.json({
        success: true,
        shift: saved,
      });
    })
  );

  router.get(
    '/shift-assignments',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const personId = req.query.personId as string | undefined;
      const workDate = req.query.workDate as string | undefined;
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;

      const assignments = await repo.getShiftAssignments({
        personId,
        workDate,
        fromDate,
        toDate,
      });

      res.json({
        success: true,
        total: assignments.length,
        assignments,
      });
    })
  );

  router.post(
    '/shift-assignments',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const { personId, workDate, shiftId, assignmentType } = req.body || {};

      if (!personId || !workDate || !shiftId) {
        return res.status(400).json({
          success: false,
          error: 'personId, workDate และ shiftId เป็นข้อมูลจำเป็น',
        });
      }

      const result = await repo.withTransaction((tx) =>
        tx.assignShift(
          {
            personId,
            workDate,
            shiftId,
            assignmentType: assignmentType || 'DAILY',
          },
          user.username
        )
      );

      if (!result.success) {
        return res.status(409).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        assignment: result.assignment,
      });
    })
  );

  router.delete(
    '/shift-assignments/:id',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const { id } = req.params;
      const reason = (req.body?.reason as string) || 'ยกเลิกกะเวลาโดยเจ้าหน้าที่';

      const result = await repo.withTransaction((tx) =>
        tx.cancelShiftAssignment({
          assignmentId: id,
          reason,
          cancelledBy: user.fullName || user.username,
        })
      );

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        cancellationLog: result.log,
      });
    })
  );

  // ==========================================
  // 6. Scanner Sync & Immutable Raw Scans (6-Field Contract — §1, §5 & §7)
  // ==========================================
  router.post(
    '/scanners/sync',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      let body: any = req.body;
      if (typeof req.body === 'string') {
        try {
          body = JSON.parse(req.body);
        } catch {
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON payload',
          });
        }
      }

      if (!body || typeof body !== 'object' || !Array.isArray(body.scans)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payload: ต้องมีอาร์เรย์ scans[] ตามสัญญาข้อมูล 6 ฟิลด์ของ Scanner EXE',
        });
      }

      // Strictly validate all items in scans[]
      for (const item of body.scans) {
        const check = ScannerAdapter.validateScanRecord(item);
        if (!check.valid) {
          return res.status(400).json({
            success: false,
            error: `ข้อมูลสแกนไม่ตรงตามสัญญา 6 ฟิลด์: ${check.reason}`,
          });
        }
      }

      const ingestion = await repo.withTransaction((tx) =>
        tx.ingestRawScans(body.scans, user.username)
      );

      res.json({
        success: true,
        totalRead: ingestion.totalRead,
        newScansCount: ingestion.newScansCount,
        duplicateScansCount: ingestion.duplicateScansCount,
        unmappedScansCount: ingestion.unmappedScansCount,
        scans: ingestion.newEvents,
      });
    })
  );

  router.get(
    '/raw-scans',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const machineNo = req.query.machineNo ? Number(req.query.machineNo) : undefined;
      const enrollNumber = req.query.enrollNumber
        ? Number(req.query.enrollNumber)
        : undefined;
      const mappingStatus = req.query.mappingStatus as
        | 'MAPPED'
        | 'PENDING_MAPPING'
        | 'DISPUTED_MAPPING'
        | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

      const result = await repo.getRawScans({
        fromDate,
        toDate,
        machineNo,
        enrollNumber,
        mappingStatus,
        page,
        pageSize,
      });

      res.json({
        success: true,
        ...result,
      });
    })
  );

  // ==========================================
  // 7. Attendance, Attendance Review & Reprocess (§5 & §7)
  // ==========================================
  router.get(
    '/attendance',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const workDate = req.query.workDate as string | undefined;
      const personId = req.query.personId as string | undefined;
      const department = req.query.department as string | undefined;
      const status = req.query.status as string | undefined;
      const hrReviewStatus = req.query.hrReviewStatus as string | undefined;
      const search = req.query.search as string | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

      const result = await repo.getAttendance({
        fromDate,
        toDate,
        workDate,
        personId,
        department,
        status,
        hrReviewStatus,
        search,
        page,
        pageSize,
      });

      res.json({
        success: true,
        ...result,
      });
    })
  );

  router.get(
    '/attendance-review',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const department = req.query.department as string | undefined;
      const status = req.query.status as string | undefined;
      const hrReviewStatus = req.query.hrReviewStatus as string | undefined;
      const search = req.query.search as string | undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

      const scopeRes = await repo.getAttendance({
        fromDate,
        toDate,
        department,
        search,
        pageSize: 10000,
      });
      const allInScope = scopeRes.items;

      const kpi = {
        evaluatedShifts: allInScope.length,
        normalCount: allInScope.filter((r) => r.status === 'NORMAL').length,
        lateCount: allInScope.filter((r) => r.status === 'LATE').length,
        noScanCount: allInScope.filter((r) => r.status === 'NO_SCAN').length,
        missingCheckoutCount: allInScope.filter(
          (r) => r.status === 'MISSING_CHECKOUT' || r.hasMissingCheckout
        ).length,
        pendingReviewCount: allInScope.filter(
          (r) => r.hrReviewStatus === 'PENDING_REVIEW'
        ).length,
      };

      const paged = await repo.getAttendance({
        fromDate,
        toDate,
        department,
        status,
        hrReviewStatus,
        search,
        page,
        pageSize,
      });

      res.json({
        success: true,
        kpi,
        ...paged,
      });
    })
  );

  router.post(
    '/attendance/reprocess/preview',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const { fromDate, toDate, groupName, personId, referenceDateTime } = req.body || {};
      if (!fromDate || !toDate || typeof fromDate !== 'string' || typeof toDate !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุช่วงวันที่ fromDate และ toDate (yyyy-MM-dd)',
        });
      }

      const preview = await repo.previewReprocess({
        fromDate,
        toDate,
        referenceDateTime,
        filterGroupName: groupName,
        filterPersonId: personId,
      });

      res.json({
        success: true,
        preview,
      });
    })
  );

  router.post(
    '/attendance/reprocess',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const user = (req as any).user as AuthenticatedUser;
      const { fromDate, toDate, groupName, personId, referenceDateTime } = req.body || {};
      if (!fromDate || !toDate || typeof fromDate !== 'string' || typeof toDate !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'fromDate and toDate are required (yyyy-MM-dd)',
        });
      }

      const result = await repo.withTransaction((tx) =>
        tx.executeReprocess({
          fromDate,
          toDate,
          referenceDateTime,
          filterGroupName: groupName,
          filterPersonId: personId,
          actor: user.username,
        })
      );

      res.json({
        success: true,
        message: `Reprocessed attendance from ${fromDate} to ${toDate} deterministically`,
        reprocessedCount: result.reprocessedCount,
        succeededCount: result.succeededCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        skippedCount: result.skippedCount,
        errorsCount: result.errorsCount,
        unmappedScansCount: result.unmappedScansCount,
        noScheduleCount: result.noScheduleCount,
        skippedReasons: result.skippedReasons,
        changes: result.changes,
      });
    })
  );

  const handleSaveHRReview = asyncRoute(async (req: Request, res: Response) => {
    const user = (req as any).user as AuthenticatedUser;
    const { id } = req.params;
    const { reasonCode, reasonLabel, note, hrReviewStatus } = req.body || {};

    if (!reasonCode || typeof reasonCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุรหัสเหตุผล (reasonCode)',
      });
    }

    const resolvedStatus: EngineHRReviewStatus =
      hrReviewStatus === 'PENDING_REVIEW' ? 'PENDING_REVIEW' : 'REVIEWED';

    try {
      const updatedRecord = await repo.withTransaction((tx) =>
        tx.saveHRReviewAndNote({
          attendanceId: id,
          reasonCode,
          reasonLabel: reasonLabel || reasonCode,
          note: note || '',
          hrReviewStatus: resolvedStatus,
          authorUserId: user.userId,
          authorName: user.fullName || user.username,
        })
      );

      res.json({
        success: true,
        message: `บันทึกผลการตรวจสอบของ HR สำหรับรายการ ${id} สำเร็จ (คงสถานะ Attendance: ${updatedRecord.status})`,
        record: updatedRecord,
        note: updatedRecord.notes,
        noteHistory: updatedRecord.noteHistory,
      });
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        throw error;
      }
      res.status(404).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  router.post('/attendance/:id/notes', staffOrAdmin, handleSaveHRReview);
  router.post('/attendance/:id/review', staffOrAdmin, handleSaveHRReview);

  // ==========================================
  // 8. Reports (`STAFF`, `ADMIN`)
  // ==========================================
  router.get(
    '/reports/lateness',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const fromDate = (req.query.fromDate as string) || '2026-11-01';
      const toDate = (req.query.toDate as string) || '2026-11-06';
      const department = req.query.department as string | undefined;

      const attRes = await repo.getAttendance({
        fromDate,
        toDate,
        department,
        pageSize: 5000,
      });
      const records = attRes.items;

      const byPerson = new Map<
        string,
        {
          personId: string;
          fingleId: number;
          fullName: string;
          department: string;
          lateOccurrences: number;
          totalLateMinutes: number;
        }
      >();

      for (const r of records) {
        if (r.status === 'LATE') {
          if (!byPerson.has(r.personId)) {
            byPerson.set(r.personId, {
              personId: r.personId,
              fingleId: r.fingleId,
              fullName: r.fullName,
              department: r.department,
              lateOccurrences: 0,
              totalLateMinutes: 0,
            });
          }
          const entry = byPerson.get(r.personId)!;
          entry.lateOccurrences++;
          entry.totalLateMinutes += r.lateMinutes;
        }
      }

      const rankings = Array.from(byPerson.values()).sort(
        (a, b) =>
          b.lateOccurrences - a.lateOccurrences || b.totalLateMinutes - a.totalLateMinutes
      );

      res.json({
        success: true,
        fromDate,
        toDate,
        rankings,
      });
    })
  );

  // ==========================================
  // 9. HOSOffice Push Preparation & Preview (Phase 2 — §6 & §7)
  // ==========================================
  const handleHosOfficePushPreview = asyncRoute(async (req: Request, res: Response) => {
    const user = (req as any).user as AuthenticatedUser;
    const { attendanceIds } = req.body || {};

    if (!Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'attendanceIds array is required',
      });
    }

    const preview = await repo.withTransaction((tx) =>
      HosOfficeAdapter.validateAndPreviewPush({
        repository: tx,
        attendanceIds,
        actorUserId: user.userId,
        actorName: user.fullName || user.username,
      })
    );

    // Phase 2 strict rule (§6): Never report live push as executed/succeeded!
    res.json({
      success: true,
      livePushExecuted: false,
      ...preview,
    });
  });

  router.post('/hosoffice/push/preview', staffOrAdmin, handleHosOfficePushPreview);
  router.post('/hosoffice/push', staffOrAdmin, handleHosOfficePushPreview);

  router.get(
    '/hosoffice/push-history',
    staffOrAdmin,
    asyncRoute(async (_req: Request, res: Response) => {
      const history = await repo.getPushHistory();
      res.json({
        success: true,
        history,
      });
    })
  );

  // ==========================================
  // 10. System Logs & Connection Settings (§7)
  // ==========================================
  router.get(
    '/system-logs',
    staffOrAdmin,
    asyncRoute(async (req: Request, res: Response) => {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
      const logs = await repo.getAuditLogs(limit);
      res.json({
        success: true,
        logs,
      });
    })
  );

  router.get(
    '/settings/connections',
    adminOnly,
    asyncRoute(async (_req: Request, res: Response) => {
      const hosConfig = HosOfficeAdapter.getConnectionConfigStatus();
      const samAttHost = process.env.SAM_ATT_DB_HOST || '';
      const samAttUser = process.env.SAM_ATT_DB_USER || '';
      const samAttConfigured = Boolean(
        samAttHost && samAttUser && process.env.SAM_ATT_DB_PASSWORD
      );

      res.json({
        success: true,
        repositoryMode: repo.mode,
        architecture: {
          frontendPort: 3001,
          frontendPath: '/Sam_Att/',
          gatewayPort: 3002,
          gatewayPath: '/api/Sam_Att/',
          isolatedDatabase: 'samchuk_attendance',
        },
        samchukAttendanceDb: {
          configured: samAttConfigured,
          host: samAttHost || 'ยังไม่ได้ตั้งค่า (Awaiting SAM_ATT_DB_HOST)',
          port: Number(process.env.SAM_ATT_DB_PORT || 3306),
          database: 'samchuk_attendance',
          user: samAttUser || 'ยังไม่ได้ตั้งค่า (Awaiting SAM_ATT_DB_USER)',
          passwordMasked: '••••••••••••',
        },
        hosofficeDb: hosConfig,
      });
    })
  );

  // ==========================================
  // Error Handler: Database Unavailable (503) & Unexpected Errors (500)
  // Zero Mock Fallback in REAL Mode (§2 & §7)
  // ==========================================
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DatabaseUnavailableError) {
      return res.status(503).json({
        success: false,
        code: err.code,
        repositoryMode: repo.mode,
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal Server Error',
    });
  });

  return router;
}

export const samAttRouter: Router = createSamAttRouter();
export default samAttRouter;
