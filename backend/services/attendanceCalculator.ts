/**
 * Core Attendance Calculation Service (Deterministic & Idempotent)
 * Based on MASTER DEVELOPMENT PROMPT §4.7
 */

export interface ShiftDefinition {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  graceMinutes: number;
  crossMidnight: boolean;
}

export class AttendanceCalculator {
  /**
   * Deterministic late calculation:
   * lateMinutes = max(0, actualCheckIn - shiftStart - grace)
   */
  public static calculateLate(
    checkInTimeStr: string,
    shift: ShiftDefinition
  ): { isLate: boolean; lateMinutes: number } {
    const [cHour, cMin] = checkInTimeStr.split(':').map(Number);
    const [sHour, sMin] = shift.startTime.split(':').map(Number);

    const checkInMins = cHour * 60 + cMin;
    const shiftStartMins = sHour * 60 + sMin;
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
   * Create unique fingerprint for raw scan deduplication
   * Composite: machineNo + enrollNumber + scanDateTime
   */
  public static generateDedupeKey(machineNo: number, enrollNumber: number, scanDateTime: string): string {
    return `${machineNo}_${enrollNumber}_${scanDateTime}`;
  }
}
