const argon2 = require('argon2');
const prisma = require('../src/config/prisma');
const ImportService = require('../src/services/import.service');
const { computeBlindHash, decryptText } = require('../src/utils/crypto.util');
const { ERROR_CODES } = require('../src/constants/error-codes');
const ArabicDataNormalizer = require('../src/import/normalizers/arabic-data.normalizer');

async function runCommitStudentOnboardingTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING COMMIT STUDENT ONBOARDING BACKEND TEST SUITE');
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
  const createdBatchIds = [];

  try {
    // ------------------------------------------------------------------
    // SETUP: Test Users & Schools
    // ------------------------------------------------------------------
    console.log('--- SETUP: Creating Test Environment & Schools ---');

    // Create Test School A
    const schoolA = await prisma.school.create({
      data: {
        code: `SCH_TEST_COMMIT_A_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        nameAr: 'مدارس اختبار الاعتماد (أ)',
        isActive: true
      }
    });
    createdSchoolIds.push(schoolA.id);

    // Create Test School B (for isolation tests)
    const schoolB = await prisma.school.create({
      data: {
        code: `SCH_TEST_COMMIT_B_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        nameAr: 'مدارس اختبار الاعتماد (ب)',
        isActive: true
      }
    });
    createdSchoolIds.push(schoolB.id);

    // Create Academic Structure in School A
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
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم البنين' }
    });

    const classSectionA1 = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: '1-أ',
        nameEn: '1-A',
        maxCapacity: 30
      }
    });

    const classSectionA2 = await prisma.classSection.create({
      data: {
        schoolId: schoolA.id,
        academicYearId: yearA.id,
        gradeId: gradeA.id,
        sectionDivisionId: sectionA.id,
        nameAr: '1-ب',
        nameEn: '1-B',
        maxCapacity: 30
      }
    });

    // Create Test School Admin User
    const passwordHash = await argon2.hash('TestAdminPass2026!', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    const userAdmin = await prisma.user.create({
      data: {
        username: `admin_commit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        passwordHash,
        fullName: 'مدير نظام تجريبي للاعتماد',
        status: 'ACTIVE'
      }
    });
    createdUserIds.push(userAdmin.id);

    const callerUser = { id: userAdmin.id, username: userAdmin.username };
    const callerScopesA = [{ schoolId: schoolA.id, role: 'SCHOOL_ADMIN' }];
    const callerScopesB = [{ schoolId: schoolB.id, role: 'SCHOOL_ADMIN' }];

    assert(Boolean(schoolA.id && schoolB.id && userAdmin.id), 'Setup: Schools, Academic Structure, and Test User initialized');

    // Helper to create a batch with valid staged records
    async function createTestBatch(schoolId, recordsData, batchStatus = 'VALIDATED', errorRows = 0) {
      const batch = await prisma.importBatch.create({
        data: {
          schoolId,
          uploadedById: userAdmin.id,
          entityType: 'STUDENTS',
          originalFileName: 'students_onboarding_test.xlsx',
          status: batchStatus,
          totalRows: recordsData.length,
          validRows: recordsData.length - errorRows,
          errorRows
        }
      });
      createdBatchIds.push(batch.id);

      if (recordsData.length > 0) {
        await prisma.importRecord.createMany({
          data: recordsData.map((data, idx) => ({
            batchId: batch.id,
            rowNumber: idx + 1,
            rawData: data,
            entityType: 'STUDENTS',
            status: 'VALID'
          }))
        });
      }

      return batch;
    }

    // ==================================================================
    // SCENARIO A: Successful Commit (Happy Path)
    // ==================================================================
    console.log('\n--- SCENARIO A: Successful Onboarding Batch Commit ---');
    const parentIdA = '1099887701';
    const batchA = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdA,
        parentName: 'محمد عبدالله السالم',
        parentPhone: '0501112233',
        parentEmail: 'salem.parent@test.com',
        studentName: 'فيصل محمد عبدالله السالم',
        studentNationalId: '1199887701',
        studentCode: `STU-A-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    const commitResultA = await ImportService.commitStudentOnboardingBatch(batchA.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-a', ipAddress: '127.0.0.1' }
    });

    assert(commitResultA.status === 'COMMITTED', 'Scenario A: Commit returns status COMMITTED');
    assert(commitResultA.summary.createdStudentsCount === 1, 'Scenario A: 1 Student created in summary');
    assert(commitResultA.summary.resolvedGuardiansCount === 1, 'Scenario A: 1 Guardian resolved in summary');
    assert(commitResultA.summary.newGuardiansCreatedCount === 1, 'Scenario A: 1 New Guardian created in summary');

    // Verify DB state
    const dbBatchA = await prisma.importBatch.findUnique({ where: { id: batchA.id } });
    assert(dbBatchA.status === 'COMMITTED', 'Scenario A: import_batches record in DB is COMMITTED');

    const dbRecordsA = await prisma.importRecord.findMany({ where: { batchId: batchA.id } });
    assert(dbRecordsA.length === 1 && dbRecordsA[0].status === 'PROCESSED', 'Scenario A: import_records status is PROCESSED (not COMMITTED)');

    const dbGuardianA = await prisma.guardian.findFirst({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdA) }
    });
    assert(Boolean(dbGuardianA), 'Scenario A: Guardian record created in DB');
    assert(dbGuardianA.fullNameAr === 'محمد عبدالله السالم', 'Scenario A: Guardian fullNameAr matches');
    assert(dbGuardianA.status === 'ACTIVE', 'Scenario A: Guardian status is ACTIVE');

    const dbStudentA = await prisma.student.findFirst({
      where: { schoolId: schoolA.id, nationalId: '1199887701' }
    });
    assert(Boolean(dbStudentA), 'Scenario A: Student record created in DB');
    assert(dbStudentA.status === 'ACTIVE', 'Scenario A: Student status is ACTIVE');

    const dbEnrollmentA = await prisma.studentEnrollment.findFirst({
      where: { schoolId: schoolA.id, studentId: dbStudentA.id }
    });
    assert(Boolean(dbEnrollmentA), 'Scenario A: StudentEnrollment record created in DB');
    assert(dbEnrollmentA.classSectionId === classSectionA1.id, 'Scenario A: Student enrolled in correct ClassSection (1-أ)');

    const dbLinkA = await prisma.studentGuardian.findFirst({
      where: { schoolId: schoolA.id, studentId: dbStudentA.id, guardianId: dbGuardianA.id }
    });
    assert(Boolean(dbLinkA), 'Scenario A: StudentGuardian link created in DB');
    assert(dbLinkA.relationshipType === 'FATHER', 'Scenario A: Relationship type is FATHER');

    // Verify Audit Logs for Scenario A
    const auditLogsA = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, requestId: 'req-test-a' }
    });
    const eventTypesA = auditLogsA.map(l => l.eventType);
    assert(eventTypesA.includes('GUARDIAN_CREATED_FROM_IMPORT'), 'Scenario A: AuditLog contains GUARDIAN_CREATED_FROM_IMPORT');
    assert(eventTypesA.includes('STUDENT_CREATED_FROM_IMPORT'), 'Scenario A: AuditLog contains STUDENT_CREATED_FROM_IMPORT');
    assert(eventTypesA.includes('STUDENT_ENROLLED_FROM_IMPORT'), 'Scenario A: AuditLog contains STUDENT_ENROLLED_FROM_IMPORT');
    assert(eventTypesA.includes('STUDENT_GUARDIAN_LINKED_FROM_IMPORT'), 'Scenario A: AuditLog contains STUDENT_GUARDIAN_LINKED_FROM_IMPORT');
    assert(eventTypesA.includes('IMPORT_BATCH_COMMITTED'), 'Scenario A: AuditLog contains IMPORT_BATCH_COMMITTED');

    // ==================================================================
    // SCENARIO B: Existing Active Guardian Reuse (Policy A)
    // ==================================================================
    console.log('\n--- SCENARIO B: Existing Active Guardian Reuse ---');
    // We already have dbGuardianA in School A. Now import another student with same parentIdA.
    // RIFAD-GAP-011 Phase 0D.2 note: this fixture originally used a raw parent
    // name that added a genuinely different extra word ("المختلف") to prove
    // the pre-0D.2 "Policy A" behavior (match-by-ID only, no name/phone
    // consistency check at all). That is no longer legitimate reuse under the
    // now-approved Phase 0D.2 identity-consistency rule — a real name
    // difference on a shared parentId is correctly rejected with 409 CONFLICT
    // by the new defense-in-depth check, and that rejection path is already
    // covered separately by Scenario O. This fixture is corrected to what
    // Scenario B was actually designed to prove: the raw string is still
    // free to vary (still not required to be byte-identical), but the
    // normalized identity (signature/phone) must agree — here the raw form
    // adds the "بن" noise word, which SiblingDetector.compareIdentities is
    // specifically designed to treat as equivalent to the stored name.
    // Verified against the REAL project comparator (ArabicDataNormalizer +
    // SiblingDetector.compareIdentities + computeBlindHash, no stand-ins):
    // nameSignatureMatches=true, phoneHashMatches=true, isConsistent=true.
    const batchB = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdA,
        parentName: 'محمد بن عبدالله السالم', // different raw form (adds "بن"), same normalized identity
        parentPhone: '0501112233',
        studentName: 'سارة محمد عبدالله السالم',
        studentNationalId: '1199887702',
        studentCode: `STU-B-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    const commitResultB = await ImportService.commitStudentOnboardingBatch(batchB.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-b' }
    });

    assert(commitResultB.summary.newGuardiansCreatedCount === 0, 'Scenario B: 0 New Guardians created');
    assert(commitResultB.summary.existingGuardiansReusedCount === 1, 'Scenario B: 1 Existing Guardian reused');

    const totalGuardiansWithHashA = await prisma.guardian.count({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdA) }
    });
    assert(totalGuardiansWithHashA === 1, 'Scenario B: No duplicate Guardian created in DB');

    // Verify existing guardian data was NOT overwritten
    const guardianAfterB = await prisma.guardian.findUnique({ where: { id: dbGuardianA.id } });
    assert(guardianAfterB.fullNameAr === 'محمد عبدالله السالم', 'Scenario B: Existing Guardian name preserved (Policy A: no overwrite)');

    // Verify new student is linked to existing guardian
    const studentB = await prisma.student.findFirst({ where: { nationalId: '1199887702' } });
    const linkB = await prisma.studentGuardian.findFirst({
      where: { studentId: studentB.id, guardianId: dbGuardianA.id }
    });
    assert(Boolean(linkB), 'Scenario B: New student successfully linked to existing Guardian');

    // Verify AuditLog action is 'IMPORT' (NOT 'READ')
    const auditLogsB = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, requestId: 'req-test-b', eventType: 'GUARDIAN_REUSED_FROM_IMPORT' }
    });
    assert(auditLogsB.length === 1, 'Scenario B: AuditLog recorded GUARDIAN_REUSED_FROM_IMPORT');
    assert(auditLogsB[0].action === 'IMPORT', 'Scenario B: GUARDIAN_REUSED_FROM_IMPORT uses action: IMPORT (Enum compatibility)');

    // ==================================================================
    // SCENARIO C: Soft-Deleted Guardian Reactivation
    // ==================================================================
    console.log('\n--- SCENARIO C: Soft-Deleted Guardian Reactivation ---');
    const parentIdC = '1099887703';
    // RIFAD-GAP-011 Phase 0D.2 note: this fixture manually constructs the
    // soft-deleted Guardian directly via prisma.guardian.create (there is no
    // live path to create a pre-existing soft-deleted record), so its
    // phoneHash must be built the exact same way the real commit path builds
    // it — hash of the NORMALIZED phone (via the project's own
    // ArabicDataNormalizer.normalizeSaudiPhone), never the raw phone string.
    // Verified against the real project utilities: hashing the raw phone
    // string here previously produced a different hash than the live path
    // would ever store for this same phone number, which made this fixture
    // fail the new Phase 0D.2 existing-Guardian identity check as a false
    // "different phone" even though the underlying phone number was
    // identical — a stale-fixture defect, not a comparator defect (the
    // production comparator itself was not changed).
    const CANONICAL_PHONE_C = ArabicDataNormalizer.normalizeSaudiPhone('0503334455').normalized;
    // Create soft-deleted guardian
    const softDeletedGuardian = await prisma.guardian.create({
      data: {
        schoolId: schoolA.id,
        firstNameAr: 'خالد',
        familyNameAr: 'العتيبي',
        fullNameAr: 'خالد بن ناصر العتيبي',
        status: 'INACTIVE',
        nationalIdEncrypted: 'enc-dummy-nid',
        phoneEncrypted: 'enc-dummy-phone',
        nationalIdHash: computeBlindHash(parentIdC),
        phoneHash: computeBlindHash(CANONICAL_PHONE_C),
        deletedAt: new Date()
      }
    });

    const batchC = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdC,
        parentName: 'خالد بن ناصر العتيبي',
        parentPhone: '0503334455',
        studentName: 'ناصر خالد العتيبي',
        studentNationalId: '1199887703',
        studentCode: `STU-C-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-ب',
        relationship: 'FATHER'
      }
    ]);

    const commitResultC = await ImportService.commitStudentOnboardingBatch(batchC.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-c' }
    });

    assert(commitResultC.summary.guardiansReactivatedCount === 1, 'Scenario C: 1 Guardian reactivated in summary');

    const reactivatedGuardian = await prisma.guardian.findUnique({ where: { id: softDeletedGuardian.id } });
    assert(reactivatedGuardian.deletedAt === null, 'Scenario C: Guardian deletedAt reset to null');
    assert(reactivatedGuardian.status === 'ACTIVE', 'Scenario C: Guardian status set to ACTIVE');

    const auditLogsC = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, requestId: 'req-test-c', eventType: 'GUARDIAN_REACTIVATED_FROM_IMPORT' }
    });
    assert(auditLogsC.length === 1 && auditLogsC[0].action === 'UPDATE', 'Scenario C: AuditLog recorded GUARDIAN_REACTIVATED_FROM_IMPORT with action: UPDATE');

    // ==================================================================
    // SCENARIO D: Siblings in Same Batch (Multiple Students, 1 Guardian)
    // ==================================================================
    console.log('\n--- SCENARIO D: Siblings (Same Guardian in Same Batch) ---');
    const parentIdD = '1099887704';
    const batchD = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdD,
        parentName: 'فهد عبدالعزيز الدوسري',
        parentPhone: '0504445566',
        studentName: 'تركي فهد الدوسري',
        studentNationalId: '1199887704',
        studentCode: `STU-D1-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      },
      {
        national_id: parentIdD,
        parentName: 'فهد عبدالعزيز الدوسري',
        parentPhone: '0504445566',
        studentName: 'ريما فهد الدوسري',
        studentNationalId: '1199887705',
        studentCode: `STU-D2-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-ب',
        relationship: 'FATHER'
      }
    ]);

    const commitResultD = await ImportService.commitStudentOnboardingBatch(batchD.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-d' }
    });

    assert(commitResultD.summary.createdStudentsCount === 2, 'Scenario D: 2 Students created');
    assert(commitResultD.summary.newGuardiansCreatedCount === 1, 'Scenario D: Exactly 1 Guardian created for siblings');
    assert(commitResultD.summary.siblingGroupsCount === 1, 'Scenario D: Sibling group detected');

    const siblingsGuardians = await prisma.guardian.findMany({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdD) }
    });
    assert(siblingsGuardians.length === 1, 'Scenario D: Only 1 Guardian record exists in DB for sibling pair');

    const siblingsLinks = await prisma.studentGuardian.findMany({
      where: { schoolId: schoolA.id, guardianId: siblingsGuardians[0].id }
    });
    assert(siblingsLinks.length === 2, 'Scenario D: Both siblings linked to the exact same guardianId');

    // ==================================================================
    // SCENARIO E: Relationship Normalization (Grandparent & Variants)
    // ==================================================================
    console.log('\n--- SCENARIO E: Relationship Normalization ---');
    const parentIdE = '1099887705';
    const codeE1 = `STU-E1-${Date.now()}`;
    const codeE2 = `STU-E2-${Date.now()}`;
    const codeE3 = `STU-E3-${Date.now()}`;
    const codeE4 = `STU-E4-${Date.now()}`;
    const codeE5 = `STU-E5-${Date.now()}`;
    const codeE6 = `STU-E6-${Date.now()}`;

    const batchE = await createTestBatch(schoolA.id, [
      {
        national_id: `${parentIdE}_1`,
        parentName: 'الجد منصور الأحمد',
        studentName: 'حفيد 1 منصور',
        studentCode: codeE1,
        relationship: 'GRANDFATHER'
      },
      {
        national_id: `${parentIdE}_2`,
        parentName: 'الجدة حصة الأحمد',
        studentName: 'حفيد 2 حصة',
        studentCode: codeE2,
        relationship: 'GRANDMOTHER'
      },
      {
        national_id: `${parentIdE}_3`,
        parentName: 'جد تجريبي',
        studentName: 'حفيد 3 عربي',
        studentCode: codeE3,
        relationship: 'جد'
      },
      {
        national_id: `${parentIdE}_4`,
        parentName: 'جدة تجريبية',
        studentName: 'حفيد 4 عربية',
        studentCode: codeE4,
        relationship: 'جدة'
      },
      {
        national_id: `${parentIdE}_5`,
        parentName: 'وصي معتمد',
        studentName: 'طالب تحت الوصاية',
        studentCode: codeE5,
        relationship: 'وصي'
      },
      {
        national_id: `${parentIdE}_6`,
        parentName: 'عم الطالب',
        studentName: 'طالب مكفول من عمه',
        studentCode: codeE6,
        relationship: 'عم'
      }
    ]);

    await ImportService.commitStudentOnboardingBatch(batchE.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-e' }
    });

    const linksE = await prisma.studentGuardian.findMany({
      where: {
        student: {
          studentCode: { in: [codeE1, codeE2, codeE3, codeE4, codeE5, codeE6] }
        }
      },
      include: { student: true }
    });

    const linkByCode = {};
    linksE.forEach(l => { linkByCode[l.student.studentCode] = l.relationshipType; });

    assert(linkByCode[codeE1] === 'GRANDPARENT', 'Scenario E: GRANDFATHER normalized to GRANDPARENT');
    assert(linkByCode[codeE2] === 'GRANDPARENT', 'Scenario E: GRANDMOTHER normalized to GRANDPARENT');
    assert(linkByCode[codeE3] === 'GRANDPARENT', 'Scenario E: "جد" normalized to GRANDPARENT');
    assert(linkByCode[codeE4] === 'GRANDPARENT', 'Scenario E: "جدة" normalized to GRANDPARENT');
    assert(linkByCode[codeE5] === 'LEGAL_GUARDIAN', 'Scenario E: "وصي" normalized to LEGAL_GUARDIAN');
    assert(linkByCode[codeE6] === 'UNCLE', 'Scenario E: "عم" normalized to UNCLE');

    // ==================================================================
    // SCENARIO F: Sequential Double Commit Prevention
    // ==================================================================
    console.log('\n--- SCENARIO F: Sequential Double Commit Prevention ---');
    let doubleCommitError = null;
    try {
      await ImportService.commitStudentOnboardingBatch(batchA.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false
      });
    } catch (err) {
      doubleCommitError = err;
    }

    assert(Boolean(doubleCommitError), 'Scenario F: Re-committing already COMMITTED batch is rejected');
    assert(doubleCommitError.statusCode === 409 || doubleCommitError.statusCode === 400, 'Scenario F: Re-commit returns 409 Conflict / 400');

    // ==================================================================
    // SCENARIO G: Concurrent Double Commit (FOR UPDATE Row Lock)
    // ==================================================================
    console.log('\n--- SCENARIO G: Concurrent Double Commit (Row-level Lock) ---');
    const parentIdG = '1099887707';
    const batchG = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdG,
        parentName: 'عمر القحطاني',
        studentName: 'يوسف عمر القحطاني',
        studentNationalId: '1199887707',
        studentCode: `STU-G-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    // Launch 2 simultaneous commit requests via Promise.allSettled
    const [res1, res2] = await Promise.allSettled([
      ImportService.commitStudentOnboardingBatch(batchG.id, { callerUser, callerScopes: callerScopesA, isPlatformLevel: false }),
      ImportService.commitStudentOnboardingBatch(batchG.id, { callerUser, callerScopes: callerScopesA, isPlatformLevel: false })
    ]);

    const fulfilledCount = [res1, res2].filter(r => r.status === 'fulfilled').length;
    const rejectedCount = [res1, res2].filter(r => r.status === 'rejected').length;

    assert(fulfilledCount === 1, 'Scenario G: Exactly 1 concurrent request succeeded');
    assert(rejectedCount === 1, 'Scenario G: Exactly 1 concurrent request was rejected with Conflict');

    const totalStudentsG = await prisma.student.count({
      where: { schoolId: schoolA.id, nationalId: '1199887707' }
    });
    assert(totalStudentsG === 1, 'Scenario G: No duplicate students inserted despite race condition');

    // ==================================================================
    // SCENARIO H: Invalid Batch Statuses
    // ==================================================================
    console.log('\n--- SCENARIO H: Invalid Batch Statuses ---');
    const invalidStatuses = ['PENDING', 'VALIDATING', 'FAILED', 'CANCELLED'];
    for (const st of invalidStatuses) {
      const invBatch = await createTestBatch(schoolA.id, [
        { national_id: '1000000099', studentName: 'طالب حالة خاطئة' }
      ], st);

      let caughtErr = null;
      try {
        await ImportService.commitStudentOnboardingBatch(invBatch.id, {
          callerUser,
          callerScopes: callerScopesA,
          isPlatformLevel: false
        });
      } catch (err) {
        caughtErr = err;
      }
      assert(Boolean(caughtErr), `Scenario H: Batch with status ${st} is rejected`);
    }

    // ==================================================================
    // SCENARIO I: Batch with Errors (errorRows > 0)
    // ==================================================================
    console.log('\n--- SCENARIO I: Batch with Error Rows ---');
    const batchWithErrors = await createTestBatch(schoolA.id, [
      { national_id: '1000000088', studentName: 'طالب به أخطاء' }
    ], 'VALIDATED', 2);

    let errorBatchCaught = null;
    try {
      await ImportService.commitStudentOnboardingBatch(batchWithErrors.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false
      });
    } catch (err) {
      errorBatchCaught = err;
    }
    assert(Boolean(errorBatchCaught), 'Scenario I: Batch with errorRows > 0 is rejected from commit');

    // ==================================================================
    // SCENARIO J: School Isolation / Multi-tenancy Scope Enforcement
    // ==================================================================
    console.log('\n--- SCENARIO J: School Isolation Scope Enforcement ---');
    const batchSchoolB = await createTestBatch(schoolB.id, [
      { national_id: '1000000077', studentName: 'طالب مدرسة ب' }
    ]);

    let scopeErr = null;
    try {
      // Caller with scopes for School A attempts to commit batch belonging to School B
      await ImportService.commitStudentOnboardingBatch(batchSchoolB.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false
      });
    } catch (err) {
      scopeErr = err;
    }
    assert(Boolean(scopeErr), 'Scenario J: Cross-school commit attempt is blocked by Scope Middleware');

    const untouchedBatchB = await prisma.importBatch.findUnique({ where: { id: batchSchoolB.id } });
    assert(untouchedBatchB.status === 'VALIDATED', 'Scenario J: School B batch remained intact in VALIDATED state');

    // ==================================================================
    // SCENARIO K: Atomic Rollback on Mid-Transaction Failure
    // ==================================================================
    console.log('\n--- SCENARIO K: Atomic Rollback on Failure ---');
    const parentIdK = '1099887799';
    // Record 1 is valid; Record 2 has an invalid studentCode exceeding VARCHAR(50) to force PostgreSQL constraint failure
    const oversizedStudentCode = 'STU_OVERSIZED_CODE_'.repeat(10); // > 150 chars
    const batchK = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdK,
        parentName: 'والد التراجع الذري',
        studentName: 'طالب 1 سليم',
        studentNationalId: '1199887791',
        studentCode: `STU-K1-${Date.now().toString().slice(-4)}`
      },
      {
        national_id: parentIdK,
        parentName: 'والد التراجع الذري',
        studentName: 'طالب 2 يسبب خطأ قاعدة بيانات',
        studentNationalId: '1199887792',
        studentCode: oversizedStudentCode // will fail on DB insert
      }
    ]);

    let rollbackErr = null;
    try {
      await ImportService.commitStudentOnboardingBatch(batchK.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false,
        context: { requestId: 'req-test-k' }
      });
    } catch (err) {
      rollbackErr = err;
    }

    assert(Boolean(rollbackErr), 'Scenario K: Mid-transaction DB error caused transaction to abort');

    // Verify complete Rollback:
    const postRollbackBatch = await prisma.importBatch.findUnique({ where: { id: batchK.id } });
    assert(postRollbackBatch.status === 'VALIDATED', 'Scenario K: Batch remains cleanly in VALIDATED state after rollback');

    const postRollbackRecords = await prisma.importRecord.findMany({ where: { batchId: batchK.id } });
    assert(postRollbackRecords.every(r => r.status === 'VALID'), 'Scenario K: ImportRecords remain in VALID status (none PROCESSED)');

    const studentK1 = await prisma.student.findFirst({ where: { nationalId: '1199887791' } });
    assert(studentK1 === null, 'Scenario K: Student 1 was NOT persisted (atomic rollback)');

    const guardianK = await prisma.guardian.findFirst({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdK) }
    });
    assert(guardianK === null, 'Scenario K: Guardian was NOT persisted (atomic rollback)');

    const auditLogsK = await prisma.auditLog.findMany({ where: { requestId: 'req-test-k' } });
    assert(auditLogsK.length === 0, 'Scenario K: Zero partial audit logs persisted');

    // ==================================================================
    // SCENARIO L: PII Protection Verification
    // ==================================================================
    console.log('\n--- SCENARIO L: PII Protection Verification ---');
    const guardianToCheck = await prisma.guardian.findFirst({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdA) }
    });

    assert(!guardianToCheck.nationalIdEncrypted.includes(parentIdA), 'Scenario L: nationalIdEncrypted is cipher text, not plaintext');
    assert(!guardianToCheck.phoneEncrypted.includes('0501112233'), 'Scenario L: phoneEncrypted is cipher text, not plaintext');
    assert(!guardianToCheck.emailEncrypted.includes('salem.parent@test.com'), 'Scenario L: emailEncrypted is cipher text, not plaintext');
    assert(guardianToCheck.nationalIdHash === computeBlindHash(parentIdA), 'Scenario L: nationalIdHash blind index correctly populated');
    const normalizedPhoneA = '966501112233';
    assert(guardianToCheck.phoneHash === computeBlindHash(normalizedPhoneA), 'Scenario L: phoneHash blind index correctly populated with normalized phone');

    // Decryption validation
    const decryptedNid = decryptText(guardianToCheck.nationalIdEncrypted);
    assert(decryptedNid === parentIdA, 'Scenario L: Encrypted nationalId successfully decrypts to original plaintext');
    const decryptedPhone = decryptText(guardianToCheck.phoneEncrypted);
    assert(decryptedPhone === normalizedPhoneA, 'Scenario L: Encrypted phone successfully decrypts to normalized phone');

    // Audit logs PII check
    const allImportAuditLogs = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, eventType: { in: ['GUARDIAN_CREATED_FROM_IMPORT', 'GUARDIAN_REUSED_FROM_IMPORT'] } }
    });
    for (const log of allImportAuditLogs) {
      const logStr = JSON.stringify(log.newData || {});
      assert(!logStr.includes(parentIdA), 'Scenario L: AuditLog does not leak plain national ID');
      assert(!logStr.includes('0501112233'), 'Scenario L: AuditLog does not leak plain phone');
      assert(!logStr.includes(normalizedPhoneA), 'Scenario L: AuditLog does not leak normalized phone');
    }

    // ==================================================================
    // SCENARIO M: Import Record Status Explicit Verification
    // ==================================================================
    console.log('\n--- SCENARIO M: Import Record Status Verification ---');
    const allProcessedRecords = await prisma.importRecord.findMany({
      where: { batchId: batchA.id }
    });
    assert(allProcessedRecords.length > 0, 'Scenario M: Records exist for batch A');
    assert(allProcessedRecords.every(r => r.status === 'PROCESSED'), 'Scenario M: All committed records have status PROCESSED');
    assert(!allProcessedRecords.some(r => r.status === 'COMMITTED'), 'Scenario M: No import records have status COMMITTED (schema compatibility)');

    // ==================================================================
    // SCENARIO N: AuditAction Enum Strict Verification
    // ==================================================================
    console.log('\n--- SCENARIO N: AuditAction Enum Verification ---');
    const allowedAuditActions = ['CREATE', 'UPDATE', 'DELETE', 'VIEW_SENSITIVE', 'LOGIN', 'EXPORT', 'IMPORT'];
    const allCreatedAuditLogs = await prisma.auditLog.findMany({
      where: { schoolId: { in: createdSchoolIds } }
    });

    for (const log of allCreatedAuditLogs) {
      assert(allowedAuditActions.includes(log.action), `Scenario N: AuditLog action "${log.action}" is valid in AuditAction enum`);
    }

    // ==================================================================
    // SCENARIO O: RIFAD-GAP-011 Phase 0D.2 — Commit-Time Guardian Identity
    // Defense-in-Depth (required test scenario "G" from the Phase 0D.2 spec;
    // scenario "H" — a genuine race between validate and a Guardian change —
    // is not separately constructed here, since it would require injecting a
    // real inter-transaction delay and could not be made reliably non-flaky;
    // per the Phase 0D.2 instructions, this scenario G alone is sufficient).
    // ==================================================================
    // The live validateBatch gate now catches a guardian identity mismatch
    // BEFORE a batch can ever reach VALIDATED (see the dedicated Phase 0D.2
    // coverage in tests/import_production_suite.js). This scenario proves the
    // SEPARATE commit-time re-check inside commitStudentOnboardingBatch —
    // intended purely as defense-in-depth against the Guardian record
    // changing between validate and commit — using the SAME shared
    // SiblingDetector.compareIdentities comparator, no independent logic.
    // Because a mismatched row can no longer occur naturally via the live
    // validate endpoint after 0D.2, this fixture uses createTestBatch() to
    // construct an already-VALIDATED batch directly (bypassing validateBatch)
    // — the only way left to reach this specific commit-time code path.
    console.log('\n--- SCENARIO O: Phase 0D.2 Commit-Time Guardian Identity Defense-in-Depth ---');

    // O1. Name mismatch against an existing Guardian
    const parentIdO1 = '1099887710';
    const existingGuardianO1 = await prisma.guardian.create({
      data: {
        schoolId: schoolA.id,
        firstNameAr: 'سعود',
        familyNameAr: 'المالكي',
        fullNameAr: 'سعود بن فهد المالكي',
        status: 'ACTIVE',
        nationalIdEncrypted: 'enc-dummy-o1-nid',
        phoneEncrypted: 'enc-dummy-o1-phone',
        nationalIdHash: computeBlindHash(parentIdO1),
        phoneHash: computeBlindHash('966501110001')
      }
    });

    const batchO1 = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdO1,
        parentName: 'بندر آل سالم', // deliberately different name than the stored Guardian
        parentPhone: '0501110001', // same phone (normalizes to the stored phoneHash)
        studentName: 'فهد بندر آل سالم',
        studentNationalId: '1199887710',
        studentCode: `STU-O1-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    let identityErrorO1 = null;
    try {
      await ImportService.commitStudentOnboardingBatch(batchO1.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false,
        context: { requestId: 'req-test-o1' }
      });
    } catch (err) {
      identityErrorO1 = err;
    }

    assert(Boolean(identityErrorO1), 'Scenario O1: Commit rejected when incoming guardian name conflicts with an existing Guardian record');
    assert(identityErrorO1.statusCode === 409, 'Scenario O1: Rejection uses a clean 409 CONFLICT business error, never a raw 500');
    assert(identityErrorO1.errorCode === ERROR_CODES.CONFLICT, 'Scenario O1: Error code is CONFLICT (existing error vocabulary, no new code invented)');

    // No PII in the thrown error's own message
    assert(!identityErrorO1.message.includes(parentIdO1), 'Scenario O1: Error message does not leak the parent national ID');
    assert(!identityErrorO1.message.includes('بندر آل سالم'), 'Scenario O1: Error message does not leak the incoming guardian name');
    assert(!identityErrorO1.message.includes('سعود بن فهد المالكي'), 'Scenario O1: Error message does not leak the stored guardian name');
    assert(!identityErrorO1.message.includes('0501110001'), 'Scenario O1: Error message does not leak the phone number');

    // No partial persistence — full transaction rollback
    const guardianO1AfterAttempt = await prisma.guardian.findUnique({ where: { id: existingGuardianO1.id } });
    assert(guardianO1AfterAttempt.fullNameAr === 'سعود بن فهد المالكي', 'Scenario O1: Existing Guardian record was NOT overwritten by the conflicting import');
    const totalGuardiansO1 = await prisma.guardian.count({ where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdO1) } });
    assert(totalGuardiansO1 === 1, 'Scenario O1: No second/duplicate Guardian was created');
    const studentO1 = await prisma.student.findFirst({ where: { nationalId: '1199887710' } });
    assert(studentO1 === null, 'Scenario O1: No Student was persisted (atomic rollback before any write)');
    const linkO1 = await prisma.studentGuardian.findFirst({ where: { schoolId: schoolA.id, guardianId: existingGuardianO1.id } });
    assert(linkO1 === null, 'Scenario O1: No StudentGuardian link was created');

    const batchO1AfterAttempt = await prisma.importBatch.findUnique({ where: { id: batchO1.id } });
    assert(batchO1AfterAttempt.status === 'VALIDATED', 'Scenario O1: Batch remains cleanly in VALIDATED state after the rejected commit (rollback, not a partial COMMITTED)');
    const recordsO1AfterAttempt = await prisma.importRecord.findMany({ where: { batchId: batchO1.id } });
    assert(recordsO1AfterAttempt.every(r => r.status === 'VALID'), 'Scenario O1: ImportRecord remains VALID (never advanced to PROCESSED)');

    const auditLogsO1 = await prisma.auditLog.findMany({ where: { requestId: 'req-test-o1' } });
    assert(auditLogsO1.length === 0, 'Scenario O1: Zero partial audit logs persisted for the rejected commit');

    // O2. Phone mismatch against an existing Guardian
    const parentIdO2 = '1099887711';
    const existingGuardianO2 = await prisma.guardian.create({
      data: {
        schoolId: schoolA.id,
        firstNameAr: 'ماجد',
        familyNameAr: 'الحارثي',
        fullNameAr: 'ماجد عبدالرحمن الحارثي',
        status: 'ACTIVE',
        nationalIdEncrypted: 'enc-dummy-o2-nid',
        phoneEncrypted: 'enc-dummy-o2-phone',
        nationalIdHash: computeBlindHash(parentIdO2),
        phoneHash: computeBlindHash('966501110002')
      }
    });

    const batchO2 = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdO2,
        parentName: 'ماجد عبدالرحمن الحارثي', // same name as the stored Guardian
        parentPhone: '0599990002', // deliberately different phone
        studentName: 'عبدالرحمن ماجد الحارثي',
        studentNationalId: '1199887711',
        studentCode: `STU-O2-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    let identityErrorO2 = null;
    try {
      await ImportService.commitStudentOnboardingBatch(batchO2.id, {
        callerUser,
        callerScopes: callerScopesA,
        isPlatformLevel: false,
        context: { requestId: 'req-test-o2' }
      });
    } catch (err) {
      identityErrorO2 = err;
    }

    assert(Boolean(identityErrorO2), 'Scenario O2: Commit rejected when incoming guardian phone conflicts with an existing Guardian record');
    assert(identityErrorO2.statusCode === 409, 'Scenario O2: Rejection uses a clean 409 CONFLICT business error');
    assert(identityErrorO2.errorCode === ERROR_CODES.CONFLICT, 'Scenario O2: Error code is CONFLICT');
    assert(!identityErrorO2.message.includes('0599990002') && !identityErrorO2.message.includes('966501110002'), 'Scenario O2: Error message does not leak either phone number');

    const guardianO2AfterAttempt = await prisma.guardian.findUnique({ where: { id: existingGuardianO2.id } });
    assert(guardianO2AfterAttempt.phoneHash === computeBlindHash('966501110002'), 'Scenario O2: Existing Guardian phoneHash was NOT overwritten');
    const studentO2 = await prisma.student.findFirst({ where: { nationalId: '1199887711' } });
    assert(studentO2 === null, 'Scenario O2: No Student was persisted (atomic rollback)');
    const linkO2 = await prisma.studentGuardian.findFirst({ where: { schoolId: schoolA.id, guardianId: existingGuardianO2.id } });
    assert(linkO2 === null, 'Scenario O2: No StudentGuardian link was created');

    // O3. Control case: legitimate reuse (matching name AND phone) still
    // succeeds through this exact commit-time check — proves the
    // defense-in-depth guard does not over-reject the normal sibling/reuse
    // path it sits directly in front of.
    const parentIdO3 = '1099887712';
    const existingGuardianO3 = await prisma.guardian.create({
      data: {
        schoolId: schoolA.id,
        firstNameAr: 'طلال',
        familyNameAr: 'العنزي',
        fullNameAr: 'طلال ناصر العنزي',
        status: 'ACTIVE',
        nationalIdEncrypted: 'enc-dummy-o3-nid',
        phoneEncrypted: 'enc-dummy-o3-phone',
        nationalIdHash: computeBlindHash(parentIdO3),
        phoneHash: computeBlindHash('966501110003')
      }
    });

    const batchO3 = await createTestBatch(schoolA.id, [
      {
        national_id: parentIdO3,
        parentName: 'طلال ناصر العنزي', // identical to the stored Guardian
        parentPhone: '0501110003', // normalizes to the same stored phoneHash
        studentName: 'ناصر طلال العنزي',
        studentNationalId: '1199887712',
        studentCode: `STU-O3-${Date.now().toString().slice(-4)}`,
        grade: 'الصف الأول الابتدائي',
        section: '1-أ',
        relationship: 'FATHER'
      }
    ]);

    const commitResultO3 = await ImportService.commitStudentOnboardingBatch(batchO3.id, {
      callerUser,
      callerScopes: callerScopesA,
      isPlatformLevel: false,
      context: { requestId: 'req-test-o3' }
    });

    assert(commitResultO3.status === 'COMMITTED', 'Scenario O3: Legitimate matching-identity reuse still commits successfully through the same defense-in-depth check');
    assert(commitResultO3.summary.existingGuardiansReusedCount === 1, 'Scenario O3: Existing Guardian correctly reused, not blocked');
    const totalGuardiansO3 = await prisma.guardian.count({ where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(parentIdO3) } });
    assert(totalGuardiansO3 === 1, 'Scenario O3: No duplicate Guardian created for the legitimate-reuse control case');

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} COMMIT STUDENT ONBOARDING TESTS PASSED (100%)!`);
    console.log('========================================================\n');

  } catch (error) {
    console.error('❌ Commit Student Onboarding Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test data and schools...');
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
        await prisma.user.deleteMany({ where: { id: uid } });
      }

      for (const sid of createdSchoolIds) {
        await prisma.auditLog.deleteMany({ where: { schoolId: sid } });
        await prisma.school.deleteMany({ where: { id: sid } });
      }
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runCommitStudentOnboardingTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      process.exit(1);
    });
}

module.exports = { runCommitStudentOnboardingTestSuite };
