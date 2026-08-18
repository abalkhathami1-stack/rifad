const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
} = require('./helpers/ephemeral_owner');

async function runImportEngineTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING IMPORT ENGINE BACKEND SUITE');
  console.log('🧪 ========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] Test ${totalTests}: ${message}`);
      throw new Error(`Test Failed: ${message}`);
    }
  }

  const createdSchoolIds = [];
  const createdUserIds = [];
  let ephemeralOwner = null;

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    // ----------------------------------------------------
    // SETUP: Ephemeral Platform Owner Login
    // ----------------------------------------------------
    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);

    assert(Boolean(ownerCookie), 'Platform Owner authenticated (200 OK)');

    // ----------------------------------------------------
    // SETUP: Create Two Isolated Schools
    // ----------------------------------------------------
    console.log('\n--- 2. Create Two Isolated Schools ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_IMP_A_${Date.now()}`, nameAr: 'مدارس المستقبل الأهلية', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_IMP_B_${Date.now()}`, nameAr: 'مدارس الأمل النموذجية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // SETUP: Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Academic Structure & Specialization in School A ---');
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2026-2027',
        startDate: new Date('2026-08-20'),
        endDate: new Date('2027-06-15'),
        isCurrent: true
      }
    });

    const stageA = await prisma.educationalStage.create({
      data: { schoolId: schoolA.id, nameAr: 'المرحلة الثانوية', stageOrder: 3 }
    });

    const gradeA = await prisma.grade.create({
      data: {
        schoolId: schoolA.id,
        stageId: stageA.id,
        nameAr: 'الصف الأول الثانوي',
        nameEn: '10th Grade',
        gradeLevel: 10
      }
    });

    const sectionA = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم الثانوي' }
    });

    const classSectionA = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة 10-أ',
        nameEn: 'Section 10-A',
        maxCapacity: 30
      }
    });

    const specA = await prisma.specialization.create({
      data: { schoolId: schoolA.id, nameAr: 'اللغة العربية', code: 'SPEC_ARABIC' }
    });

    assert(Boolean(classSectionA.id && specA.id), 'Reference structure created in School A');

    // ----------------------------------------------------
    // SETUP: Create REGISTRAR for School A
    // ----------------------------------------------------
    console.log('\n--- 4. Create REGISTRAR User for School A ---');
    const regUsername = `registrar.stu.${Date.now()}`;
    const regPassword = 'Pass123!Reg';
    const regRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: regUsername,
        password: regPassword,
        fullName: 'مسجل المدرسة أ',
        roleCode: 'REGISTRAR',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });

    createdUserIds.push(regRes.body.data.user.id);
    const regLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: regUsername, password: regPassword });

    assert(regLoginRes.status === 200, 'Registrar logged in successfully');
    const regCookie = regLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // TEST: Create Import Batch by REGISTRAR
    // ----------------------------------------------------
    console.log('\n--- 5. Create Import Batch by REGISTRAR ---');
    const createBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({
        entityType: 'STUDENTS',
        originalFileName: 'students_q1_intake.xlsx'
      });

    assert(createBatchRes.status === 201, 'Batch created with 201 Created');
    const batch1Id = createBatchRes.body.data.batch.id;
    assert(createBatchRes.body.data.batch.status === 'PENDING', 'Batch starts in PENDING status');
    assert(createBatchRes.body.data.batch.schoolId === schoolA.id, 'Batch belongs to School A');

    // ----------------------------------------------------
    // TEST: Scope Isolation (Registrar School A -> School B)
    // ----------------------------------------------------
    console.log('\n--- 6. Multi-Tenancy Scope Violation (Registrar School A -> School B) ---');
    const crossSchoolBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({
        schoolId: schoolB.id,
        entityType: 'STUDENTS',
        originalFileName: 'unauthorized_school_b.xlsx'
      });

    assert(crossSchoolBatchRes.status === 403, 'Cross-school batch creation blocked with 403 Forbidden');
    assert(crossSchoolBatchRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST: Add Raw Records to Batch
    // ----------------------------------------------------
    console.log('\n--- 7. Add Staged Raw Records (POST /batches/:id/records) ---');
    const rawStudentRecords = [
      {
        rowNumber: 1,
        rawData: {
          firstNameAr: 'خالد',
          familyNameAr: 'المنصور',
          studentCode: 'STU-IMP-001',
          grade: 'الصف الأول الثانوي',
          classSection: 'شعبة 10-أ'
        }
      },
      {
        rowNumber: 2,
        rawData: {
          // Missing family name (Invalid)
          firstNameAr: 'طالب_ناقص',
          studentCode: 'STU-IMP-002',
          grade: 'الصف الأول الثانوي',
          classSection: 'شعبة 10-أ'
        }
      },
      {
        rowNumber: 3,
        rawData: {
          firstNameAr: 'سلطان',
          familyNameAr: 'الدوسري',
          studentCode: 'STU-IMP-001', // Duplicate inside batch!
          grade: 'الصف غير المعرف',
          classSection: 'شعبة 10-أ'
        }
      }
    ];

    const addRecordsRes = await request(app)
      .post(`/api/v1/import/batches/${batch1Id}/records`)
      .set('Cookie', regCookie)
      .send({ records: rawStudentRecords });

    assert(addRecordsRes.status === 201, 'Raw records added successfully (201 Created)');
    assert(addRecordsRes.body.data.addedRecordsCount === 3, '3 raw records staged in import_records');

    // ----------------------------------------------------
    // TEST: Run Validation Engine on Students Batch
    // ----------------------------------------------------
    console.log('\n--- 8. Run Validation Engine (POST /batches/:id/validate) ---');
    const validateRes = await request(app)
      .post(`/api/v1/import/batches/${batch1Id}/validate`)
      .set('Cookie', regCookie);

    assert(validateRes.status === 200, 'Validation completed (200 OK)');
    assert(validateRes.body.data.totalRows === 3, 'Processed 3 rows');
    assert(validateRes.body.data.validRows === 1, '1 row is VALID (Row 1)');
    assert(validateRes.body.data.errorRows === 2, '2 rows are INVALID (Row 2 & Row 3)');
    assert(validateRes.body.data.status === 'FAILED', 'Batch status marked FAILED due to errors');

    // ----------------------------------------------------
    // TEST: Inspect Validation Errors
    // ----------------------------------------------------
    console.log('\n--- 9. Inspect Batch Errors (GET /batches/:id/errors) ---');
    const errorsRes = await request(app)
      .get(`/api/v1/import/batches/${batch1Id}/errors`)
      .set('Cookie', regCookie);

    assert(errorsRes.status === 200, 'Retrieved validation errors');
    assert(errorsRes.body.data.errors.length >= 2, 'Contains specific error items');
    const errorCodes = errorsRes.body.data.errors.map(e => e.errorCode);
    assert(errorCodes.includes('MISSING_REQUIRED_FIELD'), 'Identified missing field on Row 2');
    assert(errorCodes.includes('DUPLICATE_IN_BATCH') || errorCodes.includes('INVALID_REFERENCE'), 'Identified duplicate code or invalid grade reference');

    // ----------------------------------------------------
    // TEST: Validation for Teachers Batch
    // ----------------------------------------------------
    console.log('\n--- 10. Validate Teachers Import Batch ---');
    const tchBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({
        entityType: 'TEACHERS',
        originalFileName: 'faculty_onboarding.csv'
      });

    const tchBatchId = tchBatchRes.body.data.batch.id;

    await request(app)
      .post(`/api/v1/import/batches/${tchBatchId}/records`)
      .set('Cookie', regCookie)
      .send({
        records: [
          {
            rowNumber: 1,
            rawData: {
              firstNameAr: 'فهد',
              familyNameAr: 'القرني',
              employeeNumber: 'EMP-IMP-888',
              specialization: 'SPEC_ARABIC'
            }
          }
        ]
      });

    const tchValRes = await request(app)
      .post(`/api/v1/import/batches/${tchBatchId}/validate`)
      .set('Cookie', regCookie);

    assert(tchValRes.status === 200, 'Teachers batch validation completed (200 OK)');
    assert(tchValRes.body.data.validRows === 1, '1 teacher row is VALID');
    assert(tchValRes.body.data.status === 'VALIDATED', 'Teachers batch status is VALIDATED');

    // ----------------------------------------------------
    // TEST: Zero Operational Mutations Guard
    // ----------------------------------------------------
    console.log('\n--- 11. Zero Operational Mutations Guard (No Commit) ---');
    const studentCheck = await prisma.student.findFirst({
      where: { schoolId: schoolA.id, studentCode: 'STU-IMP-001' }
    });
    assert(studentCheck === null, 'No student records written to operational students table during validation');

    const teacherCheck = await prisma.teacher.findFirst({
      where: { schoolId: schoolA.id, employeeNumber: 'EMP-IMP-888' }
    });
    assert(teacherCheck === null, 'No teacher records written to operational teachers table during validation');

    // ----------------------------------------------------
    // TEST: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 12. Audit Logging Completeness for Import Engine ---');
    const importAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: {
          in: ['IMPORT_BATCH_CREATED', 'IMPORT_RECORDS_ADDED', 'IMPORT_BATCH_VALIDATED']
        }
      }
    });

    assert(importAuditLogs.length >= 3, 'Import engine operations fully recorded in audit_logs');
    console.log(`  - Verified ${importAuditLogs.length} import audit logs for School A.`);

    console.log('\n--- 13. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} IMPORT ENGINE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Import Engine Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test import data, users, and schools...');
    try {
      await prisma.importError.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importRecord.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importBatch.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.specialization.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.classSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.educationalStage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.schoolSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });

      for (const uid of createdUserIds) {
        await prisma.userSession.deleteMany({ where: { userId: uid } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { entityId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }
      for (const sid of createdSchoolIds) {
        await prisma.auditLog.deleteMany({ where: { schoolId: sid } });
        await prisma.school.deleteMany({ where: { id: sid } });
      }
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runImportEngineTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runImportEngineTestSuite };
