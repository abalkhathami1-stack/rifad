const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
} = require('./helpers/ephemeral_owner');

/**
 * RIFAD-GAP-017 Phase 0E.1 — Academic SECTION Scope Enforcement.
 *
 * Genuine SAME-SCHOOL cross-section coverage: School A holds two
 * SchoolSections (Section A / Section B). A SECTION-scoped caller authorized
 * ONLY for Section A must never see, read, modify, or delete Section B or a
 * ClassSection nested under it — even though both sections belong to the
 * SAME school (this is deliberately distinct from, and must not be confused
 * with, the existing cross-SCHOOL isolation already covered by
 * academic_structure_suite.js). A SCHOOL-scoped control user proves existing
 * school-wide behavior is unaffected.
 *
 * The SECTION-scoped test caller is assigned the SCHOOL_ADMIN role (which
 * the seed grants academic.view + academic.manage_sections) so every
 * assertion below proves a genuine SCOPE restriction, never a missing
 * PERMISSION — consistent with the existing users_section_scope_suite.js /
 * schools_catalog_suite.js precedent for constructing a SECTION-scoped
 * caller in this codebase.
 */

async function createEphemeralScopedUser(prisma, { roleCode, scopeType, schoolId = null, sectionDivisionId = null, label }) {
  const role = await prisma.role.findFirst({ where: { code: roleCode } });
  if (!role) throw new Error(`Setup Failed: ${roleCode} role not found in database`);

  const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const username = `test.ephemeral.${label}.${suffix}`;
  const password = `TestPass_${suffix}!${label}`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });

  const user = await prisma.user.create({
    data: { username, passwordHash, fullName: `مستخدم تجريبي مؤقت (${label})`, status: 'ACTIVE' }
  });

  await prisma.userRoleAssignment.create({
    data: { userId: user.id, roleId: role.id, scopeType, schoolId, sectionDivisionId }
  });

  return { id: user.id, username, password };
}

async function loginAs(request, app, { username, password }) {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${username} with status ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];
  return cookie;
}

