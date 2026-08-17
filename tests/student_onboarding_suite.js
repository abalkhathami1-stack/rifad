const request = require('supertest');
const argon2 = require('argon2');
const xlsx = require('xlsx');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

const StudentImportProfile = require('../src/import/profiles/students.profile');
const ArabicDataNormalizer = require('../src/import/normalizers/arabic-data.normalizer');
const StudentValidator = require('../src/import/validators/student.validator');
const SiblingDetector = require('../src/import/detectors/sibling.detector');
const OnboardingService = require('../src/import/services/onboarding.service');

// Helper to generate in-memory Excel Buffer
function createExcelBuffer(data, sheetName = 'Sheet1') {
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runStudentOnboardingTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING STUDENT ONBOARDING FRAMEWORK TEST SUITE');
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
    // SETUP: Create Temporary Test School & Academic Structure
    // ----------------------------------------------------
    console.log('\n--- 2. Create School & Academic Structure ---');
    const schoolA = await prisma.school.create({
      data: { code: `SCH_ONBOARD_${Date.now()}`, nameAr: 'مدارس المستقبل الأهلية', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

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

    const grade1 = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الأول الابتدائي', gradeLevel: 1 }
    });

    const grade4 = await prisma.grade.create({
      data: { schoolId: schoolA.id, stageId: stageA.id, nameAr: 'الصف الرابع الابتدائي', gradeLevel: 4 }
    });

    const sectionA = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم البنين' }
    });

    const class1A = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: grade1.id,
        sectionDivisionId: sectionA.id,
        nameAr: '1-أ',
        maxCapacity: 30
      }
    });

    const class4A = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: grade4.id,
        sectionDivisionId: sectionA.id,
        nameAr: '4-أ',
        maxCapacity: 30
      }
    });

    // Create SCHOOL_ADMIN user for School A
    const adminUsername = `admin.onboard.${Date.now()}`;
    const adminPassword = 'Pass123!SchoolAdmin';
    const adminRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPassword,
        fullName: 'مدير شؤون الطلاب والقبول',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminRes.body.data.user.id);

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    assert(Boolean(class1A.id && class4A.id && adminCookie), 'School A structure and admin initialized');

    // ----------------------------------------------------
    // TEST 1: Profile Column Header Resolution
    // ----------------------------------------------------
    console.log('\n--- 3. Test Student Import Profile Resolution ---');
    const validHeaders = ['اسم الطالب', 'الصف', 'الفصل', 'هوية ولي الأمر', 'اسم ولي الأمر', 'جوال ولي الأمر', 'بريد ولي الأمر'];
    const resolved = StudentImportProfile.resolveHeaders(validHeaders);

    assert(resolved.isValid === true, 'Profile successfully resolved all required canonical columns');
    assert(resolved.mapping.studentName === 'اسم الطالب', 'Mapped studentName to اسم الطالب');
    assert(resolved.mapping.parentId === 'هوية ولي الأمر', 'Mapped parentId to هوية ولي الأمر');

    // ----------------------------------------------------
    // TEST 2: Missing Required Columns Detection
    // ----------------------------------------------------
    console.log('\n--- 4. Test Missing Required Columns Detection ---');
    const incompleteHeaders = ['اسم الطالب', 'الصف', 'الفصل']; // missing parentId, parentName, parentPhone
    const incompleteRes = StudentImportProfile.resolveHeaders(incompleteHeaders);

    assert(incompleteRes.isValid === false, 'Profile correctly flagged missing required columns');
    assert(incompleteRes.missingRequired.length === 3, 'Identified 3 missing required columns (parentId, parentName, parentPhone)');

    // ----------------------------------------------------
    // TEST 3: Arabic Data Normalization (Names, Hamzas, Diacritics)
    // ----------------------------------------------------
    console.log('\n--- 5. Test Arabic Name Normalization ---');
    const rawArabicName1 = '  إبْرَاهِيمُ   أَحْمَدُ  الْـغَامِدِيّ  ';
    const rawArabicName2 = 'ابراهيم احمد الغامدي';
    const rawArabicName3 = 'آمنة بنت علي آل الشيخ';

    const norm1 = ArabicDataNormalizer.normalizeArabicName(rawArabicName1);
    const norm2 = ArabicDataNormalizer.normalizeArabicName(rawArabicName2);
    const sig1 = ArabicDataNormalizer.generateNameComparisonSignature(rawArabicName1);
    const sig2 = ArabicDataNormalizer.generateNameComparisonSignature(rawArabicName2);
    const sig3 = ArabicDataNormalizer.generateNameComparisonSignature(rawArabicName3);

    assert(norm1 === 'ابراهيم احمد الغامدي', 'Stripped tashkeel, tatweel, spaces, unified hamzas and alef');
    assert(norm1 === norm2, 'Both representations of Arabic name match exactly after normalization');
    assert(sig1 === sig2, 'Signatures match for comparison');
    assert(!sig3.includes('بنت') && !sig3.includes('ال'), 'Signature stripped noise particles (بنت, آل)');

    // ----------------------------------------------------
    // TEST 4: Saudi Phone Number Normalization
    // ----------------------------------------------------
    console.log('\n--- 6. Test Saudi Mobile Number Normalization ---');
    const phoneFormats = [
      '0551234567',
      '+966551234567',
      '00966551234567',
      '966551234567',
      '551234567'
    ];

    const normalizedPhones = phoneFormats.map(p => ArabicDataNormalizer.normalizeSaudiPhone(p));
    const allValid = normalizedPhones.every(p => p.isValid && p.normalized === '966551234567');

    assert(allValid === true, 'All 5 variations of Saudi mobile number unified to 966551234567');

    // Invalid phone check
    const invalidPhone = ArabicDataNormalizer.normalizeSaudiPhone('0112345678'); // landline
    assert(invalidPhone.isValid === false, 'Non-mobile Saudi phone (011...) flagged as invalid mobile');

    // ----------------------------------------------------
    // TEST 5: Sibling Detection - AUTO_MATCHED Group
    // ----------------------------------------------------
    console.log('\n--- 7. Test Sibling Detection: AUTO_MATCHED ---');
    const siblingRowsValid = [
      {
        studentName: 'فيصل عبدالرحمن الغامدي',
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        parentId: '1012345678',
        parentName: 'إبراهيم بن أحمد الغامدي',
        parentPhone: '0551234567'
      },
      {
        studentName: 'ريما عبدالرحمن الغامدي',
        grade: 'الصف الرابع الابتدائي',
        section: '4-أ',
        parentId: '1012345678',
        parentName: 'ابراهيم احمد الغامدي', // slightly different spelling
        parentPhone: '+966551234567'       // international format
      }
    ];

    const dryRunResultValid = OnboardingService.generatePreviewFromRows(siblingRowsValid);

    assert(dryRunResultValid.summary.totalRows === 2, '2 student rows processed');
    assert(dryRunResultValid.summary.validRows === 2, 'All 2 rows are valid');
    assert(dryRunResultValid.summary.uniqueParentCount === 1, '1 unique parent detected');
    assert(dryRunResultValid.summary.siblingGroupsCount === 1, '1 sibling family group created');
    assert(dryRunResultValid.siblingGroups[0].status === 'AUTO_MATCHED', 'Family group status is AUTO_MATCHED');
    assert(dryRunResultValid.summary.needsReviewCount === 0, '0 review queue items');
    assert(dryRunResultValid.summary.commitEligible === true, 'Batch flagged as commitEligible = true');

    // ----------------------------------------------------
    // TEST 6: Sibling Detection - NEEDS_REVIEW (Conflicting Parent Names / Phones)
    // ----------------------------------------------------
    console.log('\n--- 8. Test Sibling Detection: NEEDS_REVIEW Discrepancy ---');
    const siblingRowsConflicting = [
      {
        studentName: 'خالد أحمد الزهراني',
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        parentId: '1088776655',
        parentName: 'أحمد إبراهيم الزهراني',
        parentPhone: '0551112233'
      },
      {
        studentName: 'منى أحمد الزهراني',
        grade: 'الصف الرابع الابتدائي',
        section: '4-أ',
        parentId: '1088776655', // same parent ID
        parentName: 'سارة محمد العتيبي', // completely different name!
        parentPhone: '0559998877'       // completely different phone!
      }
    ];

    const dryRunResultConflicting = OnboardingService.generatePreviewFromRows(siblingRowsConflicting);

    assert(dryRunResultConflicting.summary.totalRows === 2, '2 student rows processed');
    assert(dryRunResultConflicting.summary.needsReviewCount === 1, '1 group flagged for human review');
    assert(dryRunResultConflicting.reviewQueue[0].issueType === 'PARENT_NAME_MISMATCH' || dryRunResultConflicting.reviewQueue[0].issueType === 'MULTIPLE_DISCREPANCIES', 'Review issue accurately identified');
    assert(dryRunResultConflicting.summary.commitEligible === false, 'commitEligible is FALSE due to review queue items');

    // ----------------------------------------------------
    // TEST 7: Invalid Row Validation (Missing Fields & Bad ID)
    // ----------------------------------------------------
    console.log('\n--- 9. Test Invalid Row Validation ---');
    const badRows = [
      {
        studentName: '', // missing
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        parentId: '123', // invalid length
        parentName: 'سعد القحطاني',
        parentPhone: 'invalid_phone'
      }
    ];

    const dryRunResultBad = OnboardingService.generatePreviewFromRows(badRows);
    assert(dryRunResultBad.summary.invalidRows === 1, 'Row flagged as invalid');
    assert(dryRunResultBad.errors.length >= 2, 'Captured multiple validation errors (missing name, bad ID, bad phone)');

    // ----------------------------------------------------
    // TEST 8: Full End-to-End Onboarding Batch Processing in Staging
    // ----------------------------------------------------
    console.log('\n--- 10. End-to-End Onboarding Batch Processing with DB Staging ---');
    const validOnboardingData = [
      {
        student_name: 'عمر خالد الشهري',
        grade_name: 'الصف الأول الابتدائي',
        class_section: '1-أ',
        parent_id: '1099887766',
        parent_name: 'خالد عبدالله الشهري',
        parent_phone: '0501122334',
        parent_email: 'khaled.shehri@example.com'
      },
      {
        student_name: 'ياسر خالد الشهري',
        grade_name: 'الصف الرابع الابتدائي',
        class_section: '4-أ',
        parent_id: '1099887766',
        parent_name: 'خالد عبدالله الشهري',
        parent_phone: '0501122334',
        parent_email: 'khaled.shehri@example.com'
      },
      {
        student_name: 'سلطان فهد الدوسري',
        grade_name: 'الصف الأول الابتدائي',
        class_section: '1-أ',
        parent_id: '1044556677',
        parent_name: 'فهد محمد الدوسري',
        parent_phone: '0555544332',
        parent_email: null
      }
    ];

    const excelBuffer = createExcelBuffer(validOnboardingData);

    // Create batch
    const createBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', adminCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'school_onboarding_2026.xlsx' });

    assert(createBatchRes.status === 201, 'Onboarding batch created in staging (201 Created)');
    const batchId = createBatchRes.body.data.batch.id;

    // Upload file
    const uploadRes = await request(app)
      .post(`/api/v1/import/batches/${batchId}/upload`)
      .set('Cookie', adminCookie)
      .attach('file', excelBuffer, 'school_onboarding_2026.xlsx');

    assert(uploadRes.status === 200, 'Onboarding Excel uploaded and staged in import_records (200 OK)');

    // Run Onboarding Service
    const onboardingReport = await OnboardingService.processBatchOnboarding(batchId, {
      callerUser: { id: adminRes.body.data.user.id },
      callerScopes: [{ scopeType: 'SCHOOL', schoolId: schoolA.id }],
      isPlatformLevel: false,
      context: { requestId: 'REQ-ONBOARD-001' }
    });

    assert(onboardingReport.summary.totalRows === 3, 'Staged 3 student records');
    assert(onboardingReport.summary.validRows === 3, 'All 3 rows validated successfully');
    assert(onboardingReport.summary.uniqueParentCount === 2, '2 unique parents detected');
    assert(onboardingReport.summary.siblingGroupsCount === 1, '1 sibling group detected (عمر & ياسر)');
    assert(onboardingReport.summary.singleChildFamiliesCount === 1, '1 single child family (سلطان)');
    assert(onboardingReport.summary.commitEligible === true, 'Preview report marks batch as commitEligible');

    // ----------------------------------------------------
    // TEST 9: Verification that Operational Tables Remain Untouched
    // ----------------------------------------------------
    console.log('\n--- 11. Zero Touch Verification on Operational Tables ---');
    const studentCount = await prisma.student.count({ where: { schoolId: schoolA.id } });
    const enrollmentCount = await prisma.studentEnrollment.count({ where: { schoolId: schoolA.id } });

    assert(studentCount === 0, 'Zero records in operational students table (students count === 0)');
    assert(enrollmentCount === 0, 'Zero records in operational student_enrollments table (enrollments count === 0)');

    // ----------------------------------------------------
    // TEST 10: Audit Log Verification
    // ----------------------------------------------------
    console.log('\n--- 12. Audit Logging Verification ---');
    const auditLogs = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, entityId: batchId }
    });
    assert(auditLogs.length >= 2, 'Audit logs recorded batch creation, file upload, and validation');

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} ONBOARDING TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Student Onboarding Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test onboarding data, users, and schools...');
    await prisma.importError.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
    await prisma.importRecord.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
    await prisma.importBatch.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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
  runStudentOnboardingTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runStudentOnboardingTestSuite };
