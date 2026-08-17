const prisma = require('../../config/prisma');
const AppError = require('../../utils/app-error.util');
const { ERROR_CODES } = require('../../constants/error-codes');
const ArabicDataNormalizer = require('../normalizers/arabic-data.normalizer');
const StudentValidator = require('../validators/student.validator');
const SiblingDetector = require('../detectors/sibling.detector');
const AcademicService = require('../../services/academic.service');

class OnboardingService {
  /**
   * Processes, validates, and generates a preview report for a student onboarding import batch.
   * Completely read-only with respect to operational tables (students, enrollments, guardians).
   */
  static async processBatchOnboarding(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        records: { orderBy: { rowNumber: 'asc' } }
      }
    });

    if (!batch) {
      throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);
    }

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.records.length === 0) {
      throw new AppError('دفعة الاستيراد لا تحتوي على أي سجلات للمعالجة', 400, ERROR_CODES.BAD_REQUEST);
    }

    const schoolId = batch.schoolId;

    // Load academic structures for validation if available
    const [grades, classes] = await Promise.all([
      prisma.grade.findMany({
        where: { schoolId, deletedAt: null },
        select: { id: true, nameAr: true, nameEn: true, gradeLevel: true }
      }),
      prisma.classSection.findMany({
        where: { schoolId, deletedAt: null },
        select: { id: true, nameAr: true, nameEn: true }
      })
    ]);

    const gradesMap = new Map();
    grades.forEach(g => {
      gradesMap.set(g.id, g);
      gradesMap.set(g.nameAr.trim(), g);
      if (g.nameEn) gradesMap.set(g.nameEn.trim(), g);
      gradesMap.set(String(g.gradeLevel), g);
    });

    const classesMap = new Map();
    classes.forEach(c => {
      classesMap.set(c.id, c);
      classesMap.set(c.nameAr.trim(), c);
      if (c.nameEn) classesMap.set(c.nameEn.trim(), c);
    });

    const schoolContext = { gradesMap, classesMap };

    const errorsToInsert = [];
    const validRecordIds = [];
    const invalidRecordIds = [];
    const normalizedRows = [];

    // Step 1: Normalization & Structural Validation per row
    for (const record of batch.records) {
      const rawData = record.rawData || {};
      const processed = ArabicDataNormalizer.processRow(rawData);

      const rowErrors = StudentValidator.validateRow(processed, record.rowNumber, schoolContext);

      const isValid = rowErrors.length === 0;

      if (isValid) {
        validRecordIds.push(record.id);
      } else {
        invalidRecordIds.push(record.id);
        rowErrors.forEach(err => {
          errorsToInsert.push({
            batchId,
            recordId: record.id,
            rowNumber: record.rowNumber,
            fieldName: err.fieldName,
            errorCode: err.errorCode,
            errorMessageAr: err.errorMessageAr
          });
        });
      }

      normalizedRows.push({
        recordId: record.id,
        rowNumber: record.rowNumber,
        data: processed,
        isValid
      });
    }

    // Step 2: Sibling Clustering & Discrepancy Detection
    const siblingAnalysis = SiblingDetector.analyze(normalizedRows);

    // Step 3: Persist Validation Results in Staging (import_records & import_errors)
    await prisma.$transaction(async (tx) => {
      await tx.importError.deleteMany({ where: { batchId } });

      if (errorsToInsert.length > 0) {
        await tx.importError.createMany({ data: errorsToInsert });
      }

      if (validRecordIds.length > 0) {
        await tx.importRecord.updateMany({
          where: { id: { in: validRecordIds } },
          data: { status: 'VALID' }
        });
      }

      if (invalidRecordIds.length > 0) {
        await tx.importRecord.updateMany({
          where: { id: { in: invalidRecordIds } },
          data: { status: 'INVALID' }
        });
      }

      const finalStatus = (errorsToInsert.length > 0 || siblingAnalysis.needsReviewCount > 0) ? 'FAILED' : 'VALIDATED';

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          validRows: validRecordIds.length,
          errorRows: invalidRecordIds.length,
          status: finalStatus
        }
      });

      if (callerUser) {
        await tx.auditLog.create({
          data: {
            requestId: context.requestId || null,
            schoolId: batch.schoolId,
            userId: callerUser.id,
            eventType: 'IMPORT_BATCH_VALIDATED',
            entityName: 'ImportBatch',
            entityId: batchId,
            action: 'UPDATE',
            newData: {
              totalRows: batch.records.length,
              validRows: validRecordIds.length,
              errorRows: invalidRecordIds.length,
              siblingGroupsCount: siblingAnalysis.multiChildFamiliesCount,
              needsReviewCount: siblingAnalysis.needsReviewCount,
              status: finalStatus
            },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null
          }
        });
      }
    });

    // Step 4: Build Preview & Review Queue Report
    const isCommitEligible = (invalidRecordIds.length === 0 && siblingAnalysis.needsReviewCount === 0 && validRecordIds.length > 0);

    const report = {
      batchId: batch.id,
      originalFileName: batch.originalFileName,
      status: (errorsToInsert.length > 0 || siblingAnalysis.needsReviewCount > 0) ? 'FAILED' : 'VALIDATED',
      summary: {
        totalRows: batch.records.length,
        validRows: validRecordIds.length,
        invalidRows: invalidRecordIds.length,
        uniqueParentCount: siblingAnalysis.uniqueParentsCount,
        siblingGroupsCount: siblingAnalysis.multiChildFamiliesCount,
        singleChildFamiliesCount: siblingAnalysis.singletonsCount,
        needsReviewCount: siblingAnalysis.needsReviewCount,
        errorsCount: errorsToInsert.length,
        commitEligible: isCommitEligible
      },
      reviewQueue: siblingAnalysis.reviewQueue,
      siblingGroups: siblingAnalysis.siblingGroups,
      errors: errorsToInsert
    };

    return report;
  }

  /**
   * Generates a preview report directly from an array of in-memory raw records.
   * Useful for testing and dry-run validation without DB staging.
   */
  static generatePreviewFromRows(rawRows, schoolContext = {}) {
    const errors = [];
    const validRows = [];
    const invalidRows = [];
    const normalizedRows = [];

    rawRows.forEach((row, index) => {
      const rowNumber = index + 1;
      const processed = ArabicDataNormalizer.processRow(row);
      const rowErrors = StudentValidator.validateRow(processed, rowNumber, schoolContext);

      const isValid = rowErrors.length === 0;
      if (isValid) {
        validRows.push(row);
      } else {
        invalidRows.push(row);
        errors.push(...rowErrors);
      }

      normalizedRows.push({
        rowNumber,
        data: processed,
        isValid
      });
    });

    const siblingAnalysis = SiblingDetector.analyze(normalizedRows);
    const isCommitEligible = (invalidRows.length === 0 && siblingAnalysis.needsReviewCount === 0 && validRows.length > 0);

    return {
      summary: {
        totalRows: rawRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        uniqueParentCount: siblingAnalysis.uniqueParentsCount,
        siblingGroupsCount: siblingAnalysis.multiChildFamiliesCount,
        singleChildFamiliesCount: siblingAnalysis.singletonsCount,
        needsReviewCount: siblingAnalysis.needsReviewCount,
        errorsCount: errors.length,
        commitEligible: isCommitEligible
      },
      reviewQueue: siblingAnalysis.reviewQueue,
      siblingGroups: siblingAnalysis.siblingGroups,
      errors
    };
  }
}

module.exports = OnboardingService;
