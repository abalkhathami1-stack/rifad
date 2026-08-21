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

async function runPromotionRolloverTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING PROMOTION & ROLLOVER BACKEND SUITE');
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
  const createdStudentIds = [];
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
      data: { code: `SCH_PROMO_A_${Date.now()}`, nameAr: 'مدارس التميز الأهلية', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_PROMO_B_${Date.now()}`, nameAr: 'مدارس الآفاق العالمية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // SETUP: Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Source & Target Academic Years & Grades ---');
    const sourceYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2026-2027',
        startDate: new Date('2026-08-20'),
        endDate: new Date('2027-06-15'),
        isCurrent: true
      }
    });

    const targetYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2027-2028',
        startDate: new Date('2027-08-20'),
        endDate: new Date('2028-06-15'),
        isCurrent: false
      }
    });

    const stageA = await prisma.educationalStage.create({
      data: { schoolId: schoolA.id, nameAr: 'المرحلة الثانوية', stageOrder: 3 }
    });

    const grade10 = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الأول الثانوي', gradeLevel: 10 }
    });

    const grade11 = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الثاني الثانوي', gradeLevel: 11 }
    });

    const grade12 = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الثالث الثانوي', gradeLevel: 12 }
    });

    const sectionA = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم البنين' }
    });

    // Source Classes
    const class10A = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: sourceYear.id,
        gradeId: grade10.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة 10-أ'
      }
    });

    const class12A = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: sourceYear.id,
        gradeId: grade12.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة 12-أ'
      }
    });

    // Target Class (Next Year)
    const targetClass11A = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: targetYear.id,
        gradeId: grade11.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة 10-أ' // same section name in next grade level
      }
    });

    assert(Boolean(class10A.id && targetClass11A.id), 'Academic structure & classes created');

    // ----------------------------------------------------
    // SETUP: Create Students in Source Year
    // ----------------------------------------------------
    console.log('\n--- 4. Create Students & Active Enrollments in Source Year ---');
    const stu1 = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-PR1-${Date.now().toString().slice(-4)}`,
        firstNameAr: 'ياسر',
        familyNameAr: 'القحطاني',
        fullNameAr: 'ياسر القحطاني',
        status: 'ACTIVE'
      }
    });
    createdStudentIds.push(stu1.id);

    const stu2 = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-PR2-${Date.now().toString().slice(-4)}`,
        firstNameAr: 'سامي',
        familyNameAr: 'الجابر',
        fullNameAr: 'سامي الجابر',
        status: 'ACTIVE'
      }
    });
    createdStudentIds.push(stu2.id);

    const stu3 = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-PR3-${Date.now().toString().slice(-4)}`,
        firstNameAr: 'ماجد',
        familyNameAr: 'عبدالله',
        fullNameAr: 'ماجد عبدالله',
        status: 'ACTIVE'
      }
    });
    createdStudentIds.push(stu3.id);

    // Enroll stu1 & stu2 in Grade 10, and stu3 in Grade 12 (graduating grade)
    await prisma.studentEnrollment.createMany({
      data: [
        { schoolId: schoolA.id, studentId: stu1.id, academicYearId: sourceYear.id, classSectionId: class10A.id, enrollmentStatus: 'ACTIVE' },
        { schoolId: schoolA.id, studentId: stu2.id, academicYearId: sourceYear.id, classSectionId: class10A.id, enrollmentStatus: 'ACTIVE' },
        { schoolId: schoolA.id, studentId: stu3.id, academicYearId: sourceYear.id, classSectionId: class12A.id, enrollmentStatus: 'ACTIVE' }
      ]
    });

    assert(createdStudentIds.length === 3, '3 students enrolled in source academic year');

    // ----------------------------------------------------
    // SETUP: Create SCHOOL_ADMIN & ACADEMIC_ADMIN for School A
    // ----------------------------------------------------
    console.log('\n--- 5. Create School Admin & Academic Admin for School A ---');
    const adminUsername = `admin.promo.${Date.now()}`;
    const adminPassword = 'Pass123!SchoolAdmin';
    const adminRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPassword,
        fullName: 'مدير مدرسة الترفيع',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminRes.body.data.user.id);

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // Academic Admin
    const acadUsername = `acad.promo.${Date.now()}`;
    const acadPassword = 'Pass123!Promo';
    const acadRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: acadUsername,
        password: acadPassword,
        fullName: 'وكيل الترفيع الأكاديمي',
        roleCode: 'ACADEMIC_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });

    createdUserIds.push(acadRes.body.data.user.id);
    const acadLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: acadUsername, password: acadPassword });

    assert(acadLoginRes.status === 200, 'Academic Admin logged in successfully');
    const acadCookie = acadLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // TEST: Create Promotion Batch
    // ----------------------------------------------------
    console.log('\n--- 6. Create Promotion Batch (DRAFT) ---');
    const createBatchRes = await request(app)
      .post('/api/v1/promotion/batches')
      .set('Cookie', acadCookie)
      .send({
        sourceAcademicYearId: sourceYear.id,
        targetAcademicYearId: targetYear.id,
        notes: 'دفعة ترحيل نهاية العام الدراسي 2026-2027'
      });

    assert(createBatchRes.status === 201, 'Promotion batch created with 201 Created');
    const batchId = createBatchRes.body.data.batch.id;
    assert(createBatchRes.body.data.batch.status === 'DRAFT', 'Batch status starts as DRAFT');

    // ----------------------------------------------------
    // TEST: Scope Guard (Academic Admin School A -> School B)
    // ----------------------------------------------------
    console.log('\n--- 7. Multi-Tenancy Scope Violation (School A Admin -> School B) ---');
    const crossSchoolPromoRes = await request(app)
      .post('/api/v1/promotion/batches')
      .set('Cookie', acadCookie)
      .send({
        schoolId: schoolB.id,
        sourceAcademicYearId: sourceYear.id,
        targetAcademicYearId: targetYear.id
      });

    assert(crossSchoolPromoRes.status === 403, 'Cross-school promotion batch creation blocked with 403 Forbidden');
    assert(crossSchoolPromoRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST: Generate Promotion Batch Items
    // ----------------------------------------------------
    console.log('\n--- 8. Generate Promotion Batch Items ---');
    const generateRes = await request(app)
      .post(`/api/v1/promotion/batches/${batchId}/generate`)
      .set('Cookie', acadCookie);

    assert(generateRes.status === 200, 'Promotion items generated successfully (200 OK)');
    assert(generateRes.body.data.totalStudents === 3, 'Generated 3 items for the 3 enrolled students');
    assert(generateRes.body.data.promotedCount === 2, '2 students suggested for PROMOTE (Grade 10)');
    assert(generateRes.body.data.graduatedCount === 1, '1 student suggested for GRADUATE (Grade 12)');

    // ----------------------------------------------------
    // TEST: Get Batch Details & Items
    // ----------------------------------------------------
    console.log('\n--- 9. Get Batch Details & Inspect Generated Items ---');
    const getBatchRes = await request(app)
      .get(`/api/v1/promotion/batches/${batchId}?includeItems=true`)
      .set('Cookie', acadCookie);

    assert(getBatchRes.status === 200, 'Retrieved batch with items');
    const items = getBatchRes.body.data.batch.items;
    assert(items.length === 3, 'Items array length is 3');

    const itemStu2 = items.find(i => i.studentId === stu2.id);
    const itemStu3 = items.find(i => i.studentId === stu3.id);
    assert(itemStu3.suggestedAction === 'GRADUATE', '12th Grade student defaulted to GRADUATE');

    // ----------------------------------------------------
    // TEST: Override Decision for Student 2 (RETAIN)
    // ----------------------------------------------------
    console.log('\n--- 10. Override Promotion Decision (RETAIN with Reason) ---');
    const overrideRes = await request(app)
      .patch(`/api/v1/promotion/items/${itemStu2.id}`)
      .set('Cookie', acadCookie)
      .send({
        finalAction: 'RETAIN',
        overrideReason: 'إعادة السنة لعدم استيفاء نسبة الحضور'
      });

    assert(overrideRes.status === 200, 'Item override applied successfully (200 OK)');
    assert(overrideRes.body.data.item.finalAction === 'RETAIN', 'finalAction updated to RETAIN');
    assert(overrideRes.body.data.item.overrideReason === 'إعادة السنة لعدم استيفاء نسبة الحضور', 'Override reason persisted');

    // ----------------------------------------------------
    // TEST: Move Batch to UNDER_REVIEW
    // ----------------------------------------------------
    console.log('\n--- 11. Transition Batch Status (DRAFT -> UNDER_REVIEW) ---');
    const reviewStatusRes = await request(app)
      .patch(`/api/v1/promotion/batches/${batchId}/status`)
      .set('Cookie', acadCookie)
      .send({ status: 'UNDER_REVIEW' });

    assert(reviewStatusRes.status === 200, 'Batch status updated to UNDER_REVIEW');
    assert(reviewStatusRes.body.data.batch.status === 'UNDER_REVIEW', 'Status verified as UNDER_REVIEW');

    // ----------------------------------------------------
    // TEST: RBAC Separation - Academic Admin cannot approve batch
    // ----------------------------------------------------
    console.log('\n--- 12. RBAC Guard: ACADEMIC_ADMIN Forbidden from Approving Batch ---');
    const unauthorizedApproveRes = await request(app)
      .post(`/api/v1/promotion/batches/${batchId}/approve`)
      .set('Cookie', acadCookie);

    assert(unauthorizedApproveRes.status === 403, 'Academic Admin blocked from approving batch (403 Forbidden)');
    assert(unauthorizedApproveRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Returns FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // ----------------------------------------------------
    // TEST: RIFAD-GAP-013 — Concurrent approveBatch Race
    // ----------------------------------------------------
    console.log('\n--- 12b. RIFAD-GAP-013: Concurrent approveBatch Row-Lock Hardening ---');

    // Isolated fixtures for this batch — a fresh source/target year pair so this does not
    // collide with the sequential batch/year pair used by the rest of this suite.
    const sourceYearC = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2028-2029 (GAP-013)',
        startDate: new Date('2028-08-20'),
        endDate: new Date('2029-06-15'),
        isCurrent: false
      }
    });
    const targetYearC = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2029-2030 (GAP-013)',
        startDate: new Date('2029-08-20'),
        endDate: new Date('2030-06-15'),
        isCurrent: false
      }
    });
    const classSourceC = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: sourceYearC.id,
        gradeId: grade10.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة اختبار التزامن'
      }
    });

    const stuConc = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-CONC-${Date.now().toString().slice(-4)}`,
        firstNameAr: 'فهد',
        familyNameAr: 'الزهراني',
        fullNameAr: 'فهد الزهراني',
        status: 'ACTIVE'
      }
    });
    createdStudentIds.push(stuConc.id);

    await prisma.studentEnrollment.create({
      data: { schoolId: schoolA.id, studentId: stuConc.id, academicYearId: sourceYearC.id, classSectionId: classSourceC.id, enrollmentStatus: 'ACTIVE' }
    });

    // 1. Batch prepared in valid pre-approval state (UNDER_REVIEW)
    const concCreateRes = await request(app)
      .post('/api/v1/promotion/batches')
      .set('Cookie', acadCookie)
      .send({ sourceAcademicYearId: sourceYearC.id, targetAcademicYearId: targetYearC.id, notes: 'دفعة اختبار التزامن' });
    assert(concCreateRes.status === 201, 'GAP-013 setup: concurrency-test batch created (201)');
    const concBatchId = concCreateRes.body.data.batch.id;

    const concGenerateRes = await request(app)
      .post(`/api/v1/promotion/batches/${concBatchId}/generate`)
      .set('Cookie', acadCookie);
    assert(concGenerateRes.status === 200, 'GAP-013 setup: items generated for concurrency-test batch');

    const concReviewRes = await request(app)
      .patch(`/api/v1/promotion/batches/${concBatchId}/status`)
      .set('Cookie', acadCookie)
      .send({ status: 'UNDER_REVIEW' });
    assert(concReviewRes.status === 200 && concReviewRes.body.data.batch.status === 'UNDER_REVIEW', '1. Concurrency-test batch prepared in valid pre-approval state (UNDER_REVIEW)');

    // 2. Two truly concurrent approval requests dispatched against the SAME batch
    const [concRes1, concRes2] = await Promise.all([
      request(app).post(`/api/v1/promotion/batches/${concBatchId}/approve`).set('Cookie', adminCookie),
      request(app).post(`/api/v1/promotion/batches/${concBatchId}/approve`).set('Cookie', adminCookie)
    ]);
    assert(Boolean(concRes1) && Boolean(concRes2), '2. Two concurrent approval requests dispatched against the same batch');

    // --- RIFAD-GAP-013 Diagnostic Instrumentation -----------------------------
    // Safe, PII-free snapshot of BOTH concurrent responses, printed here (only
    // around this assertion) so a failure below shows the ACTUAL status/error
    // pair instead of forcing a guess. Only HTTP status, the application-level
    // error code (a fixed enum from ERROR_CODES, never user data), and the
    // static Arabic business message from AppError are logged — never cookies,
    // tokens, PII, raw student data, encrypted values, hashes, or stack traces
    // (the `details` field, which can carry `err.stack` for unhandled errors
    // outside production, is intentionally never logged here).
    const summarizeConcResponse = (res) => ({
      httpStatus: res.status,
      appErrorCode: res.body && res.body.error ? res.body.error.code : null,
      appErrorMessage: res.body && res.body.error ? res.body.error.message : null,
      success: res.body ? res.body.success !== false : null
    });
    console.log('   [GAP-013 DIAGNOSTIC] concRes1:', JSON.stringify(summarizeConcResponse(concRes1)));
    console.log('   [GAP-013 DIAGNOSTIC] concRes2:', JSON.stringify(summarizeConcResponse(concRes2)));

    // NOTE: .sort((a, b) => a - b) is ascending, so for the two fixed HTTP status
    // constants involved here (200 < 409) the smaller value always lands at index 0.
    // The assertion below checks the statuses in that same ascending order (200 then
    // 409) — matching the array it reads, not the order the two requests were fired in.
    const concStatuses = [concRes1.status, concRes2.status].sort((a, b) => a - b);
    assert(concStatuses[0] === 200 && concStatuses[1] === 409, '3+4. Exactly ONE request succeeded (200) and exactly ONE was rejected (409) — no double-approval');

    const concWinner = concRes1.status === 200 ? concRes1 : concRes2;
    const concLoser = concRes1.status === 200 ? concRes2 : concRes1;

    assert(concWinner.body.data.batch.status === 'APPROVED', 'Winning request returned status APPROVED');
    assert(concLoser.body.error.code === 'CONFLICT', '7. Losing request received a clean business-state error (CONFLICT), not a raw DB error');
    const concLoserBodyText = JSON.stringify(concLoser.body);
    assert(!/prisma|postgres|P2002|P2025|constraint|duplicate key/i.test(concLoserBodyText), '8. Losing response does not leak raw Prisma/Postgres error details');

    // 5. Final batch status is correct
    const concBatchFinal = await prisma.promotionBatch.findUnique({ where: { id: concBatchId } });
    assert(concBatchFinal.status === 'APPROVED', '5. Final batch status in the database is APPROVED');

    // 6+7. Promotion effects occurred exactly once — no duplicate enrollment/side-effects
    const concSourceEnrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: stuConc.id, academicYearId: sourceYearC.id }
    });
    assert(concSourceEnrollment.enrollmentStatus === 'PROMOTED', '6. Source-year enrollment correctly transitioned exactly once (PROMOTED)');

    // 9. Audit success event occurs exactly once
    const concAuditLogs = await prisma.auditLog.findMany({
      where: { entityId: concBatchId, eventType: 'PROMOTION_BATCH_APPROVED' }
    });
    assert(concAuditLogs.length === 1, '9. Exactly ONE PROMOTION_BATCH_APPROVED audit event was created (no false success from the losing request)');

    // 11. Existing double-approve-after-completion guard still works (now via the same CONFLICT path)
    const concThirdApproveRes = await request(app)
      .post(`/api/v1/promotion/batches/${concBatchId}/approve`)
      .set('Cookie', adminCookie);
    assert(concThirdApproveRes.status === 409, '11. Re-approving an already-APPROVED batch is still rejected (409) — double-approve guard intact');
    assert(concThirdApproveRes.body.error.code === 'CONFLICT', '11. Re-approval rejection uses the CONFLICT error code');

    // ----------------------------------------------------
    // TEST: Approve Batch by SCHOOL_ADMIN
    // ----------------------------------------------------
    console.log('\n--- 13. Approve Promotion Batch by SCHOOL_ADMIN (Atomic Rollover) ---');
    const approveRes = await request(app)
      .post(`/api/v1/promotion/batches/${batchId}/approve`)
      .set('Cookie', adminCookie);

    assert(approveRes.status === 200, 'Batch approved and executed atomically by School Admin (200 OK)');
    assert(approveRes.body.data.batch.status === 'APPROVED', 'Batch status is now APPROVED');
    assert(Boolean(approveRes.body.data.batch.approvedAt), 'approvedAt timestamp set');

    // ----------------------------------------------------
    // TEST: Verify Target Year Enrollment & Source Status
    // ----------------------------------------------------
    console.log('\n--- 14. Verify Rollover Outcomes in Operational Tables ---');
    // Student 1: Promoted -> active enrollment in target year
    const targetEnrollmentStu1 = await prisma.studentEnrollment.findFirst({
      where: { studentId: stu1.id, academicYearId: targetYear.id, deletedAt: null }
    });
    assert(Boolean(targetEnrollmentStu1), 'Student 1 has active enrollment in target academic year');
    assert(targetEnrollmentStu1.classSectionId === targetClass11A.id, 'Student 1 enrolled in 11-A in target year');

    // Student 3: Graduated -> status is GRADUATED
    const stu3Record = await prisma.student.findUnique({ where: { id: stu3.id } });
    assert(stu3Record.status === 'GRADUATED', 'Student 3 status updated to GRADUATED');

    // Source Year Enrollments: Status updated
    const sourceEnrollmentStu1 = await prisma.studentEnrollment.findFirst({
      where: { studentId: stu1.id, academicYearId: sourceYear.id }
    });
    assert(sourceEnrollmentStu1.enrollmentStatus === 'PROMOTED', 'Source enrollment for Student 1 is PROMOTED');

    const sourceEnrollmentStu2 = await prisma.studentEnrollment.findFirst({
      where: { studentId: stu2.id, academicYearId: sourceYear.id }
    });
    assert(sourceEnrollmentStu2.enrollmentStatus === 'RETAINED', 'Source enrollment for Student 2 is RETAINED');

    // ----------------------------------------------------
    // TEST: Prevent Modifying Approved Batch Items
    // ----------------------------------------------------
    console.log('\n--- 15. Guard: Prevent Modifying Approved Batch Items ---');
    const postApproveEditRes = await request(app)
      .patch(`/api/v1/promotion/items/${itemStu2.id}`)
      .set('Cookie', adminCookie)
      .send({ finalAction: 'PROMOTE' });

    assert(postApproveEditRes.status === 400, 'Modifying items on APPROVED batch is rejected with 400 Bad Request');

    // ----------------------------------------------------
    // TEST: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 16. Audit Logging Completeness for Promotion Module ---');
    const promoAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: {
          in: [
            'PROMOTION_BATCH_CREATED',
            'PROMOTION_ITEMS_GENERATED',
            'PROMOTION_ITEM_UPDATED',
            'PROMOTION_BATCH_STATUS_CHANGED',
            'PROMOTION_BATCH_APPROVED'
          ]
        }
      }
    });

    assert(promoAuditLogs.length >= 5, 'All promotion lifecycle events recorded in audit_logs');
    console.log(`  - Verified ${promoAuditLogs.length} promotion audit logs for School A.`);

    console.log('\n--- 17. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PROMOTION & ROLLOVER TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Promotion & Rollover Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test promotion data, users, and schools...');
    try {
      await prisma.promotionBatchItem.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.promotionBatch.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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

      const [remainingBatches, remainingItems, remainingStudents, remainingSchools] = await Promise.all([
        prisma.promotionBatch.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.promotionBatchItem.count({ where: { batch: { schoolId: { in: createdSchoolIds } } } }),
        prisma.student.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingBatches === 0 && remainingItems === 0 && remainingStudents === 0 && remainingSchools === 0,
        '12. Cleanup succeeded — no orphaned promotion batch/item/student/school test data remains (including the GAP-013 concurrency-test batch)'
      );

      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runPromotionRolloverTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runPromotionRolloverTestSuite };
