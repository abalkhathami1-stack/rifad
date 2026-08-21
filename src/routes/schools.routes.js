const express = require('express');
const SchoolsController = require('../controllers/schools.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Read-only Schools catalog — feeds the school selector in Users & Roles
// Management (Create User / Assign Role).
//
// Gated by users.manage_roles rather than users.view: in the current
// permission seed (prisma/seed.js) only SCHOOL_ADMIN and PLATFORM_OWNER hold
// users.manage_roles, and both of those roles also hold users.create — so
// both flows that need this catalog stay covered. Gating on users.view
// instead would additionally expose it to AUDITOR (read-only, never creates
// users or assigns roles), which is unnecessary exposure. Least privilege:
// this endpoint is authorized for exactly the roles that mutate role/scope
// assignments, since that is what it ultimately serves.
router.get('/', requirePermission(PERMISSIONS.USERS_MANAGE_ROLES), SchoolsController.listSchools);

module.exports = router;
