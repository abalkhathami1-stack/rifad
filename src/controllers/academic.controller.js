const AcademicService = require('../services/academic.service');
const { sendSuccess } = require('../utils/response.util');

class AcademicController {
  // 1. Sections
  static async listSections(req, res, next) {
    try {
      const data = await AcademicService.listSections({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { sections: data }, 200);
    } catch (e) { next(e); }
  }

  static async createSection(req, res, next) {
    try {
      const data = await AcademicService.createSection({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { section: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateSection(req, res, next) {
    try {
      const data = await AcademicService.updateSection(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { section: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteSection(req, res, next) {
    try {
      const result = await AcademicService.deleteSection(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 2. Years
  static async listYears(req, res, next) {
    try {
      const data = await AcademicService.listYears({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { academicYears: data }, 200);
    } catch (e) { next(e); }
  }

  static async createYear(req, res, next) {
    try {
      const data = await AcademicService.createYear({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { academicYear: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateYear(req, res, next) {
    try {
      const data = await AcademicService.updateYear(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { academicYear: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteYear(req, res, next) {
    try {
      const result = await AcademicService.deleteYear(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 3. Terms
  static async listTerms(req, res, next) {
    try {
      const data = await AcademicService.listTerms(req.params.yearId, {
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel
      });
      return sendSuccess(res, { terms: data }, 200);
    } catch (e) { next(e); }
  }

  static async createTerm(req, res, next) {
    try {
      const data = await AcademicService.createTerm({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        yearId: req.params.yearId,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { term: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateTerm(req, res, next) {
    try {
      const data = await AcademicService.updateTerm(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { term: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteTerm(req, res, next) {
    try {
      const result = await AcademicService.deleteTerm(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 4. Stages
  static async listStages(req, res, next) {
    try {
      const data = await AcademicService.listStages({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { stages: data }, 200);
    } catch (e) { next(e); }
  }

  static async createStage(req, res, next) {
    try {
      const data = await AcademicService.createStage({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { stage: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateStage(req, res, next) {
    try {
      const data = await AcademicService.updateStage(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { stage: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteStage(req, res, next) {
    try {
      const result = await AcademicService.deleteStage(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 5. Grades
  static async listGrades(req, res, next) {
    try {
      const data = await AcademicService.listGrades({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        stageId: req.query.stageId,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { grades: data }, 200);
    } catch (e) { next(e); }
  }

  static async createGrade(req, res, next) {
    try {
      const data = await AcademicService.createGrade({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { grade: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateGrade(req, res, next) {
    try {
      const data = await AcademicService.updateGrade(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { grade: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteGrade(req, res, next) {
    try {
      const result = await AcademicService.deleteGrade(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 6. Class Sections
  static async listClassSections(req, res, next) {
    try {
      const data = await AcademicService.listClassSections({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        academicYearId: req.query.academicYearId,
        gradeId: req.query.gradeId,
        sectionDivisionId: req.query.sectionDivisionId,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { classSections: data }, 200);
    } catch (e) { next(e); }
  }

  static async createClassSection(req, res, next) {
    try {
      const data = await AcademicService.createClassSection({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { classSection: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateClassSection(req, res, next) {
    try {
      const data = await AcademicService.updateClassSection(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { classSection: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteClassSection(req, res, next) {
    try {
      const result = await AcademicService.deleteClassSection(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }

  // 7. Subjects
  static async listSubjects(req, res, next) {
    try {
      const data = await AcademicService.listSubjects({
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        schoolId: req.query.schoolId
      });
      return sendSuccess(res, { subjects: data }, 200);
    } catch (e) { next(e); }
  }

  static async createSubject(req, res, next) {
    try {
      const data = await AcademicService.createSubject({
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { subject: data }, 201);
    } catch (e) { next(e); }
  }

  static async updateSubject(req, res, next) {
    try {
      const data = await AcademicService.updateSubject(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        data: req.body,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, { subject: data }, 200);
    } catch (e) { next(e); }
  }

  static async deleteSubject(req, res, next) {
    try {
      const result = await AcademicService.deleteSubject(req.params.id, {
        callerUser: req.user,
        callerScopes: req.scopes,
        isPlatformLevel: req.isPlatformLevel,
        context: { requestId: req.id, ipAddress: req.ip, userAgent: req.get('user-agent') }
      });
      return sendSuccess(res, result, 200);
    } catch (e) { next(e); }
  }
}

module.exports = AcademicController;
