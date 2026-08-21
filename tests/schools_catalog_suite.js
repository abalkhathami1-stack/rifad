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

const SCHOOL_FIELD_WHITELIST = ['id', 'code', 'nameAr', 'nameEn', 'isActive'];

async function createEphemeralScopedUser(prisma, { roleCode, scopeType, schoolId, sectionDivisionId = null, label }) {
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

async function loginAs(request, app, { username, password }) {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${username} with status ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const cookie = res.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];
  return cookie;
}

/**
 * Targeted suite for Gap B: GET /api/v1/schools — the new read-only, RBAC- and
 * scope-filtered Schools catalog used to populate school selectors in Users &
 * Roles Management. Uses ephemeral schools/users/sections only; never touches
 * the real platform.owner account.
 */
async function runSchoolsCatalogTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING SCHOOLS CATALOG (Gap B) BACKEND SUITE');
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
  const createdSectionIds = [];
  const createdUserIds = [];
  let ephemeralOwner = null;

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);
    assert(Boolean(ownerCookie), 'Platform Owner logs in successfully');

    // 2. Ephemeral fixture schools: A, B active; C soft-deleted; D inactive
    console.log('\n--- 2. Create Fixture Schools (A active, B active, C deleted, D inactive) ---');
    const ts = Date.now();
    const schoolA = await prisma.school.create({ data: { code: `SCH_A_${ts}`, nameAr: 'مدرسة الاختبار أ', nameEn: 'Test School A', isActive: true } });
    const schoolB = await prisma.school.create({ data: { code: `SCH_B_${ts}`, nameAr: 'مدرسة الاختبار ب', nameEn: 'Test School B', isActive: true } });
    const schoolC = await prisma.school.create({ data: { code: `SCH_C_${ts}`, nameAr: 'مدرسة الاختبار ج (محذوفة)', nameEn: 'Test School C', isActive: true } });
    const schoolD = await prisma.school.create({ data: { code: `SCH_D_${ts}`, nameAr: 'مدرسة الاختبار د (غير نشطة)', nameEn: 'Test School D', isActive: false } });
    createdSchoolIds.push(schoolA.id, schoolB.id, schoolC.id, schoolD.id);
    await prisma.school.update({ where: { id: schoolC.id }, data: { deletedAt: new Date() } });
    assert(createdSchoolIds.length === 4, 'Fixture schools A/B/C/D created');

    const section = await prisma.schoolSection.create({
      data: { schoolId: schoolA.id, genderType: 'BOYS', nameAr: 'قسم اختبار أ' }
    });
    createdSectionIds.push(section.id);

    // 3. Unauthenticated -> 401
    console.log('\n--- 3. Unauthenticated Request Rejected ---');
    const unauthRes = await request(app).get('/api/v1/schools');
    assert(unauthRes.status === 401, 'Unauthenticated request to GET /api/v1/schools returns 401');

    // 4. Authenticated, no users.manage_roles -> 403
    console.log('\n--- 4. Authenticated Without Required Permission Rejected ---');
    const teacherA = await createEphemeralScopedUser(prisma, { roleCode: 'TEACHER', scopeType: 'SCHOOL', schoolId: schoolA.id, label: 'teacher' });
    createdUserIds.push(teacherA.id);
    const teacherCookie = await loginAs(request, app, teacherA);
    const forbiddenRes = await request(app).get('/api/v1/schools').set('Cookie', teacherCookie);
    assert(forbiddenRes.status === 403, 'TEACHER (no users.manage_roles) is rejected with 403');
    assert(forbiddenRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // 5. Authorized platform-level caller -> 200, sees A/B/D, never C (deleted)
    console.log('\n--- 5. Authorized Platform-Level Caller Sees All Non-Deleted Schools ---');
    const ownerListRes = await request(app).get('/api/v1/schools').set('Cookie', ownerCookie);
    assert(ownerListRes.status === 200, 'Platform-level caller receives 200 OK');
    const ownerSchoolIds = ownerListRes.body.data.schools.map(s => s.id);
    assert(ownerSchoolIds.includes(schoolA.id), 'Platform-level caller sees School A');
    assert(ownerSchoolIds.includes(schoolB.id), 'Platform-level caller sees School B');
    assert(!ownerSchoolIds.includes(schoolC.id), 'Platform-level caller never sees soft-deleted School C');
    const schoolDInList = ownerListRes.body.data.schools.find(s => s.id === schoolD.id);
    assert(Boolean(schoolDInList), 'Platform-level caller sees inactive School D (not hidden)');
    assert(schoolDInList.isActive === false, 'Inactive School D is correctly flagged isActive: false');

    // 6. Response shape: no sensitive / extraneous fields
    console.log('\n--- 6. Response Shape Contains Only Whitelisted Fields ---');
    const allKeysWhitelisted = ownerListRes.body.data.schools.every(
      s => Object.keys(s).every(k => SCHOOL_FIELD_WHITELIST.includes(k))
    );
    assert(allKeysWhitelisted, 'Every school entry contains only id/code/nameAr/nameEn/isActive — no students/users/roleAssignments/auditLogs/etc.');

    // 7. School Admin A sees School A only, never School B
    console.log('\n--- 7. School-Scoped Caller Sees Only Their Own School ---');
    const adminA = await createEphemeralScopedUser(prisma, { roleCode: 'SCHOOL_ADMIN', scopeType: 'SCHOOL', schoolId: schoolA.id, label: 'admin-a' });
    createdUserIds.push(adminA.id);
    const adminACookie = await loginAs(request, app, adminA);
    const adminAListRes = await request(app).get('/api/v1/schools').set('Cookie', adminACookie);
    assert(adminAListRes.status === 200, 'School Admin A receives 200 OK');
    assert(adminAListRes.body.data.schools.length === 1, 'School Admin A sees exactly one school');
    assert(adminAListRes.body.data.schools[0].id === schoolA.id, 'School Admin A sees School A');
    assert(!adminAListRes.body.data.schools.some(s => s.id === schoolB.id), 'School Admin A never sees School B');

    // 8. No client-controlled scope escalation via query manipulation
    console.log('\n--- 8. No Client-Controlled Scope Escalation ---');
    const escalationRes = await request(app).get(`/api/v1/schools?schoolId=${schoolB.id}`).set('Cookie', adminACookie);
    assert(escalationRes.status === 200, 'Query-string manipulation does not error, but also does not widen scope');
    assert(escalationRes.body.data.schools.length === 1 && escalationRes.body.data.schools[0].id === schoolA.id, 'A crafted schoolId query parameter cannot be used to view School B — endpoint reads visibility purely from server-side scopes');

    // 9. Section-scoped caller never exceeds their own school
    console.log('\n--- 9. Section-Scoped Caller Never Exceeds Their School ---');
    // Uses a caller holding users.manage_roles (required to reach this endpoint
    // at all) but assigned at SECTION scope, to directly exercise the SECTION
    // code path against this specific endpoint's scope filter.
    const sectionAdmin = await createEphemeralScopedUser(prisma, {
      roleCode: 'SCHOOL_ADMIN', scopeType: 'SECTION', schoolId: schoolA.id, sectionDivisionId: section.id, label: 'section-admin'
    });
    createdUserIds.push(sectionAdmin.id);
    const sectionAdminCookie = await loginAs(request, app, sectionAdmin);
    const sectionListRes = await request(app).get('/api/v1/schools').set('Cookie', sectionAdminCookie);
    assert(sectionListRes.status === 200, 'Section-scoped caller receives 200 OK');
    assert(sectionListRes.body.data.schools.length === 1, 'Section-scoped caller sees exactly one school');
    assert(sectionListRes.body.data.schools[0].id === schoolA.id, 'Section-scoped caller sees only the school tied to their section');
    assert(!sectionListRes.body.data.schools.some(s => s.id === schoolB.id), 'Section-scoped caller never sees an unrelated school');

    console.log('\n--- 10. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} SCHOOLS CATALOG TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Schools Catalog Test Suite Failed:', error);
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
  runSchoolsCatalogTestSuite().catch(() => process.exit(1));
}

module.exports = { runSchoolsCatalogTestSuite };
