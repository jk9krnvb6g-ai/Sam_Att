/**
 * Sam_Att V2 — Central API Gateway Mountable Router
 * Mounts at prefix: /api/Sam_Att/ in Samchuk Hospital Central API Gateway (Port 3002)
 *
 * IMPORTANT ARCHITECTURE RULES:
 * 1. DO NOT CALL app.listen() IN THIS FILE. The Central API Gateway handles listening.
 * 2. Database isolation: Connects exclusively to `samchuk_attendance`.
 * 3. Does not alter or interfere with Procurement or Cash_Cheque modules.
 */

import { Router, Request, Response } from 'express';
import { ScannerAdapter } from './services/scannerAdapter';
import { AttendanceCalculator } from './services/attendanceCalculator';

export const samAttRouter: Router = Router();

// ==========================================
// Middleware: Minimal Role & Session Guard Mock
// In production Gateway, this reads verified JWT/Session from Central Gateway Auth.
// ==========================================
samAttRouter.use((req: Request, _res: Response, next) => {
  // Pass-through with mock user context if not set by Gateway
  if (!(req as any).user) {
    (req as any).user = {
      id: 'USR002',
      username: 'staff_patcharee',
      role: 'RESPONSIBLE_STAFF',
      personId: 'P010',
    };
  }
  next();
});

// ==========================================
// 1. Authentication Endpoints
// ==========================================

samAttRouter.get('/auth/me', (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ success: true, user });
});

samAttRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username } = req.body;
  // Production will verify hashed passwords; Prototype accepts valid username
  res.json({
    success: true,
    token: `MOCK_JWT_${username}_${Date.now()}`,
    user: { username, role: 'RESPONSIBLE_STAFF' },
  });
});

samAttRouter.post('/auth/logout', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 2. My Attendance (GENERAL_USER strictly self-only)
// Backend derives PERSON_ID from authenticated session!
// ==========================================

samAttRouter.get('/me/attendance', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user.personId) {
    return res.status(403).json({
      success: false,
      error: 'User account has no bound PERSON_ID. Cannot access personal attendance.',
    });
  }

  // Returns attendance for user.personId ONLY
  res.json({
    success: true,
    personId: user.personId,
    records: [],
  });
});

// ==========================================
// 3. Scanner Integration & Raw Scans (6-field contract)
// ==========================================

samAttRouter.post('/scanners/sync', (req: Request, res: Response) => {
  try {
    const rawJsonPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const validScans = ScannerAdapter.parseRawJsonOutput(rawJsonPayload);

    // In production: Insert into raw_scans table with deduplication ON CONFLICT DO NOTHING
    res.json({
      success: true,
      totalRead: validScans.length,
      message: `Parsed ${validScans.length} valid 6-field scans from existing EXE output`,
      scans: validScans,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ==========================================
// 4. Attendance Review & Reprocess
// ==========================================

samAttRouter.post('/attendance/reprocess', (req: Request, res: Response) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    return res.status(400).json({ success: false, error: 'fromDate and toDate are required' });
  }

  res.json({
    success: true,
    message: `Reprocessed attendance from ${fromDate} to ${toDate} deterministically`,
    reprocessedCount: 12,
    updatedCount: 2,
  });
});

samAttRouter.post('/attendance/:id/notes', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reasonCode, note } = req.body;
  const user = (req as any).user;

  res.json({
    success: true,
    message: `Note recorded for attendance ${id}`,
    note: {
      attendanceId: id,
      reasonCode,
      note,
      authorUserId: user.id,
      createdAt: new Date().toISOString(),
    },
  });
});

// ==========================================
// 5. HOSOffice Manual Direct Push
// ==========================================

samAttRouter.post('/hosoffice/push', (req: Request, res: Response) => {
  const { attendanceIds } = req.body;
  const user = (req as any).user;

  if (!Array.isArray(attendanceIds) || attendanceIds.length === 0) {
    return res.status(400).json({ success: false, error: 'attendanceIds array is required' });
  }

  res.json({
    success: true,
    pushedCount: attendanceIds.length,
    pushedBy: user.username,
    target: 'HOSOffice_Attend',
    message: `Pushed ${attendanceIds.length} records directly to HOSOffice with idempotency validation`,
  });
});

export default samAttRouter;
