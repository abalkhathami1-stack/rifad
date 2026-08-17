const RBACService = require('../services/rbac.service');
const { sendError } = require('../utils/response.util');
const { ERROR_CODES } = require('../constants/error-codes');

/**
 * RBAC Permission Guard:
 * Ensures the authenticated user possesses the specific granular permission code.
 * Backend is the SOLE authoritative source of truth.
 */
function requirePermission(requiredPermission) {
  return (req, res, next) => {
    if (!req.user || !req.permissions) {
      return sendError(
        res,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        'المستخدم غير مصادق عليه',
        401
      );
    }

    const hasAccess = RBACService.hasPermission(req.permissions, requiredPermission);

    if (!hasAccess) {
      return sendError(
        res,
        ERROR_CODES.FORBIDDEN_INSUFFICIENT_PERMISSIONS,
        'ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء',
        403,
        { requiredPermission }
      );
    }

    next();
  };
}

module.exports = { requirePermission };
