const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { computeBlindHash, decryptText } = require('../src/utils/crypto.util');
const {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
} = require('./helpers/ephemeral_owner');

async function runGuardiansTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING GUARDIANS DOMAIN BACKEND SUITE');
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
    // 1. Authenticate as Ephemeral PLATFORM_OWNER
    // ----------------------------------------------------
    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);

    assert(Boolean(ownerCookie), 'Platform Owner authenticated (200 OK)');

    // ----------------------------------------------------
    // 2. Create Two Isolated Schools
    // ----------------------------------------------------
    console.log('\n--- 2. Create Two Isolated Schools ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_GRD_A_${Date.now()}`, nameAr: 'مدارس المستقبل - بنين', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_GRD_B_${Date.now()}`, nameAr: 'مدارس الرواد الدولية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // 3. Create School Admin & Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Academic Structure & Students in School A ---');
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
      data: { schoolId: schoolA.id, nameAr: 'المرحلة الابتدائية', stageOrder: 1 }
    });

    const gradeA = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الأول الابتدائي', gradeLevel: 1 }
    });

    const sectionA = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم الابتدائي' }
    });

    const classSectionA = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: 'أول ابتدائي (1-أ)',
        maxCapacity: 30
      }
    });

    const studentA = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-${Date.now()}-1`,
        firstNameAr: 'عبدالله',
        secondNameAr: 'محمد',
        thirdNameAr: 'سليمان',
        familyNameAr: 'العتيبي',
        fullNameAr: 'عبدالله محمد سليمان العتيبي',
        status: 'ACTIVE'
      }
    });

    const studentA2 = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        studentCode: `STU-${Date.now()}-2`,
        firstNameAr: 'سعد',
        secondNameAr: 'محمد',
        thirdNameAr: 'سليمان',
        familyNameAr: 'العتيبي',
        fullNameAr: 'سعد محمد سليمان العتيبي',
        status: 'ACTIVE'
      }
    });

    assert(Boolean(studentA.id && studentA2.id), 'Created test students in School A');

    // Create School Admin User for School A
    console.log('\n--- 4. Create SCHOOL_ADMIN & REGISTRAR for School A ---');
    const adminPassword = 'AdminPassword2026!';
    const adminHash = await argon2.hash(adminPassword);
    const adminUser = await prisma.user.create({
      data: {
        username: `admin_grd_${Date.now()}`,
        fullName: 'أ. فهد - مدير المدرسة',
        passwordHash: adminHash,
        status: 'ACTIVE'
      }
    });
    createdUserIds.push(adminUser.id);

    const schoolAdminRole = await prisma.role.findFirst({ where: { code: 'SCHOOL_ADMIN' } });
    await prisma.userRoleAssignment.create({
      data: {
        userId: adminUser.id,
        roleId: schoolAdminRole.id,
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      }
    });

    // Create Registrar (without view_sensitive)
    const regPassword = 'RegPassword2026!';
    const regHash = await argon2.hash(regPassword);
    const regUser = await prisma.user.create({
      data: {
        username: `reg_grd_${Date.now()}`,
        fullName: 'أ. خالد - مسجل القبول',
        passwordHash: regHash,
        status: 'ACTIVE'
      }
    });
    createdUserIds.push(regUser.id);

    const registrarRole = await prisma.role.findFirst({ where: { code: 'REGISTRAR' } });
    await prisma.userRoleAssignment.create({
      data: {
        userId: regUser.id,
        roleId: registrarRole.id,
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      }
    });

    // Login as School Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUser.username, password: adminPassword });
    assert(adminLoginRes.status === 200, 'School Admin logged in successfully');
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // Login as Registrar
    const regLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: regUser.username, password: regPassword });
    assert(regLoginRes.status === 200, 'Registrar logged in successfully');
    const regCookie = regLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // ----------------------------------------------------
    // 5. Create Guardian in School A
    // ----------------------------------------------------
    console.log('\n--- 5. Create Guardian with AES-256-GCM & HMAC Blind Indexing ---');
    const rawNationalId = '1088776655';
    const rawPhone = '0555123456';
    const rawEmail = 'mohammed.otaibi@example.com';

    const createGrdRes = await request(app)
      .post('/api/v1/guardians')
      .set('Cookie', adminCookie)
      .send({
        firstNameAr: 'محمد',
        secondNameAr: 'سليمان',
        thirdNameAr: 'عبدالرحمن',
        familyNameAr: 'العتيبي',
        fullNameEn: 'Mohammed Sulaiman Al-Otaibi',
        nationality: 'سعودي',
        nationalId: rawNationalId,
        phone: rawPhone,
        email: rawEmail,
        occupation: 'مهندس اتصالات'
      });

    assert(createGrdRes.status === 201, 'Guardian created successfully (201 Created)');
    const createdGuardian = createGrdRes.body.data.guardian;
    assert(createdGuardian.fullNameAr === 'محمد سليمان عبدالرحمن العتيبي', 'Full Arabic name correctly assembled');
    assert(createdGuardian.schoolId === schoolA.id, 'Guardian correctly scoped to School A');

    // ----------------------------------------------------
    // 6. DB Inspection: Verify Encryption & Zero Plaintext
    // ----------------------------------------------------
    console.log('\n--- 6. Verify Database Encryption & Blind Hashes ---');
    const dbGuardian = await prisma.guardian.findUnique({
      where: { id: createdGuardian.id }
    });

    assert(Boolean(dbGuardian), 'Found guardian in database');
    assert(dbGuardian.nationalIdEncrypted.includes(':'), 'National ID stored as AES-256 ciphertext (iv:authTag:cipher)');
    assert(dbGuardian.phoneEncrypted.includes(':'), 'Phone stored as AES-256 ciphertext');
    assert(!dbGuardian.nationalIdEncrypted.includes(rawNationalId), 'Plaintext national ID NOT in ciphertext');
    assert(!dbGuardian.phoneEncrypted.includes(rawPhone), 'Plaintext phone NOT in ciphertext');

    // Verify Blind Index Hashes
    const expectedNidHash = computeBlindHash(rawNationalId);
    const expectedPhoneHash = computeBlindHash(rawPhone);
    assert(dbGuardian.nationalIdHash === expectedNidHash, 'nationalIdHash matches deterministic HMAC-SHA256');
    assert(dbGuardian.phoneHash === expectedPhoneHash, 'phoneHash matches deterministic HMAC-SHA256');
    assert(decryptText(dbGuardian.nationalIdEncrypted) === rawNationalId, 'nationalId decrypts accurately with AES-256');

    // ----------------------------------------------------
    // 7. Duplicate National ID Prevention in Same School
    // ----------------------------------------------------
    console.log('\n--- 7. Prevent Duplicate Active Guardian National ID ---');
    const dupRes = await request(app)
      .post('/api/v1/guardians')
      .set('Cookie', adminCookie)
      .send({
        firstNameAr: 'محمد',
        familyNameAr: 'العتيبي',
        nationalId: rawNationalId,
        phone: '0555999888'
      });

    assert(dupRes.status === 409, 'Duplicate national ID in same school rejected with 409 Conflict');

    // ----------------------------------------------------
    // 8. Data Masking vs Sensitive Permissions
    // ----------------------------------------------------
    console.log('\n--- 8. Test Data Masking for Regular vs Sensitive Users ---');
    // Registrar (without view_sensitive)
    const regViewRes = await request(app)
      .get(`/api/v1/guardians/${createdGuardian.id}`)
      .set('Cookie', regCookie);

    assert(regViewRes.status === 200, 'Registrar can view guardian basic details (200 OK)');
    const maskedGuardian = regViewRes.body.data.guardian;
    assert(maskedGuardian.nationalId.includes('*'), 'National ID is MASKED for user without view_sensitive');
    assert(maskedGuardian.phone.includes('*'), 'Phone is MASKED for user without view_sensitive');
    assert(maskedGuardian.email.includes('*'), 'Email is MASKED for user without view_sensitive');

    // Admin (with view_sensitive)
    const adminViewRes = await request(app)
      .get(`/api/v1/guardians/${createdGuardian.id}`)
      .set('Cookie', adminCookie);

    assert(adminViewRes.status === 200, 'Admin can view guardian details (200 OK)');
    const decryptedGuardian = adminViewRes.body.data.guardian;
    assert(decryptedGuardian.nationalId === rawNationalId, 'National ID decrypted accurately for user with view_sensitive');
    assert(decryptedGuardian.phone === rawPhone, 'Phone decrypted accurately for user with view_sensitive');
    assert(decryptedGuardian.email === rawEmail, 'Email decrypted accurately for user with view_sensitive');

    // ----------------------------------------------------
    // 9. Multi-Tenancy Scope Violation
    // ----------------------------------------------------
    console.log('\n--- 9. Multi-Tenancy Scope Violation Protection ---');
    const crossSchoolCreate = await request(app)
      .post('/api/v1/guardians')
      .set('Cookie', adminCookie)
      .send({
        schoolId: schoolB.id,
        firstNameAr: 'علي',
        familyNameAr: 'الشهري',
        nationalId: '1099887766',
        phone: '0555666777'
      });

    assert(crossSchoolCreate.status === 403, 'Cross-school guardian creation blocked with 403 Forbidden');
    assert(crossSchoolCreate.body.error?.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // 10. Link Student to Guardian (StudentGuardians)
    // ----------------------------------------------------
    console.log('\n--- 10. Link Student to Guardian ---');
    const linkRes = await request(app)
      .post(`/api/v1/guardians/${createdGuardian.id}/students`)
      .set('Cookie', adminCookie)
      .send({
        studentId: studentA.id,
        relationshipType: 'FATHER',
        isPrimary: true,
        isEmergencyContact: true,
        isFinanciallyResponsible: true,
        hasPickupAuthorization: true,
        notes: 'الأب - ولي الأمر الأساسي والمخول بالاستلام'
      });

    assert(linkRes.status === 201, 'Student linked to guardian successfully (201 Created)');
    const createdLink = linkRes.body.data.link;
    assert(createdLink.studentId === studentA.id, 'Linked studentId matches student 1');
    assert(createdLink.guardianId === createdGuardian.id, 'Linked guardianId matches guardian');
    assert(createdLink.isPrimary === true, 'isPrimary flag is set to true');

    // Link second student (Sibling)
    const link2Res = await request(app)
      .post(`/api/v1/guardians/${createdGuardian.id}/students`)
      .set('Cookie', adminCookie)
      .send({
        studentId: studentA2.id,
        relationshipType: 'FATHER',
        isPrimary: true
      });
    assert(link2Res.status === 201, 'Second student (Sibling) linked to same guardian successfully');

    // ----------------------------------------------------
    // 11. Partial Unique Index: Prevent Duplicate Active Link
    // ----------------------------------------------------
    console.log('\n--- 11. Partial Unique Index Guard on Active Links ---');
    const dupLinkRes = await request(app)
      .post(`/api/v1/guardians/${createdGuardian.id}/students`)
      .set('Cookie', adminCookie)
      .send({
        studentId: studentA.id,
        relationshipType: 'FATHER'
      });

    assert(dupLinkRes.status === 409, 'Duplicate active link rejected by Partial Unique Index (409 Conflict)');

    // ----------------------------------------------------
    // 12. Get Guardian Students (Family View)
    // ----------------------------------------------------
    console.log('\n--- 12. Retrieve Guardian Students (Family / Siblings) ---');
    const familyRes = await request(app)
      .get(`/api/v1/guardians/${createdGuardian.id}/students`)
      .set('Cookie', adminCookie);

    assert(familyRes.status === 200, 'Retrieved guardian students (200 OK)');
    assert(familyRes.body.data.students.length === 2, 'Guardian has 2 active children linked');

    // ----------------------------------------------------
    // 13. Prevent Deleting Guardian with Active Children
    // ----------------------------------------------------
    console.log('\n--- 13. Prevent Deleting Guardian with Active Children ---');
    const delFailRes = await request(app)
      .delete(`/api/v1/guardians/${createdGuardian.id}`)
      .set('Cookie', adminCookie);

    assert(delFailRes.status === 400, 'Deleting guardian with active children rejected (400 Bad Request)');

    // ----------------------------------------------------
    // 14. Unlink Student & Re-Link after Soft Delete
    // ----------------------------------------------------
    console.log('\n--- 14. Unlink Student & Re-Link using Partial Unique Index ---');
    const unlinkRes = await request(app)
      .delete(`/api/v1/guardians/${createdGuardian.id}/students/${studentA.id}`)
      .set('Cookie', adminCookie);

    assert(unlinkRes.status === 200, 'Student unlinked successfully (Soft Delete)');

    // Verify re-linking succeeds because deleted_at is not null for old link
    const relinkRes = await request(app)
      .post(`/api/v1/guardians/${createdGuardian.id}/students`)
      .set('Cookie', adminCookie)
      .send({
        studentId: studentA.id,
        relationshipType: 'LEGAL_GUARDIAN',
        isPrimary: true
      });

    assert(relinkRes.status === 201, 'Re-linking succeeded due to Partial Unique Index condition WHERE deleted_at IS NULL');

    // ----------------------------------------------------
    // 15. Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 15. Audit Logging Completeness for Guardian Domain ---');
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        entityName: { in: ['Guardian', 'StudentGuardian'] }
      }
    });

    assert(auditLogs.length >= 4, 'Audit logs recorded guardian operations (Create, Sensitive View, Link, Unlink)');
    const eventTypes = auditLogs.map(l => l.eventType);
    assert(eventTypes.includes('GUARDIAN_CREATED'), 'Audit log contains GUARDIAN_CREATED');
    assert(eventTypes.includes('STUDENT_GUARDIAN_LINKED'), 'Audit log contains STUDENT_GUARDIAN_LINKED');
    assert(eventTypes.includes('STUDENT_GUARDIAN_UNLINKED'), 'Audit log contains STUDENT_GUARDIAN_UNLINKED');
    assert(eventTypes.includes('GUARDIAN_SENSITIVE_VIEWED'), 'Audit log contains GUARDIAN_SENSITIVE_VIEWED');

    console.log('\n--- 16. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} GUARDIAN DOMAIN TESTS PASSED (100%)!`);
    console.log('========================================================\n');

  } finally {
    console.log('🧹 Cleaning up temporary test guardian data and schools...');
    try {
      await prisma.studentGuardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.guardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.classSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.schoolSection.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.grade.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.educationalStage.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.academicYear.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.auditLog.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runGuardiansTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Test suite failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runGuardiansTestSuite };

