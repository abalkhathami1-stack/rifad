const express = require('express');
const PromotionController = require('../controllers/promotion.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requirePermission } = require('../middlewares/rbac.middleware');
const { PERMISSIONS } = require('../constants/permissions');

const router = express.Router();

router.use(authenticate);

// 1. Batches Management
router.get('/batches', requirePermission(PERMISSIONS.PROMOTION_VIEW), PromotionController.listBatches);
router.post('/batches', requirePermission(PERMISSIONS.PROMOTION_CREATE_BATCH), PromotionController.createBatch);
router.get('/batches/:id', requirePermission(PERMISSIONS.PROMOTION_VIEW), PromotionController.getBatchById);
router.patch('/batches/:id/status', requirePermission(PERMISSIONS.PROMOTION_EDIT_BATCH), PromotionController.updateBatchStatus);

// 2. Generate Decisions & Review Items
router.post('/batches/:id/generate', requirePermission(PERMISSIONS.PROMOTION_EDIT_BATCH), PromotionController.generateBatchItems);
router.patch('/items/:id', requirePermission(PERMISSIONS.PROMOTION_EDIT_BATCH), PromotionController.updateBatchItem);

// 3. Approve & Execute Rollover
router.post('/batches/:id/approve', requirePermission(PERMISSIONS.PROMOTION_APPROVE_BATCH), PromotionController.approveBatch);

module.exports = router;
