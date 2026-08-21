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

/**
 * Targeted suite for Gap A: POST /api/v1/users must enforce an 8-character
 * minimum password server-side (UsersService.createUser), independent of any
 * Frontend validation. Uses ephemeral users/schools only; never touches the
 * real platform.owner account.
 */
async function runPasswordPolicyTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING PASSWORD POLICY (Gap A) BACKEND SUITE');
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

  const createdUserIds = [];
  let ephemeralOwner = null;
  let ephemeralTeacherId = null;

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);
    assert(Boolean(ownerCookie), 'Platform Owner logs in successfully');

    // 2. Weak password (< 8 chars) rejected
    console.log('\n--- 2. Weak Password Rejected ---');
    const weakUsername = `pwtest.weak.${Date.now()}`;
    const weakRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({ username: weakUsername, password: '1234567', fullName: 'اختبار كلمة مرور ضعيفة' });

    assert(weakRes.status === 400, 'Password shorter than 8 characters is rejected with 400');
    assert(weakRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR for weak password');
    assert(!JSON.stringify(weakRes.body).includes('1234567'), 'Rejected raw password is not echoed back anywhere in the error response');
    const weakUserExists = await prisma.user.findFirst({ where: { username: weakUsername } });
    assert(!weakUserExists, 'No user record was created for the rejected weak-password request');

    // 3. Exactly 8 characters accepted
    console.log('\n--- 3. Exactly 8-Character Password Accepted ---');
    const exact8Username = `pwtest.exact8.${Date.now()}`;
    const exact8Res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({ username: exact8Username, password: '12345678', fullName: 'اختبار كلمة مرور من 8 خانات' });

    assert(exact8Res.status === 201, 'Password with exactly 8 characters is accepted (201)');
    createdUserIds.push(exact8Res.body.data.user.id);

    // 4. Longer password accepted
    console.log('\n--- 4. Longer Password Accepted ---');
    const longUsername = `pwtest.long.${Date.now()}`;
    const longPassword = 'ThisIsALongEnoughPassword2026!';
    const longRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({ username: longUsername, password: longPassword, fullName: 'اختبار كلمة مرور طويلة' });

    assert(longRes.status === 201, 'Password longer than 8 characters is accepted (201)');
    createdUserIds.push(longRes.body.data.user.id);

    // 5. No password / passwordHash leak in success responses
    console.log('\n--- 5. No password/passwordHash Leak in Success Response ---');
    const longBodyStr = JSON.stringify(longRes.body);
    assert(longRes.body.data.user.password === undefined, 'Response never includes a raw "password" field');
    assert(longRes.body.data.user.passwordHash === undefined, 'Response never includes a "passwordHash" field');
    assert(!longBodyStr.includes(longPassword), 'The raw password value never appears anywhere in the response body');

    const persistedUser = await prisma.user.findUnique({ where: { id: longRes.body.data.user.id } });
    assert(persistedUser.passwordHash.startsWith('$argon2id$'), 'Password is persisted as an Argon2id hash, never plaintext');
    assert(await argon2.verify(persistedUser.passwordHash, longPassword), 'Persisted hash verifies against the original password');

    // 6. Unauthorized caller (no users.create permission) -> 403
    console.log('\n--- 6. Unauthorized Caller (no users.create) Rejected with 403 ---');
    const teacherRole = await prisma.role.findFirst({ where: { code: 'TEACHER' } });
    if (!teacherRole) throw new Error('Setup Failed: TEACHER role not found in database');

    const teacherSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const teacherUsername = `test.ephemeral.teacher.${teacherSuffix}`;
    const teacherPassword = `TestPass_${teacherSuffix}!Teacher`;
    const teacherPasswordHash = await argon2.hash(teacherPassword, {
      type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4
    });

    const teacherUser = await prisma.user.create({
      data: { username: teacherUsername, passwordHash: teacherPasswordHash, fullName: 'معلم تجريبي مؤقت', status: 'ACTIVE' }
    });
    ephemeralTeacherId = teacherUser.id;
    // TEACHER never holds users.create in the permission seed — this exercises
    // the permission gate itself, not multi-tenancy (already covered elsewhere),
    // so scopeType/schoolId are irrelevant here and left minimal.
    await prisma.userRoleAssignment.create({
      data: { userId: teacherUser.id, roleId: teacherRole.id, scopeType: 'SCHOOL', schoolId: null }
    });

    const teacherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: teacherUsername, password: teacherPassword });
    assert(teacherLoginRes.status === 200, 'Ephemeral TEACHER logs in successfully');
    const teacherCookie = teacherLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const forbiddenRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', teacherCookie)
      .send({ username: `pwtest.forbidden.${Date.now()}`, password: 'ValidPassword123!', fullName: 'محاولة غير مصرح بها' });

    assert(forbiddenRes.status === 403, 'Caller without users.create permission is rejected with 403');
    assert(forbiddenRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // 7. No sensitive data / stack traces leaked in any error response above
    console.log('\n--- 7. No Sensitive Data Leaked in Error Responses ---');
    [weakRes, forbiddenRes].forEach((res) => {
      assert(res.body.error.stack === undefined, 'Error response never includes a stack trace');
      assert(typeof res.body.error.message === 'string' && res.body.error.message.length > 0, 'Error response includes only a safe, human-readable message');
    });

    console.log('\n--- 8. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} PASSWORD POLICY TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Password Policy Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test users...');
    try {
      for (const uid of createdUserIds) {
        await prisma.userSession.deleteMany({ where: { userId: uid } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { entityId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }
      if (ephemeralTeacherId) {
        await prisma.userSession.deleteMany({ where: { userId: ephemeralTeacherId } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: ephemeralTeacherId } });
        await prisma.auditLog.deleteMany({ where: { entityId: ephemeralTeacherId } });
        await prisma.user.deleteMany({ where: { id: ephemeralTeacherId } });
      }
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runPasswordPolicyTestSuite().catch(() => process.exit(1));
}

module.exports = { runPasswordPolicyTestSuite };
