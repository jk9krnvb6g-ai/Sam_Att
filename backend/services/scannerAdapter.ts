/**
 * Scanner Reader Adapter & Immutable Raw Scan Processor (Phase 1 — §2)
 *
 * Confirmed 6-field JSON Contract from existing hospital Scanner Reader EXE:
 * {
 *   "machineNo": 1,
 *   "enrollNumber": 54,
 *   "scanDateTime": "2026-11-06 07:45:00",
 *   "verifyMode": 268435456,
 *   "inOutMode": 1,
 *   "workCode": null
 * }
 *
 * CRITICAL RULES (§2):
 * 1. Do NOT modify Scanner Reader EXE or rename `enrollNumber`.
 * 2. Strictly validate data types and real calendar date/time ("yyyy-MM-dd HH:mm:ss").
 * 3. Store Raw Scan events as Immutable (Object.freeze).
 * 4. Deduplicate ONLY by Event Identity: `${machineNo}_${enrollNumber}_${scanDateTime}`.
 * 5. NEVER deduplicate by PERSON_ID + date or enrollNumber + date.
 * 6. Support multiple scans by the same person on the same day.
 * 7. Match `enrollNumber` with `FINGLE_ID` (including historical effective dates).
 * 8. Preserve unmapped scans with status `PENDING_MAPPING`.
 * 9. Never fabricate personnel or scan timestamps.
 * 10. Never blindly trust `inOutMode` as check-in/out without shift window verification.
 */

import {
  EngineFingerprintMapping,
  EnginePersonnel,
  IngestScansRequest,
  RawScanDto,
  ValidatedRawScanEvent,
} from '../types';

const SCAN_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export interface RawScanIngestionSummary {
  totalRead: number;
  validCount: number;
  invalidCount: number;
  newScansCount: number;
  duplicateScansCount: number;
  mappedCount: number;
  unmappedScansCount: number;
  disputedMappingCount: number;
  newEvents: ValidatedRawScanEvent[];
  duplicateKeys: string[];
  invalidRecords: Array<{ raw: unknown; reason: string }>;
}

export class ScannerAdapter {
  /**
   * Parse "yyyy-MM-dd HH:mm:ss" into UTC-neutral epoch milliseconds for deterministic interval arithmetic,
   * while validating real calendar date and 24-hour clock bounds.
   */
  public static parseScanDateTimeToEpochMs(scanDateTime: string): number | null {
    if (typeof scanDateTime !== 'string') return null;
    const match = SCAN_DATETIME_REGEX.exec(scanDateTime.trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);

    if (year < 2000 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    if (second < 0 || second > 59) return null;

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) return null;

    return Date.UTC(year, month - 1, day, hour, minute, second);
  }

  /**
   * Generate deterministic composite Event Identity deduplication key (§2.4):
   * Composite: machineNo + '_' + enrollNumber + '_' + scanDateTime
   */
  public static generateDedupeKey(
    machineNo: number,
    enrollNumber: number,
    scanDateTime: string
  ): string {
    return `${machineNo}_${enrollNumber}_${scanDateTime.trim()}`;
  }

