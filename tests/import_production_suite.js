const request = require('supertest');
const xlsx = require('xlsx');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { decryptText, computeBlindHash } = require('../src/utils/crypto.util');
const ArabicDataNormalizer = require('../src/import/normalizers/arabic-data.normalizer');
const {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
} = require('./helpers/ephemeral_owner');

// Helper to generate in-memory Excel Buffer
function createExcelBuffer(data, sheetName = 'Sheet1') {
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Helper to generate in-memory CSV Buffer
function createCsvBuffer(data) {
  const ws = xlsx.utils.json_to_sheet(data);
  const csvText = xlsx.utils.sheet_to_csv(ws);
  return Buffer.from(csvText, 'utf-8');
}

async function runImportProductionTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING PRODUCTION IMPORT WORKFLOW BACKEND SUITE');
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
      data: { code: `SCH_PROD_IMP_A_${Date.now()}`, nameAr: 'مدارس النخبة الأهلية', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_PROD_IMP_B_${Date.now()}`, nameAr: 'مدارس الرواد النموذجية', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);
    assert(Boolean(schoolA.id && schoolB.id), 'Created School A and School B');

    // ----------------------------------------------------
    // SETUP: Academic Structure in School A
    // ----------------------------------------------------
    console.log('\n--- 3. Setup Academic Structure & Specializations in School A ---');
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
        maxCapacity: 25
      }
    });

    const specMath = await prisma.specialization.create({
      data: { schoolId: schoolA.id, nameAr: 'الرياضيات', code: 'SPEC_MATH' }
    });

    assert(Boolean(class1A.id && specMath.id), 'Reference structure created in School A');

    // ----------------------------------------------------
    // SETUP: Create SCHOOL_ADMIN & REGISTRAR for School A
    // ----------------------------------------------------
    console.log('\n--- 4. Create SCHOOL_ADMIN & REGISTRAR for School A ---');
    const adminUsername = `admin.imp.${Date.now()}`;
    const adminPassword = 'Pass123!SchoolAdmin';
    const adminRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPassword,
        fullName: 'مدير استيراد المدرسة',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(adminRes.body.data.user.id);

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // Registrar (has import.upload, import.view, import.validate, but NOT import.commit)
    const regUsername = `reg.imp.${Date.now()}`;
    const regPassword = 'Pass123!Registrar';
    const regRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: regUsername,
        password: regPassword,
        fullName: 'مسجل استيراد المدرسة',
        roleCode: 'REGISTRAR',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    createdUserIds.push(regRes.body.data.user.id);

    const regLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: regUsername, password: regPassword });
    const regCookie = regLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    assert(Boolean(adminCookie && regCookie), 'School Admin and Registrar logged in');

    // ----------------------------------------------------
    // TEST 1 & 2: Create Batch & Reject Invalid File Extension
    // ----------------------------------------------------
    console.log('\n--- 5. Create Batch & Reject Unsupported File Type ---');
    const createBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'students.xlsx' });

    assert(createBatchRes.status === 201, 'Student batch created (201 Created)');
    const stuBatchId = createBatchRes.body.data.batch.id;

    // Upload .txt file
    const invalidExtRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/upload`)
      .set('Cookie', regCookie)
      .attach('file', Buffer.from('dummy text content'), 'invalid_file.txt');

    assert(invalidExtRes.status === 400, 'Unsupported file extension (.txt) rejected with 400 Bad Request');

    // ----------------------------------------------------
    // TEST 3: Reject File Missing Required Template Headers
    // ----------------------------------------------------
    console.log('\n--- 6. Reject Excel File Missing Required Template Columns ---');
    const badTemplateData = [
      { random_col1: 'Value 1', random_col2: 'Value 2' }
    ];
    const badExcelBuffer = createExcelBuffer(badTemplateData);

    const badHeaderRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/upload`)
      .set('Cookie', regCookie)
      .attach('file', badExcelBuffer, 'bad_template.xlsx');

    assert(badHeaderRes.status === 400, 'Missing required template headers rejected with 400 Bad Request');
    assert(badHeaderRes.body.error.message.includes('الأعمدة الإلزامية'), 'Error message clearly explains missing template headers');

    // ----------------------------------------------------
    // TEST 4: Upload Valid Excel File for Students
    // ----------------------------------------------------
    console.log('\n--- 7. Upload Valid Excel File for Students ---');
    // RIFAD-GAP-011 Phase 0D.1: validateBatch now requires parentId/parentName/
    // parentPhone for every STUDENTS row (parentEmail stays optional) — these
    // fixtures gained valid guardian columns so this fixture keeps testing what
    // it always tested (generic /commit flow, RBAC, double-commit guard) rather
    // than being rejected by the new mandatory guardian-field rule.
    const validStudentData = [
      {
        'first_name_ar': 'عبدالرحمن',
        'second_name_ar': 'خالد',
        'third_name_ar': 'محمد',
        'family_name_ar': 'الغامدي',
        'grade': 'الصف الأول الابتدائي',
        'section': '1-أ',
        'student_code': 'STU-PROD-001',
        'parent_id': '1011122001',
        'parent_name': 'خالد عبدالعزيز الغامدي',
        'parent_phone': '0511122001'
      },
      {
        'first_name_ar': 'عبدالله',
        'second_name_ar': 'سعد',
        'third_name_ar': 'علي',
        'family_name_ar': 'الشهري',
        'grade': 'الصف الأول الابتدائي',
        'section': '1-أ',
        'student_code': 'STU-PROD-002',
        'parent_id': '1011122002',
        'parent_name': 'سعد علي الشهري',
        'parent_phone': '0511122002'
      }
    ];

    const studentExcelBuffer = createExcelBuffer(validStudentData);

    const uploadStudentRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/upload`)
      .set('Cookie', regCookie)
      .attach('file', studentExcelBuffer, 'students_intake_2026.xlsx');

    assert(uploadStudentRes.status === 200, 'Valid student Excel uploaded and parsed successfully (200 OK)');
    assert(uploadStudentRes.body.data.parsedRowsCount === 2, 'Parsed 2 student records into staging table');

    // ----------------------------------------------------
    // TEST 5: Validate Students Batch
    // ----------------------------------------------------
    console.log('\n--- 8. Run Validation on Students Batch ---');
    const validateStudentRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/validate`)
      .set('Cookie', regCookie);

    assert(validateStudentRes.status === 200, 'Validation finished (200 OK)');
    assert(validateStudentRes.body.data.validRows === 2, 'All 2 student rows are VALID');
    assert(validateStudentRes.body.data.errorRows === 0, '0 validation errors');
    assert(validateStudentRes.body.data.status === 'VALIDATED', 'Batch status updated to VALIDATED');

    // ----------------------------------------------------
    // TEST 6: Preview Students Batch
    // ----------------------------------------------------
    console.log('\n--- 9. Get Batch Preview (GET /preview) ---');
    const previewRes = await request(app)
      .get(`/api/v1/import/batches/${stuBatchId}/preview`)
      .set('Cookie', regCookie);

    assert(previewRes.status === 200, 'Retrieved batch preview (200 OK)');
    assert(previewRes.body.data.isCommitEligible === true, 'Batch is flagged as isCommitEligible = true');
    assert(previewRes.body.data.previewRecords.length === 2, 'Preview contains 2 student records');

    // ----------------------------------------------------
    // TEST 7: RBAC Guard - Registrar Cannot Commit Batch
    // ----------------------------------------------------
    console.log('\n--- 10. RBAC Guard: REGISTRAR Forbidden from Executing Commit ---');
    const unauthCommitRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/commit`)
      .set('Cookie', regCookie);

    assert(unauthCommitRes.status === 403, 'Registrar blocked from committing batch (403 Forbidden)');
    assert(unauthCommitRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Returns FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // ----------------------------------------------------
    // TEST 8: Commit Students Batch by SCHOOL_ADMIN
    // ----------------------------------------------------
    console.log('\n--- 11. Atomic Commit of Students Batch by SCHOOL_ADMIN ---');
    const commitStudentRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/commit`)
      .set('Cookie', adminCookie);

    assert(commitStudentRes.status === 200, 'Batch committed atomically to operational tables (200 OK)');
    assert(commitStudentRes.body.data.insertedCount === 2, 'Inserted 2 students and enrollments');
    assert(commitStudentRes.body.data.status === 'COMMITTED', 'Batch status is now COMMITTED');

    // Verify operational table records
    const insertedStudent1 = await prisma.student.findFirst({
      where: { schoolId: schoolA.id, studentCode: 'STU-PROD-001' },
      include: { enrollments: true }
    });
    assert(Boolean(insertedStudent1), 'Student 1 persisted in students table');
    assert(insertedStudent1.enrollments.length === 1, 'Student 1 enrolled in 1-A');
    assert(insertedStudent1.enrollments[0].classSectionId === class1A.id, 'Enrollment mapped to class 1-A');

    // ----------------------------------------------------
    // TEST 9: Prevent Re-committing Already Committed Batch
    // ----------------------------------------------------
    console.log('\n--- 12. Guard: Prevent Double-Commit on Already Committed Batch ---');
    const doubleCommitRes = await request(app)
      .post(`/api/v1/import/batches/${stuBatchId}/commit`)
      .set('Cookie', adminCookie);

    // RIFAD-GAP-014 hardening: commitBatch now re-checks status under a row lock inside the
    // transaction, so an already-COMMITTED batch is rejected via the same clean business-state
    // error path (409 CONFLICT) as any other concurrent-loser attempt, not the generic 400 used
    // before this fix.
    assert(doubleCommitRes.status === 409, 'Double-commit rejected with 409 Conflict (RIFAD-GAP-014 business-state error semantics)');
    assert(doubleCommitRes.body.error.code === 'CONFLICT', 'Double-commit error code is CONFLICT');

    // ----------------------------------------------------
    // TEST 9b: RIFAD-GAP-011 Phase 0D.1 — Guardian Field Validation at Live Validate Gate
    // ----------------------------------------------------
    console.log('\n--- 12b. RIFAD-GAP-011 Phase 0D.1: Guardian Validation at validateBatch ---');

    const gapBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_validation_check.xlsx' });
    assert(gapBatchRes.status === 201, 'GAP-011 setup: guardian-validation-check batch created (201)');
    const gapBatchId = gapBatchRes.body.data.batch.id;

    // 5 rows, each isolating exactly ONE deterministic guardian defect (A-E).
    const gapInvalidRecords = [
      { // A. Missing parentId
        rowNumber: 1,
        rawData: { firstNameAr: 'سالم', familyNameAr: 'العتيبي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentName: 'فهد العتيبي', parentPhone: '0533344001' }
      },
      { // B. Invalid parentId format (not 10 digits)
        rowNumber: 2,
        rawData: { firstNameAr: 'نايف', familyNameAr: 'الحربي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '12345', parentName: 'سلطان الحربي', parentPhone: '0533344002' }
      },
      { // C. Missing parentName
        rowNumber: 3,
        rawData: { firstNameAr: 'تركي', familyNameAr: 'الدوسري', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1033344003', parentPhone: '0533344003' }
      },
      { // D. Missing parentPhone — must never reach the legacy 0500000000 placeholder path
        rowNumber: 4,
        rawData: { firstNameAr: 'بندر', familyNameAr: 'القحطاني', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1033344004', parentName: 'سعيد القحطاني' }
      },
      { // E. Invalid parentPhone format
        rowNumber: 5,
        rawData: { firstNameAr: 'ماجد', familyNameAr: 'الشمري', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1033344005', parentName: 'عبدالعزيز الشمري', parentPhone: '999' }
      }
    ];

    const gapAddRes = await request(app)
      .post(`/api/v1/import/batches/${gapBatchId}/records`)
      .set('Cookie', regCookie)
      .send({ records: gapInvalidRecords });
    assert(gapAddRes.status === 201, 'GAP-011 setup: 5 guardian-defect rows staged');

    const gapValidateRes = await request(app)
      .post(`/api/v1/import/batches/${gapBatchId}/validate`)
      .set('Cookie', regCookie);

    assert(gapValidateRes.status === 200, 'A-E: Validation request completes (200 OK)');
    assert(gapValidateRes.body.data.validRows === 0, 'A-E: Zero rows are VALID — every row has a deterministic guardian defect');
    assert(gapValidateRes.body.data.errorRows === 5, 'A-E: All 5 rows are INVALID');
    assert(gapValidateRes.body.data.status !== 'VALIDATED', 'A-E: Batch status is NOT VALIDATED — rejected before commit, not deferred to it');

    const gapErrorsRes = await request(app)
      .get(`/api/v1/import/batches/${gapBatchId}/errors`)
      .set('Cookie', regCookie);
    const gapErrorCodes = gapErrorsRes.body.data.errors.map(e => e.errorCode);

    assert(gapErrorCodes.includes('MISSING_PARENT_ID'), 'A. Missing parentId rejected at validate with MISSING_PARENT_ID');
    assert(gapErrorCodes.includes('INVALID_PARENT_ID_FORMAT'), 'B. Malformed parentId rejected at validate with INVALID_PARENT_ID_FORMAT (not deferred to commit)');
    assert(gapErrorCodes.includes('MISSING_PARENT_NAME'), 'C. Missing parentName rejected at validate with MISSING_PARENT_NAME');
    assert(gapErrorCodes.includes('MISSING_PARENT_PHONE'), 'D. Missing parentPhone rejected at validate with MISSING_PARENT_PHONE');
    assert(gapErrorCodes.includes('INVALID_SAUDI_PHONE_FORMAT'), 'E. Malformed parentPhone rejected at validate with INVALID_SAUDI_PHONE_FORMAT');

    // I. Commit eligibility — a batch with deterministic guardian errors must never
    // become commit-eligible, and must never reach the onboarding commit orchestrator.
    const gapPreviewRes = await request(app)
      .get(`/api/v1/import/batches/${gapBatchId}/preview`)
      .set('Cookie', regCookie);
    assert(gapPreviewRes.body.data.isCommitEligible === false, 'I. Batch with guardian defects is NOT commit-eligible');

    const gapCommitAttemptRes = await request(app)
      .post(`/api/v1/import/batches/${gapBatchId}/commit-onboarding`)
      .set('Cookie', adminCookie);
    assert(gapCommitAttemptRes.status === 409, 'I. commit-onboarding on a non-VALIDATED batch is rejected (409) — deterministic guardian defects never reach the commit orchestrator');
    assert(gapCommitAttemptRes.body.error.code === 'CONFLICT', 'I. Rejection uses the existing CONFLICT error code — no new status/error vocabulary introduced');

    // D (continued). Since the batch never reached VALIDATED, no student/guardian was
    // ever persisted for the missing-parentPhone row — the legacy 0500000000 fallback
    // in commitStudentOnboardingBatch was never reached.
    const gapNoGhostGuardian = await prisma.guardian.findFirst({
      where: { schoolId: schoolA.id, phoneHash: computeBlindHash('0500000000') }
    });
    assert(gapNoGhostGuardian === null, 'D. No guardian was created with the legacy placeholder phone — the fallback path was never reached');

    // F + H + G. A second batch: F (parentEmail absent — still optional), H (a
    // normalization variant ArabicDataNormalizer.normalizeSaudiPhone already
    // supports today — a 9-digit number with no leading 0, e.g. "512233010",
    // normalizes to a valid Saudi number), and G (fully valid guardian fields
    // continue to validate normally, confirming this is additive, not a regression).
    const gapValidBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_validation_valid.xlsx' });
    const gapValidBatchId = gapValidBatchRes.body.data.batch.id;

    const gapValidRecords = [
      { // F. parentEmail omitted entirely — must remain optional, row still valid
        rowNumber: 1,
        rawData: { firstNameAr: 'يزيد', familyNameAr: 'المطيري', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1033355001', parentName: 'خالد المطيري', parentPhone: '0533355001' }
      },
      { // H. parentPhone as a 9-digit number without a leading 0 — a normalization
        // variant ArabicDataNormalizer.normalizeSaudiPhone already accepts as valid.
        rowNumber: 2,
        rawData: { firstNameAr: 'رياض', familyNameAr: 'الغامدي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1033355002', parentName: 'ماجد الغامدي', parentPhone: '533355002' }
      }
    ];

    await request(app)
      .post(`/api/v1/import/batches/${gapValidBatchId}/records`)
      .set('Cookie', regCookie)
      .send({ records: gapValidRecords });

    const gapValidValidateRes = await request(app)
      .post(`/api/v1/import/batches/${gapValidBatchId}/validate`)
      .set('Cookie', regCookie);

    assert(gapValidValidateRes.status === 200, 'F/G/H: Validation request completes (200 OK)');
    assert(gapValidValidateRes.body.data.validRows === 2, 'F/G/H: Both rows are VALID — missing optional email and a supported phone-normalization variant do not block validation');
    assert(gapValidValidateRes.body.data.errorRows === 0, 'F/G/H: Zero validation errors');
    assert(gapValidValidateRes.body.data.status === 'VALIDATED', 'F/G/H: Batch reaches VALIDATED — the new guardian rule does not over-reject legitimate rows');

    // ----------------------------------------------------
    // TEST 9c: RIFAD-GAP-011 Phase 0D.2 — Guardian Identity Consistency
    // ----------------------------------------------------
    console.log('\n--- 12c. RIFAD-GAP-011 Phase 0D.2: Guardian Identity Consistency & Safe Reuse ---');

    // --- Part 1 (Scenarios A, B, C, I, J): Within-batch consistency -------
    // 7 rows in one batch:
    //   Rows 1-2: same parentId, equivalent normalized name/phone forms
    //             (legitimate siblings — A — and a normalization-equivalence
    //             proof — I: one row uses 05xxxxxxxx, the other 9665xxxxxxxx,
    //             and one name form omits the "بن" noise word).
    //   Rows 3-4: same parentId, DIFFERENT name, same phone (B).
    //   Rows 5-6: same parentId, same name, DIFFERENT phone (C).
    //   Row 7:    unique parentId, missing parentPhone entirely — proves the
    //             0D.1 field-level guardian check still runs unaffected
    //             alongside the new 0D.2 consistency checks (J).
    const consistencyBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_consistency_within_batch.xlsx' });
    assert(consistencyBatchRes.status === 201, 'Phase 0D.2 setup: within-batch consistency check batch created (201)');
    const consistencyBatchId = consistencyBatchRes.body.data.batch.id;

    const consistencyRecords = [
      { // 1. Anchor of legitimate sibling group
        rowNumber: 1,
        rawData: { firstNameAr: 'فهد', familyNameAr: 'العتيبي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455001', parentName: 'خالد بن سعود الفهد', parentPhone: '0512340001' }
      },
      { // 2. Sibling — name without "بن" noise word, phone in 9665xxxxxxxx form: both must still match (A + I)
        rowNumber: 2,
        rawData: { firstNameAr: 'نورة', familyNameAr: 'العتيبي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455001', parentName: 'خالد سعود الفهد', parentPhone: '966512340001' }
      },
      { // 3. Anchor of name-mismatch group (never itself flagged)
        rowNumber: 3,
        rawData: { firstNameAr: 'سلطان', familyNameAr: 'الغامدي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455002', parentName: 'سلطان الغامدي', parentPhone: '0512340002' }
      },
      { // 4. B. Different parent name, same phone -> PARENT_NAME_MISMATCH
        rowNumber: 4,
        rawData: { firstNameAr: 'ريم', familyNameAr: 'الغامدي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455002', parentName: 'فيصل الغامدي', parentPhone: '0512340002' }
      },
      { // 5. Anchor of phone-mismatch group (never itself flagged)
        rowNumber: 5,
        rawData: { firstNameAr: 'عبدالمجيد', familyNameAr: 'الشريف', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455003', parentName: 'عبدالمجيد الشريف', parentPhone: '0512340003' }
      },
      { // 6. C. Same parent name, different phone -> PARENT_PHONE_MISMATCH
        rowNumber: 6,
        rawData: { firstNameAr: 'لمى', familyNameAr: 'الشريف', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455003', parentName: 'عبدالمجيد الشريف', parentPhone: '0555550003' }
      },
      { // 7. J. Missing parentPhone entirely — unrelated unique parentId; must still be
        // caught by the 0D.1 field-level check regardless of 0D.2 running alongside it
        rowNumber: 7,
        rawData: { firstNameAr: 'ياسر', familyNameAr: 'القرني', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: '1044455004', parentName: 'ياسر القرني' }
      }
    ];

    const consistencyAddRes = await request(app)
      .post(`/api/v1/import/batches/${consistencyBatchId}/records`)
      .set('Cookie', regCookie)
      .send({ records: consistencyRecords });
    assert(consistencyAddRes.status === 201, 'Phase 0D.2 setup: 7 within-batch consistency rows staged');

    const consistencyValidateRes = await request(app)
      .post(`/api/v1/import/batches/${consistencyBatchId}/validate`)
      .set('Cookie', regCookie);

    assert(consistencyValidateRes.status === 200, 'Within-batch: Validation request completes (200 OK)');
    // Valid: row 1, row 2 (siblings), row 3 (mismatch-group anchor, never
    // flagged itself), row 5 (mismatch-group anchor, never flagged itself) = 4.
    // Invalid: row 4 (PARENT_NAME_MISMATCH), row 6 (PARENT_PHONE_MISMATCH),
    // row 7 (MISSING_PARENT_PHONE, an unrelated 0D.1 field error) = 3.
    assert(consistencyValidateRes.body.data.validRows === 4, 'A+I: Rows 1-2 (legitimate siblings, normalization-equivalent forms) plus anchor rows 3 and 5 remain VALID');
    assert(consistencyValidateRes.body.data.errorRows === 3, 'B+C+J: Rows 4, 6, and 7 are INVALID (name mismatch, phone mismatch, and the unrelated 0D.1 field error)');
    assert(consistencyValidateRes.body.data.status !== 'VALIDATED', 'Batch is NOT VALIDATED while any consistency/field conflict remains unresolved');

    const consistencyErrorsRes = await request(app)
      .get(`/api/v1/import/batches/${consistencyBatchId}/errors`)
      .set('Cookie', regCookie);
    const consistencyErrors = consistencyErrorsRes.body.data.errors;
    const consistencyErrorsByRow = {};
    consistencyErrors.forEach(e => {
      if (!consistencyErrorsByRow[e.rowNumber]) consistencyErrorsByRow[e.rowNumber] = [];
      consistencyErrorsByRow[e.rowNumber].push(e.errorCode);
    });

    assert(!consistencyErrorsByRow[1] && !consistencyErrorsByRow[2], 'A: Rows 1-2 (siblings) carry zero errors');
    assert(!consistencyErrorsByRow[3], 'B: Anchor row 3 is never flagged solely for being first in its group');
    assert(Boolean(consistencyErrorsByRow[4] && consistencyErrorsByRow[4].includes('PARENT_NAME_MISMATCH')), 'B: Row 4 flagged with PARENT_NAME_MISMATCH against its group anchor (row 3)');
    assert(!(consistencyErrorsByRow[4] || []).includes('PARENT_PHONE_MISMATCH'), 'B: Row 4 phone matches its anchor — no false-positive PARENT_PHONE_MISMATCH');
    assert(!consistencyErrorsByRow[5], 'C: Anchor row 5 is never flagged solely for being first in its group');
    assert(Boolean(consistencyErrorsByRow[6] && consistencyErrorsByRow[6].includes('PARENT_PHONE_MISMATCH')), 'C: Row 6 flagged with PARENT_PHONE_MISMATCH against its group anchor (row 5)');
    assert(!(consistencyErrorsByRow[6] || []).includes('PARENT_NAME_MISMATCH'), 'C: Row 6 name matches its anchor — no false-positive PARENT_NAME_MISMATCH');
    assert(Boolean(consistencyErrorsByRow[7] && consistencyErrorsByRow[7].includes('MISSING_PARENT_PHONE')), 'J (0D.1 regression spot-check): Row 7 still rejected with MISSING_PARENT_PHONE — 0D.1 field rules unaffected by 0D.2');

    // K (privacy spot-check): the raw parent names/phones/IDs involved in the
    // mismatches must never appear anywhere in the errors response payload —
    // only row numbers and conflict type codes are permitted.
    const consistencyErrorsBodyText = JSON.stringify(consistencyErrorsRes.body);
    assert(!consistencyErrorsBodyText.includes('1044455002') && !consistencyErrorsBodyText.includes('1044455003'), 'K: Errors response does not leak raw parentId values for the mismatched groups');
    assert(!consistencyErrorsBodyText.includes('فيصل الغامدي') && !consistencyErrorsBodyText.includes('سلطان الغامدي'), 'K: Errors response does not leak the conflicting parent names themselves');
    assert(!consistencyErrorsBodyText.includes('0555550003'), 'K: Errors response does not leak the conflicting phone number itself');

    // --- Part 2 (Scenarios D, E, F): Existing-Guardian consistency ---------
    // A real Guardian is first created end-to-end via the live commit path,
    // then three further batches target the SAME parentId: a legitimate
    // reuse (D), a name mismatch (E), and a phone mismatch (F).
    const EXISTING_PARENT_ID = '1044466001';
    const EXISTING_PARENT_NAME = 'ناصر بن تركي السبيعي';
    const EXISTING_PARENT_PHONE = '0522210001';

    const setupBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_consistency_setup.xlsx' });
    const setupBatchId = setupBatchRes.body.data.batch.id;
    await request(app)
      .post(`/api/v1/import/batches/${setupBatchId}/records`)
      .set('Cookie', regCookie)
      .send({
        records: [{
          rowNumber: 1,
          rawData: { firstNameAr: 'تركي', familyNameAr: 'السبيعي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: EXISTING_PARENT_ID, parentName: EXISTING_PARENT_NAME, parentPhone: EXISTING_PARENT_PHONE }
        }]
      });
    const setupValidateRes = await request(app)
      .post(`/api/v1/import/batches/${setupBatchId}/validate`)
      .set('Cookie', regCookie);
    assert(setupValidateRes.body.data.status === 'VALIDATED', 'Phase 0D.2 setup: existing-Guardian source batch is VALIDATED');
    const setupCommitRes = await request(app)
      .post(`/api/v1/import/batches/${setupBatchId}/commit-onboarding`)
      .set('Cookie', adminCookie);
    assert(setupCommitRes.status === 200 && setupCommitRes.body.data.status === 'COMMITTED', 'Phase 0D.2 setup: existing-Guardian source batch committed — real Guardian now exists in DB');

    // D. Legitimate reuse — equivalent normalized name/phone forms, end-to-end through commit
    const reuseBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_consistency_reuse.xlsx' });
    const reuseBatchId = reuseBatchRes.body.data.batch.id;
    await request(app)
      .post(`/api/v1/import/batches/${reuseBatchId}/records`)
      .set('Cookie', regCookie)
      .send({
        records: [{
          rowNumber: 1,
          rawData: { firstNameAr: 'سلمى', familyNameAr: 'السبيعي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: EXISTING_PARENT_ID, parentName: 'ناصر تركي السبيعي', parentPhone: '966522210001' }
        }]
      });
    const reuseValidateRes = await request(app)
      .post(`/api/v1/import/batches/${reuseBatchId}/validate`)
      .set('Cookie', regCookie);
    assert(reuseValidateRes.body.data.validRows === 1 && reuseValidateRes.body.data.errorRows === 0, 'D: Legitimate reuse row (equivalent name/phone forms) passes existing-Guardian consistency at validate');
    assert(reuseValidateRes.body.data.status === 'VALIDATED', 'D: Batch reaches VALIDATED');

    const reusePreviewRes = await request(app)
      .get(`/api/v1/import/batches/${reuseBatchId}/preview`)
      .set('Cookie', regCookie);
    assert(reusePreviewRes.body.data.isCommitEligible === true, 'D: Batch is commit-eligible');

    const reuseCommitRes = await request(app)
      .post(`/api/v1/import/batches/${reuseBatchId}/commit-onboarding`)
      .set('Cookie', adminCookie);
    assert(reuseCommitRes.status === 200 && reuseCommitRes.body.data.status === 'COMMITTED', 'D: Legitimate reuse batch committed successfully end-to-end');
    assert(reuseCommitRes.body.data.summary.existingGuardiansReusedCount === 1, 'D: Existing Guardian was reused (not recreated) at commit');

    const guardiansAfterReuse = await prisma.guardian.count({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(EXISTING_PARENT_ID) }
    });
    assert(guardiansAfterReuse === 1, 'D: Exactly ONE Guardian row exists for this parentId after the reuse commit — no duplicate created');

    // E. Existing-guardian NAME mismatch — rejected at validate, never commit-eligible
    const nameMismatchBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_consistency_name_mismatch.xlsx' });
    const nameMismatchBatchId = nameMismatchBatchRes.body.data.batch.id;
    await request(app)
      .post(`/api/v1/import/batches/${nameMismatchBatchId}/records`)
      .set('Cookie', regCookie)
      .send({
        records: [{
          rowNumber: 1,
          rawData: { firstNameAr: 'بدر', familyNameAr: 'الدوسري', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: EXISTING_PARENT_ID, parentName: 'سالم الدوسري', parentPhone: EXISTING_PARENT_PHONE }
        }]
      });
    const nameMismatchValidateRes = await request(app)
      .post(`/api/v1/import/batches/${nameMismatchBatchId}/validate`)
      .set('Cookie', regCookie);
    assert(nameMismatchValidateRes.body.data.errorRows === 1, 'E: Existing-Guardian name-mismatch row is INVALID');
    assert(nameMismatchValidateRes.body.data.status !== 'VALIDATED', 'E: Batch does not reach VALIDATED');

    const nameMismatchErrorsRes = await request(app)
      .get(`/api/v1/import/batches/${nameMismatchBatchId}/errors`)
      .set('Cookie', regCookie);
    const nameMismatchErrorCodes = nameMismatchErrorsRes.body.data.errors.map(e => e.errorCode);
    assert(nameMismatchErrorCodes.includes('EXISTING_GUARDIAN_NAME_MISMATCH'), 'E: Error code EXISTING_GUARDIAN_NAME_MISMATCH returned');
    assert(!nameMismatchErrorCodes.includes('EXISTING_GUARDIAN_PHONE_MISMATCH'), 'E: Phone matches the existing Guardian — no false-positive EXISTING_GUARDIAN_PHONE_MISMATCH');

    const nameMismatchErrorsBodyText = JSON.stringify(nameMismatchErrorsRes.body);
    assert(!nameMismatchErrorsBodyText.includes(EXISTING_PARENT_ID), 'K: Existing-Guardian mismatch errors do not leak the raw parentId');
    assert(!nameMismatchErrorsBodyText.includes(EXISTING_PARENT_NAME) && !nameMismatchErrorsBodyText.includes('سالم الدوسري'), 'K: Existing-Guardian mismatch errors do not leak either guardian name');

    const nameMismatchPreviewRes = await request(app)
      .get(`/api/v1/import/batches/${nameMismatchBatchId}/preview`)
      .set('Cookie', regCookie);
    assert(nameMismatchPreviewRes.body.data.isCommitEligible === false, 'E: Batch is NOT commit-eligible');

    const nameMismatchCommitAttemptRes = await request(app)
      .post(`/api/v1/import/batches/${nameMismatchBatchId}/commit-onboarding`)
      .set('Cookie', adminCookie);
    assert(nameMismatchCommitAttemptRes.status === 409, 'E: commit-onboarding on the non-VALIDATED batch is rejected (409) — never reaches the commit orchestrator');

    // F. Existing-guardian PHONE mismatch — rejected at validate, never commit-eligible
    const phoneMismatchBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', regCookie)
      .send({ entityType: 'STUDENTS', originalFileName: 'guardian_consistency_phone_mismatch.xlsx' });
    const phoneMismatchBatchId = phoneMismatchBatchRes.body.data.batch.id;
    await request(app)
      .post(`/api/v1/import/batches/${phoneMismatchBatchId}/records`)
      .set('Cookie', regCookie)
      .send({
        records: [{
          rowNumber: 1,
          rawData: { firstNameAr: 'هند', familyNameAr: 'السبيعي', grade: 'الصف الأول الابتدائي', section: '1-أ', parentId: EXISTING_PARENT_ID, parentName: EXISTING_PARENT_NAME, parentPhone: '0599990001' }
        }]
      });
    const phoneMismatchValidateRes = await request(app)
      .post(`/api/v1/import/batches/${phoneMismatchBatchId}/validate`)
      .set('Cookie', regCookie);
    assert(phoneMismatchValidateRes.body.data.errorRows === 1, 'F: Existing-Guardian phone-mismatch row is INVALID');
    assert(phoneMismatchValidateRes.body.data.status !== 'VALIDATED', 'F: Batch does not reach VALIDATED');

    const phoneMismatchErrorsRes = await request(app)
      .get(`/api/v1/import/batches/${phoneMismatchBatchId}/errors`)
      .set('Cookie', regCookie);
    const phoneMismatchErrorCodes = phoneMismatchErrorsRes.body.data.errors.map(e => e.errorCode);
    assert(phoneMismatchErrorCodes.includes('EXISTING_GUARDIAN_PHONE_MISMATCH'), 'F: Error code EXISTING_GUARDIAN_PHONE_MISMATCH returned');
    assert(!phoneMismatchErrorCodes.includes('EXISTING_GUARDIAN_NAME_MISMATCH'), 'F: Name matches the existing Guardian — no false-positive EXISTING_GUARDIAN_NAME_MISMATCH');

    const phoneMismatchErrorsBodyText = JSON.stringify(phoneMismatchErrorsRes.body);
    assert(!phoneMismatchErrorsBodyText.includes('0599990001') && !phoneMismatchErrorsBodyText.includes(EXISTING_PARENT_PHONE), 'K: Existing-Guardian mismatch errors do not leak either phone number');

    const phoneMismatchPreviewRes = await request(app)
      .get(`/api/v1/import/batches/${phoneMismatchBatchId}/preview`)
      .set('Cookie', regCookie);
    assert(phoneMismatchPreviewRes.body.data.isCommitEligible === false, 'F: Batch is NOT commit-eligible');

    // Final integrity check: despite 2 rejected mismatch attempts, still exactly
    // ONE Guardian exists for this parentId — no Guardian was ever created,
    // overwritten, or duplicated by any of the E/F rejected batches.
    const guardiansAfterMismatches = await prisma.guardian.count({
      where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(EXISTING_PARENT_ID) }
    });
    assert(guardiansAfterMismatches === 1, 'E+F: Still exactly ONE Guardian exists after both rejected mismatch attempts — no mutation, no duplicate');
    const guardianStillOriginal = await prisma.guardian.findFirst({ where: { schoolId: schoolA.id, nationalIdHash: computeBlindHash(EXISTING_PARENT_ID) } });
    assert(guardianStillOriginal.fullNameAr === ArabicDataNormalizer.normalizeArabicName(EXISTING_PARENT_NAME), 'E+F: The one surviving Guardian record still holds its original name — never overwritten by a rejected mismatch attempt');

    // ----------------------------------------------------
    // TEST 10: Upload CSV File for Teachers with Sensitive PII
    // ----------------------------------------------------
    console.log('\n--- 13. Upload & Commit CSV File for Teachers with AES-256 PII Encryption ---');
    const tchBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', adminCookie)
      .send({ entityType: 'TEACHERS', originalFileName: 'teachers.csv' });

    const tchBatchId = tchBatchRes.body.data.batch.id;

    const validTeacherData = [
      {
        'full_name_ar': 'أحمد إبراهيم الزهراني',
        'employee_number': 'EMP-PROD-777',
        'specialization': 'SPEC_MATH',
        'national_id': '1098765432',
        'phone': '0551234567',
        'email': 'ahmed.zahrani@school.edu.sa'
      }
    ];

    const teacherCsvBuffer = createCsvBuffer(validTeacherData);

    const uploadTchRes = await request(app)
      .post(`/api/v1/import/batches/${tchBatchId}/upload`)
      .set('Cookie', adminCookie)
      .attach('file', teacherCsvBuffer, 'faculty_q1.csv');

    assert(uploadTchRes.status === 200, 'Teacher CSV uploaded and parsed (200 OK)');

    const validateTchRes = await request(app)
      .post(`/api/v1/import/batches/${tchBatchId}/validate`)
      .set('Cookie', adminCookie);

    assert(validateTchRes.status === 200, 'Teacher validation passed (200 OK)');
    assert(validateTchRes.body.data.status === 'VALIDATED', 'Teacher batch is VALIDATED');

    // ----------------------------------------------------
    // TEST 10b: RIFAD-GAP-009 Regression — Batch Preview Must Not Leak Raw PII
    // ----------------------------------------------------
    console.log('\n--- 13b. RIFAD-GAP-009 Regression: Batch Preview Must Not Expose Raw PII ---');
    const NATIONAL_ID_SENTINEL = '1098765432';
    const PHONE_SENTINEL = '0551234567';
    const EMAIL_SENTINEL = 'ahmed.zahrani@school.edu.sa';

    // A. Authorized caller (import.view) still gets a successful preview as before
    const tchPreviewRes = await request(app)
      .get(`/api/v1/import/batches/${tchBatchId}/preview`)
      .set('Cookie', adminCookie);

    assert(tchPreviewRes.status === 200, 'Authorized caller (import.view) still retrieves batch preview (200 OK)');
    assert(tchPreviewRes.body.data.previewRecords.length === 1, 'Preview still contains 1 teacher record');

    // B. Response does NOT contain rawData / raw_data at all
    const previewRecord = tchPreviewRes.body.data.previewRecords[0];
    assert(!Object.prototype.hasOwnProperty.call(previewRecord, 'rawData'), 'Preview record does not contain rawData field');
    assert(!Object.prototype.hasOwnProperty.call(previewRecord, 'raw_data'), 'Preview record does not contain raw_data field');

    // C. Recursive serialization check — no sentinel PII value anywhere in the full response body
    const previewBodyText = JSON.stringify(tchPreviewRes.body);
    assert(!previewBodyText.includes(NATIONAL_ID_SENTINEL), 'Preview response does not leak sentinel national ID anywhere in the payload');
    assert(!previewBodyText.includes(PHONE_SENTINEL), 'Preview response does not leak sentinel phone number anywhere in the payload');
    assert(!previewBodyText.includes(EMAIL_SENTINEL), 'Preview response does not leak sentinel email anywhere in the payload');
    assert(!previewBodyText.toLowerCase().includes('rawdata') && !previewBodyText.includes('raw_data'), 'Preview response contains no rawData/raw_data key anywhere');

    // D. Existing non-sensitive preview metadata still present as expected
    assert(
      Boolean(previewRecord.id) && previewRecord.rowNumber === 1 && Boolean(previewRecord.status) && previewRecord.entityType === 'TEACHERS',
      'Preview record still exposes non-sensitive metadata (id, rowNumber, status, entityType)'
    );
    assert(tchPreviewRes.body.data.isCommitEligible === true, 'isCommitEligible metadata unaffected by the fix');

    // E. Unauthorized behavior remains unchanged (auth/permission model untouched by this fix)
    const noAuthPreviewRes = await request(app)
      .get(`/api/v1/import/batches/${tchBatchId}/preview`);
    assert(noAuthPreviewRes.status === 401, 'Unauthenticated preview request still rejected (401) — auth model unchanged');

    const commitTchRes = await request(app)
      .post(`/api/v1/import/batches/${tchBatchId}/commit`)
      .set('Cookie', adminCookie);

    assert(commitTchRes.status === 200, 'Teacher batch committed (200 OK)');

    // Verify Teacher PII Encryption
    const insertedTeacher = await prisma.teacher.findFirst({
      where: { schoolId: schoolA.id, employeeNumber: 'EMP-PROD-777' }
    });

    assert(Boolean(insertedTeacher), 'Teacher persisted in teachers table');
    assert(insertedTeacher.nationalIdEncrypted !== '1098765432', 'National ID is not stored in plaintext');
    assert(Boolean(insertedTeacher.nationalIdHash), 'National ID blind hash index generated');
    const decryptedNationalId = decryptText(insertedTeacher.nationalIdEncrypted);
    assert(decryptedNationalId === '1098765432', 'National ID decrypted accurately with AES-256-GCM');

    // ----------------------------------------------------
    // TEST 13c: RIFAD-GAP-014 — Concurrent commitBatch Race (Teacher Import Path)
    // ----------------------------------------------------
    console.log('\n--- 13c. RIFAD-GAP-014: Concurrent commitBatch Row-Lock Hardening (Teachers) ---');

    const concTchBatchRes = await request(app)
      .post('/api/v1/import/batches')
      .set('Cookie', adminCookie)
      .send({ entityType: 'TEACHERS', originalFileName: 'teachers_concurrency.csv' });
    assert(concTchBatchRes.status === 201, 'GAP-014 setup: concurrency-test teacher batch created (201)');
    const concTchBatchId = concTchBatchRes.body.data.batch.id;

    const CONC_NATIONAL_ID = '1077777777';
    const concTeacherData = [
      {
        'full_name_ar': 'سلطان محمد العنزي',
        'employee_number': 'EMP-CONC-001',
        'specialization': 'SPEC_MATH',
        'national_id': CONC_NATIONAL_ID,
        'phone': '0567777777',
        'email': 'sultan.anzi@school.edu.sa'
      }
    ];
    const concTeacherCsvBuffer = createCsvBuffer(concTeacherData);

    const concUploadRes = await request(app)
      .post(`/api/v1/import/batches/${concTchBatchId}/upload`)
      .set('Cookie', adminCookie)
      .attach('file', concTeacherCsvBuffer, 'teachers_concurrency.csv');
    assert(concUploadRes.status === 200, 'GAP-014 setup: concurrency-test teacher CSV uploaded');

    const concValidateRes = await request(app)
      .post(`/api/v1/import/batches/${concTchBatchId}/validate`)
      .set('Cookie', adminCookie);
    assert(concValidateRes.status === 200 && concValidateRes.body.data.status === 'VALIDATED', 'GAP-014 setup: concurrency-test batch is VALIDATED with 0 errors');

    // Two truly concurrent commit requests dispatched against the SAME VALIDATED batch
    const [concCommit1, concCommit2] = await Promise.all([
      request(app).post(`/api/v1/import/batches/${concTchBatchId}/commit`).set('Cookie', adminCookie),
      request(app).post(`/api/v1/import/batches/${concTchBatchId}/commit`).set('Cookie', adminCookie)
    ]);

    // --- RIFAD-GAP-014 Diagnostic Instrumentation -----------------------------
    // Safe, PII-free snapshot of BOTH concurrent responses, printed here (only
    // around this assertion) so a failure below shows the ACTUAL status/error
    // pair instead of forcing a guess. Only HTTP status, the application-level
    // error code (a fixed enum from ERROR_CODES, never user data), and the
    // static Arabic business message from AppError are logged — never cookies,
    // tokens, PII, raw import data, encrypted values, hashes, or stack traces
    // (the `details` field, which can carry `err.stack` for unhandled errors
    // outside production, is intentionally never logged here).
    const summarizeConcCommitResponse = (res) => ({
      httpStatus: res.status,
      appErrorCode: res.body && res.body.error ? res.body.error.code : null,
      appErrorMessage: res.body && res.body.error ? res.body.error.message : null,
      success: res.body ? res.body.success !== false : null
    });
    console.log('   [GAP-014 DIAGNOSTIC] concCommit1:', JSON.stringify(summarizeConcCommitResponse(concCommit1)));
    console.log('   [GAP-014 DIAGNOSTIC] concCommit2:', JSON.stringify(summarizeConcCommitResponse(concCommit2)));

    // NOTE: .sort((a, b) => a - b) is ascending, so for the two fixed HTTP status
    // constants involved here (200 < 409) the smaller value always lands at index 0.
    // The assertion below checks the statuses in that same ascending order (200 then
    // 409) — matching the array it reads, not the order the two requests were fired in.
    const concCommitStatuses = [concCommit1.status, concCommit2.status].sort((a, b) => a - b);
    assert(concCommitStatuses[0] === 200 && concCommitStatuses[1] === 409, '1+2. Exactly ONE commit request succeeded (200) and exactly ONE was rejected (409)');

    const concCommitWinner = concCommit1.status === 200 ? concCommit1 : concCommit2;
    const concCommitLoser = concCommit1.status === 200 ? concCommit2 : concCommit1;

    assert(concCommitWinner.body.data.status === 'COMMITTED', 'Winning commit request returned status COMMITTED');
    assert(concCommitWinner.body.data.insertedCount === 1, 'Winning commit request inserted exactly 1 teacher record');
    assert(concCommitLoser.body.error.code === 'CONFLICT', '7. Losing commit request received a clean business-state error (CONFLICT), not a raw DB error');
    const concCommitLoserBodyText = JSON.stringify(concCommitLoser.body);
    assert(!/prisma|postgres|P2002|P2025|constraint|duplicate key/i.test(concCommitLoserBodyText), '7. Losing response does not leak raw Prisma/Postgres error details');

    // 3. Batch ends COMMITTED
    const concTchBatchFinal = await prisma.importBatch.findUnique({ where: { id: concTchBatchId } });
    assert(concTchBatchFinal.status === 'COMMITTED', '3. Final batch status in the database is COMMITTED');

    // 4+5. Teacher operational row created exactly once — no duplicate Teacher from the race
    const concTeachers = await prisma.teacher.findMany({
      where: { schoolId: schoolA.id, employeeNumber: 'EMP-CONC-001' }
    });
    assert(concTeachers.length === 1, '4+5. Exactly ONE Teacher row was created despite two concurrent commit requests (no duplicate)');

    // 8. Commit audit event occurs exactly once
    const concCommitAuditLogs = await prisma.auditLog.findMany({
      where: { entityId: concTchBatchId, eventType: 'IMPORT_BATCH_COMMITTED' }
    });
    assert(concCommitAuditLogs.length === 1, '8. Exactly ONE IMPORT_BATCH_COMMITTED audit event was created (no false success from the losing request)');

    // 10. PII encryption remains intact for the record created by the winning request
    assert(concTeachers[0].nationalIdEncrypted !== CONC_NATIONAL_ID, '10. National ID is not stored in plaintext (encryption intact)');
    assert(decryptText(concTeachers[0].nationalIdEncrypted) === CONC_NATIONAL_ID, '10. National ID decrypts correctly with AES-256-GCM (encryption intact)');

    // ----------------------------------------------------
    // TEST 11: Multi-Tenancy Scope Violation
    // ----------------------------------------------------
    console.log('\n--- 14. Multi-Tenancy Scope Violation (School A Admin -> School B) ---');
    const crossSchoolUploadRes = await request(app)
      .post(`/api/v1/import/batches`)
      .set('Cookie', adminCookie)
      .send({
        schoolId: schoolB.id,
        entityType: 'STUDENTS',
        originalFileName: 'unauthorized.xlsx'
      });

    assert(crossSchoolUploadRes.status === 403, 'Cross-school batch creation blocked (403 Forbidden)');
    assert(crossSchoolUploadRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Returns FORBIDDEN_SCOPE_VIOLATION');

    // ----------------------------------------------------
    // TEST 12: Audit Logging Completeness
    // ----------------------------------------------------
    console.log('\n--- 15. Audit Logging Completeness for Production Import ---');
    const importAuditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: schoolA.id,
        eventType: {
          in: [
            'IMPORT_BATCH_CREATED',
            'IMPORT_FILE_UPLOADED',
            'IMPORT_BATCH_VALIDATED',
            'IMPORT_BATCH_COMMITTED'
          ]
        }
      }
    });

    assert(importAuditLogs.length >= 4, 'All production import lifecycle events recorded in audit_logs');
    console.log(`  - Verified ${importAuditLogs.length} import audit logs for School A.`);

    console.log('\n--- 16. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PRODUCTION IMPORT TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Production Import Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test import data, users, and schools...');
    try {
      await prisma.importError.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importRecord.deleteMany({ where: { batch: { schoolId: { in: createdSchoolIds } } } });
      await prisma.importBatch.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      // RIFAD-GAP-011 Phase 0D.2: the new existing-Guardian consistency tests
      // (D/E/F) commit real Guardian/StudentGuardian rows end-to-end via the
      // live API, unlike Phase 0D.1's tests which never advanced past a
      // rejected validate. Both must be deleted before Student (StudentGuardian
      // -> Student and -> Guardian are onDelete: Restrict in the schema).
      await prisma.studentGuardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.guardian.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.student.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.teacher.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
      await prisma.specialization.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
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

      const [remainingBatches, remainingTeachers, remainingSchools, remainingGuardians, remainingStudentGuardians] = await Promise.all([
        prisma.importBatch.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.teacher.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } }),
        prisma.guardian.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.studentGuardian.count({ where: { schoolId: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingBatches === 0 && remainingTeachers === 0 && remainingSchools === 0,
        '12. Cleanup succeeded — no orphaned import batch/teacher/school test data remains (including the GAP-014 concurrency-test batch)'
      );
      assert(
        remainingGuardians === 0 && remainingStudentGuardians === 0,
        'L (Phase 0D.2 cleanup): No orphaned Guardian or StudentGuardian test data remains from the existing-Guardian consistency tests'
      );

      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runImportProductionTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runImportProductionTestSuite };
