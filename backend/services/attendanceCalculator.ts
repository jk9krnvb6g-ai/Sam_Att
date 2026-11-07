/**
 * Core Attendance Calculation & Reprocess Engine (Phase 1 — §3 & §4)
 *
 * Deterministic, Idempotent, Multi-Shift & Cross-Midnight Aware.
 *
 * CRITICAL RULES (§3 & §4):
 * 1. One person may have multiple shifts on the same day, provided real time intervals do not overlap.
 * 2. Shift end time equal to next shift start time (e.g. 08:00-16:00 and 16:00-24:00) is allowed.
 * 3. Uses full real date + time (UTC-neutral epoch ms) for cross-midnight and next-day scan matching.
 * 4. NEVER blindly uses first scan and last scan of the calendar day across all shifts.
 * 5. Matches Raw Scans to each shift using bounded check-in/check-out windows and prevents reuse of the same Raw Scan ID across shifts.
 * 6. Calculates lateness strictly from shiftStartTime + graceMinutes.
 * 7. Does NOT conclude MISSING_CHECKOUT before shift end time.
 * 8. Does NOT conclude NO_SCAN before shift evaluation cutoff (future/in-progress shifts).
 * 9. Strictly separates NO_SCHEDULE, PENDING_MAPPING, NO_SCAN, and MISSING_CHECKOUT.
 * 10. NEVER changes an abnormal AttendanceStatus to NORMAL just because an HR note exists.
 * 11. NEVER fabricates Raw Scan events or check-in/check-out times.
 * 12. When a scan timestamp cannot be reliably classified as check-in vs check-out, flags `ambiguousScanFlag: true` and `hrReviewStatus: 'PENDING_REVIEW'`.
 */

import {
  EngineAttendanceRecord,
  EngineAttendanceStatus,
  EngineEvaluationState,
  EngineFingerprintMapping,
  EngineHRReviewStatus,
  EnginePersonnel,
  EngineShiftAssignment,
  EngineShiftConfig,
  ReprocessExecutionResult,
  ReprocessPreviewResult,
  ShiftCategoryCode,
  ValidatedRawScanEvent,
} from '../types';
import { ScannerAdapter } from './scannerAdapter';

export interface ShiftDefinition {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  graceMinutes: number;
  crossMidnight: boolean;
}

export interface AbsoluteShiftWindow {
  workDate: string;
  shiftStartMs: number;
  shiftEndMs: number;
  graceCutoffMs: number;
  earlyCheckInStartMs: number;
  lateCheckInMaxMs: number;
  earlyCheckOutMinMs: number;
  lateCheckOutEndMs: number;
  crossMidnight: boolean;
}

export class AttendanceCalculator {
  public static readonly TIMEZONE = 'Asia/Bangkok';
  public static readonly TIMEZONE_OFFSET = '+07:00';

  /**
   * Parse "HH:mm" or "HH:mm:ss" into minutes from 00:00 (supports "24:00").
   */
  public static parseTimeToMinutes(timeStr: string): number {
    if (timeStr === '24:00' || timeStr === '24:00:00') return 1440;
    const parts = timeStr.trim().split(':').map(Number);
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    return hours * 60 + minutes;
  }