  /**
   * Validate a single 6-field scan object with detailed reason on failure (§2.1 & §2.2).
   */
  public static validateScanRecord(
    scan: unknown
  ): { valid: true; value: RawScanDto; epochMs: number } | { valid: false; reason: string } {
    if (typeof scan !== 'object' || scan === null || Array.isArray(scan)) {
      return { valid: false, reason: 'Payload item must be a JSON object' };
    }

    const record = scan as Record<string, unknown>;

    if (
      typeof record.machineNo !== 'number' ||
      !Number.isInteger(record.machineNo) ||
      record.machineNo <= 0
    ) {
      return { valid: false, reason: 'Invalid machineNo: must be a positive integer' };
    }

    if (
      typeof record.enrollNumber !== 'number' ||
      !Number.isInteger(record.enrollNumber) ||
      record.enrollNumber <= 0
    ) {
      return { valid: false, reason: 'Invalid enrollNumber: must be a positive integer' };
    }

    if (typeof record.scanDateTime !== 'string') {
      return { valid: false, reason: 'Invalid scanDateTime: must be a string (yyyy-MM-dd HH:mm:ss)' };
    }

    const normalizedDateTime = record.scanDateTime.trim();
    const epochMs = this.parseScanDateTimeToEpochMs(normalizedDateTime);
    if (epochMs === null) {
      return {
        valid: false,
        reason: `Invalid scanDateTime value "${record.scanDateTime}": must be valid calendar date/time in format yyyy-MM-dd HH:mm:ss`,
      };
    }

    if (typeof record.verifyMode !== 'number' || !Number.isInteger(record.verifyMode)) {
      return { valid: false, reason: 'Invalid verifyMode: must be an integer' };
    }

    if (typeof record.inOutMode !== 'number' || !Number.isInteger(record.inOutMode)) {
      return { valid: false, reason: 'Invalid inOutMode: must be an integer' };
    }

    if (
      record.workCode !== null &&
      record.workCode !== undefined &&
      (typeof record.workCode !== 'number' || !Number.isInteger(record.workCode))
    ) {
      return { valid: false, reason: 'Invalid workCode: must be an integer or null' };
    }

    return {
      valid: true,
      epochMs,
      value: {
        machineNo: record.machineNo,
        enrollNumber: record.enrollNumber,
        scanDateTime: normalizedDateTime,
        verifyMode: record.verifyMode,
        inOutMode: record.inOutMode,
        workCode: record.workCode === undefined ? null : (record.workCode as number | null),
      },
    };
  }

  /**
   * Backward-compatible boolean type guard for 6-field scanner contract.
   */
  public static validateScanDto(scan: unknown): scan is RawScanDto {
    return this.validateScanRecord(scan).valid;
  }

  /**
   * Resolve `enrollNumber` to `PERSON_ID` using effective-date fingerprint mappings
   * or active personnel reference (§2.7, §2.8, §8.7, §8.8, §8.10).
   */
  public static resolveEnrollNumberMapping(
    enrollNumber: number,
    scanDatePart: string,
    personnel: ReadonlyArray<EnginePersonnel>,
    fingerprintMappings?: ReadonlyArray<EngineFingerprintMapping>
  ): {
    personId: string | null;
    mappingStatus: 'MAPPED' | 'PENDING_MAPPING' | 'DISPUTED_MAPPING';
  } {
    // 1. Check explicit effective-date fingerprint mappings first if provided
    if (fingerprintMappings && fingerprintMappings.length > 0) {
      const matchingMappings = fingerprintMappings.filter((m) => {
        if (m.fingleId !== enrollNumber) return false;
        if (m.status === 'DISPUTED') return true;
        const fromOk = !m.effectiveFrom || m.effectiveFrom <= scanDatePart;
        const toOk = !m.effectiveTo || m.effectiveTo >= scanDatePart;
        return fromOk && toOk;
      });

      if (matchingMappings.some((m) => m.status === 'DISPUTED')) {
        return { personId: null, mappingStatus: 'DISPUTED_MAPPING' };
      }

      const distinctPersons = Array.from(new Set(matchingMappings.map((m) => m.personId)));
      if (distinctPersons.length > 1) {
        return { personId: null, mappingStatus: 'DISPUTED_MAPPING' };
      }
      if (distinctPersons.length === 1) {
        return { personId: distinctPersons[0], mappingStatus: 'MAPPED' };
      }
    }

    // 2. Check authoritative personnel list (active first, then inactive for historical lookups)
    const activeMatches = personnel.filter((p) => p.active && p.fingleId === enrollNumber);
    if (activeMatches.length > 1) {
      return { personId: null, mappingStatus: 'DISPUTED_MAPPING' };
    }
    if (activeMatches.length === 1) {
      return { personId: activeMatches[0].personId, mappingStatus: 'MAPPED' };
    }

    const inactiveMatches = personnel.filter((p) => !p.active && p.fingleId === enrollNumber);
    if (inactiveMatches.length === 1) {
      return { personId: inactiveMatches[0].personId, mappingStatus: 'MAPPED' };
    }
    if (inactiveMatches.length > 1) {
      return { personId: null, mappingStatus: 'DISPUTED_MAPPING' };
    }

    return { personId: null, mappingStatus: 'PENDING_MAPPING' };
  }

