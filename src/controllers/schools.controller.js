const SchoolsService = require('../services/schools.service');
const { sendSuccess } = require('../utils/response.util');

class SchoolsController {
  /**
   * GET /api/v1/schools
   * Read-only schools catalog, scoped to the caller via RBAC.
   */
  static async listSchools(req, res, next) {
    try {
      const result = await SchoolsService.listSchools({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });

      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SchoolsController;
