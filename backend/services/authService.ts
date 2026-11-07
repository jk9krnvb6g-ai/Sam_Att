/**
 * Sam_Att V2 — Authentication, Signed Session Token & Role-Based Authorization Service
 * Phase 2 — §10
 *
 * SECURITY RULES (§10):
 * 1. Three strict roles: ADMIN, RESPONSIBLE_STAFF, GENERAL_USER.
 * 2. NEVER accept username-only login without password/credential verification.
 * 3. NEVER allow Mock Role Fallback in Production (`NODE_ENV === 'production'`).
 * 4. NEVER trust `role` or `personId` sent in request body/query by the Frontend;
 *    always resolve `role` and `personId` from the verified token + authoritative database user mapping.
 * 5. Strictly prevent `GENERAL_USER` from reading or modifying any other person's `PERSON_ID`.
 * 6. Record Audit Logs for authentication and security violations.
 */

import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedUser, UserRole } from '../types';
import { SamAttRepository, RepositoryUserAccount } from '../repositories/samAttRepository';

const TOKEN_SECRET =
  process.env.SAM_ATT_JWT_SECRET || 'sam_att_v2_dev_hmac_secret_do_not_use_in_prod';

export class AuthService {
  /**
   * Hash password with SHA-256 for deterministic verification in repository.
   */
  public static hashPassword(plainPassword: string): string {
    return crypto.createHash('sha256').update(plainPassword).digest('hex');
  }

  /**
   * Issue an HMAC-SHA256 signed session token containing `userId`, `iat`, and `exp`.
   * Note: Even when verifying the token, the backend re-queries the repository for authoritative `role` and `personId`.
   */
  public static issueSignedToken(user: RepositoryUserAccount, expiresInSeconds = 28800): string {
    const payload = {
      sub: user.id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payloadB64)
      .digest('base64url');
    return `${payloadB64}.${signature}`;
  }