  /**
   * Process and deduplicate a batch of 6-field scans into immutable ValidatedRawScanEvent objects (§2.3–§2.9).
   */
  public static ingestAndDeduplicateScans(params: {
    incomingScans: ReadonlyArray<unknown>;
    existingDedupeKeys: ReadonlySet<string>;
    personnel: ReadonlyArray<EnginePersonnel>;
    fingerprintMappings?: ReadonlyArray<EngineFingerprintMapping>;
    importedAt?: string;
    idPrefix?: string;
  }): RawScanIngestionSummary {
    const importedAt =
      params.importedAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const seenKeys = new Set<string>(params.existingDedupeKeys);

    let validCount = 0;
    let invalidCount = 0;
    let newScansCount = 0;
    let duplicateScansCount = 0;
    let mappedCount = 0;
    let unmappedScansCount = 0;
    let disputedMappingCount = 0;

    const newEvents: ValidatedRawScanEvent[] = [];
    const duplicateKeys: string[] = [];
    const invalidRecords: Array<{ raw: unknown; reason: string }> = [];

    params.incomingScans.forEach((rawItem, index) => {
      const validation = this.validateScanRecord(rawItem);
      if (!validation.valid) {
        invalidCount++;
        invalidRecords.push({ raw: rawItem, reason: validation.reason });
        return;
      }

      validCount++;
      const dto = validation.value;
      const dedupeKey = this.generateDedupeKey(
        dto.machineNo,
        dto.enrollNumber,
        dto.scanDateTime
      );
      const workDatePart = dto.scanDateTime.slice(0, 10);
      const timePart = dto.scanDateTime.slice(11, 19);

      const mapping = this.resolveEnrollNumberMapping(
        dto.enrollNumber,
        workDatePart,
        params.personnel,
        params.fingerprintMappings
      );

      if (mapping.mappingStatus === 'MAPPED') {
        mappedCount++;
      } else if (mapping.mappingStatus === 'DISPUTED_MAPPING') {
        disputedMappingCount++;
        unmappedScansCount++;
      } else {
        unmappedScansCount++;
      }

      // Deduplicate strictly by Event Identity (machineNo_enrollNumber_scanDateTime)
      if (seenKeys.has(dedupeKey)) {
        duplicateScansCount++;
        duplicateKeys.push(dedupeKey);
        return;
      }

      seenKeys.add(dedupeKey);
      newScansCount++;

      const immutableEvent: ValidatedRawScanEvent = Object.freeze({
        id: `${params.idPrefix || 'RAW'}_${dto.machineNo}_${dto.enrollNumber}_${dto.scanDateTime.replace(/[- :]/g, '')}_${index}`,
        machineNo: dto.machineNo,
        enrollNumber: dto.enrollNumber,
        scanDateTime: dto.scanDateTime,
        verifyMode: dto.verifyMode,
        inOutMode: dto.inOutMode,
        workCode: dto.workCode,
        dedupeKey,
        importedAt,
        epochMs: validation.epochMs,
        workDatePart,
        timePart,
        mappedPersonId: mapping.personId,
        mappingStatus: mapping.mappingStatus,
      });

      newEvents.push(immutableEvent);
    });

    return {
      totalRead: params.incomingScans.length,
      validCount,
      invalidCount,
      newScansCount,
      duplicateScansCount,
      mappedCount,
      unmappedScansCount,
      disputedMappingCount,
      newEvents,
      duplicateKeys,
      invalidRecords,
    };
  }

  /**
   * Sanitize & parse raw JSON text returned by existing Scanner Reader EXE.
   */
  public static parseRawJsonOutput(rawJsonText: string): RawScanDto[] {
    let parsed: IngestScansRequest;
    try {
      parsed = JSON.parse(rawJsonText);
    } catch (err) {
      throw new Error(`Failed to parse scanner output JSON: ${(err as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.scans)) {
      throw new Error('Invalid JSON format: missing scans array');
    }

    const validScans: RawScanDto[] = [];
    for (const scan of parsed.scans) {
      const check = this.validateScanRecord(scan);
      if (check.valid) {
        validScans.push(check.value);
      }
    }

    return validScans;
  }
}
