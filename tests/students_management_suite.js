const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

async function runStudentsTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING STUDENTS DOMAIN BACKEND SUITE');
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
    console.log('\n--- 2. Create Two Isolated Schools ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_STU_A_${Date.now()}`, nameAr: 'مدارس الرياض النموذجية - بنين', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_STU_B_${Date.now()}`, nameAr: 'مدارس الرواد العالمية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // SETUP: Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Academic Structure in School A ---');
    const yearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: '2026-2027',
        startDate: new Date('2026-08-20'),
        endDate: new Date('2027-06-15'),
        isCurrent: true
      }
    });

    const sectionA = await prisma.schoolSection.create({
      data: {
        schoolId: schoolA.id,
        genderType: 'BOYS',
        nameAr: 'قسم البنين'
      }
    });

    const stageA = await prisma.educationalStage.create({
      data: {
        schoolId: schoolA.id,
        nameAr: 'المرحلة الابتدائية',
        stageOrder: 1
      }
    });

    const gradeA = await prisma.grade.create({
      data: {
        schoolId: schoolA.id,
        stageId: stageA.id,
        nameAr: 'الصف الأول الابتدائي',
        gradeLevel: 1
      }
    });

    const classSectionA = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'شعبة 1-أ',
        maxCapacity: 25
      }
    });

    assert(Boolean(classSectionA.id), 'Academic structure created in School A');

    // ----------------------------------------------------
    // SETUP: Create School Admin and Academic Admin for School A
    // ----------------------------------------------------
    console.log('\n--- 4. Create School Admin & Academic Admin ---');
    const adminUsername = `admin.stu.${Date.now()}`;
    const adminPass = 'Pass123!Admin';
    const adminRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPass,
        fullName: 'مدير مدرسة الطلاب',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminRes.body.data.user.id);

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPass });
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // Academic Admin
    const acadUsername = `acad.stu.${Date.now()}`;
    const acadPass = 'Pass123!Acad';
    const acadRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: acadUsername,
        password: acadPass,
        fullName: 'وكيل شؤون الطلاب',
        roleCode: 'ACADEMIC_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(acadRes.body.data.user.id);

    const acadLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: acadUsername, password: acadPass });
    const acadCookie = acadLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // TEST: Create Student in School A
    // ----------------------------------------------------
    console.log('\n--- 5. Create Student in School A ---');
    const nationalIdVal = '1098765432';
    const createStuRes = await request(app)
      .post('/api/v1/students')
      .set('Cookie', adminCookie)
      .send({
        firstNameAr: 'محمد',
        secondNameAr: 'عبدالله',
        thirdNameAr: 'سعد',
        familyNameAr: 'العتيبي',
        fullNameEn: 'Mohammed Abdullah Al-Otaibi',
        nationalId: nationalIdVal
      });

    assert(createStuRes.status === 201, 'Student created with 201 Created');
    const student1 = createStuRes.body.data.student;
    createdStudentIds.push(student1.id);
    assert(student1.fullNameAr === 'محمد عبدالله سعد العتيبي', 'Full Arabic name synthesized accurately');
    assert(student1.studentCode.startsWith('STU-'), 'Student code auto-generated with STU- prefix');
    assert(student1.schoolId === schoolA.id, 'Student assigned to School A');

    // ----------------------------------------------------
    // TEST: Scope Guard - School Admin A cannot create student in School B
    // ----------------------------------------------------
    console.log('\n--- 6. Multi-Tenancy Scope Violation (School A Admin -> School B) ---');
    const crossSchoolStuRes = await request(app)
      .post('/api/v1/students')
      .set('Cookie', adminCookie)
      .send({
        schoolId: schoolB.id,
        firstNameAr: 'طالب',
        familyNameAr: 'محظور'
      });

    assert(crossSchoolStuRes.status === 403, 'Cross-school student creation blocked with 403 Forbidden');
    assert(crossSchoolStuRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST: Enroll Student in Class Section
    // ----------------------------------------------------
    console.log('\n--- 7. Enroll Student into Class Section (Teskyn) ---');
    const enrollRes = await request(app)
      .post(`/api/v1/students/${student1.id}/enroll`)
      .set('Cookie', acadCookie)
      .send({
        academicYearId: yearA.id,
        classSectionId: classSectionA.id,
        enrollmentDate: '2026-08-20'
      });

    assert(enrollRes.status === 201, 'Student enrolled successfully (201 Created)');
    assert(enrollRes.body.data.enrollment.classSectionId === classSectionA.id, 'Enrolled into classSectionA');
    assert(enrollRes.body.data.enrollment.enrollmentStatus === 'ACTIVE', 'Enrollment status is ACTIVE');

    // ----------------------------------------------------
    // TEST: Duplicate Active Enrollment in Same Class
    // ----------------------------------------------------
    console.log('\n--- 8. Prevent Duplicate Active Enrollment in Same Class ---');
    const duplicateEnrollRes = await request(app)
      .post(`/api/v1/students/${student1.id}/enroll`)
      .set('Cookie', acadCookie)
      .send({
        academicYearId: yearA.id,
        classSectionId: classSectionA.id
      });

    assert(duplicateEnrollRes.status === 409, 'Duplicate active enrollment rejected with 409 Conflict');

    // ----------------------------------------------------
    // TEST: Enrollment History
    // ----------------------------------------------------
    console.log('\n--- 9. Get Enrollment History ---');
    const historyRes = await request(app)
      .get(`/api/v1/students/${student1.id}/history`)
      .set('Cookie', acadCookie);

    assert(historyRes.status === 200, 'Retrieved enrollment history (200 OK)');
    assert(historyRes.body.data.history.length === 1, 'History contains 1 enrollment record');
    assert(historyRes.body.data.history[0].classSection.nameAr === 'شعبة 1-أ', 'Class section name matches');

    // ----------------------------------------------------
    // TEST: National ID Masking for Non-Sensitive Scope
    // ----------------------------------------------------
    console.log('\n--- 10. National ID Masking Protection ---');
    // Create teacher (who lacks students.view_sensitive permission)
    const teacherUser = await prisma.user.create({
      data: {
        username: `teacher.test.${Date.now()}`,
        fullName: 'معلم الصف',
        passwordHash: ownerHash,
        status: 'ACTIVE'
      }
    });
    createdUserIds.push(teacherUser.id);

    const teacherRole = await prisma.role.findUnique({ where: { code: 'TEACHER' } });
    await prisma.userRoleAssignment.create({
      data: {
        userId: teacherUser.id,
        roleId: teacherRole.id,
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      }
    });

    const teacherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: teacherUser.username, password: ownerPassword });
    const teacherCookie = teacherLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const teacherViewStuRes = await request(app)
      .get(`/api/v1/students/${student1.id}`)
      .set('Cookie', teacherCookie);

    assert(teacherViewStuRes.status === 200, 'Teacher can view student');
    assert(teacherViewStuRes.body.data.student.nationalId.includes('*'), 'National ID is MASKED for user without view_sensitive permission');

    // ----------------------------------------------------
    // TEST: Dangerous Deletion Prevention
    // ----------------------------------------------------
    console.log('\n--- 11. Prevent Deleting Enrolled Student ---');
    const deleteEnrolledRes = await request(app)
      .delete(`/api/v1/students/${student1.id}`)
      .set('Cookie', adminCookie);

    assert(deleteEnrolledRes.status === 400, 'Enrolled student cannot be deleted (400 Bad Request)');
    assert(deleteEnrolledRes.body.error.code === 'BAD_REQUEST', 'Error code is BAD_REQUEST');

    // ----------------------------------------------------
    // TEST: Update Student Status
    // ----------------------------------------------------
    console.log('\n--- 12. Update Student Status ---');
    const statusUpdateRes = await request(app)
      .patch(`/api/v1/students/${student1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'SUSPENDED' });

    assert(statusUpdateRes.status === 200, 'Student status updated to SUSPENDED (200 OK)');
    assert(statusUpdateRes.body.data.student.status === 'SUSPENDED', 'Status verified as SUSPENDED');

    // ----------------------------------------------------
    // TEST: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 13. Audit Logging Completeness for Student Operations ---');
    const studentAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: { in: ['STUDENT_CREATED', 'STUDENT_ENROLLED', 'STUDENT_STATUS_CHANGED'] }
      }
    });

    assert(studentAuditLogs.length >= 3, 'All student operations recorded in audit_logs');
    console.log(`  - Verified ${studentAuditLogs.length} student audit logs for School A.`);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} STUDENTS MODULE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Students Module Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test student data and schools...');
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
    console.log('✨ Cleanup complete.');
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStudentsTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runStudentsTestSuite };
