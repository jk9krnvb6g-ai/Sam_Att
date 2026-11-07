/**
 * Default Repository Seeder for Sam_Att V2 Backend Gateway
 * Bridges initial dataset into `SamAttRepository` when no custom repository instance is injected.
 */

import {
  SamAttRepository,
  RepositoryUserAccount,
  ProductionRepositoryConfigurationError,
} from './samAttRepository';
import { AuthService } from '../services/authService';
import {
  MOCK_PERSONNEL,
  MOCK_SHIFTS,
  MOCK_SHIFT_ASSIGNMENTS,
  MOCK_RAW_SCANS,
  MOCK_ATTENDANCE,
  MOCK_HISTORICAL_ATTENDANCE,
  MOCK_USERS,
} from '../../src/mock/mockData';
import {
  EngineAttendanceRecord,
  EngineFingerprintMapping,
  EnginePersonnel,
  EngineShiftAssignment,
  EngineShiftConfig,
  RawScanDto,
  ShiftCategoryCode,
} from '../types';

export function createDefaultSeededRepository(): SamAttRepository {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.SAM_ATT_REPO_MODE?.trim() === 'REAL'
  ) {
    throw new ProductionRepositoryConfigurationError(
      'CRITICAL CONFIGURATION ERROR: Seeded Mock Repository (createDefaultSeededRepository) is strictly prohibited in Production or REAL mode.'
    );
  }
  const users: RepositoryUserAccount[] = MOCK_USERS.map((u) => ({
    id: u.id,
    username: u.username,
    // Default password for dev/testing: `${u.username}_pass`
    passwordHash: AuthService.hashPassword(`${u.username}_pass`),
    fullName: u.fullName,
    role: u.role,
    personId: u.personId,
    department: u.department,
    position: u.position,
    active: u.active,
  }));

  const personnel: EnginePersonnel[] = MOCK_PERSONNEL.map((p) => ({
    personId: p.personId,
    fingleId: p.fingleId,
    prefix: p.prefix,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    department: p.department,
    groupName: p.groupName,
    personnelType: p.personnelType,
    active: p.active,
    lastHosOfficeSync: p.lastHosOfficeSync,
  }));

  const fingerprintMappings: EngineFingerprintMapping[] = personnel
    .filter((p) => p.fingleId > 0)
    .map((p) => ({
      id: `FM_${p.personId}_${p.fingleId}`,
      personId: p.personId,
      fingleId: p.fingleId,
      effectiveFrom: '2020-01-01',
      effectiveTo: null,
      status: 'ACTIVE',
    }));

  const shifts: EngineShiftConfig[] = MOCK_SHIFTS.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    category: (s.category || 'MORNING') as ShiftCategoryCode,
    startTime: s.startTime,
    endTime: s.endTime,
    crossMidnight: s.crossMidnight,
    graceMinutes: s.graceMinutes,
    earlyScanWindowMinutes: s.earlyScanWindowMinutes,
    lateScanWindowMinutes: s.lateScanWindowMinutes,
    active: s.active,
  }));

  const assignments: EngineShiftAssignment[] = MOCK_SHIFT_ASSIGNMENTS.map((a) => ({
    id: a.id,
    personId: a.personId,
    workDate: a.workDate,
    shiftId: a.shiftId,
    assignmentType: a.assignmentType,
    shiftName: a.shiftName,
    shiftStartTime: a.shiftStartTime,
    shiftEndTime: a.shiftEndTime,
    crossMidnight: a.crossMidnight,
    graceMinutes: a.graceMinutes,
    shiftCategory: (a.shiftCategory || 'MORNING') as ShiftCategoryCode,
    status: 'ACTIVE',
  }));

  const rawScans: RawScanDto[] = MOCK_RAW_SCANS.map((r) => ({
    machineNo: r.machineNo,
    enrollNumber: r.enrollNumber,
    scanDateTime: r.scanDateTime,
    verifyMode: r.verifyMode,
    inOutMode: r.inOutMode,
    workCode: r.workCode,
  }));

  const attendance: EngineAttendanceRecord[] = [
    ...MOCK_ATTENDANCE,
    ...MOCK_HISTORICAL_ATTENDANCE,
  ].map((a) => ({
    id: a.id,
    businessKey: `${a.personId}_${a.workDate}_${a.shiftId}`,
    personId: a.personId,
    fingleId: a.fingleId,
    fullName: a.fullName,
    department: a.department,
    groupName: a.groupName,
    personnelType: a.personnelType,
    workDate: a.workDate,
    shiftId: a.shiftId,
    shiftName: a.shiftName,
    shiftStartTime: a.shiftStartTime,
    shiftEndTime: a.shiftEndTime,
    crossMidnight: Boolean(a.crossMidnight),
    graceMinutes: a.graceMinutes ?? 15,
    shiftCategory: (a.shiftCategory || 'MORNING') as ShiftCategoryCode,
    checkInAt: a.checkInAt,
    checkOutAt: a.checkOutAt,
    checkInDateTime: a.checkInAt ? `${a.workDate} ${a.checkInAt}` : null,
    checkOutDateTime: a.checkOutAt ? `${a.workDate} ${a.checkOutAt}` : null,
    lateMinutes: a.lateMinutes,
    earlyCheckoutMinutes: a.earlyCheckoutMinutes,
    hasMissingCheckout: Boolean(a.hasMissingCheckout || a.status === 'MISSING_CHECKOUT'),
    status: a.status,
    evaluationState: 'EVALUATED',
    hrReviewStatus:
      a.hrReviewStatus ||
      (a.notes
        ? 'REVIEWED'
        : a.status === 'NORMAL'
        ? 'NOT_REQUIRED'
        : 'PENDING_REVIEW'),
    rawScanInId: a.rawScanInId ?? null,
    rawScanOutId: a.rawScanOutId ?? null,
    relatedRawScanIds: [a.rawScanInId, a.rawScanOutId].filter(
      (x): x is string => Boolean(x)
    ),
    computedAt: a.computedAt,
    notes: a.notes ? { ...a.notes } : undefined,
    noteHistory: a.noteHistory
      ? a.noteHistory.map((nh) => ({
          ...nh,
          attendanceId: a.id,
        }))
      : undefined,
    isPushedToHosOffice: Boolean(a.isPushedToHosOffice),
    lastPushedAt: a.lastPushedAt ?? null,
    modifiedAfterPush: Boolean(a.modifiedAfterPush),
  }));

  return new SamAttRepository({
    users,
    personnel,
    fingerprintMappings,
    shifts,
    assignments,
    rawScans,
    attendance,
  });
}
