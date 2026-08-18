const express = require('express');
const ImportController = require('../controllers/import.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate);

// 1. Batches Management
router.get('/batches', requirePermission(PERMISSIONS.IMPORT_VIEW), ImportController.listBatches);
router.post('/batches', requirePermission(PERMISSIONS.IMPORT_UPLOAD), ImportController.createBatch);
router.get('/batches/:id', requirePermission(PERMISSIONS.IMPORT_VIEW), ImportController.getBatchById);
router.get('/batches/:id/errors', requirePermission(PERMISSIONS.IMPORT_VIEW), ImportController.getBatchErrors);

// 2. File Upload & Staging
router.post('/batches/:id/upload', requirePermission(PERMISSIONS.IMPORT_UPLOAD), upload.single('file'), ImportController.uploadFile);
router.post('/batches/:id/records', requirePermission(PERMISSIONS.IMPORT_UPLOAD), ImportController.addRecords);

// 3. Validation & Review Preview
router.post('/batches/:id/validate', requirePermission(PERMISSIONS.IMPORT_VALIDATE), ImportController.validateBatch);
router.get('/batches/:id/preview', requirePermission(PERMISSIONS.IMPORT_VIEW), ImportController.getBatchPreview);

// 4. Commit & Cancel
router.post('/batches/:id/commit', requirePermission(PERMISSIONS.IMPORT_COMMIT), ImportController.commitBatch);
router.post('/batches/:id/commit-onboarding', requirePermission(PERMISSIONS.IMPORT_COMMIT), ImportController.commitStudentOnboardingBatch);
router.patch('/batches/:id/cancel', requirePermission(PERMISSIONS.IMPORT_CANCEL), ImportController.cancelBatch);

module.exports = router;
