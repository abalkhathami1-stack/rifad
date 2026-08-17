const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AcademicService = require('./academic.service');
const { encryptText, decryptText, computeBlindHash } = require('../utils/crypto.util');

class GuardiansService {
  /**
   * Formats and masks or decrypts sensitive PII fields.
   */
  static formatGuardian(guardian, hasSensitivePermission = false) {
    if (!guardian) return null;

    let nationalId = null;
    let phone = null;
    let email = null;

    if (hasSensitivePermission) {
      nationalId = decryptText(guardian.nationalIdEncrypted);
      phone = decryptText(guardian.phoneEncrypted);
      email = guardian.emailEncrypted ? decryptText(guardian.emailEncrypted) : null;
    } else {
      const decNid = decryptText(guardian.nationalIdEncrypted);
      if (decNid && decNid.length >= 6) {
        nationalId = `${decNid.slice(0, 2)}${'*'.repeat(decNid.length - 4)}${decNid.slice(-2)}`;
      } else {
        nationalId = '********';
      }

      const decPhone = decryptText(guardian.phoneEncrypted);
      if (decPhone && decPhone.length >= 7) {
        phone = `${decPhone.slice(0, 3)}****${decPhone.slice(-3)}`;
      } else {
        phone = '**********';
      }

      const decEmail = guardian.emailEncrypted ? decryptText(guardian.emailEncrypted) : null;
      if (decEmail && decEmail.includes('@')) {
        const [userPart, domainPart] = decEmail.split('@');
        email = `${userPart.slice(0, 2)}***@${domainPart}`;
      } else if (guardian.emailEncrypted) {
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
    } = guardian;

    return {
      ...safeFields,
      nationalId,
      phone,
      email
    };
  }

  // ==========================================
  // 1. LIST GUARDIANS (استعراض أولياء الأمور)
  // ==========================================
  static async listGuardians({
    callerScopes = [],
    isPlatformLevel = false,
    schoolId = null,
    query = null,
    status = null,
    page = 1,
    limit = 20,
    hasSensitivePermission = false
  }) {
    const targetSchoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: schoolId
    });

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const where = {
      schoolId: targetSchoolId,
      deletedAt: null
    };

    if (status) {
      where.status = status;
    }

    if (query && query.trim()) {
      const q = query.trim();
      const blindHash = computeBlindHash(q);
      where.OR = [
        { fullNameAr: { contains: q, mode: 'insensitive' } },
        { fullNameEn: { contains: q, mode: 'insensitive' } },
        { nationalIdHash: blindHash },
        { phoneHash: blindHash }
      ];
    }

