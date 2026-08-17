const express = require('express');
const AcademicController = require('../controllers/academic.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.use(authenticate);

// 1. School Sections (الأقسام التعليمية)
router.get('/sections', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listSections);
router.post('/sections', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.createSection);
router.patch('/sections/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.updateSection);
router.delete('/sections/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.deleteSection);

// 2. Academic Years (السنوات الدراسية)
router.get('/years', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listYears);
router.post('/years', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.createYear);
router.patch('/years/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.updateYear);
router.delete('/years/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.deleteYear);

// 3. Academic Terms (الفصول الدراسية)
router.get('/years/:yearId/terms', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listTerms);
router.post('/years/:yearId/terms', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.createTerm);
router.patch('/terms/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.updateTerm);
router.delete('/terms/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_YEARS), AcademicController.deleteTerm);

// 4. Educational Stages (المراحل التعليمية)
router.get('/stages', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listStages);
router.post('/stages', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_STAGES), AcademicController.createStage);
router.patch('/stages/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_STAGES), AcademicController.updateStage);
router.delete('/stages/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_STAGES), AcademicController.deleteStage);

// 5. Grades (الصفوف الدراسية)
router.get('/grades', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listGrades);
router.post('/grades', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_GRADES), AcademicController.createGrade);
router.patch('/grades/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_GRADES), AcademicController.updateGrade);
router.delete('/grades/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_GRADES), AcademicController.deleteGrade);

// 6. Class Sections (الشعب الصفية)
router.get('/classes', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listClassSections);
router.post('/classes', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.createClassSection);
router.patch('/classes/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.updateClassSection);
router.delete('/classes/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SECTIONS), AcademicController.deleteClassSection);

// 7. Subjects (المواد الدراسية)
router.get('/subjects', requirePermission(PERMISSIONS.ACADEMIC_VIEW), AcademicController.listSubjects);
router.post('/subjects', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SUBJECTS), AcademicController.createSubject);
router.patch('/subjects/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SUBJECTS), AcademicController.updateSubject);
router.delete('/subjects/:id', requirePermission(PERMISSIONS.ACADEMIC_MANAGE_SUBJECTS), AcademicController.deleteSubject);

module.exports = router;
