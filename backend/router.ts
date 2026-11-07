/**
 * Sam_Att V2 — Central API Gateway Mountable Router (Phase 1 + Phase 2)
 * Mounts at prefix: `/api/Sam_Att/` in Samchuk Hospital Central API Gateway (Port 3002)
 *
 * IMPORTANT ARCHITECTURE RULES (§1, §9, §10, §15):
 * 1. DO NOT CALL `app.listen()` or `server.listen()` IN THIS FILE.
 *    The hospital's Central API Gateway handles listening on Port 3002.
 * 2. Database isolation: Connects exclusively to `samchuk_attendance`.
 * 3. Does not alter or interfere with Procurement or Cash_Cheque modules.
 * 4. Enforces strict Role-Based Authorization (`ADMIN`, `RESPONSIBLE_STAFF`, `GENERAL_USER`)
 *    and guarantees `GENERAL_USER` can only access their own `PERSON_ID`.
 */

import { Router, Request, Response } from 'express';
import { SamAttRepository } from './repositories/samAttRepository';
import { createDefaultSeededRepository } from './repositories/defaultRepositorySeed';
import { AuthService } from './services/authService';
import { ScannerAdapter } from './services/scannerAdapter';
import { HosOfficeAdapter } from './services/hosofficeAdapter';
import { AuthenticatedUser, EngineHRReviewStatus } from './types';