    const [total, items] = await Promise.all([
      prisma.guardian.count({ where }),
      prisma.guardian.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          studentGuardians: {
            where: { deletedAt: null },
            include: {
              student: {
                select: {
                  id: true,
                  studentCode: true,
                  fullNameAr: true,
                  status: true
                }
              }
            }
          }
        }
      })
    ]);

    return {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
      items: items.map(g => this.formatGuardian(g, hasSensitivePermission))
    };
  }

  // ==========================================
  // 2. GET GUARDIAN BY ID (تفاصيل ولي الأمر)
  // ==========================================
  static async getGuardianById({
    callerScopes = [],
    isPlatformLevel = false,
    id,
    hasSensitivePermission = false,
    callerUser = null,
    context = {}
  }) {
    if (!id) {
      throw new AppError('معرف ولي الأمر مطلوب', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const guardian = await prisma.guardian.findFirst({
      where: { id, deletedAt: null },
      include: {
        studentGuardians: {
          where: { deletedAt: null },
          include: {
            student: {
              select: {
                id: true,
                studentCode: true,
                fullNameAr: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!guardian) {
      throw new AppError('سجل ولي الأمر غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: guardian.schoolId
    });

    // If sensitive data was viewed with permission, log audit entry
    if (hasSensitivePermission && callerUser) {
      await prisma.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: guardian.schoolId,
          userId: callerUser.id,
          eventType: 'GUARDIAN_SENSITIVE_VIEWED',
          entityName: 'Guardian',
          entityId: guardian.id,
          action: 'VIEW_SENSITIVE',
          oldData: null,
          newData: { viewedFields: ['nationalId', 'phone', 'email'] },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    }

    return this.formatGuardian(guardian, hasSensitivePermission);
  }

  // ==========================================
  // 3. CREATE GUARDIAN (إنشاء ولي أمر)
  // ==========================================
  static async createGuardian({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    data,
    context = {}
  }) {
    const schoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: data.schoolId
    });

    const {
      firstNameAr,
      secondNameAr,
      thirdNameAr,
      familyNameAr,
      fullNameEn,
      nationality,
      nationalId,
      phone,
      email,
      occupation,
      workplace,
      status = 'ACTIVE'
    } = data;

    if (!firstNameAr || !familyNameAr) {
      throw new AppError('الاسم الأول واسم العائلة حقول إجبارية بالعربية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!nationalId || typeof nationalId !== 'string' || nationalId.trim().length < 5) {
      throw new AppError('رقم الهوية الوطنية / الإقامة غير صالح', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
      throw new AppError('رقم الجوال غير صالح', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const cleanNationalId = nationalId.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email && typeof email === 'string' ? email.trim().toLowerCase() : null;

    const fullNameAr = [firstNameAr.trim(), secondNameAr?.trim(), thirdNameAr?.trim(), familyNameAr.trim()]
      .filter(Boolean)
      .join(' ');

    const nationalIdHash = computeBlindHash(cleanNationalId);
    const phoneHash = computeBlindHash(cleanPhone);
    const emailHash = cleanEmail ? computeBlindHash(cleanEmail) : null;

    // Check duplicate active national ID in same school
    const existing = await prisma.guardian.findFirst({
      where: {
        schoolId,
        nationalIdHash,
        deletedAt: null
      }
    });

    if (existing) {
      throw new AppError('يوجد ولي أمر مسجل مسبقاً بنفس رقم الهوية في هذه المدرسة', 409, ERROR_CODES.CONFLICT);
    }

    const nationalIdEncrypted = encryptText(cleanNationalId);
    const phoneEncrypted = encryptText(cleanPhone);
    const emailEncrypted = cleanEmail ? encryptText(cleanEmail) : null;

    const guardian = await prisma.$transaction(async (tx) => {
      const created = await tx.guardian.create({
        data: {
          schoolId,
          firstNameAr: firstNameAr.trim(),
          secondNameAr: secondNameAr?.trim() || null,
          thirdNameAr: thirdNameAr?.trim() || null,
          familyNameAr: familyNameAr.trim(),
          fullNameAr,
          fullNameEn: fullNameEn?.trim() || null,
          nationality: nationality?.trim() || null,
          occupation: occupation?.trim() || null,
          workplace: workplace?.trim() || null,
          status,
          nationalIdEncrypted,
          nationalIdHash,
          phoneEncrypted,
          phoneHash,
          emailEncrypted,
          emailHash
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'GUARDIAN_CREATED',
          entityName: 'Guardian',
          entityId: created.id,
          action: 'CREATE',
          oldData: null,
          newData: {
            fullNameAr,
            nationalIdHash,
            phoneHash
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return this.formatGuardian(guardian, true);
  }

  // ==========================================
  // 4. UPDATE GUARDIAN (تعديل بيانات ولي الأمر)
  // ==========================================
  static async updateGuardian({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    id,
    data,
    context = {}
  }) {
    if (!id) {
      throw new AppError('معرف ولي الأمر مطلوب', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const existing = await prisma.guardian.findFirst({
      where: { id, deletedAt: null }
    });

    if (!existing) {
      throw new AppError('سجل ولي الأمر غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    const updateData = {};

    if (data.firstNameAr !== undefined || data.familyNameAr !== undefined || data.secondNameAr !== undefined || data.thirdNameAr !== undefined) {
      const fName = data.firstNameAr !== undefined ? data.firstNameAr.trim() : existing.firstNameAr;
      const sName = data.secondNameAr !== undefined ? data.secondNameAr?.trim() : existing.secondNameAr;
      const tName = data.thirdNameAr !== undefined ? data.thirdNameAr?.trim() : existing.thirdNameAr;
      const famName = data.familyNameAr !== undefined ? data.familyNameAr.trim() : existing.familyNameAr;

      updateData.firstNameAr = fName;
      updateData.secondNameAr = sName || null;
      updateData.thirdNameAr = tName || null;
      updateData.familyNameAr = famName;
      updateData.fullNameAr = [fName, sName, tName, famName].filter(Boolean).join(' ');
    }

    if (data.fullNameEn !== undefined) updateData.fullNameEn = data.fullNameEn?.trim() || null;
    if (data.nationality !== undefined) updateData.nationality = data.nationality?.trim() || null;
    if (data.occupation !== undefined) updateData.occupation = data.occupation?.trim() || null;
    if (data.workplace !== undefined) updateData.workplace = data.workplace?.trim() || null;
    if (data.status !== undefined) updateData.status = data.status;

    if (data.nationalId !== undefined) {
      const cleanNid = data.nationalId.trim();
      const nationalIdHash = computeBlindHash(cleanNid);

      if (nationalIdHash !== existing.nationalIdHash) {
        const dup = await prisma.guardian.findFirst({
          where: {
            schoolId: existing.schoolId,
            nationalIdHash,
            id: { not: existing.id },
            deletedAt: null
          }
        });
        if (dup) {
          throw new AppError('يوجد ولي أمر آخر بنفس رقم الهوية في المدرسة', 409, ERROR_CODES.CONFLICT);
        }
      }

      updateData.nationalIdEncrypted = encryptText(cleanNid);
      updateData.nationalIdHash = nationalIdHash;
    }

    if (data.phone !== undefined) {
      const cleanPhone = data.phone.trim();
      updateData.phoneEncrypted = encryptText(cleanPhone);
      updateData.phoneHash = computeBlindHash(cleanPhone);
    }

    if (data.email !== undefined) {
      const cleanEmail = data.email ? data.email.trim().toLowerCase() : null;
      updateData.emailEncrypted = cleanEmail ? encryptText(cleanEmail) : null;
      updateData.emailHash = cleanEmail ? computeBlindHash(cleanEmail) : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.guardian.update({
        where: { id },
        data: updateData
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'GUARDIAN_UPDATED',
          entityName: 'Guardian',
          entityId: id,
          action: 'UPDATE',
          oldData: {
            fullNameAr: existing.fullNameAr,
            status: existing.status
          },
          newData: {
            fullNameAr: res.fullNameAr,
            status: res.status
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return res;
    });

    return this.formatGuardian(updated, true);
  }

  // ==========================================
  // 5. DELETE GUARDIAN (الحذف المنطقي لولي الأمر)
  // ==========================================
  static async deleteGuardian({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    id,
    context = {}
  }) {
    if (!id) {
      throw new AppError('معرف ولي الأمر مطلوب', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const existing = await prisma.guardian.findFirst({
      where: { id, deletedAt: null },
      include: {
        studentGuardians: {
          where: { deletedAt: null }
        }
      }
    });

    if (!existing) {
      throw new AppError('سجل ولي الأمر غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: existing.schoolId
    });

    if (existing.studentGuardians.length > 0) {
      throw new AppError('لا يمكن حذف ولي أمر لديه طلاب مرتبطون به حالياً. يرجى إلغاء الربط أولاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    await prisma.$transaction(async (tx) => {
      await tx.guardian.update({
        where: { id },
        data: { deletedAt: new Date() }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: existing.schoolId,
          userId: callerUser.id,
          eventType: 'GUARDIAN_DELETED',
          entityName: 'Guardian',
          entityId: id,
          action: 'DELETE',
          oldData: { id, fullNameAr: existing.fullNameAr },
          newData: null,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم حذف سجل ولي الأمر بنجاح' };
  }

  // ==========================================
  // 6. LINK STUDENT TO GUARDIAN (ربط طالب بولي أمر)
  // ==========================================
  static async linkStudent({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    guardianId,
    data,
    context = {}
  }) {
    const {
      studentId,
      relationshipType = 'FATHER',
      isPrimary = true,
      isEmergencyContact = true,
      isFinanciallyResponsible = true,
      hasPickupAuthorization = true,
      notes
    } = data;

    if (!guardianId || !studentId) {
      throw new AppError('معرف ولي الأمر ومعرف الطالب حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const [guardian, student] = await Promise.all([
      prisma.guardian.findFirst({ where: { id: guardianId, deletedAt: null } }),
      prisma.student.findFirst({ where: { id: studentId, deletedAt: null } })
    ]);

    if (!guardian) throw new AppError('سجل ولي الأمر غير موجود', 404, ERROR_CODES.NOT_FOUND);
    if (!student) throw new AppError('سجل الطالب غير موجود', 404, ERROR_CODES.NOT_FOUND);

    if (guardian.schoolId !== student.schoolId) {
      throw new AppError('لا يمكن ربط طالب وولي أمر من مدرستين مختلفتين', 400, ERROR_CODES.BAD_REQUEST);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: guardian.schoolId
    });

    // Check active link uniqueness
    const activeLink = await prisma.studentGuardian.findFirst({
      where: {
        studentId,
        guardianId,
        deletedAt: null
      }
    });

    if (activeLink) {
      throw new AppError('الطالب مرتبط مسبقاً بهذا الولي بشكل نشط', 409, ERROR_CODES.CONFLICT);
    }

    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.studentGuardian.create({
        data: {
          schoolId: guardian.schoolId,
          studentId,
          guardianId,
          relationshipType,
          isPrimary,
          isEmergencyContact,
          isFinanciallyResponsible,
          hasPickupAuthorization,
          notes: notes?.trim() || null
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: guardian.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_GUARDIAN_LINKED',
          entityName: 'StudentGuardian',
          entityId: created.id,
          action: 'CREATE',
          oldData: null,
          newData: {
            guardianId,
            studentId,
            relationshipType,
            isPrimary
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return link;
  }

  // ==========================================
  // 7. UNLINK STUDENT FROM GUARDIAN (فك ربط طالب)
  // ==========================================
  static async unlinkStudent({
    callerUser,
    callerScopes = [],
    isPlatformLevel = false,
    guardianId,
    studentId,
    context = {}
  }) {
    if (!guardianId || !studentId) {
      throw new AppError('معرف ولي الأمر ومعرف الطالب مطلوبان', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const link = await prisma.studentGuardian.findFirst({
      where: {
        guardianId,
        studentId,
        deletedAt: null
      }
    });

    if (!link) {
      throw new AppError('علاقة الربط بين الطالب وولي الأمر غير موجودة أو ملغاة مسبقاً', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: link.schoolId
    });

    await prisma.$transaction(async (tx) => {
      await tx.studentGuardian.update({
        where: { id: link.id },
        data: { deletedAt: new Date() }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: link.schoolId,
          userId: callerUser.id,
          eventType: 'STUDENT_GUARDIAN_UNLINKED',
          entityName: 'StudentGuardian',
          entityId: link.id,
          action: 'DELETE',
          oldData: { guardianId, studentId },
          newData: null,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return { message: 'تم إلغاء ربط الطالب بولي الأمر بنجاح' };
  }

  // ==========================================
  // 8. GET GUARDIAN STUDENTS (أبناء ولي الأمر)
  // ==========================================
  static async getGuardianStudents({
    callerScopes = [],
    isPlatformLevel = false,
    guardianId
  }) {
    if (!guardianId) {
      throw new AppError('معرف ولي الأمر مطلوب', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const guardian = await prisma.guardian.findFirst({
      where: { id: guardianId, deletedAt: null }
    });

    if (!guardian) {
      throw new AppError('سجل ولي الأمر غير موجود', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: guardian.schoolId
    });

    const links = await prisma.studentGuardian.findMany({
      where: {
        guardianId,
        deletedAt: null
      },
      include: {
        student: {
          include: {
            enrollments: {
              where: { deletedAt: null, enrollmentStatus: 'ACTIVE' },
              include: {
                classSection: true,
                academicYear: true
              }
            }
          }
        }
      }
    });

    return links;
  }
}

module.exports = GuardiansService;
