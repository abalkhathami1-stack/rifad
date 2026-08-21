const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { decryptText } = require('../src/utils/crypto.util');
const {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
} = require('./helpers/ephemeral_owner');

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
    // TEST: RIFAD-GAP-001 / RIFAD-GAP-002 Regression — Create Response Must Not
    // Expose Encrypted/Hash Fields, and Must NOT Grant Plaintext PII via the
    // Former Hardcoded 'teachers.view_sensitive' Bypass (SCHOOL_ADMIN does not
    // legitimately hold that permission — RIFAD-GAP-003 stays OPEN/undefined).
    // ----------------------------------------------------
    console.log('\n--- 6b. RIFAD-GAP-001/002 Regression: Create Response Hygiene ---');
    const createBodyText = JSON.stringify(createTchRes.body);

    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'nationalIdEncrypted'), 'Create response does not contain nationalIdEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'phoneEncrypted'), 'Create response does not contain phoneEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'emailEncrypted'), 'Create response does not contain emailEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'nationalIdHash'), 'Create response does not contain nationalIdHash');
    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'phoneHash'), 'Create response does not contain phoneHash');
    assert(!Object.prototype.hasOwnProperty.call(teacher1, 'emailHash'), 'Create response does not contain emailHash');
    assert(!createBodyText.includes('Encrypted') && !createBodyText.includes('Hash'), 'Create response body contains no *Encrypted/*Hash keys anywhere');

    // GAP-002: adminCookie is SCHOOL_ADMIN (holds teachers.create, NOT teachers.view_sensitive,
    // NOT isPlatformLevel). Before the fix, createTeacher hardcoded callerPermissions to
    // ['teachers.view_sensitive'], so this same caller received full plaintext PII. Now it
    // must receive the same masked view any non-sensitive caller gets.
    assert(Boolean(teacher1.nationalId) && teacher1.nationalId.includes('*') && teacher1.nationalId !== rawNid, 'Create response nationalId is MASKED, not plaintext (hardcoded bypass removed)');
    assert(Boolean(teacher1.phone) && teacher1.phone.includes('*') && teacher1.phone !== rawPhone, 'Create response phone is MASKED, not plaintext (hardcoded bypass removed)');
    assert(Boolean(teacher1.email) && teacher1.email.includes('*') && teacher1.email !== rawEmail, 'Create response email is MASKED, not plaintext (hardcoded bypass removed)');
    assert(!createBodyText.includes(rawNid), 'Create response body does not leak the raw national ID sentinel anywhere');
    assert(!createBodyText.includes(rawPhone), 'Create response body does not leak the raw phone sentinel anywhere');
    assert(!createBodyText.includes(rawEmail), 'Create response body does not leak the raw email sentinel anywhere');

    // Existing non-sensitive fields remain intact
    assert(teacher1.employeeNumber && teacher1.status === 'ACTIVE' && teacher1.nationality === 'سعودي', 'Non-sensitive teacher fields remain intact in create response');

    // Database encryption itself is unchanged — this fix only touches response shaping
    const dbTeacher1 = await prisma.teacher.findUnique({ where: { id: teacher1.id } });
    assert(dbTeacher1.nationalIdEncrypted !== rawNid, 'National ID is still stored encrypted (not plaintext) in the database');
    assert(decryptText(dbTeacher1.nationalIdEncrypted) === rawNid, 'Stored national ID still decrypts correctly with AES-256-GCM (encryption untouched)');
    assert(Boolean(dbTeacher1.nationalIdHash), 'Blind-index hash still generated and stored (untouched)');

    // ----------------------------------------------------
    // TEST: RIFAD-GAP-005 — createTeacher.initialSubjectIds Cross-School Integrity
    // ----------------------------------------------------
    console.log('\n--- 6c. RIFAD-GAP-005: createTeacher initialSubjectIds Same-School Validation ---');

    // Cross-school target fixture: a real Subject that belongs to School B
    const subjectB = await prisma.subject.create({
      data: { schoolId: schoolB.id, code: 'CROSSB101', nameAr: 'مادة اختراق - مدرسة ب' }
    });

    // A: Valid flow — createTeacher in School A with initialSubjectIds all from School A
    const validSubjectsEmpNum = `EMP-GAP005-A-${Date.now().toString().slice(-6)}`;
    const validSubjectsTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        specializationId: specId,
        employeeNumber: validSubjectsEmpNum,
        firstNameAr: 'خالد',
        familyNameAr: 'العتيبي',
        hireDate: '2026-08-01',
        nationalId: '1020000001',
        initialSubjectIds: [mathSubject.id, physicsSubject.id]
      });
    assert(validSubjectsTchRes.status === 201, 'A1: createTeacher with same-school initialSubjectIds succeeds (201)');
    const teacherWithSubjects = validSubjectsTchRes.body.data.teacher;

    const teacherWithSubjectsLinks = await prisma.teacherSubject.findMany({ where: { teacherId: teacherWithSubjects.id } });
    assert(teacherWithSubjectsLinks.length === 2, 'A2: Both TeacherSubject relations were created correctly');
    assert(
      teacherWithSubjectsLinks.some(l => l.subjectId === mathSubject.id) && teacherWithSubjectsLinks.some(l => l.subjectId === physicsSubject.id),
      'A2: TeacherSubject relations reference the correct School A subjects'
    );

    const teacherWithSubjectsDetailRes = await request(app)
      .get(`/api/v1/teachers/${teacherWithSubjects.id}`)
      .set('Cookie', adminCookie);
    assert(teacherWithSubjectsDetailRes.status === 200, 'A3: getTeacherById succeeds for the new teacher');
    const detailSubjectCodes = teacherWithSubjectsDetailRes.body.data.teacher.subjects.map(s => s.subject.code);
    assert(detailSubjectCodes.includes('MATH101') && detailSubjectCodes.includes('PHYS101'), 'A3: Teacher details correctly display both linked subjects');

    // B: Cross-school rejection — a single initialSubjectId from School B
    const crossOnlyEmpNum = `EMP-GAP005-B-${Date.now().toString().slice(-6)}`;
    const crossOnlyTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        specializationId: specId,
        employeeNumber: crossOnlyEmpNum,
        firstNameAr: 'محاولة',
        familyNameAr: 'اختراق',
        hireDate: '2026-08-01',
        nationalId: '1020000002',
        initialSubjectIds: [subjectB.id]
      });
    assert(crossOnlyTchRes.status === 404, 'B1: createTeacher with a School B subject in initialSubjectIds rejected (404)');
    assert(crossOnlyTchRes.body.error.code === 'NOT_FOUND', 'B1: Error code is NOT_FOUND');

    const crossOnlyBodyText = JSON.stringify(crossOnlyTchRes.body);
    assert(!crossOnlyBodyText.includes(subjectB.id), 'B2: Error response does not leak the School B subject ID');
    assert(!crossOnlyBodyText.includes('مادة اختراق - مدرسة ب') && !crossOnlyBodyText.includes(schoolB.id), 'B2: Error response does not leak the School B subject name or School B ID');

    const crossOnlyTeacherInDb = await prisma.teacher.findFirst({ where: { employeeNumber: crossOnlyEmpNum } });
    assert(!crossOnlyTeacherInDb, 'B3: No Teacher was persisted for the rejected cross-school-only attempt');

    const crossOnlyOrphanLinks = await prisma.teacherSubject.findMany({ where: { subjectId: subjectB.id } });
    assert(crossOnlyOrphanLinks.length === 0, 'B4: No TeacherSubject referencing the School B subject was persisted');

    // C: Mixed list atomicity — one valid School A subject + one School B subject
    const tsCountBeforeMixed = await prisma.teacherSubject.count({ where: { schoolId: schoolA.id } });
    const mixedEmpNum = `EMP-GAP005-C-${Date.now().toString().slice(-6)}`;
    const mixedTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        specializationId: specId,
        employeeNumber: mixedEmpNum,
        firstNameAr: 'قائمة',
        familyNameAr: 'مختلطة',
        hireDate: '2026-08-01',
        nationalId: '1020000003',
        initialSubjectIds: [mathSubject.id, subjectB.id]
      });
    assert(mixedTchRes.status === 404, 'C1: createTeacher with a mixed valid/cross-school initialSubjectIds list is rejected entirely (404)');
    assert(mixedTchRes.body.error.code === 'NOT_FOUND', 'C1: Error code is NOT_FOUND');

    const mixedTeacherInDb = await prisma.teacher.findFirst({ where: { employeeNumber: mixedEmpNum } });
    assert(!mixedTeacherInDb, 'C2: No partial Teacher was persisted after the mixed-list rejection (full atomicity)');

    const tsCountAfterMixed = await prisma.teacherSubject.count({ where: { schoolId: schoolA.id } });
    assert(tsCountAfterMixed === tsCountBeforeMixed, 'C3: No partial TeacherSubject rows were persisted after the mixed-list rejection (full atomicity)');

    // D: Regression
    const noSubjectsEmpNum = `EMP-GAP005-D-${Date.now().toString().slice(-6)}`;
    const noSubjectsTchRes = await request(app)
      .post('/api/v1/teachers')
      .set('Cookie', adminCookie)
      .send({
        specializationId: specId,
        employeeNumber: noSubjectsEmpNum,
        firstNameAr: 'بلا',
        familyNameAr: 'مواد',
        hireDate: '2026-08-01',
        nationalId: '1020000004'
      });
    assert(noSubjectsTchRes.status === 201, 'D1: createTeacher without initialSubjectIds still works (201)');
    const teacherNoSubjects = noSubjectsTchRes.body.data.teacher;

    const noSubjectsBodyText = JSON.stringify(noSubjectsTchRes.body);
    assert(!noSubjectsBodyText.includes('Encrypted') && !noSubjectsBodyText.includes('Hash'), 'D2: Create response body still contains no *Encrypted/*Hash keys (GAP-001/002 unaffected)');
    assert(Boolean(teacherNoSubjects.nationalId) && teacherNoSubjects.nationalId.includes('*'), 'D2: nationalId still masked for SCHOOL_ADMIN (GAP-002 hardcoded bypass still removed)');
    const dbTeacherNoSubjects = await prisma.teacher.findUnique({ where: { id: teacherNoSubjects.id } });
    assert(decryptText(dbTeacherNoSubjects.nationalIdEncrypted) === '1020000004', 'D3: National ID encryption/decryption round-trip still correct (untouched by GAP-005)');

    const regressionLinkRes = await request(app)
      .post(`/api/v1/teachers/${teacherNoSubjects.id}/subjects`)
      .set('Cookie', adminCookie)
      .send({ subjectId: mathSubject.id });
    assert(regressionLinkRes.status === 201, 'D4: assignTeacherSubject same-school still works (201)');

    const regressionDuplicateRes = await request(app)
      .post(`/api/v1/teachers/${teacherNoSubjects.id}/subjects`)
      .set('Cookie', adminCookie)
      .send({ subjectId: mathSubject.id });
    assert(regressionDuplicateRes.status === 409, 'D5: assignTeacherSubject duplicate qualification behavior unchanged (409 Conflict)');

    const regressionCrossAssignRes = await request(app)
      .post(`/api/v1/teachers/${teacherNoSubjects.id}/subjects`)
      .set('Cookie', adminCookie)
      .send({ subjectId: subjectB.id });
    assert(regressionCrossAssignRes.status === 404, 'D6: assignTeacherSubject cross-school subject still rejected (404) — pre-existing guard unchanged');
    assert(regressionCrossAssignRes.body.error.code === 'NOT_FOUND', 'D6: Error code is NOT_FOUND');

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
    // TEST: PII Masking Protection for Teachers
    // ----------------------------------------------------
    console.log('\n--- 8. PII Masking Protection for Teachers ---');
    // Regular teacher user without view_sensitive permission
    const testUser = await prisma.user.create({
      data: {
        username: `guest.tch.${Date.now()}`,
        fullName: 'مستخدم عادي',
        passwordHash: ephemeralOwner.passwordHash,
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
      .send({ username: testUser.username, password: ephemeralOwner.password });
    const testUserCookie = testUserLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const guestViewTchRes = await request(app)
      .get(`/api/v1/teachers/${teacher1.id}`)
      .set('Cookie', testUserCookie);

    assert(guestViewTchRes.status === 200, 'Regular user can view teacher basic profile');
    assert(guestViewTchRes.body.data.teacher.nationalId.includes('*'), 'National ID is MASKED for unauthorized user');
    assert(guestViewTchRes.body.data.teacher.phone.includes('*'), 'Phone is MASKED for unauthorized user');
    assert(guestViewTchRes.body.data.teacher.email.includes('*'), 'Email is MASKED for unauthorized user');

    // ----------------------------------------------------
    // TEST: RIFAD-GAP-001 Regression — PATCH /teachers/:id Response Hygiene
    // ----------------------------------------------------
    console.log('\n--- 8b. RIFAD-GAP-001 Regression: PATCH /teachers/:id Response Hygiene ---');
    const newPhone = '0559876543';
    const newEmail = 'ahmed.updated@rifad.edu.sa';
    const patchTchRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}`)
      .set('Cookie', adminCookie)
      .send({ nationality: 'سعودي', phone: newPhone, email: newEmail });

    assert(patchTchRes.status === 200, 'PATCH /teachers/:id succeeds for authorized caller (200 OK)');
    const patchedTeacher = patchTchRes.body.data.teacher;
    const patchBodyText = JSON.stringify(patchTchRes.body);

    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'nationalIdEncrypted'), 'PATCH response does not contain nationalIdEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'phoneEncrypted'), 'PATCH response does not contain phoneEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'emailEncrypted'), 'PATCH response does not contain emailEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'nationalIdHash'), 'PATCH response does not contain nationalIdHash');
    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'phoneHash'), 'PATCH response does not contain phoneHash');
    assert(!Object.prototype.hasOwnProperty.call(patchedTeacher, 'emailHash'), 'PATCH response does not contain emailHash');
    assert(!patchBodyText.includes('Encrypted') && !patchBodyText.includes('Hash'), 'PATCH response body contains no *Encrypted/*Hash keys anywhere');
    assert(!patchBodyText.includes(newPhone) && !patchBodyText.includes(newEmail), 'PATCH response body does not leak the new phone/email sentinels in plaintext (SCHOOL_ADMIN has no view_sensitive)');
    assert(Boolean(patchedTeacher.phone) && patchedTeacher.phone.includes('*'), 'PATCH response phone is MASKED for caller without view_sensitive');
    assert(Boolean(patchedTeacher.email) && patchedTeacher.email.includes('*'), 'PATCH response email is MASKED for caller without view_sensitive');
    assert(patchedTeacher.employeeNumber === teacher1.employeeNumber && patchedTeacher.fullNameAr === teacher1.fullNameAr, 'Non-sensitive teacher fields remain intact in PATCH response');

    // ----------------------------------------------------
    // TEST: RIFAD-GAP-001 Regression — PATCH /teachers/:id/status Response Hygiene
    // ----------------------------------------------------
    console.log('\n--- 8c. RIFAD-GAP-001 Regression: PATCH /teachers/:id/status Response Hygiene ---');
    const patchStatusRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'ON_LEAVE' });

    assert(patchStatusRes.status === 200, 'PATCH /teachers/:id/status succeeds for authorized caller (200 OK)');
    const statusTeacher = patchStatusRes.body.data.teacher;
    const statusBodyText = JSON.stringify(patchStatusRes.body);

    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'nationalIdEncrypted'), 'PATCH status response does not contain nationalIdEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'phoneEncrypted'), 'PATCH status response does not contain phoneEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'emailEncrypted'), 'PATCH status response does not contain emailEncrypted');
    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'nationalIdHash'), 'PATCH status response does not contain nationalIdHash');
    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'phoneHash'), 'PATCH status response does not contain phoneHash');
    assert(!Object.prototype.hasOwnProperty.call(statusTeacher, 'emailHash'), 'PATCH status response does not contain emailHash');
    assert(!statusBodyText.includes('Encrypted') && !statusBodyText.includes('Hash'), 'PATCH status response body contains no *Encrypted/*Hash keys anywhere');
    assert(statusTeacher.status === 'ON_LEAVE', 'Status field updated correctly and still present');

    // Reset status back to ACTIVE so subsequent steps (assignment guard, etc.) are unaffected
    await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'ACTIVE' });

    // ----------------------------------------------------
    // TEST: Unauthorized behavior unchanged (auth model untouched by this fix)
    // ----------------------------------------------------
    console.log('\n--- 8d. Unauthorized Access Unchanged ---');
    const noAuthPatchRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}`)
      .send({ nationality: 'test' });
    assert(noAuthPatchRes.status === 401, 'Unauthenticated PATCH /teachers/:id still rejected (401) — auth model unchanged');

    const noAuthStatusRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}/status`)
      .send({ status: 'ON_LEAVE' });
    assert(noAuthStatusRes.status === 401, 'Unauthenticated PATCH /teachers/:id/status still rejected (401) — auth model unchanged');

    // ----------------------------------------------------
    // TEST: Cross-school scope behavior unchanged for PATCH endpoints
    // ----------------------------------------------------
    console.log('\n--- 8e. Cross-School Scope Guard Unchanged for PATCH Endpoints ---');
    const adminBUsername = `admin.tchB.${Date.now()}`;
    const adminBPass = 'Pass123!TchAdminB';
    const adminBRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminBUsername,
        password: adminBPass,
        fullName: 'مدير مدرسة ب',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolB.id
      });
    createdUserIds.push(adminBRes.body.data.user.id);

    const adminBLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminBUsername, password: adminBPass });
    const adminBCookie = adminBLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const crossSchoolPatchRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}`)
      .set('Cookie', adminBCookie)
      .send({ nationality: 'test' });
    assert(crossSchoolPatchRes.status === 403, 'School B admin cannot PATCH School A teacher (403 Forbidden) — cross-school guard unchanged');
    assert(crossSchoolPatchRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    const crossSchoolStatusRes = await request(app)
      .patch(`/api/v1/teachers/${teacher1.id}/status`)
      .set('Cookie', adminBCookie)
      .send({ status: 'ON_LEAVE' });
    assert(crossSchoolStatusRes.status === 403, 'School B admin cannot PATCH School A teacher status (403 Forbidden) — cross-school guard unchanged');

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

    console.log('\n--- 13. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TEACHERS DOMAIN TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Teachers Module Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test teacher data and schools...');
    try {
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
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);

      const [remainingTeachers, remainingTeacherSubjects, remainingSubjects, remainingSchools] = await Promise.all([
        prisma.teacher.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.teacherSubject.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.subject.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingTeachers === 0 && remainingTeacherSubjects === 0 && remainingSubjects === 0 && remainingSchools === 0,
        'Cleanup succeeded — no orphaned School A/B teacher/subject test data remains (including the GAP-005 School B subject fixture)'
      );

      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runTeachersTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runTeachersTestSuite };
