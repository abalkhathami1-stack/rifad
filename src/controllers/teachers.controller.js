const TeachersService = require('../services/teachers.service');
const { sendSuccess } = require('../utils/response.util');

class TeachersController {
  // Specializations
  static async listSpecializations(req, res, next) {
    try {
      const specializations = await TeachersService.listSpecializations({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { specializations }, 200);
    } catch (e) { next(e); }
  }

  static async createSpecialization(req, res, next) {
    try {
      const specialization = await TeachersService.createSpecialization({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { specialization }, 201);
    } catch (e) { next(e); }
  }

  static async updateSpecialization(req, res, next) {
    try {
      const specialization = await TeachersService.updateSpecialization(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { specialization }, 200);
    } catch (e) { next(e); }
  }

  // Teachers
  static async listTeachers(req, res, next) {
    try {
      const result = await TeachersService.listTeachers({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        callerPermissions: req.permissions,
        schoolId: req.query.schoolId,
        query: req.query
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  static async getTeacherById(req, res, next) {
    try {
      const teacher = await TeachersService.getTeacherById(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        callerPermissions: req.permissions
      });
      return sendSuccess(res, { teacher }, 200);
    } catch (e) { next(e); }
  }

  static async createTeacher(req, res, next) {
    try {
      const teacher = await TeachersService.createTeacher({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { teacher }, 201);
    } catch (e) { next(e); }
  }

  static async updateTeacher(req, res, next) {
    try {
      const teacher = await TeachersService.updateTeacher(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { teacher }, 200);
    } catch (e) { next(e); }
  }

  static async updateTeacherStatus(req, res, next) {
    try {
      const teacher = await TeachersService.updateTeacherStatus(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        status: req.body.status,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { teacher }, 200);
    } catch (e) { next(e); }
  }

  static async deleteTeacher(req, res, next) {
    try {
      const result = await TeachersService.deleteTeacher(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // Teacher Subjects
  static async assignTeacherSubject(req, res, next) {
    try {
      const result = await TeachersService.assignTeacherSubject(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        subjectId: req.body.subjectId,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { teacherSubject: result }, 201);
    } catch (e) { next(e); }
  }

  static async removeTeacherSubject(req, res, next) {
    try {
      const result = await TeachersService.removeTeacherSubject(req.params.id, req.params.subjectId, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // Teacher Assignments
  static async createAssignment(req, res, next) {
    try {
      const assignment = await TeachersService.createAssignment(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { assignment }, 201);
    } catch (e) { next(e); }
  }

  static async listAssignments(req, res, next) {
    try {
      const assignments = await TeachersService.listAssignments(req.params.id, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, { assignments }, 200);
    } catch (e) { next(e); }
  }
}

module.exports = TeachersController;
