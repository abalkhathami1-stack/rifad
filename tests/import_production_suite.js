const request = require('supertest');
const xlsx = require('xlsx');
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
    const validStudentData = [
      {
        'first_name_ar': 'عبدالرحمن',
        'second_name_ar': 'خالد',
        'third_name_ar': 'محمد',
        'family_name_ar': 'الغامدي',
        'grade': 'الصف الأول الابتدائي',
        'section': '1-أ',
        'student_code': 'STU-PROD-001'
      },
      {
        'first_name_ar': 'عبدالله',
        'second_name_ar': 'سعد',
        'third_name_ar': 'علي',
        'family_name_ar': 'الشهري',
        'grade': 'الصف الأول الابتدائي',
        'section': '1-أ',
        'student_code': 'STU-PROD-002'
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

      const [remainingBatches, remainingTeachers, remainingSchools] = await Promise.all([
        prisma.importBatch.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.teacher.count({ where: { schoolId: { in: createdSchoolIds } } }),
        prisma.school.count({ where: { id: { in: createdSchoolIds } } })
      ]);
      assert(
        remainingBatches === 0 && remainingTeachers === 0 && remainingSchools === 0,
        '12. Cleanup succeeded — no orphaned import batch/teacher/school test data remains (including the GAP-014 concurrency-test batch)'
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
