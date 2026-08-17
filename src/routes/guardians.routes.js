const express = require('express');
const GuardiansController = require('../controllers/guardians.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.use(authenticate);

// 1. List and Retrieve Guardians
router.get('/', requirePermission(PERMISSIONS.GUARDIANS_VIEW), GuardiansController.listGuardians);
router.get('/:id', requirePermission(PERMISSIONS.GUARDIANS_VIEW), GuardiansController.getGuardianById);

// 2. Create Guardian
router.post('/', requirePermission(PERMISSIONS.GUARDIANS_CREATE), GuardiansController.createGuardian);

// 3. Update Guardian
router.patch('/:id', requirePermission(PERMISSIONS.GUARDIANS_EDIT), GuardiansController.updateGuardian);

// 4. Delete Guardian (Soft Delete)
router.delete('/:id', requirePermission(PERMISSIONS.GUARDIANS_DELETE), GuardiansController.deleteGuardian);

// 5. Student-Guardian Relations
router.post('/:id/students', requirePermission(PERMISSIONS.GUARDIANS_LINK_STUDENT), GuardiansController.linkStudent);
router.delete('/:id/students/:studentId', requirePermission(PERMISSIONS.GUARDIANS_LINK_STUDENT), GuardiansController.unlinkStudent);
router.get('/:id/students', requirePermission(PERMISSIONS.GUARDIANS_VIEW), GuardiansController.getGuardianStudents);

module.exports = router;
