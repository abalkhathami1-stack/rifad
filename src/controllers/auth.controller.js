const env = require('../config/env');
const AuthService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response.util');

class AuthController {
  /**
   * POST /api/v1/auth/login
   * Authenticates user and sets HttpOnly Secure Cookie.
   */
  static async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent') || 'Unknown';

      const authData = await AuthService.login({
        username,
        password,
        ipAddress,
        userAgent,
        requestId: req.id
      });

      // Set HttpOnly Secure Cookie as the primary session mechanism
      res.cookie(env.SESSION_COOKIE_NAME, authData.rawToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        expires: authData.expiresAt,
        path: '/'
      });

      return sendSuccess(
        res,
        {
          user: authData.user,
          roles: authData.roles,
          permissions: authData.permissions,
          scopes: authData.scopes,
          expiresAt: authData.expiresAt
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user profile, roles, and permissions.
   */
  static async getMe(req, res, next) {
    try {
      return sendSuccess(
        res,
        {
          user: req.user,
          roles: req.roles,
          permissions: req.permissions,
          scopes: req.scopes,
          isPlatformLevel: req.isPlatformLevel
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Revokes current session and clears HttpOnly Cookie.
   */
  static async logout(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent') || 'Unknown';

      await AuthService.logout(req.rawToken, {
        requestId: req.id,
        ipAddress,
        userAgent
      });

      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/'
      });

      return sendSuccess(res, { message: 'تم تسجيل الخروج بنجاح' }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout-all
   * Revokes all active sessions for the user across all devices.
   */
  static async logoutAll(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent') || 'Unknown';

      const revokedCount = await AuthService.logoutAll(req.user.id, {
        requestId: req.id,
        ipAddress,
        userAgent
      });

      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/'
      });

      return sendSuccess(
        res,
        {
          message: 'تم تسجيل الخروج وإلغاء كافة الجلسات النشطة عبر جميع الأجهزة',
          revokedSessions: revokedCount
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
