const RBACService = require('../services/rbac.service');
const { sendError } = require('../utils/response.util');
const { ERROR_CODES } = require('../constants/error-codes');

/**
 * Multi-Tenancy Scope Guard:
 * Validates that the user's role assignment scope (PLATFORM, SCHOOL, SECTION)
 * allows operations on the requested school or section resource.
 *
 * @param {Function} scopeExtractor - A function (req) => ({ targetSchoolId, targetSectionDivisionId })
 */
function requireScope(scopeExtractor) {
  return (req, res, next) => {
    if (!req.user || !req.scopes) {
      return sendError(
        res,
        ERROR_CODES.AUTH_UNAUTHENTICATED,
        'المستخدم غير مصادق عليه',
        401
      );
    }

    // Platform-level users bypass multi-tenant restrictions
    if (req.isPlatformLevel) {
      return next();
    }

    const { targetSchoolId = null, targetSectionDivisionId = null } = scopeExtractor(req) || {};

    const isScopeAllowed = RBACService.validateScopeAccess(req.scopes, {
      targetSchoolId,
      targetSectionDivisionId
    });

    if (!isScopeAllowed) {
      return sendError(
        res,
        ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION,
        'غير مصرح لك بالوصول إلى بيانات هذا النطاق أو المدرسة',
        403,
        { targetSchoolId, targetSectionDivisionId }
      );
    }

    next();
  };
}

module.exports = { requireScope };
