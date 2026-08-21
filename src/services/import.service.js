const prisma = require('../config/prisma');
const AppError = require('../utils/app-error.util');
const { ERROR_CODES } = require('../constants/error-codes');
const { encryptText, computeBlindHash } = require('../utils/crypto.util');
const FileParserUtil = require('../utils/file-parser.util');
const ArabicDataNormalizer = require('../import/normalizers/arabic-data.normalizer');
const AcademicService = require('./academic.service');

class ImportService {
  /**
   * Creates a new import batch in PENDING state.
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

    const { entityType, originalFileName } = data;

    const validEntityTypes = ['STUDENTS', 'TEACHERS'];
    if (!entityType || !validEntityTypes.includes(entityType.toUpperCase())) {
      throw new AppError('نوع الكيان المطلوب استيراده غير صالح (يجب أن يكون STUDENTS أو TEACHERS)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          schoolId,
          uploadedById: callerUser.id,
          entityType: entityType.toUpperCase(),
          originalFileName: originalFileName ? originalFileName.trim() : 'pending_upload.xlsx',
          status: 'PENDING',
          requestId: context.requestId || null,
          totalRows: 0,
          validRows: 0,
          errorRows: 0
        },
        include: {
          uploadedBy: { select: { id: true, username: true, fullName: true } }
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'IMPORT_BATCH_CREATED',
          entityName: 'ImportBatch',
          entityId: created.id,
          action: 'CREATE',
          newData: {
            entityType: created.entityType,
            originalFileName: created.originalFileName
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
   * Uploads and parses an Excel/CSV file into staged records in import_records.
   */
  static async uploadFileToBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    file,
    context = {}
  }) {
    if (!file || !file.buffer) {
      throw new AppError('لم يتم إرفاق ملف للرفع (file is required)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status === 'COMMITTED') {
      throw new AppError('لا يمكن رفع ملف لدفعة تم اعتمادها مسبقاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    // Parse and normalize Excel/CSV buffer
    const parsedRows = FileParserUtil.parseBuffer(file.buffer, file.originalname, batch.entityType);

    const sanitizedRecords = parsedRows.map(r => {
      const rawData = { ...r.rawData };
      delete rawData.password;
      delete rawData.passwordHash;
      delete rawData.secret;
      return {
        batchId,
        rowNumber: r.rowNumber,
        entityType: batch.entityType,
        rawData,
        status: 'PENDING'
      };
    });

    await prisma.$transaction(async (tx) => {
      // Clear previous records and errors if re-uploading
      await tx.importError.deleteMany({ where: { batchId } });
      await tx.importRecord.deleteMany({ where: { batchId } });

      await tx.importRecord.createMany({
        data: sanitizedRecords
      });

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          originalFileName: file.originalname,
          totalRows: sanitizedRecords.length,
          validRows: 0,
          errorRows: 0,
          status: 'PENDING'
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: batch.schoolId,
          userId: callerUser.id,
          eventType: 'IMPORT_FILE_UPLOADED',
          entityName: 'ImportBatch',
          entityId: batchId,
          action: 'UPDATE',
          newData: {
            fileName: file.originalname,
            fileSize: file.size,
            parsedRowsCount: sanitizedRecords.length
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return {
      batchId,
      originalFileName: file.originalname,
      parsedRowsCount: sanitizedRecords.length,
      status: 'PENDING'
    };
  }

  /**
   * Adds raw records to an import batch (JSONB staging).
   */
  static async addRecords(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    records,
    context = {}
  }) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new AppError('يجب تقديم مصفوفة سجلات غير فارغة (records)', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status === 'COMMITTED') {
      throw new AppError('لا يمكن إضافة سجلات لدفعة تم اعتمادها مسبقاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    const sanitizedRecords = records.map((rec, index) => {
      const rowNumber = rec.rowNumber || (index + 1);
      const rawData = { ...(rec.rawData || rec) };
      delete rawData.password;
      delete rawData.passwordHash;
      delete rawData.secret;
      return {
        batchId,
        rowNumber,
        entityType: batch.entityType,
        rawData,
        status: 'PENDING'
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.importRecord.createMany({
        data: sanitizedRecords
      });

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          totalRows: { increment: sanitizedRecords.length },
          status: 'PENDING'
        }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: batch.schoolId,
          userId: callerUser.id,
          eventType: 'IMPORT_RECORDS_ADDED',
          entityName: 'ImportRecord',
          entityId: batchId,
          action: 'CREATE',
          newData: { addedCount: sanitizedRecords.length },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return {
      batchId,
      addedRecordsCount: sanitizedRecords.length
    };
  }

  /**
   * Validates all staged records in an import batch without writing to operational tables.
   */
  static async validateBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { records: { orderBy: { rowNumber: 'asc' } } }
    });

    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.records.length === 0) {
      throw new AppError('دفعة الاستيراد لا تحتوي على أي سجلات للتحقق منها', 400, ERROR_CODES.BAD_REQUEST);
    }

    if (batch.status === 'COMMITTED') {
      throw new AppError('تم اعتماد هذه الدفعة مسبقاً ولا يمكن إعادة التحقق منها', 400, ERROR_CODES.BAD_REQUEST);
    }

    const schoolId = batch.schoolId;

    let existingCodes = new Set();
    let validSpecializations = new Map();
    let validClasses = new Map();
    let validGrades = new Map();

    if (batch.entityType === 'STUDENTS') {
      const [existingStudents, grades, classes] = await Promise.all([
        prisma.student.findMany({
          where: { schoolId, deletedAt: null },
          select: { studentCode: true }
        }),
        prisma.grade.findMany({
          where: { schoolId, deletedAt: null },
          select: { id: true, nameAr: true, nameEn: true, gradeLevel: true }
        }),
        prisma.classSection.findMany({
          where: { schoolId, deletedAt: null },
          select: { id: true, nameAr: true, nameEn: true, academicYearId: true, gradeId: true }
        })
      ]);

      existingStudents.forEach(s => {
        if (s.studentCode) existingCodes.add(s.studentCode.toUpperCase());
      });

      grades.forEach(g => {
        validGrades.set(g.id, g);
        validGrades.set(g.nameAr.trim(), g);
        if (g.nameEn) validGrades.set(g.nameEn.trim(), g);
        validGrades.set(String(g.gradeLevel), g);
      });

      classes.forEach(c => {
        validClasses.set(c.id, c);
        validClasses.set(c.nameAr.trim(), c);
        if (c.nameEn) validClasses.set(c.nameEn.trim(), c);
      });
    } else if (batch.entityType === 'TEACHERS') {
      const [existingTeachers, specializations] = await Promise.all([
        prisma.teacher.findMany({
          where: { schoolId, deletedAt: null },
          select: { employeeNumber: true }
        }),
        prisma.specialization.findMany({
          where: { schoolId, deletedAt: null },
          select: { id: true, nameAr: true, code: true }
        })
      ]);

      existingTeachers.forEach(t => {
        if (t.employeeNumber) existingCodes.add(t.employeeNumber.toUpperCase());
      });

      specializations.forEach(s => {
        validSpecializations.set(s.id, s);
        validSpecializations.set(s.nameAr.trim(), s);
        if (s.code) validSpecializations.set(s.code.toUpperCase(), s);
      });
    }

    const errorsToInsert = [];
    const validRecordIds = [];
    const invalidRecordIds = [];
    const seenBatchCodes = new Set();

    for (const record of batch.records) {
      const data = record.rawData || {};
      const rowNumber = record.rowNumber;
      const rowErrors = [];

      if (batch.entityType === 'STUDENTS') {
        // 1. Name Check
        const hasArabicName = (data.firstNameAr && data.familyNameAr) ||
                              (data.first_name_ar && data.family_name_ar) ||
                              data.fullNameAr || data.full_name_ar;
        if (!hasArabicName) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'firstNameAr',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'الاسم الأول واسم العائلة (أو الاسم الكامل) حقل إجباري'
          });
        }

        // 2. Grade Check
        const gradeVal = data.grade || data.gradeId || data.gradeName || data.grade_name || data.grade_level;
        if (!gradeVal) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'grade',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'الصف الدراسي حقل إجباري'
          });
        } else if (!validGrades.has(gradeVal) && !validGrades.has(String(gradeVal).trim())) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'grade',
            errorCode: 'INVALID_REFERENCE',
            errorMessageAr: `الصف الدراسي [${gradeVal}] غير معرف في المدرسة`
          });
        }

        // 3. Class Section Check
        const classVal = data.section || data.classSection || data.classSectionId || data.className || data.class_section;
        if (!classVal) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'section',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'الشعبة الصفية حقل إجباري'
          });
        } else if (!validClasses.has(classVal) && !validClasses.has(String(classVal).trim())) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'section',
            errorCode: 'INVALID_REFERENCE',
            errorMessageAr: `الشعبة الصفية [${classVal}] غير معرفة في المدرسة`
          });
        }

        // 4. Student Code Uniqueness Check
        const studentCodeVal = data.studentCode || data.student_code;
        if (studentCodeVal) {
          const sCode = String(studentCodeVal).trim().toUpperCase();
          if (existingCodes.has(sCode)) {
            rowErrors.push({
              batchId,
              recordId: record.id,
              rowNumber,
              fieldName: 'studentCode',
              errorCode: 'DUPLICATE_CODE',
              errorMessageAr: `كود الطالب [${sCode}] مسجل مسبقاً في قاعدة بيانات المدرسة`
            });
          } else if (seenBatchCodes.has(sCode)) {
            rowErrors.push({
              batchId,
              recordId: record.id,
              rowNumber,
              fieldName: 'studentCode',
              errorCode: 'DUPLICATE_IN_BATCH',
              errorMessageAr: `كود الطالب [${sCode}] مكرر داخل نفس ملف الاستيراد`
            });
          } else {
            seenBatchCodes.add(sCode);
          }
        }
      } else if (batch.entityType === 'TEACHERS') {
        // 1. Name Check
        const hasArabicName = (data.firstNameAr && data.familyNameAr) ||
                              (data.first_name_ar && data.family_name_ar) ||
                              data.fullNameAr || data.full_name_ar;
        if (!hasArabicName) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'firstNameAr',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'الاسم الأول واسم العائلة (أو الاسم الكامل) حقل إجباري'
          });
        }

        // 2. Employee Number Check
        const empVal = data.employeeNumber || data.employee_number;
        if (!empVal) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'employeeNumber',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'الرقم الوظيفي حقل إجباري للمعلم'
          });
        } else {
          const empNum = String(empVal).trim().toUpperCase();
          if (existingCodes.has(empNum)) {
            rowErrors.push({
              batchId,
              recordId: record.id,
              rowNumber,
              fieldName: 'employeeNumber',
              errorCode: 'DUPLICATE_CODE',
              errorMessageAr: `الرقم الوظيفي [${empNum}] مسجل مسبقاً في قاعدة بيانات المدرسة`
            });
          } else if (seenBatchCodes.has(empNum)) {
            rowErrors.push({
              batchId,
              recordId: record.id,
              rowNumber,
              fieldName: 'employeeNumber',
              errorCode: 'DUPLICATE_IN_BATCH',
              errorMessageAr: `الرقم الوظيفي [${empNum}] مكرر داخل نفس ملف الاستيراد`
            });
          } else {
            seenBatchCodes.add(empNum);
          }
        }

        // 3. Specialization Check
        const specVal = data.specialization || data.specializationId || data.specializationName || data.specialization_code;
        if (!specVal) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'specialization',
            errorCode: 'MISSING_REQUIRED_FIELD',
            errorMessageAr: 'التخصص حقل إجباري للمعلم'
          });
        } else if (!validSpecializations.has(specVal) && !validSpecializations.has(String(specVal).trim())) {
          rowErrors.push({
            batchId,
            recordId: record.id,
            rowNumber,
            fieldName: 'specialization',
            errorCode: 'INVALID_REFERENCE',
            errorMessageAr: `التخصص [${specVal}] غير معرف في المدرسة`
          });
        }
      }

      if (rowErrors.length > 0) {
        errorsToInsert.push(...rowErrors);
        invalidRecordIds.push(record.id);
      } else {
        validRecordIds.push(record.id);
      }
    }

    // Persist validation results
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

      const finalStatus = errorsToInsert.length > 0 ? 'FAILED' : 'VALIDATED';

      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          validRows: validRecordIds.length,
          errorRows: invalidRecordIds.length,
          status: finalStatus
        }
      });

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
            status: finalStatus
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });
    });

    return {
      batchId,
      totalRows: batch.records.length,
      validRows: validRecordIds.length,
      errorRows: invalidRecordIds.length,
      status: errorsToInsert.length > 0 ? 'FAILED' : 'VALIDATED',
      errorsCount: errorsToInsert.length
    };
  }

  /**
   * Returns a complete preview of the batch before committing.
   */
  static async getBatchPreview(batchId, { callerScopes, isPlatformLevel }) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
        records: {
          orderBy: { rowNumber: 'asc' },
          take: 50,
          // RIFAD-GAP-009: explicit field allowlist — never select rawData (raw import PII)
          // into the preview response. Only non-sensitive validation-state metadata is needed
          // here; the actual record content is only handled server-side during commit.
          select: {
            id: true,
            rowNumber: true,
            entityType: true,
            status: true
          }
        },
        errors: {
          orderBy: { rowNumber: 'asc' },
          take: 50
        }
      }
    });

    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    const isCommitEligible = (batch.status === 'VALIDATED' && batch.errorRows === 0 && batch.validRows > 0);

    return {
      batchId: batch.id,
      entityType: batch.entityType,
      originalFileName: batch.originalFileName,
      status: batch.status,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      errorRows: batch.errorRows,
      isCommitEligible,
      previewRecords: batch.records,
      errors: batch.errors
    };
  }

  /**
   * Atomically commits a validated import batch to operational tables (students / teachers).
   */
  static async commitBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        records: {
          where: { status: 'VALID' },
          orderBy: { rowNumber: 'asc' }
        }
      }
    });

    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status === 'COMMITTED') {
      throw new AppError('تم اعتماد هذه الدفعة مسبقاً ولا يمكن إعادة إدخالها', 400, ERROR_CODES.BAD_REQUEST);
    }

    if (batch.status !== 'VALIDATED' || batch.errorRows > 0 || batch.records.length === 0) {
      throw new AppError('لا يمكن اعتماد الدفعة إلا بعد فحصها واجتياز كافة السجلات بنجاح (VALIDATED مع صفر أخطاء)', 400, ERROR_CODES.BAD_REQUEST);
    }

    const schoolId = batch.schoolId;

    // Load active academic year
    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true, deletedAt: null }
    });

    const result = await prisma.$transaction(async (tx) => {
      let insertedCount = 0;

      if (batch.entityType === 'STUDENTS') {
        const classes = await tx.classSection.findMany({
          where: { schoolId, deletedAt: null }
        });
        const classMap = new Map();
        classes.forEach(c => {
          classMap.set(c.id, c);
          classMap.set(c.nameAr.trim(), c);
          if (c.nameEn) classMap.set(c.nameEn.trim(), c);
        });

        for (const record of batch.records) {
          const data = record.rawData || {};
          
          let firstNameAr = data.first_name_ar || data.firstNameAr;
          let secondNameAr = data.second_name_ar || data.secondNameAr || null;
          let thirdNameAr = data.third_name_ar || data.thirdNameAr || null;
          let familyNameAr = data.family_name_ar || data.familyNameAr;
          let fullNameAr = data.full_name_ar || data.fullNameAr;

          if (!fullNameAr && firstNameAr && familyNameAr) {
            fullNameAr = [firstNameAr, secondNameAr, thirdNameAr, familyNameAr].filter(Boolean).join(' ');
          } else if (fullNameAr && (!firstNameAr || !familyNameAr)) {
            const parts = fullNameAr.trim().split(/\s+/);
            firstNameAr = parts[0] || 'طالب';
            familyNameAr = parts[parts.length - 1] || 'مستجد';
          }

          const studentCode = (data.student_code || data.studentCode || `STU-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

          const student = await tx.student.create({
            data: {
              schoolId,
              studentCode,
              firstNameAr,
              secondNameAr,
              thirdNameAr,
              familyNameAr,
              fullNameAr,
              status: (data.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE')
            }
          });

          // Resolve classSection
          const classVal = data.section || data.classSection || data.classSectionId || data.className || data.class_section;
          const targetClass = classMap.get(classVal) || classMap.get(String(classVal).trim());

          if (targetClass && activeYear) {
            await tx.studentEnrollment.create({
              data: {
                schoolId,
                studentId: student.id,
                academicYearId: targetClass.academicYearId || activeYear.id,
                classSectionId: targetClass.id,
                enrollmentStatus: 'ACTIVE',
                enrollmentDate: new Date()
              }
            });
          }

          insertedCount++;
        }
      } else if (batch.entityType === 'TEACHERS') {
        const specializations = await tx.specialization.findMany({
          where: { schoolId, deletedAt: null }
        });
        const specMap = new Map();
        specializations.forEach(s => {
          specMap.set(s.id, s);
          specMap.set(s.nameAr.trim(), s);
          if (s.code) specMap.set(s.code.toUpperCase(), s);
        });

        for (const record of batch.records) {
          const data = record.rawData || {};

          let firstNameAr = data.first_name_ar || data.firstNameAr;
          let familyNameAr = data.family_name_ar || data.familyNameAr;
          let fullNameAr = data.full_name_ar || data.fullNameAr;

          if (!fullNameAr && firstNameAr && familyNameAr) {
            fullNameAr = `${firstNameAr} ${familyNameAr}`;
          } else if (fullNameAr && (!firstNameAr || !familyNameAr)) {
            const parts = fullNameAr.trim().split(/\s+/);
            firstNameAr = parts[0] || 'معلم';
            familyNameAr = parts[parts.length - 1] || 'معتمد';
          }

          const specVal = data.specialization || data.specializationId || data.specializationName || data.specialization_code;
          const spec = specMap.get(specVal) || specMap.get(String(specVal).trim());

          // Encrypt sensitive PII if present
          const rawNationalId = data.national_id || data.nationalId || '1000000000';
          const nationalIdEncrypted = encryptText(String(rawNationalId).trim());
          const nationalIdHash = computeBlindHash(String(rawNationalId).trim());

          let phoneEncrypted = null;
          let phoneHash = null;
          const rawPhone = data.phone || data.phoneNumber;
          if (rawPhone) {
            phoneEncrypted = encryptText(String(rawPhone).trim());
            phoneHash = computeBlindHash(String(rawPhone).trim());
          }

          let emailEncrypted = null;
          let emailHash = null;
          const rawEmail = data.email;
          if (rawEmail) {
            emailEncrypted = encryptText(String(rawEmail).trim().toLowerCase());
            emailHash = computeBlindHash(String(rawEmail).trim().toLowerCase());
          }

          const employeeNumber = String(data.employee_number || data.employeeNumber || `EMP-${Date.now().toString().slice(-4)}`).toUpperCase();

          await tx.teacher.create({
            data: {
              schoolId,
              specializationId: spec ? spec.id : (specializations[0] ? specializations[0].id : undefined),
              employeeNumber,
              firstNameAr,
              familyNameAr,
              fullNameAr,
              nationality: data.nationality || 'سعودي',
              hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
              nationalIdEncrypted,
              nationalIdHash,
              phoneEncrypted,
              phoneHash,
              emailEncrypted,
              emailHash,
              status: 'ACTIVE'
            }
          });

          insertedCount++;
        }
      }

      // Mark records as PROCESSED
      await tx.importRecord.updateMany({
        where: { batchId, status: 'VALID' },
        data: { status: 'PROCESSED' }
      });

      // Mark batch as COMMITTED
      const updatedBatch = await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'COMMITTED' }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId,
          userId: callerUser.id,
          eventType: 'IMPORT_BATCH_COMMITTED',
          entityName: 'ImportBatch',
          entityId: batchId,
          action: 'CREATE',
          newData: {
            entityType: batch.entityType,
            insertedCount
          },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return {
        batchId,
        entityType: batch.entityType,
        status: 'COMMITTED',
        insertedCount
      };
    });

    return result;
  }

  /**
   * Atomically commits a validated student onboarding batch (including Students, Enrollments, Guardians, and StudentGuardians).
   */
  static async commitStudentOnboardingBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. PostgreSQL Row-level lock on the targeted import batch to prevent concurrent commits
      const lockedBatches = await tx.$queryRaw`
        SELECT 
          id, 
          school_id AS "schoolId", 
          status, 
          error_rows AS "errorRows", 
          valid_rows AS "validRows", 
          total_rows AS "totalRows",
          entity_type AS "entityType"
        FROM import_batches
        WHERE id = ${batchId}::uuid
        FOR UPDATE
      `;

      const batch = lockedBatches && lockedBatches.length > 0 ? lockedBatches[0] : null;

      if (!batch) {
        throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);
      }

      const schoolId = AcademicService.resolveSchoolId({
        callerScopes,
        isPlatformLevel,
        requestedSchoolId: batch.schoolId
      });

      if (batch.status === 'COMMITTED') {
        throw new AppError('تم اعتماد هذه الدفعة مسبقاً ولا يمكن إعادة إدخالها', 409, ERROR_CODES.CONFLICT);
      }

      if (batch.status !== 'VALIDATED') {
        throw new AppError(`لا يمكن اعتماد الدفعة: حالة الدفعة الحالية هي ${batch.status} وليست VALIDATED`, 409, ERROR_CODES.CONFLICT);
      }

      if (batch.errorRows > 0) {
        throw new AppError('لا يمكن اعتماد الدفعة: تحتوي الدفعة على أخطاء تحقق يجب تصحيحها أولاً', 400, ERROR_CODES.BAD_REQUEST);
      }

      // 2. Fetch VALID records belonging to this batch inside the transaction
      const records = await tx.importRecord.findMany({
        where: { batchId, status: 'VALID' },
        orderBy: { rowNumber: 'asc' }
      });

      if (records.length === 0) {
        throw new AppError('لا يمكن اعتماد الدفعة: لا توجد سجلات صالحة للاعتماد في هذه الدفعة', 400, ERROR_CODES.BAD_REQUEST);
      }

      // Helper to map and normalize relationship types to standard GuardianRelationshipType enum
      const normalizeRelationship = (rawRel) => {
        if (!rawRel) return 'FATHER';
        const cleaned = String(rawRel).trim().toUpperCase();

        if (
          cleaned === 'GRANDPARENT' ||
          cleaned === 'GRANDFATHER' ||
          cleaned === 'GRANDMOTHER' ||
          cleaned === 'جد' ||
          cleaned === 'جدة' ||
          cleaned === 'الجد' ||
          cleaned === 'الجدة'
        ) {
          return 'GRANDPARENT';
        }

        if (cleaned === 'FATHER' || cleaned === 'أب' || cleaned === 'والد' || cleaned === 'الوالد' || cleaned === 'الاب') {
          return 'FATHER';
        }

        if (cleaned === 'MOTHER' || cleaned === 'أم' || cleaned === 'والدة' || cleaned === 'الوالدة' || cleaned === 'الام') {
          return 'MOTHER';
        }

        if (cleaned === 'BROTHER' || cleaned === 'أخ' || cleaned === 'اخ' || cleaned === 'الأخ' || cleaned === 'الاخ') {
          return 'BROTHER';
        }

        if (cleaned === 'SISTER' || cleaned === 'أخت' || cleaned === 'اخت' || cleaned === 'الأخت' || cleaned === 'الاخت') {
          return 'SISTER';
        }

        if (cleaned === 'UNCLE' || cleaned === 'عم' || cleaned === 'العم' || cleaned === 'خال' || cleaned === 'الخال') {
          return 'UNCLE';
        }

        if (cleaned === 'AUNT' || cleaned === 'عمة' || cleaned === 'العمة' || cleaned === 'خالة' || cleaned === 'الخالة') {
          return 'AUNT';
        }

        if (cleaned === 'LEGAL_GUARDIAN' || cleaned === 'وصي' || cleaned === 'ولي أمر' || cleaned === 'الوصي' || cleaned === 'ولي الامر' || cleaned === 'كفيل') {
          return 'LEGAL_GUARDIAN';
        }

        const validEnumValues = ['FATHER', 'MOTHER', 'LEGAL_GUARDIAN', 'BROTHER', 'SISTER', 'UNCLE', 'AUNT', 'GRANDPARENT', 'OTHER'];
        return validEnumValues.includes(cleaned) ? cleaned : 'FATHER';
      };

      // 3. In-Memory Data Preparation & Family Grouping
      const familyMap = new Map();

      for (const record of records) {
        const rawData = record.rawData || {};
        const processed = ArabicDataNormalizer.processRow(rawData);

        const parentRawId = processed.parent.normalized.id || rawData.parentId || rawData.parent_id || rawData.national_id || '';
        const cleanParentId = String(parentRawId).trim();
        const parentPhone = processed.parent.normalized.phone || rawData.parentPhone || rawData.parent_phone || '';
        const parentName = rawData.parentName || rawData.parent_name || rawData.guardianName || rawData.guardian_name || 'ولي أمر معتمد';
        const parentEmail = processed.parent.normalized.email || rawData.parentEmail || rawData.parent_email || null;

        const parentNationalIdHash = computeBlindHash(cleanParentId);

        if (!familyMap.has(parentNationalIdHash)) {
          const normalizedParentName = ArabicDataNormalizer.normalizeArabicName(parentName);
          const nameParts = normalizedParentName.split(/\s+/).filter(Boolean);
          const firstNameAr = nameParts[0] || 'ولي';
          const familyNameAr = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'أمر';
          const fullNameAr = normalizedParentName || `${firstNameAr} ${familyNameAr}`;

          familyMap.set(parentNationalIdHash, {
            nationalIdPlain: cleanParentId,
            nationalIdHash: parentNationalIdHash,
            phonePlain: parentPhone,
            emailPlain: parentEmail,
            firstNameAr,
            familyNameAr,
            fullNameAr,
            children: []
          });
        }

        const studentRawName = rawData.studentName || rawData.student_name || rawData.name || rawData.fullNameAr || '';
        const normalizedStudentName = ArabicDataNormalizer.normalizeArabicName(studentRawName);
        const studentNameParts = normalizedStudentName.split(/\s+/).filter(Boolean);
        const studentFirstNameAr = studentNameParts[0] || 'طالب';
        const studentSecondNameAr = studentNameParts.length > 2 ? studentNameParts[1] : null;
        const studentThirdNameAr = studentNameParts.length > 3 ? studentNameParts[2] : null;
        const studentFamilyNameAr = studentNameParts.length > 1 ? studentNameParts[studentNameParts.length - 1] : 'مستجد';
        const studentFullNameAr = normalizedStudentName || `${studentFirstNameAr} ${studentFamilyNameAr}`;
        const studentFullNameEn = rawData.studentNameEn || rawData.student_name_en || null;
        const studentCode = (rawData.studentCode || rawData.student_code || `STU-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
        const nationalId = rawData.studentNationalId || rawData.student_national_id || rawData.nationalId || null;

        const gradeVal = rawData.grade || rawData.grade_name || rawData.gradeId || '';
        const sectionVal = rawData.section || rawData.classSection || rawData.class_section || '';
        const relationshipTypeRaw = rawData.relationshipType || rawData.relationship_type || rawData.relationship || 'FATHER';
        const relationshipType = normalizeRelationship(relationshipTypeRaw);

        familyMap.get(parentNationalIdHash).children.push({
          recordId: record.id,
          rowNumber: record.rowNumber,
          student: {
            studentCode,
            firstNameAr: studentFirstNameAr,
            secondNameAr: studentSecondNameAr,
            thirdNameAr: studentThirdNameAr,
            familyNameAr: studentFamilyNameAr,
            fullNameAr: studentFullNameAr,
            fullNameEn: studentFullNameEn,
            nationalId,
            status: 'ACTIVE'
          },
          enrollment: {
            gradeVal,
            sectionVal
          },
          relationshipType
        });
      }

      // 4. Load Academic Dependencies
      const activeYear = await tx.academicYear.findFirst({
        where: { schoolId, isCurrent: true, deletedAt: null }
      });

      const classes = await tx.classSection.findMany({
        where: { schoolId, deletedAt: null }
      });
      const classMap = new Map();
      classes.forEach(c => {
        classMap.set(c.id, c);
        classMap.set(c.nameAr.trim(), c);
        if (c.nameEn) classMap.set(c.nameEn.trim(), c);
      });

      // 5. Operational Persistence & Domain Entities Creation
      let createdStudentsCount = 0;
      let createdEnrollmentsCount = 0;
      let resolvedGuardiansCount = 0;
      let newGuardiansCreatedCount = 0;
      let existingGuardiansReusedCount = 0;
      let guardiansReactivatedCount = 0;
      let studentGuardianLinksCount = 0;
      let auditLogsCount = 0;

      const auditLogsToInsert = [];

      // Step A: Iterate over each family group
      for (const [parentHash, family] of familyMap.entries()) {
        resolvedGuardiansCount++;

        const existingGuardian = await tx.guardian.findFirst({
          where: {
            schoolId,
            nationalIdHash: parentHash
          }
        });

        let guardianId;

        if (existingGuardian) {
          guardianId = existingGuardian.id;

          if (existingGuardian.deletedAt) {
            // Reactivate soft-deleted guardian
            await tx.guardian.update({
              where: { id: existingGuardian.id },
              data: { deletedAt: null, status: 'ACTIVE' }
            });
            guardiansReactivatedCount++;

            auditLogsToInsert.push({
              requestId: context.requestId || null,
              schoolId,
              userId: callerUser.id,
              eventType: 'GUARDIAN_REACTIVATED_FROM_IMPORT',
              entityName: 'Guardian',
              entityId: guardianId,
              action: 'UPDATE',
              newData: {
                nationalIdHash: parentHash,
                reactivatedByBatchId: batchId
              },
              ipAddress: context.ipAddress || null,
              userAgent: context.userAgent || null
            });
          } else {
            // Reuse existing active guardian as-is (Policy A)
            existingGuardiansReusedCount++;

            auditLogsToInsert.push({
              requestId: context.requestId || null,
              schoolId,
              userId: callerUser.id,
              eventType: 'GUARDIAN_REUSED_FROM_IMPORT',
              entityName: 'Guardian',
              entityId: guardianId,
              action: 'IMPORT',
              newData: {
                nationalIdHash: parentHash,
                reusedForBatchId: batchId
              },
              ipAddress: context.ipAddress || null,
              userAgent: context.userAgent || null
            });
          }
        } else {
          // Create new encrypted guardian
          const nationalIdEncrypted = encryptText(family.nationalIdPlain);
          const phoneEncrypted = family.phonePlain ? encryptText(family.phonePlain) : encryptText('0500000000');
          const phoneHash = family.phonePlain ? computeBlindHash(family.phonePlain) : computeBlindHash('0500000000');
          const emailEncrypted = family.emailPlain ? encryptText(family.emailPlain) : null;
          const emailHash = family.emailPlain ? computeBlindHash(family.emailPlain) : null;

          const newGuardian = await tx.guardian.create({
            data: {
              schoolId,
              firstNameAr: family.firstNameAr,
              familyNameAr: family.familyNameAr,
              fullNameAr: family.fullNameAr,
              status: 'ACTIVE',
              nationalIdEncrypted,
              nationalIdHash: family.nationalIdHash,
              phoneEncrypted,
              phoneHash,
              emailEncrypted,
              emailHash
            }
          });

          guardianId = newGuardian.id;
          newGuardiansCreatedCount++;

          auditLogsToInsert.push({
            requestId: context.requestId || null,
            schoolId,
            userId: callerUser.id,
            eventType: 'GUARDIAN_CREATED_FROM_IMPORT',
            entityName: 'Guardian',
            entityId: guardianId,
            action: 'CREATE',
            newData: {
              fullNameAr: newGuardian.fullNameAr,
              nationalIdHash: newGuardian.nationalIdHash,
              importBatchId: batchId
            },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null
          });
        }

        // Step B: Create students and links for this family
        for (const child of family.children) {
          const student = await tx.student.create({
            data: {
              schoolId,
              ...child.student
            }
          });
          createdStudentsCount++;

          auditLogsToInsert.push({
            requestId: context.requestId || null,
            schoolId,
            userId: callerUser.id,
            eventType: 'STUDENT_CREATED_FROM_IMPORT',
            entityName: 'Student',
            entityId: student.id,
            action: 'CREATE',
            newData: {
              studentCode: student.studentCode,
              fullNameAr: student.fullNameAr,
              importBatchId: batchId,
              rowNumber: child.rowNumber
            },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null
          });

          const targetClass = classMap.get(child.enrollment.sectionVal) || classMap.get(String(child.enrollment.sectionVal).trim());
          if (targetClass && activeYear) {
            const enrollment = await tx.studentEnrollment.create({
              data: {
                schoolId,
                studentId: student.id,
                academicYearId: targetClass.academicYearId || activeYear.id,
                classSectionId: targetClass.id,
                enrollmentStatus: 'ACTIVE',
                enrollmentDate: new Date()
              }
            });
            createdEnrollmentsCount++;

            auditLogsToInsert.push({
              requestId: context.requestId || null,
              schoolId,
              userId: callerUser.id,
              eventType: 'STUDENT_ENROLLED_FROM_IMPORT',
              entityName: 'StudentEnrollment',
              entityId: enrollment.id,
              action: 'CREATE',
              newData: {
                studentId: student.id,
                classSectionId: targetClass.id,
                importBatchId: batchId,
                rowNumber: child.rowNumber
              },
              ipAddress: context.ipAddress || null,
              userAgent: context.userAgent || null
            });
          }

          const link = await tx.studentGuardian.create({
            data: {
              schoolId,
              studentId: student.id,
              guardianId,
              relationshipType: child.relationshipType,
              isPrimary: true,
              isEmergencyContact: true,
              isFinanciallyResponsible: true,
              hasPickupAuthorization: true
            }
          });
          studentGuardianLinksCount++;

          auditLogsToInsert.push({
            requestId: context.requestId || null,
            schoolId,
            userId: callerUser.id,
            eventType: 'STUDENT_GUARDIAN_LINKED_FROM_IMPORT',
            entityName: 'StudentGuardian',
            entityId: link.id,
            action: 'CREATE',
            newData: {
              studentId: student.id,
              guardianId,
              relationshipType: link.relationshipType,
              importBatchId: batchId,
              rowNumber: child.rowNumber
            },
            ipAddress: context.ipAddress || null,
            userAgent: context.userAgent || null
          });
        }
      }

      // Step C: Mark Staged Records as PROCESSED
      await tx.importRecord.updateMany({
        where: { batchId, status: 'VALID' },
        data: { status: 'PROCESSED' }
      });

      // Step D: Mark Batch as COMMITTED
      await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'COMMITTED' }
      });

      // Step E: Batch-level Audit Log
      auditLogsToInsert.push({
        requestId: context.requestId || null,
        schoolId,
        userId: callerUser.id,
        eventType: 'IMPORT_BATCH_COMMITTED',
        entityName: 'ImportBatch',
        entityId: batchId,
        action: 'CREATE',
        newData: {
          entityType: batch.entityType,
          createdStudentsCount,
          createdEnrollmentsCount,
          resolvedGuardiansCount,
          newGuardiansCreatedCount,
          existingGuardiansReusedCount,
          guardiansReactivatedCount,
          studentGuardianLinksCount
        },
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null
      });

      if (auditLogsToInsert.length > 0) {
        await tx.auditLog.createMany({
          data: auditLogsToInsert
        });
        auditLogsCount = auditLogsToInsert.length;
      }

      return {
        batchId,
        status: 'COMMITTED',
        summary: {
          totalProcessedRows: records.length,
          createdStudentsCount,
          createdEnrollmentsCount,
          resolvedGuardiansCount,
          newGuardiansCreatedCount,
          existingGuardiansReusedCount,
          guardiansReactivatedCount,
          studentGuardianLinksCount,
          siblingGroupsCount: Array.from(familyMap.values()).filter(f => f.children.length > 1).length,
          auditLogsCount
        },
        committedAt: new Date()
      };
    }, {
      maxWait: 10000,
      timeout: 60000
    });

    return result;
  }

  /**
   * Cancels an import batch.
   */
  static async cancelBatch(batchId, {
    callerUser,
    callerScopes,
    isPlatformLevel,
    context = {}
  }) {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    if (batch.status === 'COMMITTED') {
      throw new AppError('لا يمكن إلغاء دفعة تم اعتمادها وإدخالها مسبقاً', 400, ERROR_CODES.BAD_REQUEST);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.importBatch.update({
        where: { id: batchId },
        data: { status: 'CANCELLED' }
      });

      await tx.auditLog.create({
        data: {
          requestId: context.requestId || null,
          schoolId: batch.schoolId,
          userId: callerUser.id,
          eventType: 'IMPORT_BATCH_CANCELLED',
          entityName: 'ImportBatch',
          entityId: batchId,
          action: 'UPDATE',
          oldData: { status: batch.status },
          newData: { status: 'CANCELLED' },
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null
        }
      });

      return res;
    });

    return updated;
  }

  /**
   * Lists import batches filtered by school scope.
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

    const { status, entityType, page = 1, limit = 20 } = query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = { schoolId: targetSchoolId };
    if (status) where.status = status;
    if (entityType) where.entityType = entityType.toUpperCase();

    const [total, batches] = await Promise.all([
      prisma.importBatch.count({ where }),
      prisma.importBatch.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, username: true, fullName: true } }
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
   * Retrieves single batch details.
   */
  static async getBatchById(id, { callerScopes, isPlatformLevel }) {
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: {
        school: { select: { id: true, nameAr: true, code: true } },
        uploadedBy: { select: { id: true, username: true, fullName: true } },
        _count: {
          select: { records: true, errors: true }
        }
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

    return batch;
  }

  /**
   * Retrieves validation errors for an import batch.
   */
  static async getBatchErrors(batchId, { callerScopes, isPlatformLevel }) {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('دفعة الاستيراد غير موجودة', 404, ERROR_CODES.NOT_FOUND);

    AcademicService.resolveSchoolId({
      callerScopes,
      isPlatformLevel,
      requestedSchoolId: batch.schoolId
    });

    const errors = await prisma.importError.findMany({
      where: { batchId },
      orderBy: { rowNumber: 'asc' }
    });

    return {
      batchId,
      totalErrors: errors.length,
      errors
    };
  }
}

module.exports = ImportService;