async function runAcademicSectionScopeTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING ACADEMIC SECTION SCOPE ENFORCEMENT SUITE (0E.1)');
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

    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);
    assert(Boolean(ownerCookie), 'Platform Owner logs in successfully');

    // ----------------------------------------------------
    // SETUP: School A with Section A / Section B (SAME school, SAME-SCHOOL
    // cross-section fixture — do not confuse with cross-school tests).
    // ----------------------------------------------------
    console.log('\n--- 2. Fixture: School A with Section A + Section B ---');
    const ts = Date.now();
    const schoolA = await prisma.school.create({ data: { code: `SECSC_A_${ts}`, nameAr: 'مدرسة اختبار نطاق الأقسام', isActive: true } });
    createdSchoolIds.push(schoolA.id);

    const sectionARes = await request(app)
      .post('/api/v1/academic/sections')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم أ - بنين' });
    assert(sectionARes.status === 201, 'Platform Owner creates Section A (201)');
    const sectionAId = sectionARes.body.data.section.id;

    const sectionBRes = await request(app)
      .post('/api/v1/academic/sections')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, genderType: 'GIRLS', nameAr: 'قسم ب - بنات' });
    assert(sectionBRes.status === 201, 'Platform Owner creates Section B (same school) (201)');
    const sectionBId = sectionBRes.body.data.section.id;

    // Shared academic fixtures (year/stage/grade) needed to build ClassSections.
    const yearRes = await request(app)
      .post('/api/v1/academic/years')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, name: '1447-1448', startDate: '2026-08-20', endDate: '2027-06-15', isCurrent: true });
    assert(yearRes.status === 201, 'Platform Owner creates Academic Year (201)');
    const yearId = yearRes.body.data.academicYear.id;

    const stageRes = await request(app)
      .post('/api/v1/academic/stages')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, nameAr: 'المرحلة الثانوية', stageOrder: 3 });
    assert(stageRes.status === 201, 'Platform Owner creates Educational Stage (201)');
    const stageId = stageRes.body.data.stage.id;

    const gradeRes = await request(app)
      .post('/api/v1/academic/grades')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, stageId, nameAr: 'الصف الأول الثانوي', gradeLevel: 10 });
    assert(gradeRes.status === 201, 'Platform Owner creates Grade (201)');
    const gradeId = gradeRes.body.data.grade.id;

    // Class A under Section A, Class B under Section B.
    const classARes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, academicYearId: yearId, gradeId, sectionDivisionId: sectionAId, nameAr: 'شعبة أ' });
    assert(classARes.status === 201, 'Platform Owner creates Class A under Section A (201)');
    const classAId = classARes.body.data.classSection.id;

    const classBRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', ownerCookie)
      .send({ schoolId: schoolA.id, academicYearId: yearId, gradeId, sectionDivisionId: sectionBId, nameAr: 'شعبة ب' });
    assert(classBRes.status === 201, 'Platform Owner creates Class B under Section B (201)');
    const classBId = classBRes.body.data.classSection.id;

    // ----------------------------------------------------
    // SETUP: SECTION-scoped caller (Section A only) + SCHOOL-scoped control.
    // SCHOOL_ADMIN role is used deliberately for the SECTION caller: the
    // seed grants it academic.view + academic.manage_sections, so every
    // denial below proves SCOPE restriction, not a missing PERMISSION.
    // ----------------------------------------------------
    console.log('\n--- 3. Create SECTION-Scoped Caller (Section A only) and SCHOOL Control ---');
    const sectionUser = await createEphemeralScopedUser(prisma, {
      roleCode: 'SCHOOL_ADMIN', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionAId, label: 'section-a-caller'
    });
    createdUserIds.push(sectionUser.id);
    const sectionCookie = await loginAs(request, app, sectionUser);

    const schoolUser = await createEphemeralScopedUser(prisma, {
      roleCode: 'SCHOOL_ADMIN', scopeType: 'SCHOOL', schoolId: schoolA.id, label: 'school-control'
    });
    createdUserIds.push(schoolUser.id);
    const schoolCookie = await loginAs(request, app, schoolUser);
    assert(Boolean(sectionCookie && schoolCookie), 'SECTION-scoped caller and SCHOOL-scoped control both authenticated');

    // ======================================================
    // SCHOOLSECTION TESTS
    // ======================================================
    console.log('\n--- 4. SchoolSection: SECTION User listSections Returns Section A Only ---');
    const secListRes = await request(app).get('/api/v1/academic/sections').set('Cookie', sectionCookie);
    assert(secListRes.status === 200, 'A: SECTION user listSections succeeds (200)');
    const secListIds = secListRes.body.data.sections.map(s => s.id);
    assert(secListIds.includes(sectionAId) && !secListIds.includes(sectionBId), 'A: SECTION user sees Section A only, never Section B');

    console.log('\n--- 5. SchoolSection: SECTION User Cannot Update Section B ---');
    const secUpdateBRes = await request(app)
      .patch(`/api/v1/academic/sections/${sectionBId}`)
      .set('Cookie', sectionCookie)
      .send({ nameAr: 'محاولة تعديل قسم ب' });
    assert(secUpdateBRes.status === 404, 'B: SECTION user cannot update Section B (404, non-disclosing)');
    assert(secUpdateBRes.body.error.code === 'NOT_FOUND', 'B: Error code is NOT_FOUND');

    console.log('\n--- 6. SchoolSection: SECTION User Cannot Delete Section B ---');
    const secDeleteBRes = await request(app)
      .delete(`/api/v1/academic/sections/${sectionBId}`)
      .set('Cookie', sectionCookie);
    assert(secDeleteBRes.status === 404, 'C: SECTION user cannot delete Section B (404, non-disclosing)');
    assert(secDeleteBRes.body.error.code === 'NOT_FOUND', 'C: Error code is NOT_FOUND');
    const sectionBStillActive = await prisma.schoolSection.findFirst({ where: { id: sectionBId, deletedAt: null } });
    assert(Boolean(sectionBStillActive), 'C: Section B was NOT soft-deleted by the rejected attempt');

    console.log('\n--- 7. SchoolSection: SECTION User Cannot Create a New SchoolSection ---');
    const secCreateRes = await request(app)
      .post('/api/v1/academic/sections')
      .set('Cookie', sectionCookie)
      .send({ genderType: 'BOYS', nameAr: 'محاولة إنشاء قسم جديد' });
    assert(secCreateRes.status === 403, 'D: SECTION-only user cannot create a new SchoolSection (403)');
    assert(secCreateRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'D: Error code is FORBIDDEN_SCOPE_VIOLATION');

    console.log('\n--- 8. SchoolSection: SECTION User CAN Access/Update Permitted Section A ---');
    const secUpdateARes = await request(app)
      .patch(`/api/v1/academic/sections/${sectionAId}`)
      .set('Cookie', sectionCookie)
      .send({ nameEn: 'Section A (Updated)' });
    assert(secUpdateARes.status === 200, 'E: SECTION user CAN update their own permitted Section A (200)');
    assert(secUpdateARes.body.data.section.nameEn === 'Section A (Updated)', 'E: Section A update applied correctly');

    console.log('\n--- 9. SchoolSection: SCHOOL Control Sees Both Sections ---');
    const schoolListRes = await request(app).get('/api/v1/academic/sections').set('Cookie', schoolCookie);
    assert(schoolListRes.status === 200, 'F: SCHOOL control listSections succeeds (200)');
    const schoolListIds = schoolListRes.body.data.sections.map(s => s.id);
    assert(schoolListIds.includes(sectionAId) && schoolListIds.includes(sectionBId), 'F: SCHOOL control sees both Section A and Section B');

    console.log('\n--- 10. SchoolSection: SCHOOL Control Existing CRUD Behavior Remains Valid ---');
    const schoolUpdateBRes = await request(app)
      .patch(`/api/v1/academic/sections/${sectionBId}`)
      .set('Cookie', schoolCookie)
      .send({ nameEn: 'Section B (School Admin Update)' });
    assert(schoolUpdateBRes.status === 200, 'G: SCHOOL control can update Section B (200) — school-wide behavior unaffected');

    // ======================================================
    // CLASSSECTION TESTS
    // ======================================================
    console.log('\n--- 11. ClassSection: SECTION User listClasses Sees Class A, Not Class B ---');
    const classListRes = await request(app).get('/api/v1/academic/classes').set('Cookie', sectionCookie);
    assert(classListRes.status === 200, 'A: SECTION user listClassSections succeeds (200)');
    const classListIds = classListRes.body.data.classSections.map(c => c.id);
    assert(classListIds.includes(classAId) && !classListIds.includes(classBId), 'A: SECTION user sees Class A only, never Class B');

    console.log('\n--- 12. ClassSection: Explicit ?sectionDivisionId=SectionB Query Cannot Bypass Scope ---');
    const bypassRes = await request(app)
      .get('/api/v1/academic/classes')
      .set('Cookie', sectionCookie)
      .query({ sectionDivisionId: sectionBId });
    assert(bypassRes.status === 200, 'B: Explicit cross-section query does not error (200)');
    assert(bypassRes.body.data.classSections.length === 0, 'B: Explicit ?sectionDivisionId=SectionB query yields zero results — cannot widen scope');

    console.log('\n--- 13. ClassSection: SECTION User Cannot Update Class B ---');
    const classUpdateBRes = await request(app)
      .patch(`/api/v1/academic/classes/${classBId}`)
      .set('Cookie', sectionCookie)
      .send({ nameEn: 'محاولة تعديل شعبة ب' });
    assert(classUpdateBRes.status === 404, 'C: SECTION user cannot update Class B (404, non-disclosing)');
    assert(classUpdateBRes.body.error.code === 'NOT_FOUND', 'C: Error code is NOT_FOUND');

    console.log('\n--- 14. ClassSection: SECTION User Cannot Delete Class B ---');
    const classDeleteBRes = await request(app)
      .delete(`/api/v1/academic/classes/${classBId}`)
      .set('Cookie', sectionCookie);
    assert(classDeleteBRes.status === 404, 'D: SECTION user cannot delete Class B (404, non-disclosing)');
    assert(classDeleteBRes.body.error.code === 'NOT_FOUND', 'D: Error code is NOT_FOUND');
    const classBStillActive = await prisma.classSection.findFirst({ where: { id: classBId, deletedAt: null } });
    assert(Boolean(classBStillActive), 'D: Class B was NOT soft-deleted by the rejected attempt');

    console.log('\n--- 15. ClassSection: SECTION User Cannot Create Under Section B ---');
    const classCreateUnderBRes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', sectionCookie)
      .send({ academicYearId: yearId, gradeId, sectionDivisionId: sectionBId, nameAr: 'محاولة إنشاء تحت قسم ب' });
    assert(classCreateUnderBRes.status === 404, 'E: SECTION user cannot create a ClassSection under Section B (404, non-disclosing)');
    assert(classCreateUnderBRes.body.error.code === 'NOT_FOUND', 'E: Error code is NOT_FOUND');

    console.log('\n--- 16. ClassSection: SECTION User CAN Create Under Section A ---');
    const classCreateUnderARes = await request(app)
      .post('/api/v1/academic/classes')
      .set('Cookie', sectionCookie)
      .send({ academicYearId: yearId, gradeId, sectionDivisionId: sectionAId, nameAr: 'شعبة ثانية تحت قسم أ' });
    assert(classCreateUnderARes.status === 201, 'F: SECTION user CAN create a ClassSection under their own Section A (201)');
    const classA2Id = classCreateUnderARes.body.data.classSection.id;

    console.log('\n--- 17. ClassSection: SECTION User Cannot Move Class A into Section B ---');
    const moveToSectionBRes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', sectionCookie)
      .send({ sectionDivisionId: sectionBId });
    assert(moveToSectionBRes.status === 404, 'G: SECTION user cannot move Class A into Section B (404, non-disclosing)');
    assert(moveToSectionBRes.body.error.code === 'NOT_FOUND', 'G: Error code is NOT_FOUND');
    const classAAfterMoveAttempt = await prisma.classSection.findUnique({ where: { id: classAId } });
    assert(classAAfterMoveAttempt.sectionDivisionId === sectionAId, 'G: Class A sectionDivisionId unchanged after rejected move attempt');

    console.log('\n--- 18. ClassSection: SECTION User CAN Update Inside Section A ---');
    const updateInsideARes = await request(app)
      .patch(`/api/v1/academic/classes/${classAId}`)
      .set('Cookie', sectionCookie)
      .send({ maxCapacity: 27 });
    assert(updateInsideARes.status === 200, 'H: SECTION user CAN update a ClassSection inside their own Section A (200)');
    assert(updateInsideARes.body.data.classSection.maxCapacity === 27, 'H: maxCapacity updated correctly');

    console.log('\n--- 19. ClassSection: SCHOOL Control Sees Both Class A and Class B ---');
    const schoolClassListRes = await request(app).get('/api/v1/academic/classes').set('Cookie', schoolCookie);
    assert(schoolClassListRes.status === 200, 'I: SCHOOL control listClassSections succeeds (200)');
    const schoolClassIds = schoolClassListRes.body.data.classSections.map(c => c.id);
    assert(schoolClassIds.includes(classAId) && schoolClassIds.includes(classBId), 'I: SCHOOL control sees both Class A and Class B');

    console.log('\n--- 20. ClassSection: SCHOOL Control Legitimate School-Wide Management Unchanged ---');
    const schoolMoveRes = await request(app)
      .patch(`/api/v1/academic/classes/${classA2Id}`)
      .set('Cookie', schoolCookie)
      .send({ sectionDivisionId: sectionBId });
    assert(schoolMoveRes.status === 200, 'J: SCHOOL control can freely move a ClassSection between sections in their own school (200)');

    console.log('\n--- 21. Multi-Section Caller Sees the Union of All Assigned Sections ---');
    const multiSectionUser = await createEphemeralScopedUser(prisma, {
      roleCode: 'SCHOOL_ADMIN', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionAId, label: 'multi-section'
    });
    createdUserIds.push(multiSectionUser.id);
    const roleForMulti = await prisma.role.findFirst({ where: { code: 'SCHOOL_ADMIN' } });
    await prisma.userRoleAssignment.create({
      data: { userId: multiSectionUser.id, roleId: roleForMulti.id, scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionBId }
    });
    const multiSectionCookie = await loginAs(request, app, multiSectionUser);
    const multiListRes = await request(app).get('/api/v1/academic/sections').set('Cookie', multiSectionCookie);
    assert(multiListRes.status === 200, 'H: Multi-section caller listSections succeeds (200)');
    const multiListIds = multiListRes.body.data.sections.map(s => s.id);
    assert(multiListIds.includes(sectionAId) && multiListIds.includes(sectionBId), 'H: Multi-section caller (Section A + Section B) sees the union of both assigned sections');
    const multiClassListRes = await request(app).get('/api/v1/academic/classes').set('Cookie', multiSectionCookie);
    const multiClassIds = multiClassListRes.body.data.classSections.map(c => c.id);
    assert(multiClassIds.includes(classAId) && multiClassIds.includes(classBId), 'H: Multi-section caller sees ClassSections under both assigned sections');

    // ======================================================
    // REGRESSION: cross-school isolation and GAP-006/007/008 spot-check
    // (full coverage already lives in academic_structure_suite.js — this is
    // a lightweight confirmation that 0E.1 did not disturb it).
    // ======================================================
    console.log('\n--- 21. Regression: Cross-School Isolation Still Enforced (Unrelated School) ---');
    const schoolC = await prisma.school.create({ data: { code: `SECSC_C_${ts}`, nameAr: 'مدرسة ثالثة غير مرتبطة', isActive: true } });
    createdSchoolIds.push(schoolC.id);
    const crossSchoolListRes = await request(app)
      .get('/api/v1/academic/sections')
      .set('Cookie', schoolCookie)
      .query({ schoolId: schoolC.id });
    assert(crossSchoolListRes.status === 403, 'K: SCHOOL control still cannot list an unrelated school\'s sections (403) — cross-school isolation unaffected');
    assert(crossSchoolListRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'K: Error code is FORBIDDEN_SCOPE_VIOLATION');

    console.log('\n--- 22. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ACADEMIC SECTION SCOPE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Academic Section Scope Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test academic data, users, and schools...');
    try {
      await prisma.classSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.educationalStage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.academicTerm.deleteMany({ where: { academicYear: { schoolId: { in: createdSchoolIds } } } });
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

      const [remainingClassSections, remainingSections, remainingSchools] = await Promise.all([
        prisma.classSection.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.schoolSection.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingClassSections === 0 && remainingSections === 0 && remainingSchools === 0,
        'Cleanup succeeded — no orphaned test data remains'
      );

      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runAcademicSectionScopeTestSuite().catch(() => process.exit(1));
}

module.exports = { runAcademicSectionScopeTestSuite };
