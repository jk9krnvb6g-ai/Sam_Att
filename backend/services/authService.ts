/**
 * Sam_Att V2 — Hardened Authentication, Session Revocation, Rate Limiting & RBAC Service
 * Phase 1+2 Hardening — §4
 *
 * SECURITY FIXES APPLIED (§4):
 * 1. Uses `bcryptjs` with cryptographic salt (10 rounds) for all password hashing (`$2a$` / `$2b$`).
 * 2. NEVER compares plaintext passwords against stored database values.
 * 3. NEVER uses plain SHA-256 for storing new passwords.
 * 4. Safe Legacy Hash Migration: Only accounts explicitly tagged `legacy_sha256$<64hex>` can be verified
 *    via `crypto.timingSafeEqual` on login, and are immediately upgraded to `bcrypt` in the database.
 * 5. Zero hardcoded default secret in source code:
 *    - In `REAL` / `production` mode, strictly requires `process.env.SAM_ATT_JWT_SECRET` (>= 32 chars)
 *      and throws an error if missing.
 *    - In `MOCK` / `TEST` mode, generates an ephemeral random 256-bit secret per process if env var is unset.
 * 6. Full Token Signature (`HMAC-SHA256`), Expiration (`exp`), and Session Revocation (`jti` denylist + user revocation).
 * 7. Brute-Force Protection & Login Rate Limiting (max 5 failed attempts per 15-minute window -> HTTP 429).
 * 8. Never logs passwords, password hashes, tokens, or secrets.
 * 9. Disables Mock Persona Fallback in `REAL` mode and `NODE_ENV === 'production'`.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedUser, UserRole } from '../types';
import {
  ISamAttRepository,
  RepositoryMode,
  RepositoryUserAccount,
} from '../repositories/interfaces';

const BCRYPT_SALT_ROUNDS = 10;
const LEGACY_SHA256_PREFIX = 'legacy_sha256$';

// Ephemeral random secret used ONLY in non-production MOCK/TEST mode when SAM_ATT_JWT_SECRET is unset
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

interface RateLimitState {
  failedAttempts: number;
  firstFailedAtMs: number;
  lockedUntilMs: number | null;
}

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export class AuthService {
  private static revokedTokenJtis = new Set<string>();
  private static userRevokedBeforeSec = new Map<string, number>();
  private static loginRateLimitMap = new Map<string, RateLimitState>();

  /**
   * Resolve the signing secret according to the active mode (§4.5 & §4.6).
   * - In REAL mode or NODE_ENV === 'production', strictly requires `process.env.SAM_ATT_JWT_SECRET` (>= 32 chars).
   * - Refuses to start or sign/verify if missing in REAL/production mode.
   */
  public static getSigningSecret(mode: RepositoryMode = 'MOCK'): string {
    const envSecret = process.env.SAM_ATT_JWT_SECRET?.trim() || '';
    const isRealOrProd =
      mode === 'REAL' ||
      process.env.SAM_ATT_REPO_MODE === 'REAL' ||
      process.env.NODE_ENV === 'production';

    if (isRealOrProd) {
      if (!envSecret || envSecret.length < 32) {
        throw new Error(
          'CRITICAL SECURITY ERROR: SAM_ATT_JWT_SECRET environment variable (minimum 32 characters) is required in REAL/Production mode.'
        );
      }
      return envSecret;
    }

    return envSecret.length >= 16 ? envSecret : EPHEMERAL_DEV_SECRET;
  }

  /**
   * Validate that Real/Production mode has a valid secret before starting the backend router (§4.6).
   */
  public static assertRealModeSecretConfigured(mode: RepositoryMode): void {
    if (mode === 'REAL' || process.env.NODE_ENV === 'production') {
      this.getSigningSecret('REAL');
    }
  }

  /**
   * Hash a password using bcrypt with cryptographic salt (§4.1, §4.2, §4.4).
   */
  public static hashPassword(plainPassword: string): string {
    if (!plainPassword || typeof plainPassword !== 'string' || plainPassword.length < 4) {
      throw new Error('Password must be a non-empty string of at least 4 characters');
    }
    return bcrypt.hashSync(plainPassword, BCRYPT_SALT_ROUNDS);
  }

  /**
   * Create a tagged legacy SHA-256 hash ONLY for testing legacy migration strategy (§4).
   */
  public static createLegacySha256TaggedHashForMigrationTest(plainPassword: string): string {
    const hex = crypto.createHash('sha256').update(plainPassword).digest('hex');
    return `${LEGACY_SHA256_PREFIX}${hex}`;
  }

  /**
   * Synchronous password verification helper for bcrypt and legacy_sha256$ tagged hashes (§4).
   */
  public static verifyPassword(
    plainPassword: string,
    storedHash: string
  ): { valid: boolean; isLegacySha256: boolean } {
    if (!plainPassword || !storedHash || typeof storedHash !== 'string') {
      return { valid: false, isLegacySha256: false };
    }
    if (
      storedHash.startsWith('$2a$') ||
      storedHash.startsWith('$2b$') ||
      storedHash.startsWith('$2y$')
    ) {
      return { valid: bcrypt.compareSync(plainPassword, storedHash), isLegacySha256: false };
    }
    if (storedHash.startsWith(LEGACY_SHA256_PREFIX)) {
      const legacyHex = storedHash.slice(LEGACY_SHA256_PREFIX.length);
      if (legacyHex.length !== 64) return { valid: false, isLegacySha256: false };
      const candidateHex = crypto.createHash('sha256').update(plainPassword).digest('hex');
      const a = Buffer.from(legacyHex, 'hex');
      const b = Buffer.from(candidateHex, 'hex');
      const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      return { valid, isLegacySha256: valid };
    }
    return { valid: false, isLegacySha256: false };
  }

  /**
   * Verify password against stored hash (never compares plaintext!) and transparently upgrade
   * explicitly tagged `legacy_sha256$` hashes to `bcrypt` upon successful verification (§4.3 & §4).
   */
  public static async verifyPasswordAndMigrateIfNeeded(
    plainPassword: string,
    storedHash: string,
    userId: string,
    repository: ISamAttRepository
  ): Promise<{ valid: boolean; migrated: boolean }> {
    const check = this.verifyPassword(plainPassword, storedHash);
    if (!check.valid) {
      return { valid: false, migrated: false };
    }
    if (check.isLegacySha256) {
      const upgradedBcryptHash = this.hashPassword(plainPassword);
      await repository.updateUserPasswordHash(userId, upgradedBcryptHash);
      await repository.recordAuditLog({
        actor: userId,
        action: 'PASSWORD_HASH_MIGRATED_TO_BCRYPT',
        entityType: 'User',
        entityId: userId,
        summary: `อัปเกรด Password Hash ของบัญชี ${userId} จาก Legacy Hash เป็น Bcrypt สำเร็จหลังยืนยันรหัสผ่าน`,
      });
      return { valid: true, migrated: true };
    }
    return { valid: true, migrated: false };
  }

  /**
   * Issue an HMAC-SHA256 signed session token with unique `jti`, `sub`, `iat`, and `exp` (§4.7 & §4.8).
   */
  public static issueSignedToken(
    user: RepositoryUserAccount,
    expiresInSeconds = 28800,
    mode: RepositoryMode = 'MOCK'
  ): string {
    const secret = this.getSigningSecret(mode);
    const nowSec = Math.floor(Date.now() / 1000);
    const jti = `JTI_${crypto.randomUUID()}`;

    const payload = {
      jti,
      sub: user.id,
      username: user.username,
      iat: nowSec,
      exp: nowSec + expiresInSeconds,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verify token signature, expiration (`exp`), and session revocation (`jti` & user revocation timestamp) (§4.7 & §4.8).
   */
  public static verifySignedToken(
    token: string,
    mode: RepositoryMode = 'MOCK'
  ): {
    valid: boolean;
    userId?: string;
    jti?: string;
    exp?: number;
    reason?: string;
  } {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      return { valid: false, reason: 'Malformed token' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Malformed token structure' };
    }

    const [payloadB64, signature] = parts;
    const secret = this.getSigningSecret(mode);
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Invalid token signature' };
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);

      if (typeof payload.exp !== 'number' || payload.exp < nowSec) {
        return { valid: false, reason: 'Token expired' };
      }

      if (payload.jti && this.revokedTokenJtis.has(payload.jti)) {
        return { valid: false, reason: 'Session has been revoked' };
      }

      const revokedBefore = this.userRevokedBeforeSec.get(payload.sub);
      if (revokedBefore !== undefined && typeof payload.iat === 'number' && payload.iat <= revokedBefore) {
        return { valid: false, reason: 'All user sessions prior to revocation have been invalidated' };
      }

      return {
        valid: true,
        userId: payload.sub,
        jti: payload.jti,
        exp: payload.exp,
      };
    } catch {
      return { valid: false, reason: 'Invalid token payload' };
    }
  }

  /**
   * Revoke a specific token immediately (e.g., on logout) and persist revocation to Repository (§4.8 & §9).
   */
  public static async revokeToken(
    token: string,
    mode: RepositoryMode = 'MOCK',
    repository?: ISamAttRepository
  ): Promise<boolean> {
    const verified = this.verifySignedToken(token, mode) as {
      valid: boolean;
      userId?: string;
      jti?: string;
      exp?: number;
    };
    if (verified.jti) {
      this.revokedTokenJtis.add(verified.jti);
      if (repository?.revokeSessionJti && verified.userId) {
        await repository.revokeSessionJti(
          verified.jti,
          verified.userId,
          verified.exp || Math.floor(Date.now() / 1000) + 28800
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Revoke all active sessions for a user ID (§4.8).
   */
  public static revokeAllUserSessions(userId: string): void {
    this.userRevokedBeforeSec.set(userId, Math.floor(Date.now() / 1000));
  }

  /**
   * Check and update login rate limiter for brute-force protection, reading from persistent repository when available (§4.9, §4.10 & §9).
   */
  public static async checkRateLimit(
    rateLimitKey: string,
    repository?: ISamAttRepository
  ): Promise<{
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds?: number;
  }> {
    const nowMs = Date.now();
    let state: RateLimitState | undefined = this.loginRateLimitMap.get(rateLimitKey);

    if (!state && repository?.getRateLimitEntry) {
      const persisted = await repository.getRateLimitEntry(rateLimitKey);
      if (persisted) {
        state = {
          failedAttempts: persisted.failedAttempts,
          firstFailedAtMs: persisted.firstFailedAtMs,
          lockedUntilMs: persisted.lockedUntilMs,
        };
        this.loginRateLimitMap.set(rateLimitKey, state);
      }
    }

    if (!state) {
      return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS };
    }

    if (state.lockedUntilMs && state.lockedUntilMs > nowMs) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil((state.lockedUntilMs - nowMs) / 1000),
      };
    }

    if (nowMs - state.firstFailedAtMs > RATE_LIMIT_WINDOW_MS) {
      this.loginRateLimitMap.delete(rateLimitKey);
      if (repository?.deleteRateLimitEntry) {
        await repository.deleteRateLimitEntry(rateLimitKey);
      }
      return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - state.failedAttempts),
    };
  }

  private static async recordFailedLoginAttempt(
    rateLimitKey: string,
    repository?: ISamAttRepository
  ): Promise<{
    locked: boolean;
    failedAttempts: number;
  }> {
    const nowMs = Date.now();
    let current = this.loginRateLimitMap.get(rateLimitKey);

    if (!current && repository?.getRateLimitEntry) {
      const persisted = await repository.getRateLimitEntry(rateLimitKey);
      if (persisted) {
        current = {
          failedAttempts: persisted.failedAttempts,
          firstFailedAtMs: persisted.firstFailedAtMs,
          lockedUntilMs: persisted.lockedUntilMs,
        };
      }
    }

    if (!current || nowMs - current.firstFailedAtMs > RATE_LIMIT_WINDOW_MS) {
      const nextState: RateLimitState = {
        failedAttempts: 1,
        firstFailedAtMs: nowMs,
        lockedUntilMs: null,
      };
      this.loginRateLimitMap.set(rateLimitKey, nextState);
      if (repository?.saveRateLimitEntry) {
        await repository.saveRateLimitEntry({
          rateKey: rateLimitKey,
          ...nextState,
        });
      }
      return { locked: false, failedAttempts: 1 };
    }

    current.failedAttempts += 1;
    if (current.failedAttempts >= RATE_LIMIT_MAX_ATTEMPTS) {
      current.lockedUntilMs = nowMs + RATE_LIMIT_LOCKOUT_MS;
    }
    this.loginRateLimitMap.set(rateLimitKey, current);

    if (repository?.saveRateLimitEntry) {
      await repository.saveRateLimitEntry({
        rateKey: rateLimitKey,
        failedAttempts: current.failedAttempts,
        firstFailedAtMs: current.firstFailedAtMs,
        lockedUntilMs: current.lockedUntilMs,
      });
    }

    return {
      locked: Boolean(current.lockedUntilMs && current.lockedUntilMs > nowMs),
      failedAttempts: current.failedAttempts,
    };
  }

  public static clearRateLimitForTest(): void {
    this.loginRateLimitMap.clear();
    this.revokedTokenJtis.clear();
    this.userRevokedBeforeSec.clear();
  }

  public static resetSecurityStateForTests(): void {
    this.clearRateLimitForTest();
  }

  /**
   * Authenticate user credentials (`username` + `password`) with persistent rate limiting, bcrypt verification,
   * legacy hash migration, and audit logging without leaking sensitive values (§4.1–§4.11 & §9).
   */
  public static async authenticateCredentials(
    repository: ISamAttRepository,
    username?: string,
    password?: string,
    clientIp = '127.0.0.1'
  ): Promise<{
    success: boolean;
    statusCode: number;
    token?: string;
    user?: AuthenticatedUser;
    error?: string;
    retryAfterSeconds?: number;
    passwordUpgradedToBcrypt?: boolean;
  }> {
    if (!username || typeof username !== 'string' || !username.trim()) {
      return {
        success: false,
        statusCode: 400,
        error: 'กรุณาระบุชื่อผู้ใช้งาน (username)',
      };
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return {
        success: false,
        statusCode: 401,
        error: 'กรุณาระบุรหัสผ่าน (ห้ามใช้เฉพาะ Username ในการยืนยันตัวตน)',
      };
    }

    const normalizedUsername = username.trim().toLowerCase();
    const rateKey = `${normalizedUsername}@${clientIp}`;

    const rateCheck = await this.checkRateLimit(rateKey, repository);
    if (!rateCheck.allowed) {
      await repository.recordAuditLog({
        actor: normalizedUsername,
        action: 'AUTH_LOGIN_LOCKED_BRUTE_FORCE',
        entityType: 'User',
        entityId: normalizedUsername,
        summary: `ระงับการเข้าสู่ระบบชั่วคราวของ ${normalizedUsername} เนื่องจากใส่รหัสผ่านผิดเกินกำหนด (Rate Limit Lockout)`,
      });
      return {
        success: false,
        statusCode: 429,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        error: `บัญชีถูกระงับการเข้าสู่ระบบชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกิน ${RATE_LIMIT_MAX_ATTEMPTS} ครั้ง กรุณารอ ${rateCheck.retryAfterSeconds} วินาที`,
      };
    }

    const account = await repository.findUserByUsername(normalizedUsername);
    if (!account || !account.active) {
      await this.recordFailedLoginAttempt(rateKey, repository);
      return {
        success: false,
        statusCode: 401,
        error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
      };
    }

    const verifyRes = await this.verifyPasswordAndMigrateIfNeeded(
      password,
      account.passwordHash,
      account.id,
      repository
    );

    if (!verifyRes.valid) {
      const failState = await this.recordFailedLoginAttempt(rateKey, repository);
      await repository.recordAuditLog({
        actor: account.username,
        actorName: account.fullName,
        actorRole: account.role,
        action: failState.locked ? 'AUTH_BRUTE_FORCE_LOCKOUT' : 'AUTH_LOGIN_FAILED',
        entityType: 'User',
        entityId: account.id,
        summary: `เข้าสู่ระบบไม่สำเร็จสำหรับ ${account.username} (ครั้งที่ ${failState.failedAttempts}/${RATE_LIMIT_MAX_ATTEMPTS})`,
      });

      if (failState.locked) {
        const retryCheck = await this.checkRateLimit(rateKey, repository);
        return {
          success: false,
          statusCode: 429,
          retryAfterSeconds: retryCheck.retryAfterSeconds || 900,
          error: `บัญชีถูกระงับการเข้าสู่ระบบชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกิน ${RATE_LIMIT_MAX_ATTEMPTS} ครั้ง`,
        };
      }

      return {
        success: false,
        statusCode: 401,
        error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
      };
    }

    // Reset failed attempts upon successful login
    this.loginRateLimitMap.delete(rateKey);
    if (repository.deleteRateLimitEntry) {
      await repository.deleteRateLimitEntry(rateKey);
    }

    const token = this.issueSignedToken(account, 28800, repository.mode);
    const authUser: AuthenticatedUser = {
      userId: account.id,
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      personId: account.personId,
      department: account.department,
      authMode: 'VERIFIED_TOKEN',
    };

    await repository.recordAuditLog({
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
      statusCode: 200,
      token,
      user: authUser,
      passwordUpgradedToBcrypt: verifyRes.migrated,
    };
  }

  /**
   * Express authentication middleware (§4, §7 & §9).
   * - Verifies Bearer token signature, expiration, and both in-memory & repository-persisted session revocation.
   * - Re-queries the authoritative repository for `role` and `personId` (never trusts client claims).
   * - Strictly disables Mock Role Fallback when `repository.mode === 'REAL'` or `NODE_ENV === 'production'`.
   */
  public static createAuthMiddleware(repository: ISamAttRepository) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        const isRealOrProduction =
          repository.mode === 'REAL' ||
          process.env.SAM_ATT_REPO_MODE === 'REAL' ||
          process.env.NODE_ENV === 'production';

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.slice(7).trim();
          const verification = AuthService.verifySignedToken(token, repository.mode);
          if (!verification.valid || !verification.userId) {
            return res.status(401).json({
              success: false,
              error: `การยืนยันตัวตนไม่ผ่าน (${verification.reason || 'Invalid token'})`,
            });
          }

          // Check persistent session revocation in repository (survives backend restart & multi-process)
          if (verification.jti && repository.isSessionJtiRevoked) {
            const isRevokedInRepo = await repository.isSessionJtiRevoked(verification.jti);
            if (isRevokedInRepo) {
              this.revokedTokenJtis.add(verification.jti);
              return res.status(401).json({
                success: false,
                error: 'การยืนยันตัวตนไม่ผ่าน (Session has been revoked)',
              });
            }
          }

          const dbUser = await repository.findUserById(verification.userId);
          if (!dbUser || !dbUser.active) {
            return res.status(401).json({
              success: false,
              error: 'บัญชีผู้ใช้งานไม่มีอยู่ในระบบหรือถูกระงับการใช้งาน',
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
          (req as any).rawToken = token;

          return next();
        }

        // §4.12: NEVER allow Mock Role Fallback in REAL mode or Production!
        if (isRealOrProduction) {
          return res.status(401).json({
            success: false,
            error:
              'Unauthorized: Real/Production mode requires a valid signed Bearer token (Mock Persona Fallback is disabled).',
          });
        }

        // MOCK / TEST mode only: resolve persona by `x-sam-att-dev-user-id` from repository
        const devUserId =
          (req.headers['x-sam-att-dev-user-id'] as string | undefined) || 'USR002';
        const devAccount = await repository.findUserById(devUserId);

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
      } catch (err) {
        return next(err);
      }
    };
  }

  /**
   * Role-based access control guard (§4 & §7).
   */
  public static requireRoles(allowedRoles: ReadonlyArray<UserRole>, repository?: ISamAttRepository) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user as AuthenticatedUser | undefined;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
        });
      }

      if (!allowedRoles.includes(user.role)) {
        if (repository) {
          await repository.recordAuditLog({
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
   * Verify that a `GENERAL_USER` is only accessing their own `personId` across URL, Query, and Body (§4 & §10).
   */
  public static async verifyGeneralUserOwnAccess(
    req: Request,
    res: Response,
    repository?: ISamAttRepository
  ): Promise<{ allowed: true; personId: string } | { allowed: false }> {
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

    // Collect any personId / PERSON_ID / person_id candidate passed in URL params, Query string, or Request Body
    const candidateValues: string[] = [];
    const extractCandidates = (source: Record<string, unknown> | undefined) => {
      if (!source || typeof source !== 'object') return;
      for (const [k, v] of Object.entries(source)) {
        const lower = k.toLowerCase();
        if (lower === 'personid' || lower === 'person_id') {
          if (Array.isArray(v)) {
            v.forEach((item) => {
              if (item !== undefined && item !== null && String(item).trim() !== '') {
                candidateValues.push(String(item).trim());
              }
            });
          } else if (v !== undefined && v !== null && String(v).trim() !== '') {
            candidateValues.push(String(v).trim());
          }
        }
      }
    };

    extractCandidates(req.params as Record<string, unknown>);
    extractCandidates(req.query as Record<string, unknown>);
    extractCandidates(req.body as Record<string, unknown>);

    const unauthorizedTarget = candidateValues.find((val) => val !== user.personId);

    if (unauthorizedTarget && user.role === 'GENERAL_USER') {
      if (repository) {
        await repository.recordAuditLog({
          actor: user.username,
          actorName: user.fullName,
          actorRole: user.role,
          action: 'SECURITY_VIOLATION_CROSS_PERSON_ACCESS',
          entityType: 'Personnel',
          entityId: unauthorizedTarget,
          summary: `บล็อกความพยายามของ GENERAL_USER (${user.username}, personId=${user.personId}) ที่พยายามเข้าถึงข้อมูลของ ${unauthorizedTarget}`,
        });
      }
      res.status(403).json({
        success: false,
        error:
          'Forbidden: บทบาทผู้ใช้งานทั่วไป (GENERAL_USER) สามารถเข้าถึงเฉพาะข้อมูลเวลาปฏิบัติงานของตนเองเท่านั้น ห้ามเปลี่ยน PERSON_ID เพื่อดูข้อมูลผู้อื่น',
      });
      return { allowed: false };
    }

    return { allowed: true, personId: user.personId };
  }
}

