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

async function runAcademicTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING ACADEMIC STRUCTURE BACKEND SUITE');
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
    // SETUP: Create Two Isolated Schools (School A & School B)
    // ----------------------------------------------------
    console.log('\n--- 2. Create Two Isolated Schools for Multi-Tenancy Tests ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_A_${Date.now()}`, nameAr: 'مدارس الرياض النموذجية - مدرسة أ', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_B_${Date.now()}`, nameAr: 'مدارس الرواد العالمية - مدرسة ب', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B for strict isolation testing');

    // ----------------------------------------------------
    // SETUP: Create School Admin for School A
    // ----------------------------------------------------
    console.log('\n--- 3. Create School Admin for School A ---');
    const adminAUsername = `admin.schoolA.${Date.now()}`;
    const adminAPassword = 'AdminPassA2026!';
    const adminAUserRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminAUsername,
        password: adminAPassword,
        fullName: 'مدير مدرسة أ',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });

    assert(adminAUserRes.status === 201, 'Created School Admin for School A');
    createdUserIds.push(adminAUserRes.body.data.user.id);

    const adminALoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminAUsername, password: adminAPassword });
    assert(adminALoginRes.status === 200, 'School Admin A logged in successfully');
    const adminACookie = adminALoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // TEST: School Sections (الأقسام التعليمية)
    // ----------------------------------------------------
    console.log('\n--- 4. Manage School Sections (الأقسام) ---');
    const createSectionRes = await request(app)
      .post('/api/v1/academic/sections')
      .set('Cookie', adminACookie)
      .send({
        genderType: 'BOYS',
        nameAr: 'قسم البنين - مدرسة أ',
        nameEn: 'Boys Section'
      });

    assert(createSectionRes.status === 201, 'School Admin created school section (201)');
    const sectionAId = createSectionRes.body.data.section.id;
    assert(createSectionRes.body.data.section.schoolId === schoolA.id, 'Section belongs to School A');

    // ----------------------------------------------------
    // TEST: Scope Guard - School Admin A cannot create in School B
    // ----------------------------------------------------
    console.log('\n--- 5. Multi-Tenancy Scope Guard Violation (School A Admin -> School B) ---');
    const crossSchoolSectionRes = await request(app)
      .post('/api/v1/academic/sections')
      .set('Cookie', adminACookie)
      .send({
        schoolId: schoolB.id,
        genderType: 'GIRLS',
        nameAr: 'محاولة اختراق نطاق مدرسة ب'
      });

    assert(crossSchoolSectionRes.status === 403, 'Cross-school creation blocked with 403 Forbidden');
    assert(crossSchoolSectionRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Error code is FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST: Academic Years & Terms
    // ----------------------------------------------------
    console.log('\n--- 6. Manage Academic Years & Terms ---');
    const createYearRes = await request(app)
      .post('/api/v1/academic/years')
      .set('Cookie', adminACookie)
      .send({
        name: '1447-1448 هـ / 2026-2027 م',
        startDate: '2026-08-20',
        endDate: '2027-06-15',
        isCurrent: true
      });

    assert(createYearRes.status === 201, 'Created Academic Year (201)');
    const yearAId = createYearRes.body.data.academicYear.id;
    assert(createYearRes.body.data.academicYear.isCurrent === true, 'Academic Year set as current');

    const createTermRes = await request(app)
      .post(`/api/v1/academic/years/${yearAId}/terms`)
      .set('Cookie', adminACookie)
      .send({
        nameAr: 'الفصل الدراسي الأول',
        nameEn: 'First Term',
        termOrder: 1,
        isActive: true,
        startDate: '2026-08-20',
        endDate: '2026-11-20'
      });

    assert(createTermRes.status === 201, 'Created Academic Term under Year A (201)');
    const termAId = createTermRes.body.data.term.id;

    // ----------------------------------------------------
    // TEST: Educational Stages & Grades
    // ----------------------------------------------------
    console.log('\n--- 7. Manage Educational Stages & Grades ---');
    const createStageRes = await request(app)
      .post('/api/v1/academic/stages')
      .set('Cookie', adminACookie)
      .send({
        nameAr: 'المرحلة الثانوية',
        nameEn: 'High School',
        stageOrder: 3
      });

    assert(createStageRes.status === 201, 'Created Educational Stage (201)');
    const stageAId = createStageRes.body.data.stage.id;

    const createGradeRes = await request(app)
      .post('/api/v1/academic/grades')
      .set('Cookie', adminACookie)
      .send({
        stageId: stageAId,
        nameAr: 'الصف الأول الثانوي',
        nameEn: '10th Grade',
        gradeLevel: 10
      });

    assert(createGradeRes.status === 201, 'Created Grade under Stage A (201)');
    const gradeAId = createGradeRes.body.data.grade.id;

    // ----------------------------------------------------
    // TEST: Class Sections (الشعب الصفية)
    // ----------------------------------------------------
    console.log('\n--- 8. Manage Class Sections (الشعب) ---');
    const createClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearAId,
        gradeId: gradeAId,
        sectionDivisionId: sectionAId,
        nameAr: 'شعبة أ - متفوقين',
        nameEn: 'Section 10-A',
        maxCapacity: 28
      });

    assert(createClassRes.status === 201, 'Created Class Section (201)');
    const classAId = createClassRes.body.data.classSection.id;

    // ----------------------------------------------------
    // TEST: Subjects (المواد الدراسية)
    // ----------------------------------------------------
    console.log('\n--- 9. Manage Subjects (المواد الدراسية) ---');
    const createSubjectRes = await request(app)
      .post('/api/v1/academic/subjects')
      .set('Cookie', adminACookie)
      .send({
        code: 'MATH101',
        nameAr: 'الرياضيات 1',
        nameEn: 'Mathematics 1'
      });

    assert(createSubjectRes.status === 201, 'Created Subject MATH101 (201)');
    const subjectAId = createSubjectRes.body.data.subject.id;

    // ----------------------------------------------------
    // TEST: Dangerous Deletion Guard
    // ----------------------------------------------------
    console.log('\n--- 10. Dangerous Deletion Prevention (Cascade Protection) ---');
    // Attempt to delete stage that has grade
    const deleteStageRes = await request(app)
      .delete(`/api/v1/academic/stages/${stageAId}`)
      .set('Cookie', adminACookie);

    assert(deleteStageRes.status === 400, 'Stage with active grades cannot be deleted (400)');

    // Attempt to delete academic year that has terms / classes
    const deleteYearRes = await request(app)
      .delete(`/api/v1/academic/years/${yearAId}`)
      .set('Cookie', adminACookie);

    assert(deleteYearRes.status === 400, 'Academic Year with terms and classes cannot be deleted (400)');

    // Attempt to delete section with active classes
    const deleteSectionRes = await request(app)
      .delete(`/api/v1/academic/sections/${sectionAId}`)
      .set('Cookie', adminACookie);

    assert(deleteSectionRes.status === 400, 'School Section with active classes cannot be deleted (400)');

    // ----------------------------------------------------
    // TEST: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 11. Audit Logging Completeness for Academic Operations ---');
    const academicAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: {
          in: [
            'ACADEMIC_SECTION_CREATED',
            'ACADEMIC_YEAR_CREATED',
            'ACADEMIC_TERM_CREATED',
            'EDUCATIONAL_STAGE_CREATED',
            'GRADE_CREATED',
            'CLASS_SECTION_CREATED',
            'SUBJECT_CREATED'
          ]
        }
      }
    });

    assert(academicAuditLogs.length >= 7, 'All 7 academic resource creations recorded in audit_logs');
    console.log(`  - Verified ${academicAuditLogs.length} academic audit logs created for School A.`);

    // ----------------------------------------------------
    // SETUP: School B Academic Fixtures (cross-school FK targets)
    // ----------------------------------------------------
    console.log('\n--- 12. Setup School B Academic Fixtures (Cross-School FK Targets) ---');
    const stageB = await prisma.educationalStage.create({
      data: { schoolId: schoolB.id, nameAr: 'المرحلة الثانوية - مدرسة ب', stageOrder: 3 }
    });
    const gradeB = await prisma.grade.create({
      data: { schoolId: schoolB.id, stageId: stageB.id, nameAr: 'الصف الأول الثانوي - مدرسة ب', gradeLevel: 10 }
    });
    const yearB = await prisma.academicYear.create({
      data: { schoolId: schoolB.id, name: '1447-1448 هـ / مدرسة ب', startDate: new Date('2026-08-20'), endDate: new Date('2027-06-15'), isCurrent: false }
    });
    const sectionB = await prisma.schoolSection.create({
      data: { schoolId: schoolB.id, genderType: 'GIRLS', nameAr: 'قسم البنات - مدرسة ب' }
    });
    assert(Boolean(stageB.id && gradeB.id && yearB.id && sectionB.id), 'Created School B academic fixtures (stage/grade/year/section) for cross-school FK tests');

    // ----------------------------------------------------
    // TEST GROUP A: RIFAD-GAP-006 — createClassSection Cross-School FK Validation
    // ----------------------------------------------------
    console.log('\n--- 13. RIFAD-GAP-006: createClassSection Cross-School FK Validation ---');

    const validClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearAId,
        gradeId: gradeAId,
        sectionDivisionId: sectionAId,
        nameAr: 'شعبة ب - عاديين',
        nameEn: 'Section 10-B',
        maxCapacity: 25
      });
    assert(validClassRes.status === 201, 'A1: createClassSection with all-same-school FKs succeeds (201)');

    const crossYearClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearB.id,
        gradeId: gradeAId,
        sectionDivisionId: sectionAId,
        nameAr: 'محاولة اختراق - سنة من مدرسة ب'
      });
    assert(crossYearClassRes.status === 404, 'A2: createClassSection with academicYearId from School B rejected (404)');
    assert(crossYearClassRes.body.error.code === 'NOT_FOUND', 'A2: Error code is NOT_FOUND (no cross-school existence leak)');

    const crossGradeClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearAId,
        gradeId: gradeB.id,
        sectionDivisionId: sectionAId,
        nameAr: 'محاولة اختراق - صف من مدرسة ب'
      });
    assert(crossGradeClassRes.status === 404, 'A3: createClassSection with gradeId from School B rejected (404)');
    assert(crossGradeClassRes.body.error.code === 'NOT_FOUND', 'A3: Error code is NOT_FOUND (no cross-school existence leak)');

    const crossSectionClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearAId,
        gradeId: gradeAId,
        sectionDivisionId: sectionB.id,
        nameAr: 'محاولة اختراق - قسم من مدرسة ب'
      });
    assert(crossSectionClassRes.status === 404, 'A4: createClassSection with sectionDivisionId from School B rejected (404)');
    assert(crossSectionClassRes.body.error.code === 'NOT_FOUND', 'A4: Error code is NOT_FOUND (no cross-school existence leak)');

    const orphanClassSections = await prisma.classSection.findMany({
      where: {
        schoolId: schoolA.id,
        OR: [
          { academicYearId: yearB.id },
          { gradeId: gradeB.id },
          { sectionDivisionId: sectionB.id }
        ]
      }
    });
    assert(orphanClassSections.length === 0, 'A5: No ClassSection persisted with any cross-school FK after rejected attempts');

    // ----------------------------------------------------
    // TEST GROUP B: RIFAD-GAP-007 — updateClassSection Cross-School FK Validation
    // ----------------------------------------------------
    console.log('\n--- 14. RIFAD-GAP-007: updateClassSection Cross-School FK Validation ---');

    const validClassUpdateRes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', adminACookie)
      .send({ maxCapacity: 26 });
    assert(validClassUpdateRes.status === 200, 'B1: updateClassSection with valid same-school data succeeds (200)');
    assert(validClassUpdateRes.body.data.classSection.maxCapacity === 26, 'B1: maxCapacity updated correctly');

    const crossGradeUpdateRes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', adminACookie)
      .send({ gradeId: gradeB.id });
    assert(crossGradeUpdateRes.status === 404, 'B2: updateClassSection with gradeId from School B rejected (404)');
    assert(crossGradeUpdateRes.body.error.code === 'NOT_FOUND', 'B2: Error code is NOT_FOUND (no cross-school existence leak)');

    const crossSectionUpdateRes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', adminACookie)
      .send({ sectionDivisionId: sectionB.id });
    assert(crossSectionUpdateRes.status === 404, 'B3: updateClassSection with sectionDivisionId from School B rejected (404)');
    assert(crossSectionUpdateRes.body.error.code === 'NOT_FOUND', 'B3: Error code is NOT_FOUND (no cross-school existence leak)');

    // academicYearId is confirmed NOT part of the updatable contract (absent from updateData
    // construction in updateClassSection) — verify it is silently ignored, not validated as a
    // new feature, and that no cross-school year is ever applied.
    const classBeforeYearAttempt = await prisma.classSection.findUnique({ where: { id: classAId } });
    const noopYearUpdateRes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', adminACookie)
      .send({ academicYearId: yearB.id, nameEn: 'Section 10-A (Updated)' });
    assert(noopYearUpdateRes.status === 200, 'B4: updateClassSection request containing academicYearId succeeds (field is outside the update contract)');
    const classAfterYearAttempt = await prisma.classSection.findUnique({ where: { id: classAId } });
    assert(classAfterYearAttempt.academicYearId === classBeforeYearAttempt.academicYearId, 'B4: academicYearId unchanged — field remains non-updatable, no cross-school year applied');
    assert(classAfterYearAttempt.academicYearId === yearAId, 'B4: academicYearId still points to the original School A year');

    const classAfterRejections = await prisma.classSection.findUnique({ where: { id: classAId } });
    assert(classAfterRejections.gradeId === gradeAId, 'B5: gradeId unchanged after rejected cross-school update attempt');
    assert(classAfterRejections.sectionDivisionId === sectionAId, 'B5: sectionDivisionId unchanged after rejected cross-school update attempt');

    // ----------------------------------------------------
    // TEST GROUP C: RIFAD-GAP-008 — updateGrade Cross-School stageId Validation
    // ----------------------------------------------------
    console.log('\n--- 15. RIFAD-GAP-008: updateGrade Cross-School stageId Validation ---');

    const stageA2Res = await request(app)
      .post('/api/v1/academic/stages')
      .set('Cookie', adminACookie)
      .send({ nameAr: 'المرحلة المتوسطة', nameEn: 'Middle School', stageOrder: 2 });
    assert(stageA2Res.status === 201, 'Created second School A stage for valid updateGrade test');
    const stageA2Id = stageA2Res.body.data.stage.id;

    const validGradeUpdateRes = await request(app)
      .patch(`/api/v1/academic/grades/${gradeAId}`)
      .set('Cookie', adminACookie)
      .send({ stageId: stageA2Id });
    assert(validGradeUpdateRes.status === 200, 'C1: updateGrade with valid same-school stageId succeeds (200)');
    assert(validGradeUpdateRes.body.data.grade.stageId === stageA2Id, 'C1: Grade stageId updated correctly to the new School A stage');

    const crossStageUpdateRes = await request(app)
      .patch(`/api/v1/academic/grades/${gradeAId}`)
      .set('Cookie', adminACookie)
      .send({ stageId: stageB.id });
    assert(crossStageUpdateRes.status === 404, 'C2: updateGrade with stageId from School B rejected (404)');
    assert(crossStageUpdateRes.body.error.code === 'NOT_FOUND', 'C2: Error code is NOT_FOUND (no cross-school existence leak)');

    const gradeAfterRejection = await prisma.grade.findUnique({ where: { id: gradeAId } });
    assert(gradeAfterRejection.stageId === stageA2Id, 'C3: Grade.stageId remains correctly linked to School A stage after rejected cross-school update');
    assert(gradeAfterRejection.stageId !== stageB.id, 'C3: Grade.stageId was NOT changed to the School B stage');

    // ----------------------------------------------------
    // TEST GROUP D: Regression
    // ----------------------------------------------------
    console.log('\n--- 16. Regression: Existing Academic Behavior Unaffected ---');

    const listClassesRes = await request(app)
      .get('/api/v1/academic/classes')
      .set('Cookie', adminACookie);
    assert(listClassesRes.status === 200, 'D1: listClassSections for School A still works (200)');
    assert(Array.isArray(listClassesRes.body.data.classSections) && listClassesRes.body.data.classSections.length >= 2, 'D1: School A class sections listed correctly');

    const crossListRes = await request(app)
      .get('/api/v1/academic/grades')
      .set('Cookie', adminACookie)
      .query({ schoolId: schoolB.id });
    assert(crossListRes.status === 403, 'D2: School A Admin cannot list School B grades (403 Forbidden) — isolation unaffected');
    assert(crossListRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'D2: Error code is FORBIDDEN_SCOPE_VIOLATION');

    const regressionClassRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', adminACookie)
      .send({
        academicYearId: yearAId,
        gradeId: gradeAId,
        sectionDivisionId: sectionAId,
        nameAr: 'شعبة ج - تحقق الانحدار',
        maxCapacity: 20
      });
    assert(regressionClassRes.status === 201, 'D3: Normal same-school class section creation flow still works after GAP-006/007/008 fixes (201)');
    // D4 (cleanup succeeds) is verified in the finally block after teardown.

    console.log('\n--- 17. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ACADEMIC STRUCTURE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Academic Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test academic data and schools...');
    try {
      // Cleanup School A data in reverse dependency order
      await prisma.classSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.educationalStage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.academicTerm.deleteMany({ where: { academicYear: { schoolId: { in: createdSchoolIds } } } });
      await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.subject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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

      const [remainingClassSections, remainingGrades, remainingStages, remainingYears, remainingSections, remainingSchools] = await Promise.all([
        prisma.classSection.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.grade.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.educationalStage.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.academicYear.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.schoolSection.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingClassSections === 0 && remainingGrades === 0 && remainingStages === 0 &&
        remainingYears === 0 && remainingSections === 0 && remainingSchools === 0,
        'D4: Cleanup succeeded — no orphaned School A/B academic test data remains'
      );

      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runAcademicTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runAcademicTestSuite };
