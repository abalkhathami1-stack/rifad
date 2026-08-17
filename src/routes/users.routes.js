const express = require('express');
const UsersController = require('../controllers/users.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// 1. List and Retrieve Users
router.get('/', requirePermission(PERMISSIONS.USERS_VIEW), UsersController.listUsers);
router.get('/:id', requirePermission(PERMISSIONS.USERS_VIEW), UsersController.getUserById);

// 2. Create User
router.post('/', requirePermission(PERMISSIONS.USERS_CREATE), UsersController.createUser);

// 3. Update User Profile & Status
router.patch('/:id', requirePermission(PERMISSIONS.USERS_EDIT), UsersController.updateUser);
router.patch('/:id/status', requirePermission(PERMISSIONS.USERS_EDIT), UsersController.updateUserStatus);

// 4. Password Reset
router.post('/:id/reset-password', requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), UsersController.resetPassword);

// 5. Role Assignments Management
router.post('/:id/roles', requirePermission(PERMISSIONS.USERS_MANAGE_ROLES), UsersController.assignRole);
router.delete('/:id/roles/:roleAssignmentId', requirePermission(PERMISSIONS.USERS_MANAGE_ROLES), UsersController.removeRole);

module.exports = router;
