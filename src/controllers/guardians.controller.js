const GuardiansService = require('../services/guardians.service');
const { sendSuccess } = require('../utils/response.util');

class GuardiansController {
  static async listGuardians(req, res, next) {
    try {
      const hasSensitivePermission =
        req.permissions?.includes('guardians.view_sensitive') ||
        req.permissions?.includes('*') ||
        req.isPlatformLevel;

      const result = await GuardiansService.listGuardians({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId,
        query: req.query.query,
        status: req.query.status,
        page: req.query.page,
        limit: req.query.limit,
        hasSensitivePermission
      });

      return sendSuccess(res, result, 200);
    } catch (e) {
      next(e);
    }
  }

  static async getGuardianById(req, res, next) {
    try {
      const hasSensitivePermission =
        req.permissions?.includes('guardians.view_sensitive') ||
        req.permissions?.includes('*') ||
        req.isPlatformLevel;

      const guardian = await GuardiansService.getGuardianById({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        id: req.params.id,
        hasSensitivePermission,
        callerUser: req.user,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, { guardian }, 200);
    } catch (e) {
      next(e);
    }
  }

  static async createGuardian(req, res, next) {
    try {
      const guardian = await GuardiansService.createGuardian({
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

      return sendSuccess(res, { guardian }, 201);
    } catch (e) {
      next(e);
    }
  }

  static async updateGuardian(req, res, next) {
    try {
      const guardian = await GuardiansService.updateGuardian({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        id: req.params.id,
        data: req.body,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, { guardian }, 200);
    } catch (e) {
      next(e);
    }
  }

  static async deleteGuardian(req, res, next) {
    try {
      const result = await GuardiansService.deleteGuardian({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        id: req.params.id,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, result, 200);
    } catch (e) {
      next(e);
    }
  }

  static async linkStudent(req, res, next) {
    try {
      const link = await GuardiansService.linkStudent({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        guardianId: req.params.id,
        data: req.body,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, { link }, 201);
    } catch (e) {
      next(e);
    }
  }

  static async unlinkStudent(req, res, next) {
    try {
      const result = await GuardiansService.unlinkStudent({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        guardianId: req.params.id,
        studentId: req.params.studentId,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, result, 200);
    } catch (e) {
      next(e);
    }
  }

  static async getGuardianStudents(req, res, next) {
    try {
      const students = await GuardiansService.getGuardianStudents({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        guardianId: req.params.id
      });

      return sendSuccess(res, { students }, 200);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = GuardiansController;
