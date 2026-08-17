const argon2 = require('argon2');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { generateOpaqueToken, hashToken } = require('../utils/crypto.util');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AuditService = require('./audit.service');
const RBACService = require('./rbac.service');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

class AuthService {
  /**
   * Authenticates user via username and password, enforces lockout, and issues a secure session.
   */
  static async login({ username, password, ipAddress = null, userAgent = null, requestId = null }) {
    if (!username || !password) {
      throw new AppError('اسم المستخدم وكلمة المرور مطلوبان', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // 1. Find user by username
    const user = await prisma.user.findFirst({
      where: {
        username: username.trim(),
        deletedAt: null
      }
    });

    if (!user) {
      await AuditService.logLoginAttempt({
        username,
        ipAddress,
        userAgent,
        isSuccess: false,
        failureReason: 'USER_NOT_FOUND'
      });
      throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // 2. Check Account Status
    if (user.status !== 'ACTIVE') {
      await AuditService.logLoginAttempt({
        username,
        ipAddress,
        userAgent,
        isSuccess: false,
        failureReason: 'ACCOUNT_INACTIVE'
      });
      throw new AppError('الحساب غير نشط أو تم تجميده، يرجى مراجعة إدارة النظام', 403, ERROR_CODES.AUTH_ACCOUNT_INACTIVE);
    }

    // 3. Check Lockout Status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      await AuditService.logLoginAttempt({
        username,
        ipAddress,
        userAgent,
        isSuccess: false,
        failureReason: 'ACCOUNT_LOCKED'
      });
      throw new AppError(
        `تم قفل الحساب مؤقتاً لتكرار المحاولات الخاطئة. يرجى المحاولة بعد ${remainingMinutes} دقيقة`,
        403,
        ERROR_CODES.AUTH_ACCOUNT_LOCKED
      );
    }

    // 4. Verify Password with Argon2id
    let isPasswordValid = false;
    try {
      isPasswordValid = await argon2.verify(user.passwordHash, password);
    } catch (err) {
      console.error('⚠️ [Argon2 Error] Failed to verify password:', err.message);
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      const nextFailedAttempts = user.failedLoginAttempts + 1;
      let newLockedUntil = null;

      if (nextFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        newLockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextFailedAttempts,
          lockedUntil: newLockedUntil
        }
      });

      await AuditService.logLoginAttempt({
        username,
        ipAddress,
        userAgent,
        isSuccess: false,
        failureReason: 'INVALID_PASSWORD'
      });

      await AuditService.logAuditEvent({
        requestId,
        userId: user.id,
        eventType: 'LOGIN_FAILED',
        entityName: 'User',
        entityId: user.id,
        action: 'LOGIN',
        newData: { reason: 'INVALID_PASSWORD', attempt: nextFailedAttempts },
        ipAddress,
        userAgent
      });

      if (newLockedUntil) {
        throw new AppError(
          `تم قفل الحساب لمدة ${LOCKOUT_MINUTES} دقيقة بسبب تجاوز الحد الأقصى للمحاولات الخاطئة`,
          403,
          ERROR_CODES.AUTH_ACCOUNT_LOCKED
        );
      }

      throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401, ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // 5. Password Valid -> Reset Failure Counters & Create Session
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const [session] = await prisma.$transaction([
      prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash,
          ipAddress,
          userAgent,
          expiresAt
        }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date()
        }
      })
    ]);

    // 6. Load User Roles & Permissions
    const rbac = await RBACService.loadUserRBAC(user.id);

    // 7. Audit Log for Login Success
    await AuditService.logLoginAttempt({
      username,
      ipAddress,
      userAgent,
      isSuccess: true
    });

    await AuditService.logAuditEvent({
      requestId,
      userId: user.id,
      eventType: 'LOGIN_SUCCESS',
      entityName: 'User',
      entityId: user.id,
      action: 'LOGIN',
      newData: { sessionId: session.id, roles: rbac.roles },
      ipAddress,
      userAgent
    });

    return {
      rawToken,
      expiresAt,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        status: user.status
      },
      ...rbac
    };
  }

  /**
   * Validates an active session token and loads the associated user context.
   */
  static async validateSession(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = hashToken(rawToken);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      include: {
        user: true
      }
    });

    if (!session) {
      return null;
    }

    // Check revocation & expiration
    if (session.isRevoked || session.expiresAt <= new Date()) {
      return null;
    }

    // Check user active status & soft delete
    if (session.user.deletedAt !== null || session.user.status !== 'ACTIVE') {
      return null;
    }

    // Invalidate session if password was changed after session creation
    if (session.user.passwordChangedAt && session.user.passwordChangedAt > session.createdAt) {
      return null;
    }

    // Load RBAC permissions
    const rbac = await RBACService.loadUserRBAC(session.user.id);

    return {
      session,
      user: {
        id: session.user.id,
        username: session.user.username,
        email: session.user.email,
        fullName: session.user.fullName,
        status: session.user.status
      },
      ...rbac
    };
  }

  /**
   * Logs out the current session by setting is_revoked = true.
   */
  static async logout(rawToken, { requestId = null, ipAddress = null, userAgent = null } = {}) {
    if (!rawToken) {
      return false;
    }

    const tokenHash = hashToken(rawToken);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash }
    });

    if (!session || session.isRevoked) {
      return false;
    }

    await prisma.userSession.update({
      where: { id: session.id },
      data: { isRevoked: true }
    });

    await AuditService.logAuditEvent({
      requestId,
      userId: session.userId,
      eventType: 'LOGOUT',
      entityName: 'UserSession',
      entityId: session.id,
      action: 'DELETE',
      newData: { sessionId: session.id, reason: 'USER_LOGOUT' },
      ipAddress,
      userAgent
    });

    return true;
  }

  /**
   * Revokes all active sessions for a user across all devices.
   */
  static async logoutAll(userId, { requestId = null, ipAddress = null, userAgent = null } = {}) {
    const updated = await prisma.userSession.updateMany({
      where: {
        userId,
        isRevoked: false
      },
      data: {
        isRevoked: true
      }
    });

    await AuditService.logAuditEvent({
      requestId,
      userId,
      eventType: 'LOGOUT_ALL_DEVICES',
      entityName: 'User',
      entityId: userId,
      action: 'UPDATE',
      newData: { revokedCount: updated.count },
      ipAddress,
      userAgent
    });

    return updated.count;
  }
}

module.exports = AuthService;