  /**
   * Parse "yyyy-MM-dd" into UTC-neutral epoch ms representing Asia/Bangkok wall-clock date.
   */
  public static parseWorkDateToEpochMs(workDate: string): number {
    const [y, m, d] = workDate.trim().split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0);
  }

  /**
   * Format UTC-neutral epoch ms back to Asia/Bangkok wall-clock "yyyy-MM-dd HH:mm:ss" and "HH:mm:ss".
   */
  public static formatEpochMs(epochMs: number): {
    dateTimeStr: string;
    dateStr: string;
    timeStr: string;
  } {
    const dt = new Date(epochMs);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const mi = String(dt.getUTCMinutes()).padStart(2, '0');
    const ss = String(dt.getUTCSeconds()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const timeStr = `${hh}:${mi}:${ss}`;
    return {
      dateTimeStr: `${dateStr} ${timeStr}`,
      dateStr,
      timeStr,
    };
  }

  /**
   * Deterministic late calculation (time-of-day helper):
   * lateMinutes = max(0, actualCheckIn - shiftStart - grace)
   */
  public static calculateLate(
    checkInTimeStr: string,
    shift: ShiftDefinition
  ): { isLate: boolean; lateMinutes: number } {
    let checkInMins = this.parseTimeToMinutes(checkInTimeStr);
    const shiftStartMins = this.parseTimeToMinutes(shift.startTime);

    // Handle cross-midnight check-in slightly after midnight when shift starts late night (e.g. 23:30)
    if (shift.crossMidnight && shiftStartMins >= 1200 && checkInMins < 360) {
      checkInMins += 1440;
    }
    // Handle early check-in before midnight when shift starts at 00:00 (e.g. checked in at 23:50 on previous day)
    if (shiftStartMins < 180 && checkInMins >= 1260) {
      checkInMins -= 1440;
    }

    const allowedLimit = shiftStartMins + shift.graceMinutes;

    if (checkInMins > allowedLimit) {
      return {
        isLate: true,
        lateMinutes: checkInMins - allowedLimit,
      };
    }

    return {
      isLate: false,
      lateMinutes: 0,
    };
  }

  /**
   * Epoch-aware deterministic late calculation (accurate to minute boundary across midnight).
   */
  public static calculateLateFromEpoch(
    checkInEpochMs: number,
    shiftStartMs: number,
    graceMinutes: number
  ): { isLate: boolean; lateMinutes: number } {
    // Compare at minute precision (flooring seconds so 08:15:45 with cutoff 08:15:00 -> check minute vs cutoff)
    const checkInMinEpoch = Math.floor(checkInEpochMs / 60000);
    const shiftStartMinEpoch = Math.floor(shiftStartMs / 60000);
    const cutoffMinEpoch = shiftStartMinEpoch + graceMinutes;

    if (checkInMinEpoch > cutoffMinEpoch) {
      return {
        isLate: true,
        lateMinutes: checkInMinEpoch - cutoffMinEpoch,
      };
    }
    return {
      isLate: false,
      lateMinutes: 0,
    };
  }

  /**
   * Create unique fingerprint for raw scan deduplication:
   * Composite: machineNo + '_' + enrollNumber + '_' + scanDateTime
   */
  public static generateDedupeKey(
    machineNo: number,
    enrollNumber: number,
    scanDateTime: string
  ): string {
    return ScannerAdapter.generateDedupeKey(machineNo, enrollNumber, scanDateTime);
  }

  /**
   * Compute exact epoch-ms interval and scan matching windows for a shift on `workDate` (§3 Rules 1, 2, 3, 5).
   */
  public static computeShiftWindow(
    workDate: string,
    shift: Pick<
      EngineShiftConfig,
      | 'startTime'
      | 'endTime'
      | 'crossMidnight'
      | 'graceMinutes'
      | 'earlyScanWindowMinutes'
      | 'lateScanWindowMinutes'
    >
  ): AbsoluteShiftWindow {
    const dayStartMs = this.parseWorkDateToEpochMs(workDate);
    const startMins = this.parseTimeToMinutes(shift.startTime);
    let endMins = this.parseTimeToMinutes(shift.endTime);

    let isCrossMidnight = Boolean(shift.crossMidnight);

    if (endMins === 0 && startMins > 0) {
      // e.g. 16:00 - 00:00 (24:00) ends at midnight of workDate
      endMins = 1440;
    } else if (endMins <= startMins) {
      // e.g. 16:00 - 08:00 (bAfternoon-Night), 23:30 - 07:30 (Night), or 08:00 - 08:00 (24h All-Day)
      endMins += 1440;
      isCrossMidnight = true;
    }

    const shiftStartMs = dayStartMs + startMins * 60000;
    const shiftEndMs = dayStartMs + endMins * 60000;
    const durationMs = shiftEndMs - shiftStartMs;

    const graceMinutes = shift.graceMinutes ?? 15;
    const earlyWindowMins = shift.earlyScanWindowMinutes ?? 180;
    const lateWindowMins = shift.lateScanWindowMinutes ?? 240;

    const graceCutoffMs = shiftStartMs + graceMinutes * 60000;
    const earlyCheckInStartMs = shiftStartMs - earlyWindowMins * 60000;

    // Max check-in time is up to 45% of shift duration (or max 3.5 hours after start)
    const lateCheckInOffsetMs = Math.min(Math.floor(durationMs * 0.45), 210 * 60000);
    const lateCheckInMaxMs = shiftStartMs + lateCheckInOffsetMs;

    // Earliest normal check-out is at least 55% into shift (or within 2 hours before shiftEnd)
    const earlyCheckOutOffsetMs = Math.min(Math.floor(durationMs * 0.45), 120 * 60000);
    const earlyCheckOutMinMs = shiftEndMs - earlyCheckOutOffsetMs;
    const lateCheckOutEndMs = shiftEndMs + lateWindowMins * 60000;

    return {
      workDate,
      shiftStartMs,
      shiftEndMs,
      graceCutoffMs,
      earlyCheckInStartMs,
      lateCheckInMaxMs,
      earlyCheckOutMinMs,
      lateCheckOutEndMs,
      crossMidnight: isCrossMidnight,
    };
  }

  /**
   * Check whether two shift assignments overlap in real epoch time (§3 Rules 1 & 2).
   * Touching boundary (endA === startB, e.g. 08:00-16:00 and 16:00-24:00) is NOT an overlap.
   */
  public static doShiftWindowsOverlap(
    winA: Pick<AbsoluteShiftWindow, 'shiftStartMs' | 'shiftEndMs'>,
    winB: Pick<AbsoluteShiftWindow, 'shiftStartMs' | 'shiftEndMs'>
  ): boolean {
    return Math.max(winA.shiftStartMs, winB.shiftStartMs) < Math.min(winA.shiftEndMs, winB.shiftEndMs);
  }

  /**
   * Validate a person's shift assignments to detect any overlapping real intervals (§3 Rule 1 & 2).
   */
  public static validateNonOverlappingAssignments(
    assignments: ReadonlyArray<{
      assignment: EngineShiftAssignment;
      shift: EngineShiftConfig;
    }>
  ): {
    valid: boolean;
    overlaps: Array<{
      firstAssignmentId: string;
      secondAssignmentId: string;
      reason: string;
    }>;
  } {
    const items = assignments
      .filter((a) => a.assignment.status !== 'CANCELLED')
      .map((a) => ({
        ...a,
        window: this.computeShiftWindow(a.assignment.workDate, a.shift),
      }))
      .sort((a, b) => a.window.shiftStartMs - b.window.shiftStartMs);

    const overlaps: Array<{
      firstAssignmentId: string;
      secondAssignmentId: string;
      reason: string;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (this.doShiftWindowsOverlap(a.window, b.window)) {
          overlaps.push({
            firstAssignmentId: a.assignment.id,
            secondAssignmentId: b.assignment.id,
            reason: `กะ "${a.shift.name}" (${a.assignment.workDate} ${a.shift.startTime}-${a.shift.endTime}) ทับซ้อนกับกะ "${b.shift.name}" (${b.assignment.workDate} ${b.shift.startTime}-${b.shift.endTime})`,
          });
        }
      }
    }

    return {
      valid: overlaps.length === 0,
      overlaps,
    };
  }

  /**
   * Evaluate all shifts and raw scans across a date range (`fromDate` .. `toDate`)
   * with full support for:
   * - Multiple shifts on the same day
   * - Cross-midnight shifts & next-day morning check-out scans
   * - Double shifts (Morning-Afternoon, Afternoon-Night, All-Day)
   * - Non-reuse of the same Raw Scan ID across shifts
   * - In-progress & Future shift protection
   * - Ambiguous scan detection (requiring HR Review instead of guessing)
   * - Preservation of HR Notes & Review History on Reprocess
   */
  public static evaluateAndReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string; // "yyyy-MM-dd HH:mm:ss" (defaults to "2026-11-06 23:59:59")
    personnel: ReadonlyArray<EnginePersonnel>;
    shifts: ReadonlyArray<EngineShiftConfig>;
    assignments: ReadonlyArray<EngineShiftAssignment>;
    rawScans: ReadonlyArray<{
      id?: string;
      machineNo: number;
      enrollNumber: number;
      scanDateTime: string;
      verifyMode: number;
      inOutMode: number;
      workCode: number | null;
      importedAt?: string;
    }>;
    fingerprintMappings?: ReadonlyArray<EngineFingerprintMapping>;
    existingAttendance?: ReadonlyArray<EngineAttendanceRecord>;
    filterGroupName?: string;
    filterPersonId?: string;
  }): ReprocessExecutionResult {
    const referenceDateTime = params.referenceDateTime || '2026-11-06 23:59:59';
    const referenceEpochMs =
      ScannerAdapter.parseScanDateTimeToEpochMs(referenceDateTime) ??
      Date.UTC(2026, 10, 6, 23, 59, 59);
    const computedAt = referenceDateTime;

    // 1. Validate & deduplicate all raw scans (including next day after toDate for cross-midnight checkouts!)
    const toDateNextDayMs = this.parseWorkDateToEpochMs(params.toDate) + 2 * 86400000;
    const fromDatePrevDayMs = this.parseWorkDateToEpochMs(params.fromDate) - 86400000;

    const ingested = ScannerAdapter.ingestAndDeduplicateScans({
      incomingScans: params.rawScans,
      existingDedupeKeys: new Set<string>(),
      personnel: params.personnel,
      fingerprintMappings: params.fingerprintMappings,
      importedAt: computedAt,
    });

    // Preserve caller-supplied rawScan IDs when available
    const rawIdByDedupeKey = new Map<string, string>();
    params.rawScans.forEach((r) => {
      if (r.id) {
        const key = this.generateDedupeKey(r.machineNo, r.enrollNumber, r.scanDateTime);
        if (!rawIdByDedupeKey.has(key)) {
          rawIdByDedupeKey.set(key, r.id);
        }
      }
    });

    const allValidatedScans: ValidatedRawScanEvent[] = ingested.newEvents
      .map((ev) => {
        const preservedId = rawIdByDedupeKey.get(ev.dedupeKey);
        return preservedId ? Object.freeze({ ...ev, id: preservedId }) : ev;
      })
      .filter((ev) => ev.epochMs >= fromDatePrevDayMs && ev.epochMs <= toDateNextDayMs)
      .sort((a, b) => a.epochMs - b.epochMs);

    // Separate unmapped scans in the requested [fromDate, toDate] range
    const unmappedEvents = allValidatedScans.filter(
      (ev) =>
        ev.mappingStatus !== 'MAPPED' &&
        ev.workDatePart >= params.fromDate &&
        ev.workDatePart <= params.toDate
    );

    const skippedReasons: Array<{ label: string; reason: string }> = [];
    unmappedEvents.forEach((ev) => {
      skippedReasons.push({
        label: `enrollNumber #${ev.enrollNumber} (${ev.scanDateTime})`,
        reason:
          ev.mappingStatus === 'DISPUTED_MAPPING'
            ? 'พบ FINGLE_ID ซ้ำซ้อนหลายบุคลากร (Disputed Mapping) ต้องตรวจสอบ'
            : 'ไม่พบ FINGLE_ID Mapping กับบุคลากรในระบบ (PENDING_MAPPING)',
      });
    });

    // Index shifts and personnel
    const shiftMap = new Map<string, EngineShiftConfig>();
    params.shifts.forEach((s) => shiftMap.set(s.id, s));

    const personnelMap = new Map<string, EnginePersonnel>();
    params.personnel.forEach((p) => personnelMap.set(p.personId, p));

    // Index existing attendance by businessKey `${personId}_${workDate}_${shiftId}` AND by id
    const existingByBusinessKey = new Map<string, EngineAttendanceRecord>();
    (params.existingAttendance || []).forEach((rec) => {
      const bKey = rec.businessKey || `${rec.personId}_${rec.workDate}_${rec.shiftId}`;
      existingByBusinessKey.set(bKey, rec);
    });

    const prevDateStr = this.formatEpochMs(fromDatePrevDayMs).dateStr;

    // Filter active assignments in [fromDate, toDate] AND cross-midnight assignments on prevDateStr
    // matching optional group/person filter
    const targetAssignments = params.assignments.filter((asgn) => {
      if (asgn.status === 'CANCELLED') return false;
      const isTargetRange = asgn.workDate >= params.fromDate && asgn.workDate <= params.toDate;
      const template = shiftMap.get(asgn.shiftId);
      const isPrevCrossMidnight =
        asgn.workDate === prevDateStr &&
        Boolean(asgn.crossMidnight ?? template?.crossMidnight ?? false);
      if (!isTargetRange && !isPrevCrossMidnight) return false;
      const person = personnelMap.get(asgn.personId);
      if (!person) return false;
      if (
        params.filterGroupName &&
        params.filterGroupName !== 'ALL' &&
        person.groupName !== params.filterGroupName &&
        person.department !== params.filterGroupName
      ) {
        return false;
      }
      if (
        params.filterPersonId &&
        params.filterPersonId !== 'ALL' &&
        person.personId !== params.filterPersonId
      ) {
        return false;
      }
      return true;
    });

    // Group assignments by personId so we can resolve multi-shift and cross-midnight windows per person
    const assignmentsByPerson = new Map<string, EngineShiftAssignment[]>();
    targetAssignments.forEach((asgn) => {
      if (!assignmentsByPerson.has(asgn.personId)) {
        assignmentsByPerson.set(asgn.personId, []);
      }
      assignmentsByPerson.get(asgn.personId)!.push(asgn);
    });

    // Group mapped raw scans by personId
    const scansByPerson = new Map<string, ValidatedRawScanEvent[]>();
    allValidatedScans.forEach((ev) => {
      if (ev.mappingStatus === 'MAPPED' && ev.mappedPersonId) {
        if (!scansByPerson.has(ev.mappedPersonId)) {
          scansByPerson.set(ev.mappedPersonId, []);
        }
        scansByPerson.get(ev.mappedPersonId)!.push(ev);
      }
    });

    // Track globally consumed raw scan IDs per person so the same RawScanEvent is NEVER reused across shifts (§3 Rule 6)
    const usedScanIdsByPerson = new Map<string, Set<string>>();

    const resultingRecords: EngineAttendanceRecord[] = [];
    const changes: ReprocessExecutionResult['changes'] = [];
    let reprocessedCount = 0;
    let succeededCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    // Process each person's assigned shifts in chronological order
    for (const [personId, personAssignments] of assignmentsByPerson.entries()) {
      const person = personnelMap.get(personId)!;
      const personScans = (scansByPerson.get(personId) || []).sort(
        (a, b) => a.epochMs - b.epochMs
      );
      const usedScanIds = new Set<string>();
      usedScanIdsByPerson.set(personId, usedScanIds);

      // Build resolved shift descriptors with exact epoch windows
      const resolvedShifts = personAssignments
        .map((asgn) => {
          const template = shiftMap.get(asgn.shiftId);
          const effectiveShift: EngineShiftConfig = {
            id: asgn.shiftId,
            code: template?.code || asgn.shiftId,
            name: asgn.shiftName || template?.name || asgn.shiftId,
            category:
              asgn.shiftCategory ||
              template?.category ||
              ('MORNING' as ShiftCategoryCode),
            startTime: asgn.shiftStartTime || template?.startTime || '08:00',
            endTime: asgn.shiftEndTime || template?.endTime || '16:00',
            crossMidnight:
              asgn.crossMidnight ?? template?.crossMidnight ?? false,
            graceMinutes: asgn.graceMinutes ?? template?.graceMinutes ?? 15,
            earlyScanWindowMinutes: template?.earlyScanWindowMinutes ?? 180,
            lateScanWindowMinutes: template?.lateScanWindowMinutes ?? 240,
            active: template?.active ?? true,
          };
          const window = this.computeShiftWindow(asgn.workDate, effectiveShift);
          return {
            assignment: asgn,
            shift: effectiveShift,
            window,
          };
        })
        .sort((a, b) => a.window.shiftStartMs - b.window.shiftStartMs);

      for (let idx = 0; idx < resolvedShifts.length; idx++) {
        const current = resolvedShifts[idx];
        const prev = idx > 0 ? resolvedShifts[idx - 1] : null;
        const next = idx < resolvedShifts.length - 1 ? resolvedShifts[idx + 1] : null;
        const isContextOnlyShift = current.assignment.workDate < params.fromDate;

        const businessKey = `${personId}_${current.assignment.workDate}_${current.shift.id}`;
        const existingRec = existingByBusinessKey.get(businessKey);

        // Check if shift is in the FUTURE (referenceEpochMs < shiftStartMs) (§3 Rule 9, §5 Test 14)
        if (referenceEpochMs < current.window.shiftStartMs) {
          if (!isContextOnlyShift) {
            skippedReasons.push({
              label: `${person.prefix}${person.firstName} ${person.lastName} (${current.assignment.workDate} · ${current.shift.name})`,
              reason: 'กะในอนาคตยังไม่ถึงเวลาเริ่มกะ (ไม่สรุปเป็น NO_SCAN)',
            });
          }
          continue;
        }

        if (!isContextOnlyShift) {
          reprocessedCount++;
        }

        // Calculate bounded window considering adjacent shifts on the same/adjacent day
        let effectiveWindowStartMs = current.window.earlyCheckInStartMs;
        if (prev) {
          if (prev.window.shiftEndMs === current.window.shiftStartMs) {
            // Back-to-back shifts (e.g. 08:00-16:00 and 16:00-24:00):
            // Check-in for the second shift can start up to 45 mins before boundary if not already used by prev shift
            effectiveWindowStartMs = Math.max(
              effectiveWindowStartMs,
              current.window.shiftStartMs - 45 * 60000
            );
          } else if (prev.window.shiftEndMs < current.window.shiftStartMs) {
            const midpointMs = Math.floor(
              (prev.window.shiftEndMs + current.window.shiftStartMs) / 2
            );
            effectiveWindowStartMs = Math.max(effectiveWindowStartMs, midpointMs);
          }
        }

        let effectiveWindowEndMs = current.window.lateCheckOutEndMs;
        if (next) {
          if (current.window.shiftEndMs === next.window.shiftStartMs) {
            // Back-to-back shifts:
            // Look ahead to see if there are 2 distinct scans near the boundary or if next shift has its own check-in
            const boundaryMs = current.window.shiftEndMs;
            const scansNearBoundary = personScans.filter(
              (s) =>
                !usedScanIds.has(s.id) &&
                s.epochMs >= boundaryMs - 30 * 60000 &&
                s.epochMs <= boundaryMs + 45 * 60000
            );
            if (scansNearBoundary.length >= 2) {
              // First scan near boundary is checkout for current shift; second scan is reserved for next shift check-in
              effectiveWindowEndMs = scansNearBoundary[0].epochMs;
            } else {
              effectiveWindowEndMs = boundaryMs + 30 * 60000;
            }
          } else if (current.window.shiftEndMs < next.window.shiftStartMs) {
            const midpointMs = Math.floor(
              (current.window.shiftEndMs + next.window.shiftStartMs) / 2
            );
            effectiveWindowEndMs = Math.min(effectiveWindowEndMs, midpointMs);
          }
        }

        // Gather unused candidate scans in [effectiveWindowStartMs, effectiveWindowEndMs]
        const candidateScans = personScans.filter(
          (s) =>
            !usedScanIds.has(s.id) &&
            s.epochMs >= effectiveWindowStartMs &&
            s.epochMs <= effectiveWindowEndMs
        );

        const isShiftStillInProgress = referenceEpochMs < current.window.shiftEndMs;

        let checkInScan: ValidatedRawScanEvent | null = null;
        let checkOutScan: ValidatedRawScanEvent | null = null;
        let ambiguousScanFlag = false;
        let evaluationNote: string | undefined;

        if (candidateScans.length > 0) {
          // Classify scans into Check-In Zone, Middle Zone, and Check-Out Zone
          const checkInCandidates = candidateScans.filter(
            (s) => s.epochMs <= current.window.lateCheckInMaxMs
          );

          if (checkInCandidates.length > 0) {
            // Earliest scan in check-in zone is the authoritative check-in
            checkInScan = checkInCandidates[0];
          }

          // Rapid re-scans within 20 minutes of checkInScan are bounce/duplicate check-in taps, NOT check-out
          const minCheckOutSeparationMs = 20 * 60000;
          const remainingAfterCheckIn = candidateScans.filter((s) => {
            if (!checkInScan) return true;
            if (s.id === checkInScan.id) return false;
            if (
              s.epochMs - checkInScan.epochMs < minCheckOutSeparationMs &&
              s.epochMs < current.window.earlyCheckOutMinMs
            ) {
              return false;
            }
            return s.epochMs > checkInScan.epochMs;
          });

          if (checkInScan) {
            // Look for check-out scan in the Check-Out Zone or valid early checkout
            const checkOutCandidates = remainingAfterCheckIn.filter(
              (s) => s.epochMs >= current.window.earlyCheckOutMinMs
            );
            if (checkOutCandidates.length > 0) {
              // Latest scan in check-out zone is authoritative check-out
              checkOutScan = checkOutCandidates[checkOutCandidates.length - 1];
            } else if (remainingAfterCheckIn.length > 0 && !isShiftStillInProgress) {
              // Has a second scan after check-in, but before earlyCheckOutMinMs -> early checkout or mid-shift scan
              checkOutScan = remainingAfterCheckIn[remainingAfterCheckIn.length - 1];
            }
          } else {
            // NO scan in Check-In Zone, but candidateScans.length > 0!
            // (§3 Rule 12 & §5 Test 18: Do not guess check-in if scan is in the middle or only at checkout)
            ambiguousScanFlag = true;
            const onlyScan = candidateScans[0];
            if (onlyScan.epochMs >= current.window.earlyCheckOutMinMs) {
              checkOutScan = candidateScans[candidateScans.length - 1];
              evaluationNote = `พบเฉพาะสแกนช่วงท้ายกะ (${onlyScan.timePart}) ไม่พบสแกนเข้างาน ต้องให้เจ้าหน้าที่ HR ตรวจสอบ`;
            } else {
              evaluationNote = `พบสแกนกลางกะเวลา ${onlyScan.timePart} นอกช่วงเวลาเข้า-ออกปกติ ไม่สามารถระบุเป็นเวลาเข้าหรือออกได้แน่นอน ต้องให้เจ้าหน้าที่ HR ตรวจสอบ`;
            }
          }
        }

        // Mark all candidate scans that fell into this shift's window as consumed so they are not reused
        const shiftRelatedScanIds: string[] = [];
        candidateScans.forEach((s) => {
          usedScanIds.add(s.id);
          shiftRelatedScanIds.push(s.id);
        });

        if (isContextOnlyShift) {
          continue;
        }

        // Compute lateMinutes, status, evaluationState, hasMissingCheckout
        let lateMinutes = 0;
        let earlyCheckoutMinutes = 0;
        let hasMissingCheckout = false;
        let status: EngineAttendanceStatus = 'NO_SCAN';
        let evaluationState: EngineEvaluationState = isShiftStillInProgress
          ? 'IN_PROGRESS'
          : 'EVALUATED';

        if (ambiguousScanFlag) {
          evaluationState = 'AMBIGUOUS_REQUIRES_REVIEW';
          hasMissingCheckout = !checkOutScan;
          status = 'MISSING_CHECKOUT';
        } else if (checkInScan) {
          const lateCalc = this.calculateLateFromEpoch(
            checkInScan.epochMs,
            current.window.shiftStartMs,
            current.shift.graceMinutes
          );
          lateMinutes = lateCalc.lateMinutes;

          if (checkOutScan) {
            hasMissingCheckout = false;
            // Check if early checkout (more than 15 mins before shiftEndMs)
            const diffBeforeEndMin = Math.floor(
              (current.window.shiftEndMs - checkOutScan.epochMs) / 60000
            );
            if (diffBeforeEndMin > 15 && !lateCalc.isLate) {
              earlyCheckoutMinutes = diffBeforeEndMin;
              status = 'EARLY_CHECKOUT';
            } else {
              status = lateCalc.isLate ? 'LATE' : 'NORMAL';
            }
          } else {
            // Checked in, but no check-out scan yet
            if (isShiftStillInProgress) {
              // §3 Rule 8 & §5 Test 13: Do NOT conclude MISSING_CHECKOUT while shift is still in progress!
              hasMissingCheckout = false;
              status = lateCalc.isLate ? 'LATE' : 'NORMAL';
              evaluationNote = 'กำลังปฏิบัติงานอยู่ในกะ (ยังไม่ถึงเวลาสิ้นสุดกะ)';
            } else {
              hasMissingCheckout = true;
              status = lateCalc.isLate ? 'LATE' : 'MISSING_CHECKOUT';
            }
          }
        } else {
          // No checkInScan and no candidateScans
          if (isShiftStillInProgress) {
            evaluationState = 'IN_PROGRESS';
            status = 'NO_SCAN';
            evaluationNote = 'กะกำลังดำเนินการ (ยังไม่สิ้นสุดเวลาประเมินกะ)';
          } else {
            status = 'NO_SCAN';
          }
        }

        // Determine HR Review status while preserving any existing HR Review & Notes (§3 Rule 11 & §4)
        const isProblematic =
          ambiguousScanFlag ||
          hasMissingCheckout ||
          status === 'LATE' ||
          status === 'NO_SCAN' ||
          status === 'MISSING_CHECKOUT' ||
          status === 'EARLY_CHECKOUT';

        let hrReviewStatus: EngineHRReviewStatus = 'NOT_REQUIRED';
        if (existingRec?.hrReviewStatus === 'REVIEWED' || existingRec?.notes) {
          hrReviewStatus = existingRec.hrReviewStatus || 'REVIEWED';
        } else if (isProblematic && !isShiftStillInProgress) {
          hrReviewStatus = 'PENDING_REVIEW';
        }

        const recordId =
          existingRec?.id ||
          `ATT_${personId}_${current.assignment.workDate.replace(/-/g, '')}_${current.shift.id}`;

        const newRecord: EngineAttendanceRecord = {
          id: recordId,
          businessKey,
          personId: person.personId,
          fingleId: person.fingleId,
          fullName: `${person.prefix}${person.firstName} ${person.lastName}`,
          department: person.department,
          groupName: person.groupName,
          personnelType: person.personnelType,
          workDate: current.assignment.workDate,
          shiftId: current.shift.id,
          shiftName: current.shift.name,
          shiftStartTime: current.shift.startTime,
          shiftEndTime: current.shift.endTime,
          crossMidnight: current.window.crossMidnight,
          graceMinutes: current.shift.graceMinutes,
          shiftCategory: current.shift.category,
          checkInAt: checkInScan ? checkInScan.timePart : null,
          checkOutAt: checkOutScan ? checkOutScan.timePart : null,
          checkInDateTime: checkInScan ? checkInScan.scanDateTime : null,
          checkOutDateTime: checkOutScan ? checkOutScan.scanDateTime : null,
          lateMinutes,
          earlyCheckoutMinutes: earlyCheckoutMinutes > 0 ? earlyCheckoutMinutes : undefined,
          hasMissingCheckout,
          status,
          evaluationState,
          hrReviewStatus,
          ambiguousScanFlag: ambiguousScanFlag || undefined,
          evaluationNote,
          rawScanInId: checkInScan ? checkInScan.id : null,
          rawScanOutId: checkOutScan ? checkOutScan.id : null,
          relatedRawScanIds: shiftRelatedScanIds,
          computedAt,
          // Strictly preserve HR Notes & Review History across Reprocess (§4)
          notes: existingRec?.notes ? { ...existingRec.notes } : undefined,
          noteHistory: existingRec?.noteHistory
            ? [...existingRec.noteHistory]
            : undefined,
          isPushedToHosOffice: existingRec?.isPushedToHosOffice ?? false,
          lastPushedAt: existingRec?.lastPushedAt ?? null,
          modifiedAfterPush: existingRec?.modifiedAfterPush ?? false,
        };

        if (existingRec) {
          const changed =
            existingRec.status !== newRecord.status ||
            existingRec.checkInAt !== newRecord.checkInAt ||
            existingRec.checkOutAt !== newRecord.checkOutAt ||
            existingRec.lateMinutes !== newRecord.lateMinutes ||
            existingRec.hasMissingCheckout !== newRecord.hasMissingCheckout;

          if (changed) {
            updatedCount++;
            if (newRecord.isPushedToHosOffice) {
              newRecord.modifiedAfterPush = true;
            }
            changes.push({
              id: newRecord.id,
              businessKey,
              personId: newRecord.personId,
              fullName: newRecord.fullName,
              workDate: newRecord.workDate,
              shiftId: newRecord.shiftId,
              shiftName: newRecord.shiftName,
              oldStatus: existingRec.status,
              newStatus: newRecord.status,
            });
          } else {
            unchangedCount++;
          }
        } else {
          updatedCount++;
          changes.push({
            id: newRecord.id,
            businessKey,
            personId: newRecord.personId,
            fullName: newRecord.fullName,
            workDate: newRecord.workDate,
            shiftId: newRecord.shiftId,
            shiftName: newRecord.shiftName,
            oldStatus: 'UNCOMPUTED',
            newStatus: newRecord.status,
          });
        }

        succeededCount++;
        resultingRecords.push(newRecord);
      }
    }

    // Detect NO_SCHEDULE: mapped raw scans in [fromDate, toDate] that were NOT matched to any shift (§3 Rule 10 & §5 Test 12)
    const noScheduleRecords: EngineAttendanceRecord[] = [];
    for (const [personId, personScans] of scansByPerson.entries()) {
      const person = personnelMap.get(personId);
      if (!person) continue;
      if (
        params.filterGroupName &&
        params.filterGroupName !== 'ALL' &&
        person.groupName !== params.filterGroupName &&
        person.department !== params.filterGroupName
      ) {
        continue;
      }
      if (
        params.filterPersonId &&
        params.filterPersonId !== 'ALL' &&
        person.personId !== params.filterPersonId
      ) {
        continue;
      }

      const usedSet = usedScanIdsByPerson.get(personId) || new Set<string>();
      const unusedInRange = personScans.filter(
        (s) =>
          !usedSet.has(s.id) &&
          s.workDatePart >= params.fromDate &&
          s.workDatePart <= params.toDate
      );

      // Group unused scans by workDatePart
      const byDate = new Map<string, ValidatedRawScanEvent[]>();
      unusedInRange.forEach((s) => {
        if (!byDate.has(s.workDatePart)) byDate.set(s.workDatePart, []);
        byDate.get(s.workDatePart)!.push(s);
      });

      for (const [workDate, orphanScans] of byDate.entries()) {
        // Check if this person had any shift on workDate (or previous night cross-midnight shift)
        const hasShiftOnDate = targetAssignments.some(
          (a) => a.personId === personId && a.workDate === workDate
        );
        if (!hasShiftOnDate) {
          const first = orphanScans[0];
          const last = orphanScans.length > 1 ? orphanScans[orphanScans.length - 1] : null;
          const businessKey = `${personId}_${workDate}_NO_SCHEDULE`;
          const existingNoSched = existingByBusinessKey.get(businessKey);

          const noSchedRec: EngineAttendanceRecord = {
            id: existingNoSched?.id || `ATT_NOSCHED_${personId}_${workDate.replace(/-/g, '')}`,
            businessKey,
            personId: person.personId,
            fingleId: person.fingleId,
            fullName: `${person.prefix}${person.firstName} ${person.lastName}`,
            department: person.department,
            groupName: person.groupName,
            personnelType: person.personnelType,
            workDate,
            shiftId: 'NO_SCHEDULE',
            shiftName: 'ไม่มีตารางกะ (NO_SCHEDULE)',
            shiftStartTime: '-',
            shiftEndTime: '-',
            crossMidnight: false,
            graceMinutes: 0,
            shiftCategory: 'OTHER',
            checkInAt: first.timePart,
            checkOutAt: last ? last.timePart : null,
            checkInDateTime: first.scanDateTime,
            checkOutDateTime: last ? last.scanDateTime : null,
            lateMinutes: 0,
            hasMissingCheckout: false,
            status: 'NO_SCHEDULE',
            evaluationState: 'EVALUATED',
            hrReviewStatus: existingNoSched?.hrReviewStatus || 'PENDING_REVIEW',
            evaluationNote: 'พบข้อมูลสแกนนิ้วแต่ยังไม่ได้กำหนดตารางกะในวันดังกล่าว (NO_SCHEDULE)',
            rawScanInId: first.id,
            rawScanOutId: last ? last.id : null,
            relatedRawScanIds: orphanScans.map((s) => s.id),
            computedAt,
            notes: existingNoSched?.notes,
            noteHistory: existingNoSched?.noteHistory,
            isPushedToHosOffice: false,
            lastPushedAt: null,
            modifiedAfterPush: false,
          };

          noScheduleRecords.push(noSchedRec);
          resultingRecords.push(noSchedRec);
        }
      }
    }

    return {
      fromDate: params.fromDate,
      toDate: params.toDate,
      reprocessedCount,
      succeededCount,
      updatedCount,
      unchangedCount,
      skippedCount: skippedReasons.length,
      errorsCount: ingested.invalidCount,
      unmappedScansCount: unmappedEvents.length,
      noScheduleCount: noScheduleRecords.length,
      skippedReasons,
      changes,
      records: resultingRecords,
      unmappedEvents,
      noScheduleRecords,
    };
  }

  /**
   * Generate Impact Preview before running Reprocess (§4).
   */
  public static previewReprocess(params: {
    fromDate: string;
    toDate: string;
    referenceDateTime?: string;
    personnel: ReadonlyArray<EnginePersonnel>;
    shifts: ReadonlyArray<EngineShiftConfig>;
    assignments: ReadonlyArray<EngineShiftAssignment>;
    rawScans: ReadonlyArray<{
      machineNo: number;
      enrollNumber: number;
      scanDateTime: string;
      verifyMode: number;
      inOutMode: number;
      workCode: number | null;
    }>;
    fingerprintMappings?: ReadonlyArray<EngineFingerprintMapping>;
    existingAttendance?: ReadonlyArray<EngineAttendanceRecord>;
    filterGroupName?: string;
    filterPersonId?: string;
  }): ReprocessPreviewResult {
    const sim = this.evaluateAndReprocess(params);
    const futureSkippedCount = sim.skippedReasons.filter((r) =>
      r.reason.includes('กะในอนาคต')
    ).length;
    const inProgressCount = sim.records.filter(
      (r) => r.evaluationState === 'IN_PROGRESS'
    ).length;

    return {
      fromDate: params.fromDate,
      toDate: params.toDate,
      targetAssignmentsCount: sim.reprocessedCount,
      targetExistingAttendanceCount: (params.existingAttendance || []).filter(
        (a) => a.workDate >= params.fromDate && a.workDate <= params.toDate
      ).length,
      matchingRawScansCount: params.rawScans.filter((r) => {
        const d = r.scanDateTime.slice(0, 10);
        return d >= params.fromDate && d <= params.toDate;
      }).length,
      unmappedScansCount: sim.unmappedScansCount,
      noScheduleScansCount: sim.noScheduleCount,
      futureSkippedCount,
      inProgressCount,
    };
  }
}
