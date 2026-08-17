const express = require('express');
const StudentsController = require('../controllers/students.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.use(authenticate);

// 1. List and Retrieve Students
router.get('/', requirePermission(PERMISSIONS.STUDENTS_VIEW), StudentsController.listStudents);
router.get('/:id', requirePermission(PERMISSIONS.STUDENTS_VIEW), StudentsController.getStudentById);

// 2. Create Student
router.post('/', requirePermission(PERMISSIONS.STUDENTS_CREATE), StudentsController.createStudent);

// 3. Update Student & Status
router.patch('/:id', requirePermission(PERMISSIONS.STUDENTS_EDIT), StudentsController.updateStudent);
router.patch('/:id/status', requirePermission(PERMISSIONS.STUDENTS_EDIT), StudentsController.updateStudentStatus);

// 4. Enrollments & History
router.post('/:id/enroll', requirePermission(PERMISSIONS.STUDENTS_ENROLL), StudentsController.enrollStudent);
router.get('/:id/history', requirePermission(PERMISSIONS.STUDENTS_VIEW), StudentsController.getEnrollmentHistory);

// 5. Delete Student (Soft Delete with enrollment protection)
router.delete('/:id', requirePermission(PERMISSIONS.STUDENTS_DELETE), StudentsController.deleteStudent);

module.exports = router;
