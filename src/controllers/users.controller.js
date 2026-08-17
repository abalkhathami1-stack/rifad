const UsersService = require('../services/users.service');
const { sendSuccess } = require('../utils/response.util');

class UsersController {
  /**
   * GET /api/v1/users
   */
  static async listUsers(req, res, next) {
    try {
      const result = await UsersService.listUsers({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        query: req.query
      });

      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/users/:id
   */
  static async getUserById(req, res, next) {
    try {
      const user = await UsersService.getUserById(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });

      return sendSuccess(res, { user }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/users
   */
  static async createUser(req, res, next) {
    try {
      const user = await UsersService.createUser({
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

      return sendSuccess(res, { user }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/users/:id
   */
  static async updateUser(req, res, next) {
    try {
      const user = await UsersService.updateUser(req.params.id, {
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

      return sendSuccess(res, { user }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/users/:id/status
   */
  static async updateUserStatus(req, res, next) {
    try {
      const user = await UsersService.updateUserStatus(req.params.id, {
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

      return sendSuccess(res, { user }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/users/:id/reset-password
   */
  static async resetPassword(req, res, next) {
    try {
      const result = await UsersService.resetPassword(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        newPassword: req.body.newPassword,
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
   * POST /api/v1/users/:id/roles
   */
  static async assignRole(req, res, next) {
    try {
      const assignment = await UsersService.assignRole(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        roleCode: req.body.roleCode,
        scopeType: req.body.scopeType,
        schoolId: req.body.schoolId,
        sectionDivisionId: req.body.sectionDivisionId,
        context: {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }
      });

      return sendSuccess(res, { assignment }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/users/:id/roles/:roleAssignmentId
   */
  static async removeRole(req, res, next) {
    try {
      const result = await UsersService.removeRole(req.params.id, req.params.roleAssignmentId || req.params.roleId, {
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
}

module.exports = UsersController;