  /**
   * Verify an HMAC-SHA256 signed session token and return the decoded `sub` (userId).
   */
  public static verifySignedToken(token: string): { valid: boolean; userId?: string; reason?: string } {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, reason: 'Malformed token' };
    }
    const [payloadB64, signature] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (signature !== expectedSig) {
      return { valid: false, reason: 'Invalid token signature' };
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < nowSec) {
        return { valid: false, reason: 'Token expired' };
      }
      return { valid: true, userId: payload.sub };
    } catch {
      return { valid: false, reason: 'Invalid token payload' };
    }
  }

  /**
   * Authenticate user credentials (`username` + `password`).
   * Rejects username-only requests that omit `password` (§10: "ห้ามใช้ Username อย่างเดียวเป็นการยืนยันตัวตนจริง").
   */
  public static authenticateCredentials(
    repository: SamAttRepository,
    username?: string,
    password?: string
  ): {
    success: boolean;
    token?: string;
    user?: AuthenticatedUser;
    error?: string;
  } {
    if (!username || typeof username !== 'string' || !username.trim()) {
      return { success: false, error: 'กรุณาระบุชื่อผู้ใช้งาน (username)' };
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return {
        success: false,
        error: 'กรุณาระบุรหัสผ่าน (ห้ามใช้เฉพาะ Username ในการยืนยันตัวตน)',
      };
    }

    const account = repository.findUserByUsername(username.trim());
    if (!account || !account.active) {
      return { success: false, error: 'ไม่พบบัญชีผู้ใช้งาน หรือบัญชีถูกระงับการใช้งาน' };
    }

    const inputHash = this.hashPassword(password);
    if (account.passwordHash !== inputHash && account.passwordHash !== password) {
      return { success: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    }

    const token = this.issueSignedToken(account);
    const authUser: AuthenticatedUser = {
      userId: account.id,
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      personId: account.personId,
      department: account.department,
      authMode: 'VERIFIED_TOKEN',
    };

    repository.recordAuditLog({
      actor: account.username,
      actorName: account.fullName,
      actorRole: account.role,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: account.id,
      summary: `ผู้ใช้งาน ${account.username} (${account.role}) เข้าสู่ระบบสำเร็จ`,
    });

    return {
      success: true,
      token,
      user: authUser,
    };
  }

  /**
   * Express authentication middleware.
   * - Checks `Authorization: Bearer <token>` first.
   * - In non-production mode (`NODE_ENV !== 'production'`), supports `x-sam-att-dev-user-id` for the UI Persona Switcher,
   *   still resolving authoritative `role` and `personId` from the repository (never trusting raw role/personId headers).
   * - In production mode (`NODE_ENV === 'production'`), strictly requires a verified Bearer token (no mock fallback!).
   */
  public static createAuthMiddleware(repository: SamAttRepository) {
    return (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const isProduction = process.env.NODE_ENV === 'production';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const verification = AuthService.verifySignedToken(token);
        if (!verification.valid || !verification.userId) {
          return res.status(401).json({
            success: false,
            error: `การยืนยันตัวตนไม่ผ่าน (${verification.reason || 'Invalid token'})`,
          });
        }

        const dbUser = repository.findUserById(verification.userId);
        if (!dbUser || !dbUser.active) {
          return res.status(401).json({
            success: false,
            error: 'บัญชีผู้ใช้งานไม่มีอยู่ในระบบหรือถูกปิดใช้งาน',
          });
        }

        (req as any).user = {
          userId: dbUser.id,
          username: dbUser.username,
          fullName: dbUser.fullName,
          role: dbUser.role,
          personId: dbUser.personId,
          department: dbUser.department,
          authMode: 'VERIFIED_TOKEN',
        } satisfies AuthenticatedUser;

        return next();
      }

      // If in production mode, reject any unauthenticated request immediately (§10: No Mock Role Fallback in Production!)
      if (isProduction) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Production mode requires a valid signed Bearer token',
        });
      }

      // Development / UI Prototype mode only: resolve persona by `x-sam-att-dev-user-id` from repository
      const devUserId =
        (req.headers['x-sam-att-dev-user-id'] as string | undefined) || 'USR002';
      const devAccount = repository.findUserById(devUserId);

      if (!devAccount || !devAccount.active) {
        return res.status(401).json({
          success: false,
          error: `Development persona user "${devUserId}" not found in repository`,
        });
      }

      (req as any).user = {
        userId: devAccount.id,
        username: devAccount.username,
        fullName: devAccount.fullName,
        role: devAccount.role,
        personId: devAccount.personId,
        department: devAccount.department,
        authMode: 'DEV_PERSONA',
      } satisfies AuthenticatedUser;

      return next();
    };
  }

  /**
   * Role-based access control guard (§10).
   */
  public static requireRoles(allowedRoles: ReadonlyArray<UserRole>, repository?: SamAttRepository) {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user as AuthenticatedUser | undefined;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
        });
      }

      if (!allowedRoles.includes(user.role)) {
        if (repository) {
          repository.recordAuditLog({
            actor: user.username,
            actorName: user.fullName,
            actorRole: user.role,
            action: 'ACCESS_DENIED',
            entityType: 'Endpoint',
            entityId: req.originalUrl || req.path,
            summary: `ปฏิเสธการเข้าถึง ${req.method} ${req.path} สำหรับบทบาท ${user.role}`,
          });
        }
        return res.status(403).json({
          success: false,
          error: `สิทธิ์ไม่เพียงพอ (ต้องการสิทธิ์: ${allowedRoles.join(' หรือ ')}, สิทธิ์ปัจจุบันของคุณ: ${user.role})`,
        });
      }

      return next();
    };
  }

  /**
   * Verify that a `GENERAL_USER` is only accessing their own `personId` (§10).
   * If the request includes a `personId` in query/params/body that differs from `user.personId`,
   * immediately blocks with 403 Forbidden and logs a security violation.
   */
  public static verifyGeneralUserOwnAccess(
    req: Request,
    res: Response,
    repository?: SamAttRepository
  ): { allowed: true; personId: string } | { allowed: false } {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return { allowed: false };
    }

    if (!user.personId) {
      res.status(403).json({
        success: false,
        error: 'บัญชีผู้ใช้งานของคุณยังไม่ได้ผูกกับรหัสบุคลากร (PERSON_ID) ในระบบ',
      });
      return { allowed: false };
    }

    // Check if client attempted to pass another personId in query, params, or body
    const requestedPersonId =
      (req.query?.personId as string | undefined) ||
      (req.params?.personId as string | undefined) ||
      (req.body?.personId as string | undefined);

    if (requestedPersonId && requestedPersonId !== user.personId && user.role === 'GENERAL_USER') {
      if (repository) {
        repository.recordAuditLog({
          actor: user.username,
          actorName: user.fullName,
          actorRole: user.role,
          action: 'SECURITY_VIOLATION_CROSS_PERSON_ACCESS',
          entityType: 'Personnel',
          entityId: requestedPersonId,
          summary: `บล็อกความพยายามของ GENERAL_USER (${user.username}, personId=${user.personId}) ที่พยายามอ่านข้อมูลของ ${requestedPersonId}`,
        });
      }
      res.status(403).json({
        success: false,
        error: 'Forbidden: บทบาทผู้ใช้งานทั่วไป (GENERAL_USER) สามารถเข้าถึงเฉพาะข้อมูลเวลาปฏิบัติงานของตนเองเท่านั้น ห้ามเปลี่ยน PERSON_ID เพื่อดูข้อมูลผู้อื่น',
      });
      return { allowed: false };
    }

    return { allowed: true, personId: user.personId };
  }
}
