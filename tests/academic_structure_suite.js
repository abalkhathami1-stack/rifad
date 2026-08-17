const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

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

  try {
    // ----------------------------------------------------
    // SETUP: Platform Owner Login
    // ----------------------------------------------------
    const ownerPassword = 'OwnerTestPassword2026!';
    const ownerHash = await argon2.hash(ownerPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    await prisma.user.updateMany({
      where: { username: 'platform.owner' },
      data: { passwordHash: ownerHash, failedLoginAttempts: 0, lockedUntil: null, status: 'ACTIVE' }
    });

    console.log('--- 1. Authenticate as PLATFORM_OWNER ---');
    const ownerLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'platform.owner', password: ownerPassword });

    assert(ownerLoginRes.status === 200, 'Platform Owner authenticated (200 OK)');
    const ownerCookie = ownerLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

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

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ACADEMIC STRUCTURE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Academic Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test academic data and schools...');
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
    console.log('✨ Cleanup complete.');
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runAcademicTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runAcademicTestSuite };
