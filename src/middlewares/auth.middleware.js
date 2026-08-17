const env = require('../config/env');
const AuthService = require('../services/auth.service');
const { sendError } = require('../utils/response.util');
const { ERROR_CODES } = require('../constants/error-codes');

/**
 * Authentication Middleware:
 * Uses HttpOnly Secure Cookies as the primary authentication mechanism for V1.
 * Backend is the SOLE authoritative source of truth for authorization and session validity.
 */
async function authenticate(req, res, next) {
  try {
    // 1. Read token strictly from HttpOnly Cookie for V1
    const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];

    if (!rawToken) {
      return sendError(
        res,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        'يرجى تسجيل الدخول للوصول إلى هذا المورد',
        401
      );
    }

    // 2. Validate session against database
    const authContext = await AuthService.validateSession(rawToken);

    if (!authContext) {
      // Clear invalid/expired cookie
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/'
      });

      return sendError(
        res,
        ERROR_CODES.AUTH_SESSION_EXPIRED,
        'انتهت صلاحية الجلسة أو تم إلغاؤها، يرجى تسجيل الدخول مجدداً',
        401
      );
    }

    // 3. Attach authenticated context to request
    req.rawToken = rawToken;
    req.session = authContext.session;
    req.user = authContext.user;
    req.roles = authContext.roles;
    req.permissions = authContext.permissions;
    req.scopes = authContext.scopes;
    req.isPlatformLevel = authContext.isPlatformLevel;

    next();
  } catch (error) {
    console.error('⚠️ [AuthMiddleware Error]:', error);
    return sendError(
      res,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'حدث خطأ أثناء التحقق من هوية المستخدم',
      500
    );
  }
}

module.exports = authenticate;
