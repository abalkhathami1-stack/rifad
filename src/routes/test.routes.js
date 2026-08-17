const express = require('express');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { requireScope } = require('../middlewares/scope.middleware');
const { sendSuccess } = require('../utils/response.util');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.get(
  '/permission-check',
  authenticate,
  requirePermission(PERMISSIONS.USERS_VIEW),
  (req, res) => {
    return sendSuccess(res, { message: 'Permission Verified Successfully' }, 200);
  }
);

router.get(
  '/forbidden-permission-check',
  authenticate,
  requirePermission('unauthorized.system.action'),
  (req, res) => {
    return sendSuccess(res, { message: 'Should not be reached' }, 200);
  }
);

router.get(
  '/scope-check/:schoolId',
  authenticate,
  requireScope((req) => ({ targetSchoolId: req.params.schoolId })),
  (req, res) => {
    return sendSuccess(res, { message: 'Scope Verified Successfully', schoolId: req.params.schoolId }, 200);
  }
);

module.exports = router;
