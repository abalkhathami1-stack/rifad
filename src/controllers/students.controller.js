const StudentsService = require('../services/students.service');
const { sendSuccess } = require('../utils/response.util');

class StudentsController {
  /**
   * GET /api/v1/students
   */
  static async listStudents(req, res, next) {
    try {
      const result = await StudentsService.listStudents({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        callerPermissions: req.permissions,
        schoolId: req.query.schoolId,
        query: req.query
      });
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/students/:id
   */
  static async getStudentById(req, res, next) {
    try {
      const student = await StudentsService.getStudentById(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        callerPermissions: req.permissions
      });
      return sendSuccess(res, { student }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/students
   */
  static async createStudent(req, res, next) {
    try {
      const student = await StudentsService.createStudent({
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
      return sendSuccess(res, { student }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/students/:id
   */
  static async updateStudent(req, res, next) {
    try {
      const student = await StudentsService.updateStudent(req.params.id, {
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
      return sendSuccess(res, { student }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/students/:id/status
   */
  static async updateStudentStatus(req, res, next) {
    try {
      const student = await StudentsService.updateStudentStatus(req.params.id, {
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
      return sendSuccess(res, { student }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/students/:id/enroll
   */
  static async enrollStudent(req, res, next) {
    try {
      const enrollment = await StudentsService.enrollStudent(req.params.id, {
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
      return sendSuccess(res, { enrollment }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/students/:id/history
   */
  static async getEnrollmentHistory(req, res, next) {
    try {
      const history = await StudentsService.getEnrollmentHistory(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, { history }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/students/:id
   */
  static async deleteStudent(req, res, next) {
    try {
      const result = await StudentsService.deleteStudent(req.params.id, {
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

module.exports = StudentsController;
