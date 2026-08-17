const ImportService = require('../services/import.service');
const { sendSuccess } = require('../utils/response.util');

class ImportController {
  /**
   * POST /api/v1/import/batches
   */
  static async createBatch(req, res, next) {
    try {
      const batch = await ImportService.createBatch({
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
   * POST /api/v1/import/batches/:id/upload
   */
  static async uploadFile(req, res, next) {
    try {
      const result = await ImportService.uploadFileToBatch(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        file: req.file,
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
   * POST /api/v1/import/batches/:id/records
   */
  static async addRecords(req, res, next) {
    try {
      const result = await ImportService.addRecords(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        records: req.body.records,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/import/batches/:id/validate
   */
  static async validateBatch(req, res, next) {
    try {
      const result = await ImportService.validateBatch(req.params.id, {
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
   * GET /api/v1/import/batches/:id/preview
   */
  static async getBatchPreview(req, res, next) {
    try {
      const result = await ImportService.getBatchPreview(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/import/batches/:id/commit
   */
  static async commitBatch(req, res, next) {
    try {
      const result = await ImportService.commitBatch(req.params.id, {
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
   * PATCH /api/v1/import/batches/:id/cancel
   */
  static async cancelBatch(req, res, next) {
    try {
      const batch = await ImportService.cancelBatch(req.params.id, {
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

  /**
   * GET /api/v1/import/batches
   */
  static async listBatches(req, res, next) {
    try {
      const result = await ImportService.listBatches({
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
   * GET /api/v1/import/batches/:id
   */
  static async getBatchById(req, res, next) {
    try {
      const batch = await ImportService.getBatchById(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, { batch }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/import/batches/:id/errors
   */
  static async getBatchErrors(req, res, next) {
    try {
      const result = await ImportService.getBatchErrors(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ImportController;
