const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const AcademicService = require('./academic.service');

class PromotionService {
  /**
   * Creates a new promotion batch in DRAFT status.
   */
  static async createBatch({
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

    const { sourceAcademicYearId, targetAcademicYearId, notes } = data;

    if (!sourceAcademicYearId || !targetAcademicYearId) {
      throw new AppError('السنة الدراسية المصدر والسنة الدراسية الهدف حقول إجبارية', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (sourceAcademicYearId === targetAcademicYearId) {
      throw new AppError('لا يمكن أن تكون السنة المصدر هي نفسها السنة الهدف', 400, ERROR_CODES.BAD_REQUEST);
    }

    // Verify source and target academic years exist and belong to the same school
    const [sourceYear, targetYear] = await Promise.all([
      prisma.academicYear.findFirst({
        where: { id: sourceAcademicYearId, schoolId, deletedAt: null }
      }),
      prisma.academicYear.findFirst({
        where: { id: targetAcademicYearId, schoolId, deletedAt: null }
      })
    ]);

    if (!sourceYear) throw new AppError('السنة الدراسية المصدر غير موجودة في هذه المدرسة', 404, ERROR_CODES.NOT_FOUND);
    if (!targetYear) throw new AppError('السنة الدراسية الهدف غير موجودة في هذه المدرسة', 404, ERROR_CODES.NOT_FOUND);

    // Check duplicate active batch for the same source/target years
    const existingBatch = await prisma.promotionBatch.findFirst({
      where: {
        schoolId,
        sourceAcademicYearId,
        targetAcademicYearId,
        status: { in: ['DRAFT', 'UNDER_REVIEW', 'APPROVED'] }
      }
    });

    if (existingBatch) {
      throw new AppError('توجد دفعة ترفيع نشطة أو معتمدة مسبقاً بين هاتين السنتين الدراسيتين', 409, ERROR_CODES.CONFLICT);
    }

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.promotionBatch.create({
        data: {
          schoolId,
          sourceAcademicYearId,
          targetAcademicYearId,
          notes: notes?.trim() || null,
          status: 'DRAFT',
          createdById: callerUser.id,
          totalStudents: 0,
          promotedCount: 0,
          retainedCount: 0,
          graduatedCount: 0
        },
        include: {
          sourceAcademicYear: true,
          targetAcademicYear: true,
          createdBy: { select: { id: true, username: true, fullName: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'PROMOTION_BATCH_CREATED',
          entityName: 'PromotionBatch',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            sourceYear: sourceYear.name,
            targetYear: targetYear.name
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return created;
    });

    return batch;
  }

  /**
   * Lists promotion batches by school scope.
   */
  static async listBatches({
    callerScopes,
    isPlatformLevel,
    schoolId,
    query = {}
  }) {
    const targetSchoolId = AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: schoolId || query.schoolId
    });

    const { status, page = 1, limit = 20 } = query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = { schoolId: targetSchoolId };
    if (status) where.status = status;

    const [total, batches] = await Promise.all([
      prisma.promotionBatch.count({ where }),
      prisma.promotionBatch.findMany({
        where,
        include: {
          sourceAcademicYear: true,
          targetAcademicYear: true,
          createdBy: { select: { id: true, username: true, fullName: true } },
          approvedBy: { select: { id: true, username: true, fullName: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);

    return {
      batches,
      total,
      page: parseInt(page, 10) || 1,
      limit: take,
      totalPages: Math.ceil(total / take)
    };
  }

  /**
   * Retrieves single batch details with optional items.
   */
  static async getBatchById(id, { callerScopes, isPlatformLevel, query = {} }) {
    const batch = await prisma.promotionBatch.findUnique({
      where: { id },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        sourceAcademicYear: true,
        targetAcademicYear: true,
        createdBy: { select: { id: true, username: true, fullName: true } },
        approvedBy: { select: { id: true, username: true, fullName: true } },
        _count: {
          select: { items: true }
        }
      }
    });

    if (!batch) {
      throw new AppError('دفعة الترفيع غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    let items = undefined;
    if (query.includeItems === 'true') {
      items = await prisma.promotionBatchItem.findMany({
        where: { batchId: id },
        include: {
          student: { select: { id: true, studentCode: true, fullNameAr: true, status: true } },
          fromClassSection: {
            include: { grade: { include: { stage: true } } }
          },
          toClassSection: {
            include: { grade: { include: { stage: true } } }
          }
        },
        orderBy: { createdAt: 'asc' }
      });
    }

    return {
      ...batch,
      items
    };
  }

  /**
   * Generates promotion decisions for all enrolled students in source year.
   */
  static async generateBatchItems(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.promotionBatch.findUnique({
      where: { id: batchId },
      include: { sourceAcademicYear: true, targetAcademicYear: true }
    });

    if (!batch) throw new AppError('دفعة الترفيع غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status !== 'DRAFT') {
      throw new AppError('لا يمكن إعادة توليد قرارات الترفيع إلا للدفعة التي في حالة مسودة (DRAFT)', 400, ERROR_CODES.BAD_REQUEST);
    }

    const schoolId = batch.schoolId;

    // Load all active student enrollments in the source year
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        schoolId,
        academicYearId: batch.sourceAcademicYearId,
        enrollmentStatus: 'ACTIVE',
        deletedAt: null
      },
      include: {
        student: true,
        classSection: {
          include: { grade: { include: { stage: true } } }
        }
      }
    });

    if (enrollments.length === 0) {
      throw new AppError('لا يوجد طلاب مسجلين بنشاط في السنة الدراسية المصدر لتوليد قراراتهم', 400, ERROR_CODES.BAD_REQUEST);
    }

    // Find highest grade level in school to detect graduating students
    const maxGrade = await prisma.grade.findFirst({
      where: { schoolId, deletedAt: null },
      orderBy: { gradeLevel: 'desc' }
    });
    const maxGradeLevel = maxGrade ? maxGrade.gradeLevel : 12;

    // Target year class sections for matching
    const targetClasses = await prisma.classSection.findMany({
      where: { schoolId, academicYearId: batch.targetAcademicYearId, deletedAt: null },
      include: { grade: true }
    });

    const targetClassMap = new Map();
    targetClasses.forEach(c => {
      targetClassMap.set(`${c.grade.gradeLevel}_${c.nameAr.trim()}`, c.id);
      targetClassMap.set(`grade_${c.gradeId}`, c.id);
    });

    let promotedCount = 0;
    let retainedCount = 0;
    let graduatedCount = 0;

    const itemsToCreate = enrollments.map(enr => {
      const student = enr.student;
      const currentGradeLevel = enr.classSection.grade.gradeLevel;

      let suggestedAction = 'PROMOTE';
      let toClassSectionId = null;

      if (student.status !== 'ACTIVE') {
        suggestedAction = 'RETAIN';
      } else if (currentGradeLevel >= maxGradeLevel) {
        suggestedAction = 'GRADUATE';
      } else {
        suggestedAction = 'PROMOTE';
        // Try to match next grade class in target year
        const nextGradeLevel = currentGradeLevel + 1;
        const matchedClassId = targetClassMap.get(`${nextGradeLevel}_${enr.classSection.nameAr.trim()}`);
        if (matchedClassId) toClassSectionId = matchedClassId;
      }

      if (suggestedAction === 'PROMOTE') promotedCount++;
      else if (suggestedAction === 'RETAIN') retainedCount++;
      else if (suggestedAction === 'GRADUATE') graduatedCount++;

      return {
        batchId,
        studentId: student.id,
        fromClassSectionId: enr.classSectionId,
        suggestedAction,
        finalAction: suggestedAction,
        toClassSectionId
      };
    });

    await prisma.$transaction(async (tx) => {
      // Remove any prior items for this batch
      await tx.promotionBatchItem.deleteMany({ where: { batchId } });

      await tx.promotionBatchItem.createMany({
        data: itemsToCreate
      });

      await tx.promotionBatch.update({
        where: { id: batchId },
        data: {
          totalStudents: itemsToCreate.length,
          promotedCount,
          retainedCount,
          graduatedCount
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'PROMOTION_ITEMS_GENERATED',
          entityName: 'PromotionBatch',
          entityId: batchId,
          action: 'CREATE',
          newData: {
            totalStudents: itemsToCreate.length,
            promotedCount,
            retainedCount,
            graduatedCount
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return {
      batchId,
      totalStudents: itemsToCreate.length,
      promotedCount,
      retainedCount,
      graduatedCount
    };
  }

  /**
   * Updates an individual student promotion decision.
   */
  static async updateBatchItem(itemId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    data,
    context = {}
  }) {
    const item = await prisma.promotionBatchItem.findUnique({
      where: { id: itemId },
      include: { batch: true, student: true }
    });

    if (!item) throw new AppError('عنصر الترفيع غير موجود', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: item.batch.schoolId
    });

    if (item.batch.status === 'APPROVED' || item.batch.status === 'CANCELLED') {
      throw new AppError('لا يمكن تعديل قرارات الترفيع في دفعة معتمدة أو ملغاة', 400, ERROR_CODES.BAD_REQUEST);
    }

    const { finalAction, toClassSectionId, overrideReason } = data;
    const validActions = ['PROMOTE', 'RETAIN', 'GRADUATE', 'LEAVE'];

    if (finalAction && !validActions.includes(finalAction)) {
      throw new AppError('إجراء الترفيع غير صالح (يجب أن يكون PROMOTE, RETAIN, GRADUATE, أو LEAVE)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (toClassSectionId) {
      const targetClass = await prisma.classSection.findFirst({
        where: {
          id: toClassSectionId,
          schoolId: item.batch.schoolId,
          academicYearId: item.batch.targetAcademicYearId,
          deletedAt: null
        }
      });
      if (!targetClass) {
        throw new AppError('الشعبة الصفية الهدف غير صالحة للسنة الدراسية المستهدفة', 400, ERROR_CODES.BAD_REQUEST);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.promotionBatchItem.update({
        where: { id: itemId },
        data: {
          ...(finalAction ? { finalAction } : {}),
          ...(toClassSectionId !== undefined ? { toClassSectionId } : {}),
          ...(overrideReason !== undefined ? { overrideReason: overrideReason ? overrideReason.trim() : null } : {})
        },
        include: {
          student: { select: { id: true, studentCode: true, fullNameAr: true } },
          fromClassSection: true,
          toClassSection: true
        }
      });

      // Recalculate summary counts for the batch
      const [promoted, retained, graduated] = await Promise.all([
        tx.promotionBatchItem.count({ where: { batchId: item.batchId, finalAction: 'PROMOTE' } }),
        tx.promotionBatchItem.count({ where: { batchId: item.batchId, finalAction: 'RETAIN' } }),
        tx.promotionBatchItem.count({ where: { batchId: item.batchId, finalAction: 'GRADUATE' } })
      ]);

      await tx.promotionBatch.update({
        where: { id: item.batchId },
        data: {
          promotedCount: promoted,
          retainedCount: retained,
          graduatedCount: graduated
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: item.batch.schoolId,
          userId: callerUser.id,
          eventType: 'PROMOTION_ITEM_UPDATED',
          entityName: 'PromotionBatchItem',
          entityId: itemId,
          action: 'UPDATE',
          oldData: { finalAction: item.finalAction, toClassSectionId: item.toClassSectionId },
          newData: { finalAction: res.finalAction, toClassSectionId: res.toClassSectionId, overrideReason: res.overrideReason },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return res;
    });

    return updated;
  }

  /**
   * Updates promotion batch lifecycle status (DRAFT -> UNDER_REVIEW -> CANCELLED).
   */
  static async updateBatchStatus(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    status,
    context = {}
  }) {
    const allowedTransitions = ['DRAFT', 'UNDER_REVIEW', 'CANCELLED'];
    if (!allowedTransitions.includes(status)) {
      throw new AppError('الحالة المطلوبة غير صالحة للتعديل المباشر (الاعتماد يتم عبر مسار approve)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const batch = await prisma.promotionBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('دفعة الترفيع غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status === 'APPROVED') {
      throw new AppError('لا يمكن تعديل حالة دفعة تم اعتمادها مسبقاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.promotionBatch.update({
        where: { id: batchId },
        data: { status }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: batch.schoolId,
          userId: callerUser.id,
          eventType: 'PROMOTION_BATCH_STATUS_CHANGED',
          entityName: 'PromotionBatch',
          entityId: batchId,
          action: 'UPDATE',
          oldData: { status: batch.status },
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
   * Atomically approves and executes a promotion batch.
   */
  static async approveBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.promotionBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          include: {
            student: true,
            fromClassSection: true,
            toClassSection: true
          }
        },
        sourceAcademicYear: true,
        targetAcademicYear: true
      }
    });

    if (!batch) throw new AppError('دفعة الترفيع غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status !== 'UNDER_REVIEW') {
      throw new AppError('يجب أن تكون الدفعة في حالة مراجعة (UNDER_REVIEW) قبل الاعتماد النهائي', 400, ERROR_CODES.BAD_REQUEST);
    }

    if (batch.items.length === 0) {
      throw new AppError('لا يمكن اعتماد دفعة ترفيع لا تحتوي على أي قرارات طلاب', 400, ERROR_CODES.BAD_REQUEST);
    }

    const schoolId = batch.schoolId;

    // Single Atomic Transaction for full batch rollover
    const approvedBatch = await prisma.$transaction(async (tx) => {
      for (const item of batch.items) {
        const studentId = item.studentId;
        const finalAction = item.finalAction;

        // 1. Update source academic year enrollment status
        let newEnrollmentStatus = 'PROMOTED';
        if (finalAction === 'RETAIN') newEnrollmentStatus = 'RETAINED';
        else if (finalAction === 'GRADUATE') newEnrollmentStatus = 'PROMOTED';
        else if (finalAction === 'LEAVE') newEnrollmentStatus = 'WITHDRAWN';

        await tx.studentEnrollment.updateMany({
          where: {
            schoolId,
            studentId,
            academicYearId: batch.sourceAcademicYearId,
            enrollmentStatus: 'ACTIVE',
            deletedAt: null
          },
          data: {
            enrollmentStatus: newEnrollmentStatus
          }
        });

        // 2. Handle Target Year Enrolment or Student Status Transition
        if (finalAction === 'GRADUATE') {
          await tx.student.update({
            where: { id: studentId },
            data: { status: 'GRADUATED' }
          });
        } else if (finalAction === 'LEAVE') {
          await tx.student.update({
            where: { id: studentId },
            data: { status: 'TRANSFERRED_OUT' }
          });
        } else if (finalAction === 'PROMOTE' || finalAction === 'RETAIN') {
          // If toClassSectionId is assigned, enroll student in target year
          if (item.toClassSectionId) {
            // Check if enrollment already exists in target year
            const existingTargetEnrollment = await tx.studentEnrollment.findFirst({
              where: {
                studentId,
                academicYearId: batch.targetAcademicYearId,
                deletedAt: null
              }
            });

            if (!existingTargetEnrollment) {
              await tx.studentEnrollment.create({
                data: {
                  schoolId,
                  studentId,
                  academicYearId: batch.targetAcademicYearId,
                  classSectionId: item.toClassSectionId,
                  enrollmentStatus: 'ACTIVE',
                  enrollmentDate: new Date()
                }
              });
            }
          }
        }
      }

      // 3. Mark Batch as APPROVED
      const res = await tx.promotionBatch.update({
        where: { id: batchId },
        data: {
          status: 'APPROVED',
          approvedById: callerUser.id,
          approvedAt: new Date()
        },
        include: {
          approvedBy: { select: { id: true, username: true, fullName: true } }
        }
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'PROMOTION_BATCH_APPROVED',
          entityName: 'PromotionBatch',
          entityId: batchId,
          action: 'UPDATE',
          newData: {
            totalProcessed: batch.items.length,
            promoted: batch.promotedCount,
            retained: batch.retainedCount,
            graduated: batch.graduatedCount,
            targetYear: batch.targetAcademicYear.name
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return res;
    });

    return approvedBatch;
  }
}

module.exports = PromotionService;
