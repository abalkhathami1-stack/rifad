const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AcademicService = require('./academic.service');
const { encryptText, decryptText, computeBlindHash } = require('../utils/crypto.util');

class TeachersService {
  /**
   * Helper to format and mask or decrypt sensitive PII.
   */
  static formatTeacher(teacher, hasSensitivePermission = false) {
    if (!teacher) return null;

    let nationalId = null;
    let phone = null;
    let email = null;

    if (hasSensitivePermission) {
      nationalId = decryptText(teacher.nationalIdEncrypted);
      phone = decryptText(teacher.phoneEncrypted);
      email = decryptText(teacher.emailEncrypted);
    } else {
      const decNid = decryptText(teacher.nationalIdEncrypted);
      if (decNid && decNid.length >= 6) {
        nationalId = `${decNid.slice(0, 2)}${'*'.repeat(decNid.length - 4)}${decNid.slice(-2)}`;
      } else {
        nationalId = '********';
      }

      const decPhone = decryptText(teacher.phoneEncrypted);
      if (decPhone && decPhone.length >= 7) {
        phone = `${decPhone.slice(0, 3)}****${decPhone.slice(-3)}`;
      } else {
        phone = '**********';
      }

      const decEmail = decryptText(teacher.emailEncrypted);
      if (decEmail && decEmail.includes('@')) {
        const [userPart, domainPart] = decEmail.split('@');
        email = `${userPart.slice(0, 2)}***@${domainPart}`;
      } else {
        email = '***@***.***';
      }
    }

    const {
      nationalIdEncrypted,
      phoneEncrypted,
      emailEncrypted,
      nationalIdHash,
      phoneHash,
      emailHash,
      ...safeFields
    } = teacher;

    return {
      ...safeFields,
      nationalId,
      phone,
      email
    };
  }

