const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

async function runTeachersTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING TEACHERS DOMAIN BACKEND SUITE');
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
    // SETUP: Create Two Isolated Schools
    // ----------------------------------------------------
    console.log('\n--- 2. Create Two Isolated Schools ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_TCH_A_${Date.now()}`, nameAr: 'مدارس المستقبل - بنين', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_TCH_B_${Date.now()}`, nameAr: 'مدارس النخبة الدولية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // SETUP: Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Academic Structure & Subjects in School A ---');
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
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الأول الثانوي', gradeLevel: 10 }
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
        maxCapacity: 30
      }
    });

    const mathSubject = await prisma.subject.create({
      data: { schoolId: schoolA.id, code: 'MATH101', nameAr: 'الرياضيات 1' }
    });

    const physicsSubject = await prisma.subject.create({
      data: { schoolId: schoolA.id, code: 'PHYS101', nameAr: 'الفيزياء 1' }
    });

    assert(Boolean(mathSubject.id && physicsSubject.id), 'Academic Structure & Subjects created in School A');

    // ----------------------------------------------------
    // SETUP: School Admin for School A
    // ----------------------------------------------------
    console.log('\n--- 4. Create School Admin for School A ---');
    const adminUsername = `admin.tch.${Date.now()}`;
    const adminPass = 'Pass123!TchAdmin';
    const adminRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPass,
        fullName: 'مدير مدرسة المعلمين',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminRes.body.data.user.id);

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPass });
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // TEST: Create Specialization
    // ----------------------------------------------------
    console.log('\n--- 5. Create Teacher Specialization ---');
    const specRes = await request(app)
      .post('/api/v1/teachers/specializations')
      .set('Cookie', adminCookie)
      .send({
        nameAr: 'الرياضيات والعلوم التطبيقية',
        nameEn: 'Mathematics & Applied Sciences',
        code: 'SPEC_MATH'
      });

    assert(specRes.status === 201, 'Specialization created with 201 Created');
    const specId = specRes.body.data.specialization.id;

    // ----------------------------------------------------
    // TEST: Create Teacher in School A
    // ----------------------------------------------------
    console.log('\n--- 6. Create Teacher in School A ---');
    const rawNid = '1012345678';
    const rawPhone = '0501234567';
    const rawEmail = 'teacher.ahmed@rifad.edu.sa';

    const createTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        specializationId: specId,
        employeeNumber: `EMP-${Date.now().toString().slice(-4)}`,
        firstNameAr: 'أحمد',
        familyNameAr: 'الغامدي',
        fullNameEn: 'Ahmed Al-Ghamdi',
        nationality: 'سعودي',
        hireDate: '2026-08-01',
        nationalId: rawNid,
        phone: rawPhone,
        email: rawEmail
      });

    assert(createTchRes.status === 201, 'Teacher created with 201 Created');
    const teacher1 = createTchRes.body.data.teacher;
    assert(teacher1.fullNameAr === 'أحمد الغامدي', 'Full Arabic name assembled');
    assert(teacher1.schoolId === schoolA.id, 'Teacher assigned to School A');

    // ----------------------------------------------------
    // TEST: Scope Guard - School Admin A cannot create in School B
    // ----------------------------------------------------
    console.log('\n--- 7. Multi-Tenancy Scope Violation (School A Admin -> School B) ---');
    const crossSchoolTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        schoolId: schoolB.id,
        specializationId: specId,
        employeeNumber: 'EMP-CROSS',
        firstNameAr: 'معلم',
        familyNameAr: 'مرفوض',
        hireDate: '2026-08-01',
        nationalId: '1099999999'
      });

    assert(crossSchoolTchRes.status === 403, 'Cross-school teacher creation blocked with 403 Forbidden');
    assert(crossSchoolTchRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST: PII Masking Protection
    // ----------------------------------------------------
    console.log('\n--- 8. PII Masking Protection for Teachers ---');
    // Regular teacher user without view_sensitive permission
    const testUser = await prisma.user.create({
      data: {
        username: `guest.tch.${Date.now()}`,
        fullName: 'مستخدم عادي',
        passwordHash: ownerHash,
        status: 'ACTIVE'
      }
    });
    createdUserIds.push(testUser.id);

    const teacherRole = await prisma.role.findUnique({ where: { code: 'TEACHER' } });
    await prisma.userRoleAssignment.create({
      data: {
        userId: testUser.id,
        roleId: teacherRole.id,
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      }
    });

    const testUserLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: testUser.username, password: ownerPassword });
    const testUserCookie = testUserLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const guestViewTchRes = await request(app)
      .get(`/api/v1/teachers/${teacher1.id}`)
      .set('Cookie', testUserCookie);

    assert(guestViewTchRes.status === 200, 'Regular user can view teacher basic profile');
    assert(guestViewTchRes.body.data.teacher.nationalId.includes('*'), 'National ID is MASKED for unauthorized user');
    assert(guestViewTchRes.body.data.teacher.phone.includes('*'), 'Phone is MASKED for unauthorized user');
    assert(guestViewTchRes.body.data.teacher.email.includes('*'), 'Email is MASKED for unauthorized user');

    // ----------------------------------------------------
    // TEST: Link Teacher Subject (تأهيل المادة)
    // ----------------------------------------------------
    console.log('\n--- 9. Link Teacher Subject (Qualification) ---');
    const linkSubjRes = await request(app)
      .post(`/api/v1/teachers/${teacher1.id}/subjects`)
      .set('Cookie', adminCookie)
      .send({ subjectId: mathSubject.id });

    assert(linkSubjRes.status === 201, 'MATH101 linked to teacher successfully (201 Created)');

    const duplicateLinkRes = await request(app)
      .post(`/api/v1/teachers/${teacher1.id}/subjects`)
      .set('Cookie', adminCookie)
      .send({ subjectId: mathSubject.id });

    assert(duplicateLinkRes.status === 409, 'Duplicate subject link rejected with 409 Conflict');

    // ----------------------------------------------------
    // TEST: Teacher Assignment Qualification Guard
    // ----------------------------------------------------
    console.log('\n--- 10. Teacher Assignment Qualification Guard ---');
    // Attempt to assign teacher to Physics (which they are NOT qualified for)
    const unqualifiedAssignRes = await request(app)
      .post(`/api/v1/teachers/${teacher1.id}/assignments`)
      .set('Cookie', adminCookie)
      .send({
        subjectId: physicsSubject.id,
        classSectionId: classSectionA.id,
        academicYearId: yearA.id
      });

    assert(unqualifiedAssignRes.status === 400, 'Unqualified subject assignment rejected with 400 Bad Request');

    // Assign to MATH101 (which teacher IS qualified for)
    const validAssignRes = await request(app)
      .post(`/api/v1/teachers/${teacher1.id}/assignments`)
      .set('Cookie', adminCookie)
      .send({
        subjectId: mathSubject.id,
        classSectionId: classSectionA.id,
        academicYearId: yearA.id
      });

    assert(validAssignRes.status === 201, 'Qualified subject assignment created with 201 Created');
    assert(validAssignRes.body.data.assignment.subject.code === 'MATH101', 'Assignment subject is MATH101');

    // ----------------------------------------------------
    // TEST: Dangerous Deletion Guard
    // ----------------------------------------------------
    console.log('\n--- 11. Prevent Deleting Teacher with Active Assignments ---');
    const deleteTchRes = await request(app)
      .delete(`/api/v1/teachers/${teacher1.id}`)
      .set('Cookie', adminCookie);

    assert(deleteTchRes.status === 400, 'Teacher with active assignments cannot be deleted (400 Bad Request)');
    assert(deleteTchRes.body.error.code === 'BAD_REQUEST', 'Error code is BAD_REQUEST');

    // ----------------------------------------------------
    // TEST: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 12. Audit Logging Completeness for Teacher Operations ---');
    const teacherAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: {
          in: [
            'SPECIALIZATION_CREATED',
            'TEACHER_CREATED',
            'TEACHER_SUBJECT_ASSIGNED',
            'TEACHER_ASSIGNMENT_CREATED'
          ]
        }
      }
    });

    assert(teacherAuditLogs.length >= 4, 'All 4 teacher operations recorded in audit_logs');
    console.log(`  - Verified ${teacherAuditLogs.length} teacher audit logs created for School A.`);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TEACHERS DOMAIN TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Teachers Module Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test teacher data and schools...');
    await prisma.teacherAssignment.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.teacherSubject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.teacher.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.specialization.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.subject.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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
  runTeachersTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runTeachersTestSuite };
