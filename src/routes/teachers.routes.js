const express = require('express');
const TeachersController = require('../controllers/teachers.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.use(authenticate);

// 1. Specializations
router.get('/specializations', requirePermission(PERMISSIONS.TEACHERS_VIEW), TeachersController.listSpecializations);
router.post('/specializations', requirePermission(PERMISSIONS.TEACHERS_CREATE), TeachersController.createSpecialization);
router.patch('/specializations/:id', requirePermission(PERMISSIONS.TEACHERS_EDIT), TeachersController.updateSpecialization);

// 2. Teachers CRUD
router.get('/', requirePermission(PERMISSIONS.TEACHERS_VIEW), TeachersController.listTeachers);
router.get('/:id', requirePermission(PERMISSIONS.TEACHERS_VIEW), TeachersController.getTeacherById);
router.post('/', requirePermission(PERMISSIONS.TEACHERS_CREATE), TeachersController.createTeacher);
router.patch('/:id', requirePermission(PERMISSIONS.TEACHERS_EDIT), TeachersController.updateTeacher);
router.patch('/:id/status', requirePermission(PERMISSIONS.TEACHERS_EDIT), TeachersController.updateTeacherStatus);
router.delete('/:id', requirePermission(PERMISSIONS.TEACHERS_DELETE), TeachersController.deleteTeacher);

// 3. Teacher Subjects (التأهيل والربط بالمواد)
router.post('/:id/subjects', requirePermission(PERMISSIONS.TEACHERS_ASSIGN), TeachersController.assignTeacherSubject);
router.delete('/:id/subjects/:subjectId', requirePermission(PERMISSIONS.TEACHERS_ASSIGN), TeachersController.removeTeacherSubject);

// 4. Assignments (إسناد التدريس للشعب)
router.post('/:id/assignments', requirePermission(PERMISSIONS.TEACHERS_ASSIGN), TeachersController.createAssignment);
router.get('/:id/assignments', requirePermission(PERMISSIONS.TEACHERS_VIEW), TeachersController.listAssignments);

module.exports = router;