  // ==========================================
  // 1. SPECIALIZATIONS (تخصصات المعلمين)
  // ==========================================
  static async listSpecializations({ callerScopes, isPlatformLevel, schoolId }) {
    const targetSchoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: schoolId
    });

    return await prisma.specialization.findMany({
      where: { schoolId: targetSchoolId, deletedAt: null },
      orderBy: { nameAr: 'asc' }
    });
  }

  static async createSpecialization({ callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const schoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: data.schoolId
    });

    const { nameAr, nameEn, code } = data;
    if (!nameAr) {
      throw new AppError('اسم التخصص (nameAr) حقل إجباري', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const spec = await prisma.$transaction(async (tx) => {
      const created = await tx.specialization.create({
        data: {
          schoolId,
          nameAr: nameAr.trim(),
          nameEn: nameEn?.trim() || null,
          code: code?.trim().toUpperCase() || null
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'SPECIALIZATION_CREATED',
          entityName: 'Specialization',
          entityId: created.id,
          action: 'CREATE',
          newData: { nameAr: created.nameAr, code: created.code },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return created;
    });

    return spec;
  }

  static async updateSpecialization(id, { callerUser, callerScopes, isPlatformLevel, data, context = {} }) {
    const spec = await prisma.specialization.findFirst({ where: { id, deletedAt: null } });
    if (!spec) throw new AppError('التخصص غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: spec.schoolId
    });

    const updateData = {};
    if (data.nameAr !== undefined) updateData.nameAr = data.nameAr.trim();
    if (data.nameEn !== undefined) updateData.nameEn = data.nameEn ? data.nameEn.trim() : null;
    if (data.code !== undefined) updateData.code = data.code ? data.code.trim().toUpperCase() : null;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.specialization.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: spec.schoolId,
          userId: callerUser.id,
          eventType: 'SPECIALIZATION_UPDATED',
          entityName: 'Specialization',
          entityId: id,
          action: 'UPDATE',
          oldData: { nameAr: spec.nameAr },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  // ==========================================
  // 2. TEACHERS CRUD
  // ==========================================
  static async listTeachers({
    callerScopes,
    isPlatformLevel,
    callerPermissions = [],
    schoolId,
    query = {}
  }) {
    const targetSchoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: schoolId || query.schoolId
    });

    const { search, specializationId, status, page = 1, limit = 20 } = query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = {
      schoolId: targetSchoolId,
      deletedAt: null
    };

    if (status) where.status = status;
    if (specializationId) where.specializationId = specializationId;

    if (search) {
      where.OR = [
        { fullNameAr: { contains: search, mode: 'insensitive' } },
        { fullNameEn: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('teachers.view_sensitive') || callerPermissions.includes('*');

    const [total, teachers] = await Promise.all([
      prisma.teacher.count({ where }),
      prisma.teacher.findMany({
        where,
        include: {
          specialization: true,
          subjects: { include: { subject: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);

    const formattedTeachers = teachers.map(t => this.formatTeacher(t, hasSensitivePerm));

    return {
      teachers: formattedTeachers,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take)
    };
  }

  static async getTeacherById(id, { callerScopes, isPlatformLevel, callerPermissions = [] }) {
    const teacher = await prisma.teacher.findFirst({
      where: { id, deletedAt: null },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        specialization: true,
        subjects: { include: { subject: true } },
        assignments: {
          where: { deletedAt: null },
          include: {
            subject: true,
            classSection: { include: { grade: true, sectionDivision: true } },
            academicYear: true,
            academicTerm: true
          }
        }
      }
    });

    if (!teacher) {
      throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('teachers.view_sensitive') || callerPermissions.includes('*');
    return this.formatTeacher(teacher, hasSensitivePerm);
  }

  static async createTeacher({
    callerUser,
    callerScopes,
    isPlatformLevel,
    callerPermissions = [],
    data,
    context = {}
  }) {
    const schoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: data.schoolId
    });

    const {
      specializationId,
      employeeNumber,
      firstNameAr,
      familyNameAr,
      fullNameEn,
      nationality = 'سعودي',
      professionalLicenseNumber,
      hireDate,
      nationalId,
      phone,
      email,
      initialSubjectIds = []
    } = data;

    if (!specializationId || !employeeNumber || !firstNameAr || !familyNameAr || !hireDate || !nationalId) {
      throw new AppError('التخصص، الرقم الوظيفي، الاسم الأول، اسم العائلة، تاريخ التعيين، والهوية الوطنية حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Verify specialization in same school
    const spec = await prisma.specialization.findFirst({
      where: { id: specializationId, schoolId, deletedAt: null }
    });
    if (!spec) {
      throw new AppError('التخصص المحدد غير موجود في هذه المدرسة', 404, ERROR_CODES.NOT_FOUND);
    }

    // Check duplicate employeeNumber in same school
    const existingEmp = await prisma.teacher.findFirst({
      where: { schoolId, employeeNumber: employeeNumber.trim(), deletedAt: null }
    });
    if (existingEmp) {
      throw new AppError(`الرقم الوظيفي [${employeeNumber}] مسجل مسبقاً في هذه المدرسة`, 409, ERROR_CODES.CONFLICT);
    }

    // Check duplicate nationalId via Blind Index Hash
    const nationalIdHash = computeBlindHash(nationalId);
    const existingNid = await prisma.teacher.findFirst({
      where: { schoolId, nationalIdHash, deletedAt: null }
    });
    if (existingNid) {
      throw new AppError('رقم الهوية الوطنية مسجل مسبقاً في هذه المدرسة', 409, ERROR_CODES.CONFLICT);
    }

    // RIFAD-GAP-005: verify every initial subject belongs to the same school as the teacher
    // (mirrors assignTeacherSubject's same-school ownership check). Postgres FK constraints
    // alone do not enforce same-school ownership. Deduped ONLY for this existence lookup —
    // the create loop below still iterates the original initialSubjectIds unchanged, so any
    // pre-existing duplicate-subject behavior (unique constraint on teacherId+subjectId) is
    // preserved exactly as before.
    const subjectIdsToValidate = Array.isArray(initialSubjectIds) ? [...new Set(initialSubjectIds)] : [];
    if (subjectIdsToValidate.length > 0) {
      const validSubjects = await prisma.subject.findMany({
        where: { id: { in: subjectIdsToValidate }, schoolId, deletedAt: null },
        select: { id: true }
      });
      if (validSubjects.length !== subjectIdsToValidate.length) {
        throw new AppError('إحدى المواد الدراسية المحددة في initialSubjectIds غير موجودة في هذه المدرسة', 404, ERROR_CODES.NOT_FOUND);
      }
    }

    const fullNameAr = `${firstNameAr.trim()} ${familyNameAr.trim()}`;
    const nationalIdEncrypted = encryptText(nationalId.trim());
    const phoneEncrypted = phone ? encryptText(phone.trim()) : null;
    const emailEncrypted = email ? encryptText(email.trim()) : null;

    const phoneHash = phone ? computeBlindHash(phone) : null;
    const emailHash = email ? computeBlindHash(email) : null;

    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          schoolId,
          specializationId,
          employeeNumber: employeeNumber.trim(),
          firstNameAr: firstNameAr.trim(),
          familyNameAr: familyNameAr.trim(),
          fullNameAr,
          fullNameEn: fullNameEn?.trim() || null,
          nationality: nationality.trim(),
          professionalLicenseNumber: professionalLicenseNumber?.trim() || null,
          hireDate: new Date(hireDate),
          status: 'ACTIVE',
          nationalIdEncrypted,
          phoneEncrypted,
          emailEncrypted,
          nationalIdHash,
          phoneHash,
          emailHash
        }
      });

      // Link initial subjects if provided
      if (Array.isArray(initialSubjectIds) && initialSubjectIds.length > 0) {
        for (const subjId of initialSubjectIds) {
          await tx.teacherSubject.create({
            data: {
              schoolId,
              teacherId: created.id,
              subjectId: subjId
            }
          });
        }
      }

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_CREATED',
          entityName: 'Teacher',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            employeeNumber: created.employeeNumber,
            fullNameAr: created.fullNameAr,
            specialization: spec.nameAr
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    // RIFAD-GAP-002: pass through the caller's REAL permissions (no hardcoded bypass).
    // Whether plaintext sensitive PII is visible in this response is governed by the
    // same rule as every other teacher read path (isPlatformLevel / teachers.view_sensitive).
    return await this.getTeacherById(teacher.id, {
      callerScopes,
      isPlatformLevel,
      callerPermissions
    });
  }

  static async updateTeacher(id, { callerUser, callerScopes, isPlatformLevel, callerPermissions = [], data, context = {} }) {
    const existing = await prisma.teacher.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    const updateData = {};
    if (data.firstNameAr !== undefined) updateData.firstNameAr = data.firstNameAr.trim();
    if (data.familyNameAr !== undefined) updateData.familyNameAr = data.familyNameAr.trim();
    if (data.fullNameEn !== undefined) updateData.fullNameEn = data.fullNameEn ? data.fullNameEn.trim() : null;
    if (data.nationality !== undefined) updateData.nationality = data.nationality.trim();
    if (data.professionalLicenseNumber !== undefined) {
      updateData.professionalLicenseNumber = data.professionalLicenseNumber ? data.professionalLicenseNumber.trim() : null;
    }
    if (data.specializationId !== undefined) updateData.specializationId = data.specializationId;

    if (data.firstNameAr !== undefined || data.familyNameAr !== undefined) {
      updateData.fullNameAr = `${updateData.firstNameAr || existing.firstNameAr} ${updateData.familyNameAr || existing.familyNameAr}`;
    }

    if (data.phone !== undefined) {
      updateData.phoneEncrypted = data.phone ? encryptText(data.phone.trim()) : null;
      updateData.phoneHash = data.phone ? computeBlindHash(data.phone) : null;
    }

    if (data.email !== undefined) {
      updateData.emailEncrypted = data.email ? encryptText(data.email.trim()) : null;
      updateData.emailHash = data.email ? computeBlindHash(data.email) : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.teacher.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_UPDATED',
          entityName: 'Teacher',
          entityId: id,
          action: 'UPDATE',
          oldData: { fullNameAr: existing.fullNameAr, employeeNumber: existing.employeeNumber },
          newData: { fullNameAr: res.fullNameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    // RIFAD-GAP-001: never return the raw Prisma row (nationalIdEncrypted, phoneEncrypted,
    // emailEncrypted, nationalIdHash, phoneHash, emailHash). Apply the same formatter/masking
    // used by every other teacher read path (getTeacherById / listTeachers).
    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('teachers.view_sensitive') || callerPermissions.includes('*');
    return this.formatTeacher(updated, hasSensitivePerm);
  }

  static async updateTeacherStatus(id, { callerUser, callerScopes, isPlatformLevel, callerPermissions = [], status, context = {} }) {
    const validStatuses = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'];
    if (!validStatuses.includes(status)) {
      throw new AppError('حالة المعلم غير صالحة', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const existing = await prisma.teacher.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.teacher.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_STATUS_CHANGED',
          entityName: 'Teacher',
          entityId: id,
          action: 'UPDATE',
          oldData: { status: existing.status },
          newData: { status },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    // RIFAD-GAP-001: same formatter/masking as updateTeacher — never return the raw row.
    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('teachers.view_sensitive') || callerPermissions.includes('*');
    return this.formatTeacher(updated, hasSensitivePerm);
  }

  static async deleteTeacher(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const teacher = await prisma.teacher.findFirst({ where: { id, deletedAt: null } });
    if (!teacher) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    const activeAssignments = await prisma.teacherAssignment.count({
      where: { teacherId: id, deletedAt: null }
    });

    if (activeAssignments > 0) {
      throw new AppError('لا يمكن حذف المعلم لوجود إسنادات تدريس مسجلة باسمه', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: teacher.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_DELETED',
          entityName: 'Teacher',
          entityId: id,
          action: 'DELETE',
          oldData: { employeeNumber: teacher.employeeNumber, fullNameAr: teacher.fullNameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف سجل المعلم بنجاح' };
  }

  // ==========================================
  // 3. TEACHER SUBJECTS (المواد المؤهل لتدريسها)
  // ==========================================
  static async assignTeacherSubject(teacherId, { callerUser, callerScopes, isPlatformLevel, subjectId, context = {} }) {
    const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, deletedAt: null } });
    if (!teacher) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId: teacher.schoolId, deletedAt: null }
    });
    if (!subject) throw new AppError('المادة الدراسية غير موجودة في نفس مدرسة المعلم', 404, ERROR_CODES.NOT_FOUND);

    const existing = await prisma.teacherSubject.findUnique({
      where: { teacherId_subjectId: { teacherId, subjectId } }
    });
    if (existing) {
      throw new AppError('المادة مرتبطة بالمعلم مسبقاً', 409, ERROR_CODES.CONFLICT);
    }

    const created = await prisma.$transaction(async (tx) => {
      const ts = await tx.teacherSubject.create({
        data: {
          schoolId: teacher.schoolId,
          teacherId,
          subjectId
        },
        include: { subject: true }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: teacher.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_SUBJECT_ASSIGNED',
          entityName: 'TeacherSubject',
          entityId: ts.id,
          action: 'CREATE',
          newData: { teacherId, subjectName: subject.nameAr, subjectCode: subject.code },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return ts;
    });

    return created;
  }

  static async removeTeacherSubject(teacherId, subjectId, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, deletedAt: null } });
    if (!teacher) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    // Check if teacher has active assignments for this subject
    const activeAssignments = await prisma.teacherAssignment.count({
      where: { teacherId, subjectId, deletedAt: null }
    });
    if (activeAssignments > 0) {
      throw new AppError('لا يمكن إزالة المادة لوجود شعب صفية مسندة للمعلم في هذه المادة', 400, ERROR_CODES.BAD_REQUEST);
    }

    const ts = await prisma.teacherSubject.findUnique({
      where: { teacherId_subjectId: { teacherId, subjectId } }
    });
    if (!ts) throw new AppError('رابط المادة بالمعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    await prisma.$transaction(async (tx) => {
      await tx.teacherSubject.delete({
        where: { teacherId_subjectId: { teacherId, subjectId } }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: teacher.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_SUBJECT_REMOVED',
          entityName: 'TeacherSubject',
          entityId: ts.id,
          action: 'DELETE',
          oldData: { teacherId, subjectId },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم إزالة ربط المادة بالمعلم بنجاح' };
  }

  // ==========================================
  // 4. TEACHER ASSIGNMENTS (إسناد التدريس للشعب)
  // ==========================================
  static async createAssignment(teacherId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    data,
    context = {}
  }) {
    const { subjectId, classSectionId, academicYearId, academicTermId } = data;

    if (!subjectId || !classSectionId || !academicYearId) {
      throw new AppError('المادة، الشعبة الصفية، والسنة الدراسية حقول إجبارية للإسناد', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, deletedAt: null } });
    if (!teacher) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    // 1. Qualification Guard: Verify teacher is qualified for this subject
    const isQualified = await prisma.teacherSubject.findUnique({
      where: { teacherId_subjectId: { teacherId, subjectId } }
    });
    if (!isQualified) {
      throw new AppError('المعلم غير مؤهل لتدريس هذه المادة، يرجى إضافة المادة إلى قائمة مواد المعلم أولاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    // 2. Validate Class Section belongs to same school and academic year
    const classSection = await prisma.classSection.findFirst({
      where: { id: classSectionId, schoolId: teacher.schoolId, academicYearId, deletedAt: null },
      include: { grade: true }
    });
    if (!classSection) {
      throw new AppError('الشعبة الصفية غير صالحة لهذه المدرسة أو السنة المحددة', 400, ERROR_CODES.BAD_REQUEST);
    }

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId: teacher.schoolId, deletedAt: null }
    });
    if (!subject) throw new AppError('المادة الدراسية غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    // 3. Create Assignment
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.teacherAssignment.create({
        data: {
          schoolId: teacher.schoolId,
          teacherId,
          subjectId,
          classSectionId,
          academicYearId,
          academicTermId: academicTermId || null
        },
        include: {
          subject: true,
          classSection: { include: { grade: true, sectionDivision: true } },
          academicYear: true,
          academicTerm: true
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: teacher.schoolId,
          userId: callerUser.id,
          eventType: 'TEACHER_ASSIGNMENT_CREATED',
          entityName: 'TeacherAssignment',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            teacherId,
            subjectName: subject.nameAr,
            className: classSection.nameAr,
            gradeName: classSection.grade.nameAr
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return assignment;
  }

  static async listAssignments(teacherId, { callerScopes, isPlatformLevel }) {
    const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, deletedAt: null } });
    if (!teacher) throw new AppError('المعلم غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: teacher.schoolId
    });

    return await prisma.teacherAssignment.findMany({
      where: { teacherId, deletedAt: null },
      include: {
        subject: true,
        classSection: { include: { grade: true, sectionDivision: true } },
        academicYear: true,
        academicTerm: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

module.exports = TeachersService;
