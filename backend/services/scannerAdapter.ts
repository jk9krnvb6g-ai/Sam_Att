/**
 * Scanner Reader Adapter (Existing Hospital Executable Integration)
 * MASTER DEVELOPMENT PROMPT §4.5, §4.6 & §14
 *
 * NOTE: DO NOT CREATE, MODIFY, OR REPLACE THE EXISTING SCANNER EXE.
 * This adapter securely invokes the hospital's existing CLI binary server-side
 * and parses the confirmed 6-field JSON schema.
 */

import { IngestScansRequest, RawScanDto } from '../types';

export class ScannerAdapter {
  /**
   * Validate incoming 6-field scanner contract from existing EXE.
   * Rejects payload if required fields are missing.
   */
  public static validateScanDto(scan: any): scan is RawScanDto {
    if (typeof scan !== 'object' || scan === null) return false;
    if (typeof scan.machineNo !== 'number') return false;
    if (typeof scan.enrollNumber !== 'number') return false;
    if (typeof scan.scanDateTime !== 'string') return false;
    if (typeof scan.verifyMode !== 'number') return false;
    if (typeof scan.inOutMode !== 'number') return false;
    // workCode can be number or null
    if (scan.workCode !== null && typeof scan.workCode !== 'number') return false;

    return true;
  }

  /**
   * Sanitize & parse raw JSON returned by existing EXE.
   * Handles wrapper metadata: { success: true, totalRead: 1, machines: [...], scans: [...] }
   */
  public static parseRawJsonOutput(rawJsonText: string): RawScanDto[] {
    try {
      const parsed: IngestScansRequest = JSON.parse(rawJsonText);
      if (!Array.isArray(parsed.scans)) {
        throw new Error('Invalid JSON format: missing scans array');
      }

      const validScans: RawScanDto[] = [];
      for (const scan of parsed.scans) {
        if (this.validateScanDto(scan)) {
          validScans.push(scan);
        } else {
          console.warn('[ScannerAdapter] Skipping invalid scan event:', scan);
        }
      }

      return validScans;
    } catch (err) {
      throw new Error(`Failed to parse scanner output JSON: ${(err as Error).message}`);
    }
  }
}
