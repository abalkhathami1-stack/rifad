const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AcademicService = require('./academic.service');

class StudentsService {
  /**
   * Helper to mask sensitive national ID if caller lacks sensitivity permission.
   */
  static sanitizeStudent(student, hasSensitivePermission = false) {
    if (!student) return null;
    const sanitized = { ...student };
    if (!hasSensitivePermission && sanitized.nationalId) {
      // Mask middle digits: e.g. "1098765432" -> "10******32"
      const nid = sanitized.nationalId;
      if (nid.length >= 6) {
        sanitized.nationalId = `${nid.slice(0, 2)}${'*'.repeat(nid.length - 4)}${nid.slice(-2)}`;
      } else {
        sanitized.nationalId = '********';
      }
    }
    return sanitized;
  }

  /**
   * Lists students filtered by school scope and query parameters.
   */
  static async listStudents({
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

    const {
      search,
      status,
      academicYearId,
      classSectionId,
      gradeId,
      page = 1,
      limit = 20
    } = query;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = {
      schoolId: targetSchoolId,
      deletedAt: null
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { fullNameAr: { contains: search, mode: 'insensitive' } },
        { fullNameEn: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (academicYearId || classSectionId || gradeId) {
      where.enrollments = {
        some: {
          deletedAt: null,
          enrollmentStatus: 'ACTIVE',
          ...(academicYearId ? { academicYearId } : {}),
          ...(classSectionId ? { classSectionId } : {}),
          ...(gradeId ? { classSection: { gradeId } } : {})
        }
      };
    }

    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('students.view_sensitive') || callerPermissions.includes('*');

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        include: {
          enrollments: {
            where: { deletedAt: null, enrollmentStatus: 'ACTIVE' },
            include: {
              academicYear: true,
              classSection: {
                include: { grade: true, sectionDivision: true }
              }
            },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);

    const sanitizedStudents = students.map(s => this.sanitizeStudent(s, hasSensitivePerm));

    return {
      students: sanitizedStudents,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take)
    };
  }

  /**
   * Retrieves single student details with current enrollment.
   */
  static async getStudentById(id, { callerScopes, isPlatformLevel, callerPermissions = [] }) {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        enrollments: {
          where: { deletedAt: null },
          include: {
            academicYear: true,
            academicTerm: true,
            classSection: {
              include: { grade: { include: { stage: true } }, sectionDivision: true }
            }
          },
          orderBy: { enrollmentDate: 'desc' },
          take: 5
        }
      }
    });

    if (!student) {
      throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    // Verify scope access
    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: student.schoolId
    });

