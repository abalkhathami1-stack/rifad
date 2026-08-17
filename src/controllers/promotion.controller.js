const PromotionService = require('../services/promotion.service');
const { sendSuccess } = require('../utils/response.util');

class PromotionController {
  /**
   * POST /api/v1/promotion/batches
   */
  static async createBatch(req, res, next) {
    try {
      const batch = await PromotionService.createBatch({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, { batch }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/promotion/batches
   */
  static async listBatches(req, res, next) {
    try {
      const result = await PromotionService.listBatches({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId,
        query: req.query
      });
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/promotion/batches/:id
   */
  static async getBatchById(req, res, next) {
    try {
      const batch = await PromotionService.getBatchById(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        query: req.query
      });
      return sendSuccess(res, { batch }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/promotion/batches/:id/generate
   */
  static async generateBatchItems(req, res, next) {
    try {
      const result = await PromotionService.generateBatchItems(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/promotion/items/:id
   */
  static async updateBatchItem(req, res, next) {
    try {
      const item = await PromotionService.updateBatchItem(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, { item }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/promotion/batches/:id/status
   */
  static async updateBatchStatus(req, res, next) {
    try {
      const batch = await PromotionService.updateBatchStatus(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        status: req.body.status,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, { batch }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/promotion/batches/:id/approve
   */
  static async approveBatch(req, res, next) {
    try {
      const batch = await PromotionService.approveBatch(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, { batch }, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PromotionController;