export function createSamAttRouter(customRepository?: SamAttRepository): Router {
  const router = Router();
  const repo = customRepository || createDefaultSeededRepository();

  // ==========================================
  // 1. Public Authentication Endpoint (`/auth/login`)
  // ==========================================
  router.post('/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    const authRes = AuthService.authenticateCredentials(repo, username, password);
    if (!authRes.success) {
      return res.status(401).json({
        success: false,
        error: authRes.error,
      });
    }
    return res.json({
      success: true,
      token: authRes.token,
      user: authRes.user,
    });
  });

  // ==========================================
  // Middleware: Verify Session Token / Dev Persona from Authoritative Repository
  // ==========================================
  router.use(AuthService.createAuthMiddleware(repo));

  const staffOrAdmin = AuthService.requireRoles(['ADMIN', 'RESPONSIBLE_STAFF'], repo);
  const adminOnly = AuthService.requireRoles(['ADMIN'], repo);

  router.get('/auth/me', (req: Request, res: Response) => {
    const user = (req as any).user as AuthenticatedUser;
    res.json({
      success: true,
      user,
    });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const user = (req as any).user as AuthenticatedUser;
    repo.recordAuditLog({
      actor: user.username,
      actorName: user.fullName,
      actorRole: user.role,
      action: 'AUTH_LOGOUT',
      entityType: 'User',
      entityId: user.userId,
      summary: `ผู้ใช้งาน ${user.username} ออกจากระบบ`,
    });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // ==========================================
  // 2. My Attendance (`GENERAL_USER` strictly own-only — §10)
  // ==========================================
  router.get('/me/attendance', (req: Request, res: Response) => {
    const check = AuthService.verifyGeneralUserOwnAccess(req, res, repo);
    if (!check.allowed) return;

    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(200, Number(req.query.pageSize || 50));

    const result = repo.getAttendance({
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
  });

  router.get('/me/shifts', (req: Request, res: Response) => {
    const check = AuthService.verifyGeneralUserOwnAccess(req, res, repo);
    if (!check.allowed) return;

    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;

    const assignments = repo.getShiftAssignments({
      personId: check.personId,
      fromDate,
      toDate,
    });

    res.json({
      success: true,
      personId: check.personId,
      assignments,
    });
  });

  router.get('/me/raw-scans', (req: Request, res: Response) => {
    const check = AuthService.verifyGeneralUserOwnAccess(req, res, repo);
    if (!check.allowed) return;

    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(200, Number(req.query.pageSize || 50));

    const scans = repo.getRawScans({
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
  });

  // ==========================================
  // 3. Dashboard Summary (`STAFF`, `ADMIN` — §9: Does NOT fetch all raw scans)
  // ==========================================
  router.get('/dashboard/summary', staffOrAdmin, (req: Request, res: Response) => {
    const workDate = (req.query.workDate as string) || '2026-11-06';
    const dayRecords = repo.getAttendance({ workDate, pageSize: 5000 }).items;
    const activePersonnel = repo.getPersonnel({ activeOnly: true });

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
  });

  // ==========================================
  // 4. Personnel & HOSOffice Authoritative Sync (§8 & §9)
  // ==========================================
  router.get('/personnel', staffOrAdmin, (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const department = req.query.department as string | undefined;
    const personnelType = req.query.personnelType as string | undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

    const all = repo.getPersonnel({ search, department, personnelType, activeOnly: false });
    const start = (page - 1) * pageSize;

    res.json({
      success: true,
      total: all.length,
      page,
      pageSize,
      personnel: all.slice(start, start + pageSize),
    });
  });

  router.get('/personnel/mapping-issues', staffOrAdmin, (_req: Request, res: Response) => {
    const mappings = repo.getFingerprintMappings();
    const disputed = mappings.filter((m) => m.status === 'DISPUTED');
    const unmappedScans = repo.getRawScans({
      mappingStatus: 'PENDING_MAPPING',
      pageSize: 100,
    });

    res.json({
      success: true,
      disputedMappings: disputed,
      unmappedRawScansCount: unmappedScans.total,
      unmappedRawScansSample: unmappedScans.items,
    });
  });

  router.post('/personnel/sync', staffOrAdmin, async (req: Request, res: Response) => {
    try {
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
    } catch (err) {
      res.status(500).json({
        success: false,
        error: (err as Error).message,
      });
    }
  });

  // ==========================================
  // 5. Shifts & Shift Assignments (§7 & §9)
  // ==========================================
  router.get('/shifts', staffOrAdmin, (_req: Request, res: Response) => {
    res.json({
      success: true,
      shifts: repo.getShifts(),
    });
  });

  router.post('/shifts', staffOrAdmin, async (req: Request, res: Response) => {
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
  });

  router.get('/shift-assignments', staffOrAdmin, (req: Request, res: Response) => {
    const personId = req.query.personId as string | undefined;
    const workDate = req.query.workDate as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;

    const assignments = repo.getShiftAssignments({
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
  });

  router.post('/shift-assignments', staffOrAdmin, async (req: Request, res: Response) => {
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
  });

  router.delete('/shift-assignments/:id', staffOrAdmin, async (req: Request, res: Response) => {
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
  });

  // ==========================================
  // 6. Scanner Sync & Immutable Raw Scans (6-Field Contract — §2 & §9)
  // ==========================================
  router.post('/scanners/sync', staffOrAdmin, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as AuthenticatedUser;
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

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
    } catch (error) {
      res.status(400).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  router.get('/raw-scans', staffOrAdmin, (req: Request, res: Response) => {
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

    const result = repo.getRawScans({
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
  });

  // ==========================================
  // 7. Attendance, Attendance Review & Reprocess (§3, §4, §9)
  // ==========================================
  router.get('/attendance', staffOrAdmin, (req: Request, res: Response) => {
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

    const result = repo.getAttendance({
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
  });

  router.get('/attendance-review', staffOrAdmin, (req: Request, res: Response) => {
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const department = req.query.department as string | undefined;
    const status = req.query.status as string | undefined;
    const hrReviewStatus = req.query.hrReviewStatus as string | undefined;
    const search = req.query.search as string | undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 50)));

    const allInScope = repo.getAttendance({
      fromDate,
      toDate,
      department,
      search,
      pageSize: 10000,
    }).items;

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

    const paged = repo.getAttendance({
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
  });

  router.post(
    '/attendance/reprocess/preview',
    staffOrAdmin,
    (req: Request, res: Response) => {
      const { fromDate, toDate, groupName, personId, referenceDateTime } = req.body || {};
      if (!fromDate || !toDate || typeof fromDate !== 'string' || typeof toDate !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุช่วงวันที่ fromDate และ toDate (yyyy-MM-dd)',
        });
      }

      const preview = repo.previewReprocess({
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
    }
  );

  router.post('/attendance/reprocess', staffOrAdmin, async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  const handleSaveHRReview = async (req: Request, res: Response) => {
    try {
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
      res.status(404).json({
        success: false,
        error: (error as Error).message,
      });
    }
  };

  router.post('/attendance/:id/notes', staffOrAdmin, handleSaveHRReview);
  router.post('/attendance/:id/review', staffOrAdmin, handleSaveHRReview);

  // ==========================================
  // 8. Reports (`STAFF`, `ADMIN`)
  // ==========================================
  router.get('/reports/lateness', staffOrAdmin, (req: Request, res: Response) => {
    const fromDate = (req.query.fromDate as string) || '2026-11-01';
    const toDate = (req.query.toDate as string) || '2026-11-06';
    const department = req.query.department as string | undefined;

    const records = repo.getAttendance({
      fromDate,
      toDate,
      department,
      pageSize: 5000,
    }).items;

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
  });

  // ==========================================
  // 9. HOSOffice Push Preparation & Preview (Phase 2 — §11 & §15)
  // ==========================================
  const handleHosOfficePushPreview = async (req: Request, res: Response) => {
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

    // Phase 2 strict rule (§11 & §15): Never report live push as executed/succeeded!
    res.json({
      success: true,
      livePushExecuted: false,
      ...preview,
    });
  };

  router.post('/hosoffice/push/preview', staffOrAdmin, handleHosOfficePushPreview);
  router.post('/hosoffice/push', staffOrAdmin, handleHosOfficePushPreview);

  router.get('/hosoffice/push-history', staffOrAdmin, (_req: Request, res: Response) => {
    res.json({
      success: true,
      history: repo.getPushHistory(),
    });
  });

  // ==========================================
  // 10. System Logs & Connection Settings (§9, §10, §15)
  // ==========================================
  router.get('/system-logs', staffOrAdmin, (req: Request, res: Response) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    res.json({
      success: true,
      logs: repo.getAuditLogs(limit),
    });
  });

  router.get('/settings/connections', adminOnly, (_req: Request, res: Response) => {
    const hosConfig = HosOfficeAdapter.getConnectionConfigStatus();
    const samAttHost = process.env.SAM_ATT_DB_HOST || '';
    const samAttUser = process.env.SAM_ATT_DB_USER || '';
    const samAttConfigured = Boolean(samAttHost && samAttUser && process.env.SAM_ATT_DB_PASSWORD);

    res.json({
      success: true,
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
  });

  return router;
}

export const samAttRouter: Router = createSamAttRouter();
export default samAttRouter;