    const hasSensitivePerm = isPlatformLevel || callerPermissions.includes('students.view_sensitive') || callerPermissions.includes('*');
    return this.sanitizeStudent(student, hasSensitivePerm);
  }

  /**
   * Creates a new student and optionally performs initial enrollment.
   */
  static async createStudent({
    callerUser,
    callerScopes,
    isPlatformLevel,
    data,
    context = {}
  }) {
    const schoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: data.schoolId
    });

    const {
      studentCode,
      firstNameAr,
      secondNameAr,
      thirdNameAr,
      familyNameAr,
      fullNameEn,
      nationalId,
      academicYearId,
      classSectionId,
      academicTermId
    } = data;

    if (!firstNameAr || !familyNameAr) {
      throw new AppError('الاسم الأول واسم العائلة حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const fullNameAr = [firstNameAr, secondNameAr, thirdNameAr, familyNameAr]
      .filter(Boolean)
      .map(s => s.trim())
      .join(' ');

    // Generate studentCode if not provided
    const code = (studentCode && studentCode.trim().length > 0)
      ? studentCode.trim().toUpperCase()
      : `STU-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

    // Check duplicate studentCode in same school
    const existingCode = await prisma.student.findFirst({
      where: { schoolId, studentCode: code, deletedAt: null }
    });
    if (existingCode) {
      throw new AppError(`كود الطالب [${code}] مسجل مسبقاً في هذه المدرسة`, 409, ERROR_CODES.CONFLICT);
    }

    // Check duplicate nationalId in same school
    if (nationalId) {
      const existingNid = await prisma.student.findFirst({
        where: { schoolId, nationalId: nationalId.trim(), deletedAt: null }
      });
      if (existingNid) {
        throw new AppError(`رقم الهوية الوطنية مسجل مسبقاً في هذه المدرسة`, 409, ERROR_CODES.CONFLICT);
      }
    }

    // Execute atomic creation
    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          schoolId,
          studentCode: code,
          firstNameAr: firstNameAr.trim(),
          secondNameAr: secondNameAr?.trim() || null,
          thirdNameAr: thirdNameAr?.trim() || null,
          familyNameAr: familyNameAr.trim(),
          fullNameAr,
          fullNameEn: fullNameEn?.trim() || null,
          nationalId: nationalId?.trim() || null,
          status: 'ACTIVE'
        }
      });

      // Handle optional initial enrollment
      if (academicYearId && classSectionId) {
        const classSection = await tx.classSection.findFirst({
          where: { id: classSectionId, schoolId, academicYearId, deletedAt: null }
        });
        if (!classSection) {
          throw new AppError('الشعبة الصفية المحددة غير صالحة لهذه المدرسة أو السنة الدراسية', 400, ERROR_CODES.BAD_REQUEST);
        }

        await tx.studentEnrollment.create({
          data: {
            schoolId,
            studentId: created.id,
            academicYearId,
            academicTermId: academicTermId || null,
            classSectionId,
            enrollmentStatus: 'ACTIVE',
            enrollmentDate: new Date()
          }
        });
      }

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_CREATED',
          entityName: 'Student',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            studentCode: created.studentCode,
            fullNameAr: created.fullNameAr,
            initialEnrollment: Boolean(academicYearId && classSectionId)
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return await this.getStudentById(student.id, {
      callerScopes,
      isPlatformLevel,
      callerPermissions: ['students.view_sensitive']
    });
  }

  /**
   * Updates basic student profile info.
   */
  static async updateStudent(id, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    data,
    context = {}
  }) {
    const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    const updateData = {};
    if (data.firstNameAr !== undefined) updateData.firstNameAr = data.firstNameAr.trim();
    if (data.secondNameAr !== undefined) updateData.secondNameAr = data.secondNameAr ? data.secondNameAr.trim() : null;
    if (data.thirdNameAr !== undefined) updateData.thirdNameAr = data.thirdNameAr ? data.thirdNameAr.trim() : null;
    if (data.familyNameAr !== undefined) updateData.familyNameAr = data.familyNameAr.trim();
    if (data.fullNameEn !== undefined) updateData.fullNameEn = data.fullNameEn ? data.fullNameEn.trim() : null;
    if (data.nationalId !== undefined) updateData.nationalId = data.nationalId ? data.nationalId.trim() : null;

    // Recalculate fullNameAr if any part updated
    if (
      data.firstNameAr !== undefined ||
      data.secondNameAr !== undefined ||
      data.thirdNameAr !== undefined ||
      data.familyNameAr !== undefined
    ) {
      updateData.fullNameAr = [
        updateData.firstNameAr || existing.firstNameAr,
        updateData.secondNameAr !== undefined ? updateData.secondNameAr : existing.secondNameAr,
        updateData.thirdNameAr !== undefined ? updateData.thirdNameAr : existing.thirdNameAr,
        updateData.familyNameAr || existing.familyNameAr
      ].filter(Boolean).join(' ');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.student.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_UPDATED',
          entityName: 'Student',
          entityId: id,
          action: 'UPDATE',
          oldData: { fullNameAr: existing.fullNameAr, nationalId: existing.nationalId },
          newData: updateData,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
      return res;
    });

    return updated;
  }

  /**
   * Updates student lifecycle status (ACTIVE, INACTIVE, SUSPENDED, GRADUATED, TRANSFERRED_OUT).
   */
  static async updateStudentStatus(id, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    status,
    context = {}
  }) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED_OUT'];
    if (!validStatuses.includes(status)) {
      throw new AppError('حالة الطالب غير صالحة', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.student.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_STATUS_CHANGED',
          entityName: 'Student',
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

    return updated;
  }

  /**
   * Enrolls a student into a class section for an academic year.
   */
  static async enrollStudent(studentId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    data,
    context = {}
  }) {
    const { academicYearId, classSectionId, academicTermId, enrollmentDate } = data;

    if (!academicYearId || !classSectionId) {
      throw new AppError('السنة الدراسية والشعبة الصفية حقول إجبارية للتسكين', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
    if (!student) throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: student.schoolId
    });

    // Validate class section
    const classSection = await prisma.classSection.findFirst({
      where: { id: classSectionId, schoolId: student.schoolId, academicYearId, deletedAt: null },
      include: { grade: true }
    });
    if (!classSection) {
      throw new AppError('الشعبة الصفية غير موجودة أو لا تنتمي لنفس السنة المحددة', 400, ERROR_CODES.BAD_REQUEST);
    }

    // Capacity Check
    const activeEnrolledCount = await prisma.studentEnrollment.count({
      where: { classSectionId, enrollmentStatus: 'ACTIVE', deletedAt: null }
    });
    if (activeEnrolledCount >= classSection.maxCapacity) {
      throw new AppError(`تم الوصول للحد الأقصى لسعة الشعبة (${classSection.maxCapacity} طالب)`, 400, ERROR_CODES.BAD_REQUEST);
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      // Find existing active enrollment in the same academic year
      const existingEnrollment = await tx.studentEnrollment.findFirst({
        where: {
          studentId,
          academicYearId,
          enrollmentStatus: 'ACTIVE',
          deletedAt: null
        }
      });

      if (existingEnrollment) {
        if (existingEnrollment.classSectionId === classSectionId) {
          throw new AppError('الطالب مسكن مسبقاً في هذه الشعبة لنفس السنة الدراسية', 409, ERROR_CODES.CONFLICT);
        }
        // Mark old enrollment as TRANSFERRED
        await tx.studentEnrollment.update({
          where: { id: existingEnrollment.id },
          data: { enrollmentStatus: 'TRANSFERRED' }
        });
      }

      const created = await tx.studentEnrollment.create({
        data: {
          schoolId: student.schoolId,
          studentId,
          academicYearId,
          academicTermId: academicTermId || null,
          classSectionId,
          enrollmentStatus: 'ACTIVE',
          enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date()
        },
        include: {
          academicYear: true,
          classSection: { include: { grade: true, sectionDivision: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: student.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_ENROLLED',
          entityName: 'StudentEnrollment',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            studentId,
            academicYearId,
            classSectionId,
            gradeName: classSection.grade.nameAr,
            className: classSection.nameAr
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return enrollment;
  }

  /**
   * Retrieves complete enrollment history for a student.
   */
  static async getEnrollmentHistory(studentId, { callerScopes, isPlatformLevel }) {
    const student = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
    if (!student) throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: student.schoolId
    });

    return await prisma.studentEnrollment.findMany({
      where: { studentId, deletedAt: null },
      include: {
        academicYear: true,
        academicTerm: true,
        classSection: {
          include: { grade: { include: { stage: true } }, sectionDivision: true }
        }
      },
      orderBy: { enrollmentDate: 'desc' }
    });
  }

  /**
   * Deletes a student (soft delete) only if there is no enrollment history.
   */
  static async deleteStudent(id, { callerUser, callerScopes, isPlatformLevel, context = {} }) {
    const student = await prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!student) throw new AppError('الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: student.schoolId
    });

    const activeEnrollments = await prisma.studentEnrollment.count({
      where: { studentId: id, deletedAt: null }
    });

    if (activeEnrollments > 0) {
      throw new AppError('لا يمكن حذف الطالب لوجود سجلات تسكين وتاريخ أكاديمي مرتبط به', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: student.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_DELETED',
          entityName: 'Student',
          entityId: id,
          action: 'DELETE',
          oldData: { studentCode: student.studentCode, fullNameAr: student.fullNameAr },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف سجل الطالب بنجاح' };
  }
}

module.exports = StudentsService;
