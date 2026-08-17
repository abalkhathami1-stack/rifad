const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');

class AcademicService {
  /**
   * Helper to resolve and strictly enforce school scope.
   */
  static resolveSchoolId({ callerScopes = [], isPlatformLevel = false, requestedSchoolId = null }) {
    if (isPlatformLevel) {
      if (!requestedSchoolId) {
        throw new AppError('يجب تحديد معرف المدرسة (schoolId)', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      return requestedSchoolId;
    }

    const callerSchoolIds = callerScopes.map(s => s.schoolId).filter(Boolean);
    if (callerSchoolIds.length === 0) {
      throw new AppError('المستخدم الحالي غير مسند إلى أي مدرسة', 403, ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION);
    }

    if (requestedSchoolId && !callerSchoolIds.includes(requestedSchoolId)) {
      throw new AppError('غير مصرح لك بإدارة بيانات مدرسة أخرى خارج نطاقك', 403, ERROR_CODES.FORBIDDEN_SCOPE_VIOLATION);
    }

    return requestedSchoolId || callerSchoolIds[0];
  }

  // ==========================================
  // 1. SCHOOL SECTIONS (الأقسام التعليمية)
  // ==========================================
  static async listSections({ callerScopes, isPlatformLevel, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    return await prisma.schoolSection.findMany({
      where: { schoolId: targetSchoolId, deletedAt: null },
      orderBy: { createdAt: 'asc' }
    });
  }

  static async createSection({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { genderType, nameAr, nameEn } = data;

    if (!genderType || !nameAr) {
      throw new AppError('نوع القسم (genderType) والاسم العربي (nameAr) حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const section = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolSection.create({
        data: { schoolId, genderType, nameAr: nameAr.trim(), nameEn: nameEn?.trim() || null }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_SECTION_CREATED',
          entityName: 'SchoolSection',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, genderType: created.genderType },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return section;
  }

  static async updateSection(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const section = await prisma.schoolSection.findFirst({ where: { id, deletedAt: null } });
    if (!section) throw new AppError('القسم التعليمي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: section.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.genderType !== undefined) updateData.genderType = data.genderType;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.schoolSection.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: section.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_SECTION_UPDATED',
          entityName: 'SchoolSection',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: section.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteSection(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const section = await prisma.schoolSection.findFirst({ where: { id, deletedAt: null } });
    if (!section) throw new AppError('القسم التعليمي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: section.schoolId });

    // Prevent deletion if connected to class sections
    const activeClasses = await prisma.classSection.count({ where: { sectionDivisionId: id, deletedAt: null } });
    if (activeClasses > 0) {
      throw new AppError('لا يمكن حذف القسم لوجود شعب صفية مرتبطة به', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.schoolSection.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: section.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_SECTION_DELETED',
          entityName: 'SchoolSection',
          entityId: id,
          action: 'DELETE',
          oldData: { nameAr: section.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف القسم التعليمي بنجاح' };
  }

  // ==========================================
  // 2. ACADEMIC YEARS (السنوات الدراسية)
  // ==========================================
  static async listYears({ callerScopes, isPlatformLevel, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    return await prisma.academicYear.findMany({
      where: { schoolId: targetSchoolId, deletedAt: null },
      include: { academicTerms: { where: { deletedAt: null }, orderBy: { termOrder: 'asc' } } },
      orderBy: { startDate: 'desc' }
    });
  }

  static async createYear({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { name, startDate, endDate, isCurrent = false } = data;

    if (!name || !startDate || !endDate) {
      throw new AppError('اسم السنة الدراسية، تاريخ البداية، وتاريخ النهاية حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const year = await prisma.$transaction(async (tx) => {
      if (isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId, isCurrent: true },
          data: { isCurrent: false }
        });
      }

      const created = await tx.academicYear.create({
        data: {
          schoolId,
          name: name.trim(),
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          isCurrent: Boolean(isCurrent)
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_YEAR_CREATED',
          entityName: 'AcademicYear',
          entityId: created.id,
          action: 'CREATE',
          newData: { name: created.name, isCurrent: created.isCurrent },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return year;
  }

  static async updateYear(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const year = await prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year) throw new AppError('السنة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: year.schoolId });

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.isCurrent !== undefined) updateData.isCurrent = Boolean(data.isCurrent);

    const updated = await prisma.$transaction(async (tx) => {
      if (updateData.isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId: year.schoolId, isCurrent: true, id: { not: id } },
          data: { isCurrent: false }
        });
      }

      const res = await tx.academicYear.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: year.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_YEAR_UPDATED',
          entityName: 'AcademicYear',
          entityId: id,
          action: 'UPDATE',
          oldData: { name: year.name },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteYear(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const year = await prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year) throw new AppError('السنة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: year.schoolId });

    // Check dependencies
    const activeTerms = await prisma.academicTerm.count({ where: { academicYearId: id, deletedAt: null } });
    const activeClasses = await prisma.classSection.count({ where: { academicYearId: id, deletedAt: null } });
    const activeEnrollments = await prisma.studentEnrollment.count({ where: { academicYearId: id, deletedAt: null } });

    if (activeTerms > 0 || activeClasses > 0 || activeEnrollments > 0) {
      throw new AppError('لا يمكن حذف السنة الدراسية لوجود فصول أو شعب أو تسجيلات طلاب مرتبطة بها', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.academicYear.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: year.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_YEAR_DELETED',
          entityName: 'AcademicYear',
          entityId: id,
          action: 'DELETE',
          oldData: { name: year.name },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف السنة الدراسية بنجاح' };
  }

  // ==========================================
  // 3. ACADEMIC TERMS (الفصول الدراسية)
  // ==========================================
  static async listTerms(yearId, { callerScopes, isPlatformLevel }) {
    const year = await prisma.academicYear.findFirst({ where: { id: yearId, deletedAt: null } });
    if (!year) throw new AppError('السنة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: year.schoolId });

    return await prisma.academicTerm.findMany({
      where: { academicYearId: yearId, deletedAt: null },
      orderBy: { termOrder: 'asc' }
    });
  }

  static async createTerm({ callerUser, callerScopes, isPlatformLevel, yearId, data, context = {} }) {
    const year = await prisma.academicYear.findFirst({ where: { id: yearId, deletedAt: null } });
    if (!year) throw new AppError('السنة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: year.schoolId });

    const { nameAr, nameEn, termOrder, isActive = false, startDate, endDate } = data;
    if (!nameAr || termOrder === undefined) {
      throw new AppError('اسم الفصل (nameAr) وترتيب الفصل (termOrder) حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const term = await prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.academicTerm.updateMany({
          where: { academicYearId: yearId, isActive: true },
          data: { isActive: false }
        });
      }

      const created = await tx.academicTerm.create({
        data: {
          academicYearId: yearId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          termOrder: parseInt(termOrder, 10),
          isActive: Boolean(isActive),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: year.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_TERM_CREATED',
          entityName: 'AcademicTerm',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, termOrder: created.termOrder },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return term;
  }

  static async updateTerm(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const term = await prisma.academicTerm.findFirst({
      where: { id, deletedAt: null },
      include: { academicYear: true }
    });
    if (!term) throw new AppError('الفصل الدراسي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: term.academicYear.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.termOrder !== undefined) updateData.termOrder = parseInt(data.termOrder, 10);
    if (data.isActive !== undefined) updateData.isActive = Boolean(data.isActive);
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (updateData.isActive) {
        await tx.academicTerm.updateMany({
          where: { academicYearId: term.academicYearId, isActive: true, id: { not: id } },
          data: { isActive: false }
        });
      }

      const res = await tx.academicTerm.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: term.academicYear.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_TERM_UPDATED',
          entityName: 'AcademicTerm',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: term.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteTerm(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const term = await prisma.academicTerm.findFirst({
      where: { id, deletedAt: null },
      include: { academicYear: true }
    });
    if (!term) throw new AppError('الفصل الدراسي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: term.academicYear.schoolId });

    await prisma.$transaction(async (tx) => {
      await tx.academicTerm.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: term.academicYear.schoolId,
          userId: callerUser.id,
          eventType: 'ACADEMIC_TERM_DELETED',
          entityName: 'AcademicTerm',
          entityId: id,
          action: 'DELETE',
          oldData: { nameAr: term.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف الفصل الدراسي بنجاح' };
  }

  // ==========================================
  // 4. EDUCATIONAL STAGES (المراحل التعليمية)
  // ==========================================
  static async listStages({ callerScopes, isPlatformLevel, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    return await prisma.educationalStage.findMany({
      where: { schoolId: targetSchoolId, deletedAt: null },
      include: { grades: { where: { deletedAt: null }, orderBy: { gradeLevel: 'asc' } } },
      orderBy: { stageOrder: 'asc' }
    });
  }

  static async createStage({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { nameAr, nameEn, stageOrder } = data;

    if (!nameAr || stageOrder === undefined) {
      throw new AppError('اسم المرحلة (nameAr) وترتيبها (stageOrder) حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const stage = await prisma.$transaction(async (tx) => {
      const created = await tx.educationalStage.create({
        data: {
          schoolId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          stageOrder: parseInt(stageOrder, 10)
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'EDUCATIONAL_STAGE_CREATED',
          entityName: 'EducationalStage',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, stageOrder: created.stageOrder },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return stage;
  }

  static async updateStage(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const stage = await prisma.educationalStage.findFirst({ where: { id, deletedAt: null } });
    if (!stage) throw new AppError('المرحلة التعليمية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: stage.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.stageOrder !== undefined) updateData.stageOrder = parseInt(data.stageOrder, 10);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.educationalStage.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: stage.schoolId,
          userId: callerUser.id,
          eventType: 'EDUCATIONAL_STAGE_UPDATED',
          entityName: 'EducationalStage',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: stage.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteStage(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const stage = await prisma.educationalStage.findFirst({ where: { id, deletedAt: null } });
    if (!stage) throw new AppError('المرحلة التعليمية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: stage.schoolId });

    const activeGrades = await prisma.grade.count({ where: { stageId: id, deletedAt: null } });
    if (activeGrades > 0) {
      throw new AppError('لا يمكن حذف المرحلة التعليمية لوجود صفوف دراسية مرتبطة بها', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.educationalStage.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: stage.schoolId,
          userId: callerUser.id,
          eventType: 'EDUCATIONAL_STAGE_DELETED',
          entityName: 'EducationalStage',
          entityId: id,
          action: 'DELETE',
          oldData: { nameAr: stage.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف المرحلة التعليمية بنجاح' };
  }

  // ==========================================
  // 5. GRADES (الصفوف الدراسية)
  // ==========================================
  static async listGrades({ callerScopes, isPlatformLevel, stageId, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    const where = { schoolId: targetSchoolId, deletedAt: null };
    if (stageId) where.stageId = stageId;

    return await prisma.grade.findMany({
      where,
      include: { stage: true },
      orderBy: { gradeLevel: 'asc' }
    });
  }

  static async createGrade({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { stageId, nameAr, nameEn, gradeLevel } = data;

    if (!stageId || !nameAr || gradeLevel === undefined) {
      throw new AppError('المرحلة (stageId)، اسم الصف (nameAr)، والمستوى (gradeLevel) حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const stage = await prisma.educationalStage.findFirst({ where: { id: stageId, schoolId, deletedAt: null } });
    if (!stage) throw new AppError('المرحلة المحددة غير موجودة في هذه المدرسة', 404, ERROR_CODES.NOT_FOUND);

    const grade = await prisma.$transaction(async (tx) => {
      const created = await tx.grade.create({
        data: {
          schoolId,
          stageId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          gradeLevel: parseInt(gradeLevel, 10)
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'GRADE_CREATED',
          entityName: 'Grade',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, gradeLevel: created.gradeLevel },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return grade;
  }

  static async updateGrade(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const grade = await prisma.grade.findFirst({ where: { id, deletedAt: null } });
    if (!grade) throw new AppError('الصف الدراسي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: grade.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.gradeLevel !== undefined) updateData.gradeLevel = parseInt(data.gradeLevel, 10);
    if (data.stageId !== undefined) updateData.stageId = data.stageId;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.grade.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: grade.schoolId,
          userId: callerUser.id,
          eventType: 'GRADE_UPDATED',
          entityName: 'Grade',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: grade.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteGrade(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const grade = await prisma.grade.findFirst({ where: { id, deletedAt: null } });
    if (!grade) throw new AppError('الصف الدراسي غير موجود', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: grade.schoolId });

    const activeClassSections = await prisma.classSection.count({ where: { gradeId: id, deletedAt: null } });
    if (activeClassSections > 0) {
      throw new AppError('لا يمكن حذف الصف الدراسي لوجود شعب صفية مسجلة تحته', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.grade.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: grade.schoolId,
          userId: callerUser.id,
          eventType: 'GRADE_DELETED',
          entityName: 'Grade',
          entityId: id,
          action: 'DELETE',
          oldData: { nameAr: grade.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف الصف الدراسي بنجاح' };
  }

  // ==========================================
  // 6. CLASS SECTIONS (الشعب الصفية)
  // ==========================================
  static async listClassSections({ callerScopes, isPlatformLevel, academicYearId, gradeId, sectionDivisionId, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    const where = { schoolId: targetSchoolId, deletedAt: null };
    if (academicYearId) where.academicYearId = academicYearId;
    if (gradeId) where.gradeId = gradeId;
    if (sectionDivisionId) where.sectionDivisionId = sectionDivisionId;

    return await prisma.classSection.findMany({
      where,
      include: {
        academicYear: true,
        grade: { include: { stage: true } },
        sectionDivision: true
      },
      orderBy: { nameAr: 'asc' }
    });
  }

  static async createClassSection({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { academicYearId, gradeId, sectionDivisionId, nameAr, nameEn, maxCapacity = 30 } = data;

    if (!academicYearId || !gradeId || !sectionDivisionId || !nameAr) {
      throw new AppError('السنة الدراسية، الصف، القسم، واسم الشعبة حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const classSection = await prisma.$transaction(async (tx) => {
      const created = await tx.classSection.create({
        data: {
          schoolId,
          academicYearId,
          gradeId,
          sectionDivisionId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          maxCapacity: parseInt(maxCapacity, 10)
        },
        include: { grade: true, sectionDivision: true }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'CLASS_SECTION_CREATED',
          entityName: 'ClassSection',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, maxCapacity: created.maxCapacity },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return classSection;
  }

  static async updateClassSection(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const classSection = await prisma.classSection.findFirst({ where: { id, deletedAt: null } });
    if (!classSection) throw new AppError('الشعبة الصفية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: classSection.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.maxCapacity !== undefined) updateData.maxCapacity = parseInt(data.maxCapacity, 10);
    if (data.gradeId !== undefined) updateData.gradeId = data.gradeId;
    if (data.sectionDivisionId !== undefined) updateData.sectionDivisionId = data.sectionDivisionId;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.classSection.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: classSection.schoolId,
          userId: callerUser.id,
          eventType: 'CLASS_SECTION_UPDATED',
          entityName: 'ClassSection',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: classSection.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteClassSection(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const classSection = await prisma.classSection.findFirst({ where: { id, deletedAt: null } });
    if (!classSection) throw new AppError('الشعبة الصفية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: classSection.schoolId });

    // Check active enrollments or assignments
    const activeEnrollments = await prisma.studentEnrollment.count({ where: { classSectionId: id, deletedAt: null } });
    const activeTeacherAssignments = await prisma.teacherAssignment.count({ where: { classSectionId: id, deletedAt: null } });

    if (activeEnrollments > 0 || activeTeacherAssignments > 0) {
      throw new AppError('لا يمكن حذف الشعبة لوجود طلاب مقيدين أو معلمين مسندين إليها', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.classSection.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: classSection.schoolId,
          userId: callerUser.id,
          eventType: 'CLASS_SECTION_DELETED',
          entityName: 'ClassSection',
          entityId: id,
          action: 'DELETE',
          oldData: { nameAr: classSection.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف الشعبة الصفية بنجاح' };
  }

  // ==========================================
  // 7. SUBJECTS (المواد الدراسية)
  // ==========================================
  static async listSubjects({ callerScopes, isPlatformLevel, schoolId }) {
    const targetSchoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: schoolId });
    return await prisma.subject.findMany({
      where: { schoolId: targetSchoolId, deletedAt: null },
      orderBy: { code: 'asc' }
    });
  }

  static async createSubject({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: data.schoolId });
    const { nameAr, nameEn, code } = data;

    if (!nameAr || !code) {
      throw new AppError('اسم المادة (nameAr) ورمز المادة (code) حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const subject = await prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({
        data: {
          schoolId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          code: code.trim().toUpperCase()
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'SUBJECT_CREATED',
          entityName: 'Subject',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, code: created.code },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return subject;
  }

  static async updateSubject(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const subject = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
    if (!subject) throw new AppError('المادة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: subject.schoolId });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.code !== undefined) updateData.code = data.code.trim().toUpperCase();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.subject.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: subject.schoolId,
          userId: callerUser.id,
          eventType: 'SUBJECT_UPDATED',
          entityName: 'Subject',
          entityId: id,
          action: 'UPDATE',
          oldData: { code: subject.code, nameAr: subject.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  static async deleteSubject(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const subject = await prisma.subject.findFirst({ where: { id, deletedAt: null } });
    if (!subject) throw new AppError('المادة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    this.resolveSchoolId({ callerScopes, isPlatformLevel, requestedSchoolId: subject.schoolId });

    const activeTeacherAssignments = await prisma.teacherAssignment.count({ where: { subjectId: id, deletedAt: null } });
    const activeTeacherSubjects = await prisma.teacherSubject.count({ where: { subjectId: id, deletedAt: null } });

    if (activeTeacherAssignments > 0 || activeTeacherSubjects > 0) {
      throw new AppError('لا يمكن حذف المادة الدراسية لوجود إسناد معلمين مرتبط بها', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.subject.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: subject.schoolId,
          userId: callerUser.id,
          eventType: 'SUBJECT_DELETED',
          entityName: 'Subject',
          entityId: id,
          action: 'DELETE',
          oldData: { code: subject.code, nameAr: subject.nameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف المادة الدراسية بنجاح' };
  }
}

module.exports = AcademicService;
