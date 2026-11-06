/**
 * Backend Data Contracts & Interfaces for Sam_Att V2
 * Shared types for Modular Router in Central API Gateway (Port 3002)
 */

export type UserRole = 'ADMIN' | 'RESPONSIBLE_STAFF' | 'GENERAL_USER';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: UserRole;
  personId: string | null;
}

/**
 * 6-field raw scanner JSON contract matching MASTER DEVELOPMENT PROMPT §14
 */
export interface RawScanDto {
  machineNo: number;
  enrollNumber: number;
  scanDateTime: string; // "yyyy-MM-dd HH:mm:ss"
  verifyMode: number;
  inOutMode: number;
  workCode: number | null;
}

export interface IngestScansRequest {
  success?: boolean;
  totalRead?: number;
  machines?: Array<{
    machineNo: number;
    ip: string;
    read: number;
    status: string;
  }>;
  scans: RawScanDto[];
}
