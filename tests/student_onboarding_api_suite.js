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

async function runStudentOnboardingApiTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING STUDENT ONBOARDING COMMIT API TEST SUITE (EPHEMERAL)');
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
    // SETUP: Ephemeral Platform Owner Creation & Login
    // ----------------------------------------------------
    console.log('--- SETUP: Ephemeral Platform Owner Creation & Authentication ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);

    assert(Boolean(ownerCookie), 'Setup: Ephemeral Platform Owner authenticated (200 OK)');

    // ----------------------------------------------------
    // SETUP: Create Two Isolated Schools (A & B)
    // ----------------------------------------------------
    console.log('\n--- SETUP: Create Isolated Schools & Academic Structure ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_API_A_${Date.now()}`, nameAr: 'مدارس الأفق التجريبية A', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_API_B_${Date.now()}`, nameAr: 'مدارس الأفق التجريبية B', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);

    const academicYearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2026-2027',
        startDate: new Date('2026-08-20'),
        endDate: new Date('2027-06-15'),
        isCurrent: true
      }
    });

    const stageA = await prisma.educationalStage.create({
      data: { schoolId: schoolA.id, nameAr: 'المرحلة الابتدائية', stageOrder: 1 }
    });

    const gradeA = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الأول الابتدائي', gradeLevel: 1 }
    });

    const sectionA = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, nameAr: 'بنين', genderType: 'BOYS' }
    });

    const classSectionA = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: academicYearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: '1-أ',
        nameEn: '1-A',
        maxCapacity: 30
      }
    });

    assert(Boolean(schoolA.id && schoolB.id && classSectionA.id), 'Setup: Schools and ClassSection created');

    // ----------------------------------------------------
    // SETUP: Create Users with Different RBAC Roles
    // ----------------------------------------------------
    console.log('\n--- SETUP: Create Users & Authenticate ---');
    // 1. School Admin for School A
    const adminAUsername = `admin.api.a.${Date.now()}`;
    const adminAPassword = `Pass_${Date.now()}!AdminA`;
    const adminARes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminAUsername,
        password: adminAPassword,
        fullName: 'مدير مدرسة A للاختبار',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminARes.body.data.user.id);

    const adminALoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminAUsername, password: adminAPassword });
    const adminACookie = adminALoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // 2. School Admin for School B (for Cross-School Scope tests)
    const adminBUsername = `admin.api.b.${Date.now()}`;
    const adminBPassword = `Pass_${Date.now()}!AdminB`;
    const adminBRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminBUsername,
        password: adminBPassword,
        fullName: 'مدير مدرسة B للاختبار',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolB.id
      });
    createdUserIds.push(adminBRes.body.data.user.id);

    const adminBLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminBUsername, password: adminBPassword });
    const adminBCookie = adminBLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // 3. Registrar for School A (Lacks import.commit permission)
    const regUsername = `reg.api.a.${Date.now()}`;
    const regPassword = `Pass_${Date.now()}!RegA`;
    const regRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: regUsername,
        password: regPassword,
        fullName: 'مسجل مدرسة A للاختبار',
        roleCode: 'REGISTRAR',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(regRes.body.data.user.id);

    const regLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: regUsername, password: regPassword });
    const regCookie = regLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    assert(Boolean(adminACookie && adminBCookie && regCookie), 'Setup: School Admin A, School Admin B, and Registrar logged in');

    // Helper to create a batch with valid staged records
    async function createValidatedBatch(schoolId, stagedRecords) {
      const batch = await prisma.importBatch.create({
        data: {
          schoolId,
          entityType: 'STUDENTS',
          status: 'VALIDATED',
          originalFileName: 'students_onboarding_test.xlsx',
          totalRows: stagedRecords.length,
          validRows: stagedRecords.length,
          errorRows: 0,
          uploadedById: adminARes.body.data.user.id
        }
      });

      const recordsToInsert = stagedRecords.map((data, idx) => ({
        batchId: batch.id,
        rowNumber: idx + 1,
        entityType: 'STUDENTS',
        status: 'VALID',
        rawData: {
          studentName: data.studentName,
          studentCode: data.studentCode,
          national_id: data.national_id,
          parentName: data.parentName,
          parentPhone: data.parentPhone || '0501234567',
          parentEmail: data.parentEmail || 'test.parent@api.com',
          relationship: data.relationship || 'FATHER',
          stageName: 'المرحلة الابتدائية',
          gradeName: 'الصف الأول الابتدائي',
          sectionName: 'بنين',
          classSectionName: '1-أ'
        }
      }));

      await prisma.importRecord.createMany({ data: recordsToInsert });
      return batch;
    }

    // ==================================================================
    // SCENARIO A: Valid Request with import.commit by SCHOOL_ADMIN (200 OK)
    // ==================================================================
    console.log('\n--- SCENARIO A: Successful Commit via API (200 OK) ---');
    const parentIdA = '1099887766';
    const batchA = await createValidatedBatch(schoolA.id, [
      {
        studentName: 'فيصل عبد الله المطيري',
        studentCode: `STU-API-A1-${Date.now().toString().slice(-4)}`,
        national_id: parentIdA,
        parentName: 'عبد الله بن ناصر المطيري',
        parentPhone: '0501234567',
        relationship: 'FATHER'
      }
    ]);

    const commitResA = await request(app)
      .post(`/api/v1/import/batches/${batchA.id}/commit-onboarding`)
      .set('Cookie', adminACookie)
      .send();

    assert(commitResA.status === 200, 'Scenario A: POST /batches/:id/commit-onboarding returns 200 OK');
    assert(commitResA.body.success === true, 'Scenario A: Response envelope has success=true');
    assert(commitResA.body.data.status === 'COMMITTED', 'Scenario A: Batch status in response is COMMITTED');
    assert(commitResA.body.data.summary.createdStudentsCount === 1, 'Scenario A: Summary indicates 1 student created');
    assert(commitResA.body.data.summary.newGuardiansCreatedCount === 1, 'Scenario A: Summary indicates 1 guardian created');

    // ==================================================================
    // SCENARIO B: Unauthenticated Access (401 Unauthorized)
    // ==================================================================
    console.log('\n--- SCENARIO B: Unauthenticated Access Rejection (401) ---');
    const unauthRes = await request(app)
      .post(`/api/v1/import/batches/${batchA.id}/commit-onboarding`)
      .send();

    assert(unauthRes.status === 401, 'Scenario B: Request without session cookie returns 401');
    assert(unauthRes.body.error?.code === 'AUTH_UNAUTHENTICATED', 'Scenario B: Error code is AUTH_UNAUTHENTICATED');

    // ==================================================================
    // SCENARIO C: Authenticated User Lacking import.commit (403 Forbidden)
    // ==================================================================
    console.log('\n--- SCENARIO C: RBAC Permission Guard Rejection (403) ---');
    const batchC = await createValidatedBatch(schoolA.id, [
      {
        studentName: 'سلطان فهد القحطاني',
        studentCode: `STU-API-C1-${Date.now().toString().slice(-4)}`,
        national_id: '1099887755',
        parentName: 'فهد القحطاني'
      }
    ]);

    const regCommitRes = await request(app)
      .post(`/api/v1/import/batches/${batchC.id}/commit-onboarding`)
      .set('Cookie', regCookie)
      .send();

    assert(regCommitRes.status === 403, 'Scenario C: REGISTRAR (lacking import.commit) blocked with 403 Forbidden');
    assert(regCommitRes.body.error?.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Scenario C: Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // ==================================================================
    // SCENARIO D: Multi-Tenancy Scope Violation (403 Forbidden)
    // ==================================================================
    console.log('\n--- SCENARIO D: Cross-School Scope Guard Rejection (403) ---');
    const crossSchoolRes = await request(app)
      .post(`/api/v1/import/batches/${batchC.id}/commit-onboarding`)
      .set('Cookie', adminBCookie)
      .send();

    assert(crossSchoolRes.status === 403, 'Scenario D: School B Admin blocked from committing School A batch with 403 Forbidden');
    assert(crossSchoolRes.body.error?.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Scenario D: Error code is FORBIDDEN_SCOPE_VIOLATION');

    // ==================================================================
    // SCENARIO E: Non-Existent Batch (404 Not Found)
    // ==================================================================
    console.log('\n--- SCENARIO E: Non-Existent Batch Handling (404) ---');
    const nonExistentBatchId = '00000000-0000-0000-0000-000000000000';
    const notFoundRes = await request(app)
      .post(`/api/v1/import/batches/${nonExistentBatchId}/commit-onboarding`)
      .set('Cookie', adminACookie)
      .send();

    assert(notFoundRes.status === 404, 'Scenario E: Non-existent batch ID returns 404 Not Found');
    assert(notFoundRes.body.error?.code === 'NOT_FOUND', 'Scenario E: Error code is NOT_FOUND');

    // ==================================================================
    // SCENARIO F: Batch Not in VALIDATED Status (409 Conflict)
    // ==================================================================
    console.log('\n--- SCENARIO F: Invalid Batch Status Guard (409) ---');
    const pendingBatch = await prisma.importBatch.create({
      data: {
        schoolId: schoolA.id,
        entityType: 'STUDENTS',
        status: 'PENDING',
        originalFileName: 'pending.xlsx',
        totalRows: 1,
        validRows: 0,
        errorRows: 0,
        uploadedById: adminARes.body.data.user.id
      }
    });

    const pendingCommitRes = await request(app)
      .post(`/api/v1/import/batches/${pendingBatch.id}/commit-onboarding`)
      .set('Cookie', adminACookie)
      .send();

    assert(pendingCommitRes.status === 409, 'Scenario F: Committing PENDING batch rejected with 409 Conflict');
    assert(pendingCommitRes.body.error?.code === 'CONFLICT', 'Scenario F: Error code is CONFLICT');

    // ==================================================================
    // SCENARIO G: Double Commit via API (First succeeds, Second 409)
    // ==================================================================
    console.log('\n--- SCENARIO G: Double Commit Prevention via API (409) ---');
    const doubleCommitRes = await request(app)
      .post(`/api/v1/import/batches/${batchA.id}/commit-onboarding`)
      .set('Cookie', adminACookie)
      .send();

    assert(doubleCommitRes.status === 409, 'Scenario G: Re-committing already COMMITTED batch via API rejected with 409');
    assert(doubleCommitRes.body.error?.code === 'CONFLICT', 'Scenario G: Error code is CONFLICT');

    // ==================================================================
    // SCENARIO H: Invalid UUID BatchId Parameter (400 Bad Request)
    // ==================================================================
    console.log('\n--- SCENARIO H: Invalid Input Validation (400) ---');
    const invalidIdRes = await request(app)
      .post('/api/v1/import/batches/invalid-uuid-format-123/commit-onboarding')
      .set('Cookie', adminACookie)
      .send();

    assert(invalidIdRes.status === 400, 'Scenario H: Malformed UUID returns 400 Bad Request');
    assert(invalidIdRes.body.error?.code === 'VALIDATION_ERROR', 'Scenario H: Error code is VALIDATION_ERROR');

    // ==================================================================
    // SCENARIO I: PII Leak Protection in API Response
    // ==================================================================
    console.log('\n--- SCENARIO I: Sensitive PII Leak Protection ---');
    const resString = JSON.stringify(commitResA.body);
    assert(!resString.includes(parentIdA), 'Scenario I: Response body does not leak plain National ID');
    assert(!resString.includes('0501234567'), 'Scenario I: Response body does not leak plain phone number');
    assert(!resString.includes('test.parent@api.com'), 'Scenario I: Response body does not leak plain email');
    assert(typeof commitResA.body.data.summary.createdStudentsCount === 'number', 'Scenario I: Response returns non-sensitive metadata summary counts');

    // ==================================================================
    // SCENARIO J: Real Platform Owner Zero-Touch Verification
    // ==================================================================
    console.log('\n--- SCENARIO J: Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ONBOARDING COMMIT API TESTS PASSED (100%)!`);
    console.log('========================================================\n');

  } catch (error) {
    console.error('❌ Student Onboarding Commit API Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test API data and schools...');
    try {
      await prisma.importError.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importRecord.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importBatch.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.studentGuardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.guardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.classSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.schoolSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.educationalStage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });

      for (const uid of createdUserIds) {
        await prisma.userSession.deleteMany({ where: { userId: uid } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { entityId: uid } });
        await prisma.auditLog.deleteMany({ where: { userId: uid } });
        await prisma.loginAttempt.deleteMany({ where: { username: { startsWith: 'test.ephemeral.' } } });
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
  runStudentOnboardingApiTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      process.exit(1);
    });
}

module.exports = { runStudentOnboardingApiTestSuite };
