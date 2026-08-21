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

async function createEphemeralPlainUser(prisma, label) {
  const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const username = `test.ephemeral.${label}.${suffix}`;
  const passwordHash = await argon2.hash(`TestPass_${suffix}!${label}`, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
  const user = await prisma.user.create({
    data: { username, passwordHash, fullName: `مستخدم تجريبي مؤقت (${label})`, status: 'ACTIVE' }
  });
  return { id: user.id, username };
}

async function loginAs(request, app, { username, password }) {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${username} with status ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];
  return cookie;
}

/**
 * Targeted suite for the sectionDivisionId <-> schoolId Backend gap closed in
 * UsersService.createUser / assignRole (see Gap Report). Uses ephemeral
 * schools/sections/users only; never touches the real platform.owner account.
 */
async function runUsersSectionScopeTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING SECTION SCOPE BACKEND FIX SUITE');
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

  function assertSafeErrorResponse(res, label) {
    assert(res.body.error && res.body.error.stack === undefined, `${label}: no stack trace leaked`);
    const bodyStr = JSON.stringify(res.body);
    assert(
      !/PrismaClient|P2003|invalid input syntax|node_modules|at Object\./i.test(bodyStr),
      `${label}: no raw Prisma/SQL/stack content leaked`
    );
  }

  const createdSchoolIds = [];
  const createdSectionIds = [];
  const createdUserIds = [];
  let ephemeralOwner = null;

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);
    assert(Boolean(ownerCookie), 'Platform Owner logs in successfully');

    console.log('\n--- 2. Fixture Schools & Sections ---');
    const ts = Date.now();
    const schoolA = await prisma.school.create({ data: { code: `SEC_A_${ts}`, nameAr: 'مدرسة القسم أ', nameEn: 'Section Test School A', isActive: true } });
    const schoolB = await prisma.school.create({ data: { code: `SEC_B_${ts}`, nameAr: 'مدرسة القسم ب', nameEn: 'Section Test School B', isActive: true } });
    createdSchoolIds.push(schoolA.id, schoolB.id);

    const sectionA = await prisma.schoolSection.create({ data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم أ صحيح' } });
    const sectionB = await prisma.schoolSection.create({ data: { schoolId: schoolB.id, genderType: 'BOYS', nameAr: 'قسم ب' } });
    const sectionDeleted = await prisma.schoolSection.create({ data: { schoolId: schoolA.id, genderType: 'GIRLS', nameAr: 'قسم محذوف' } });
    createdSectionIds.push(sectionA.id, sectionB.id, sectionDeleted.id);
    await prisma.schoolSection.update({ where: { id: sectionDeleted.id }, data: { deletedAt: new Date() } });

    assert(Boolean(sectionA.id) && Boolean(sectionB.id) && Boolean(sectionDeleted.id), 'Fixture schools & sections created (A valid, B cross-school, deleted)');

    // 3. Valid SECTION role assignment -> success
    console.log('\n--- 3. Valid SECTION Role Assignment Succeeds ---');
    const targetForAssign = await createEphemeralPlainUser(prisma, 'assign-target');
    createdUserIds.push(targetForAssign.id);
    const validAssignRes = await request(app)
      .post(`/api/v1/users/${targetForAssign.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionA.id });
    assert(validAssignRes.status === 201, 'Valid SECTION assignRole (School A + Section A) succeeds with 201');
    assert(validAssignRes.body.data.assignment.sectionDivisionId === sectionA.id, 'Created assignment carries the correct sectionDivisionId');
    assert(validAssignRes.body.data.assignment.schoolId === schoolA.id, 'Created assignment carries the correct schoolId');

    // 4. Valid SECTION create user -> success
    console.log('\n--- 4. Valid SECTION Create User Succeeds ---');
    const validCreateRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: `sectest.create.${ts}`, password: 'ValidPassword123!', fullName: 'مستخدم قسم صحيح',
        roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionA.id
      });
    assert(validCreateRes.status === 201, 'POST /users supports direct SECTION-scope creation (201)');
    createdUserIds.push(validCreateRes.body.data.user.id);
    const createdAssignment = validCreateRes.body.data.user.roleAssignments.find(a => a.role.code === 'TEACHER');
    assert(Boolean(createdAssignment) && createdAssignment.sectionDivisionId === sectionA.id, 'Created user carries correct SECTION-scope assignment');

    // 5. SECTION without schoolId -> rejected
    console.log('\n--- 5. SECTION Without schoolId Rejected ---');
    const target5 = await createEphemeralPlainUser(prisma, 'no-school');
    createdUserIds.push(target5.id);
    const noSchoolRes = await request(app)
      .post(`/api/v1/users/${target5.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', sectionDivisionId: sectionA.id });
    assert(noSchoolRes.status === 400, 'SECTION without schoolId rejected with 400');
    assert(noSchoolRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

    // 6. SECTION without sectionDivisionId -> rejected
    console.log('\n--- 6. SECTION Without sectionDivisionId Rejected ---');
    const target6 = await createEphemeralPlainUser(prisma, 'no-section');
    createdUserIds.push(target6.id);
    const noSectionRes = await request(app)
      .post(`/api/v1/users/${target6.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id });
    assert(noSectionRes.status === 400, 'SECTION without sectionDivisionId rejected with 400');
    assert(noSectionRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

    // 7. School A + Section from School B -> rejected
    console.log('\n--- 7. Cross-School Section Rejected ---');
    const target7 = await createEphemeralPlainUser(prisma, 'cross-school');
    createdUserIds.push(target7.id);
    const crossSchoolRes = await request(app)
      .post(`/api/v1/users/${target7.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionB.id });
    assert(crossSchoolRes.status === 400, 'Section belonging to a different school is rejected with 400');
    assert(crossSchoolRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR for cross-school section');
    assertSafeErrorResponse(crossSchoolRes, 'Cross-school section');

    // 8. Non-existing section -> rejected safely
    console.log('\n--- 8. Non-Existing Section Rejected Safely ---');
    const target8 = await createEphemeralPlainUser(prisma, 'nonexistent-section');
    createdUserIds.push(target8.id);
    const nonexistentRes = await request(app)
      .post(`/api/v1/users/${target8.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: '99999999-9999-4999-8999-999999999999' });
    assert(nonexistentRes.status === 400, 'Non-existing (but valid-format) section UUID rejected with 400, not 500');
    assert(nonexistentRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    assertSafeErrorResponse(nonexistentRes, 'Non-existing section');

    // 9. Malformed UUID -> rejected safely, no 500/raw Prisma
    console.log('\n--- 9. Malformed UUID Rejected Safely (No Raw Prisma/500) ---');
    const target9 = await createEphemeralPlainUser(prisma, 'malformed-uuid');
    createdUserIds.push(target9.id);
    const malformedRes = await request(app)
      .post(`/api/v1/users/${target9.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: "not-a-real-uuid'); DROP TABLE users; --" });
    assert(malformedRes.status === 400, 'Malformed sectionDivisionId rejected with 400 (never reaches Prisma)');
    assert(malformedRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    assertSafeErrorResponse(malformedRes, 'Malformed UUID');

    // 10. Soft-deleted section -> rejected
    console.log('\n--- 10. Soft-Deleted Section Rejected ---');
    const target10 = await createEphemeralPlainUser(prisma, 'deleted-section');
    createdUserIds.push(target10.id);
    const deletedSectionRes = await request(app)
      .post(`/api/v1/users/${target10.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionDeleted.id });
    assert(deletedSectionRes.status === 400, 'Soft-deleted section rejected with 400');
    assert(deletedSectionRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR for soft-deleted section');

    // 11. SCHOOL scope with sectionDivisionId -> rejected (not silently ignored)
    console.log('\n--- 11. SCHOOL Scope With sectionDivisionId Rejected ---');
    const target11 = await createEphemeralPlainUser(prisma, 'school-with-section');
    createdUserIds.push(target11.id);
    const schoolWithSectionRes = await request(app)
      .post(`/api/v1/users/${target11.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SCHOOL', schoolId: schoolA.id, sectionDivisionId: sectionA.id });
    assert(schoolWithSectionRes.status === 400, 'SCHOOL scope with a sectionDivisionId is rejected with 400 (not silently dropped)');
    assert(schoolWithSectionRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

    // 12. PLATFORM scope with sectionDivisionId -> rejected (not silently ignored)
    console.log('\n--- 12. PLATFORM Scope With sectionDivisionId Rejected ---');
    const target12 = await createEphemeralPlainUser(prisma, 'platform-with-section');
    createdUserIds.push(target12.id);
    const platformWithSectionRes = await request(app)
      .post(`/api/v1/users/${target12.id}/roles`)
      .set('Cookie', ownerCookie)
      .send({ roleCode: 'AUDITOR', scopeType: 'PLATFORM', sectionDivisionId: sectionA.id });
    assert(platformWithSectionRes.status === 400, 'PLATFORM scope with a sectionDivisionId is rejected with 400 (not silently dropped)');
    assert(platformWithSectionRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');

    // 13. Unauthorized caller -> 403
    console.log('\n--- 13. Unauthorized Caller Rejected with 403 ---');
    const unauthorizedCaller = await createEphemeralScopedUser(prisma, { roleCode: 'TEACHER', scopeType: 'SCHOOL', schoolId: schoolA.id, label: 'no-manage-roles' });
    createdUserIds.push(unauthorizedCaller.id);
    const unauthorizedCookie = await loginAs(request, app, unauthorizedCaller);
    const target13 = await createEphemeralPlainUser(prisma, 'unauthorized-target');
    createdUserIds.push(target13.id);
    const unauthorizedRes = await request(app)
      .post(`/api/v1/users/${target13.id}/roles`)
      .set('Cookie', unauthorizedCookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: sectionA.id });
    assert(unauthorizedRes.status === 403, 'Caller without users.manage_roles is rejected with 403');
    assert(unauthorizedRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // 14. School Admin A cannot create/assign SECTION in School B
    console.log('\n--- 14. School Admin A Cannot Assign/Create SECTION in School B ---');
    const adminA = await createEphemeralScopedUser(prisma, { roleCode: 'SCHOOL_ADMIN', scopeType: 'SCHOOL', schoolId: schoolA.id, label: 'admin-a' });
    createdUserIds.push(adminA.id);
    const adminACookie = await loginAs(request, app, adminA);
    const target14 = await createEphemeralPlainUser(prisma, 'admin-a-target');
    createdUserIds.push(target14.id);
    const adminACrossRes = await request(app)
      .post(`/api/v1/users/${target14.id}/roles`)
      .set('Cookie', adminACookie)
      .send({ roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolB.id, sectionDivisionId: sectionB.id });
    assert(adminACrossRes.status === 403, 'School Admin A cannot assign a SECTION role in School B (403)');
    assert(adminACrossRes.body.error.code === 'FORBIDDEN_SCOPE_VIOLATION', 'Error code is FORBIDDEN_SCOPE_VIOLATION');

    const adminACreateCrossRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminACookie)
      .send({
        username: `sectest.adminacross.${ts}`, password: 'ValidPassword123!', fullName: 'محاولة تجاوز مدرسة',
        roleCode: 'TEACHER', scopeType: 'SECTION', schoolId: schoolB.id, sectionDivisionId: sectionB.id
      });
    assert(adminACreateCrossRes.status === 403, 'School Admin A cannot create a School-B SECTION user via createUser (403)');
    const adminACreateCrossUser = await prisma.user.findFirst({ where: { username: `sectest.adminacross.${ts}` } });
    assert(!adminACreateCrossUser, 'No user record was created for the rejected cross-school createUser attempt');

    // 15. No raw Prisma/stack leak across all rejected requests
    console.log('\n--- 15. No Raw Prisma/Stack Leak Across All Rejected Requests ---');
    [noSchoolRes, noSectionRes, crossSchoolRes, nonexistentRes, malformedRes, deletedSectionRes, schoolWithSectionRes, platformWithSectionRes].forEach((res, i) => {
      assertSafeErrorResponse(res, `Rejected request #${i + 1}`);
    });

    console.log('\n--- 16. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} SECTION SCOPE TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Section Scope Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test users, sections, and schools...');
    try {
      for (const uid of createdUserIds) {
        await prisma.userSession.deleteMany({ where: { userId: uid } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { entityId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }
      for (const sectionId of createdSectionIds) {
        await prisma.userRoleAssignment.updateMany({ where: { sectionDivisionId: sectionId }, data: { sectionDivisionId: null } });
        await prisma.schoolSection.deleteMany({ where: { id: sectionId } });
      }
      for (const sid of createdSchoolIds) {
        await prisma.auditLog.deleteMany({ where: { schoolId: sid } });
        await prisma.school.deleteMany({ where: { id: sid } });
      }
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runUsersSectionScopeTestSuite().catch(() => process.exit(1));
}

module.exports = { runUsersSectionScopeTestSuite };
