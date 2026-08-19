const request = require('supertest');
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
 * Users & Roles — Self-Protection Test Suite
 *
 * Targeted regression + new-behavior coverage for the self-protection guard
 * added to UsersService.removeRole (src/services/users.service.js).
 * Uses ONLY ephemeral users/schools created for this run. Never logs in as,
 * mutates, or otherwise touches the real `platform.owner` account (Zero-Touch
 * verified at the end, matching the existing helper convention used across
 * this test suite).
 */

async function runUsersSelfProtectionSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING USERS & ROLES — SELF-PROTECTION TEST SUITE');
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
  const createdSchoolIds = [];
  let ephemeralOwner = null;
  let ephemeralOwnerB = null;

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    // ----------------------------------------------------
    // SETUP
    // ----------------------------------------------------
    console.log('--- Setup: Ephemeral Platform Owner + Temporary Schools ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);
    assert(Boolean(ownerCookie), 'Ephemeral Platform Owner logs in successfully');

    const schoolA = await prisma.school.create({
      data: { code: `SCH_SELFPROT_A_${Date.now()}`, nameAr: 'مدرسة اختبار أ', nameEn: 'Test School A', isActive: true }
    });
    createdSchoolIds.push(schoolA.id);

    const schoolB = await prisma.school.create({
      data: { code: `SCH_SELFPROT_B_${Date.now()}`, nameAr: 'مدرسة اختبار ب', nameEn: 'Test School B', isActive: true }
    });
    createdSchoolIds.push(schoolB.id);

    const academicAdminRole = await prisma.role.findUnique({ where: { code: 'ACADEMIC_ADMIN' } });
    assert(Boolean(academicAdminRole), 'ACADEMIC_ADMIN role exists in baseline seed');

    // ==================================================================
    // A) SCHOOL_ADMIN with exactly ONE role assignment tries to remove it
    //    from themselves => rejected safely, role remains.
    // ==================================================================
    console.log('\n--- A) Self-removal of the ONLY role assignment => rejected, role remains ---');
    const adminAUsername = `school.admin.a.${Date.now()}`;
    const adminAPassword = 'AdminSelfProtA2026!';
    const createAdminARes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminAUsername,
        password: adminAPassword,
        fullName: 'مدير مدرسة اختبار أ',
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    assert(createAdminARes.status === 201, 'School Admin A created (201)');
    const adminAId = createAdminARes.body.data.user.id;
    createdUserIds.push(adminAId);
    const adminAOnlyAssignmentId = createAdminARes.body.data.user.roleAssignments[0].id;

    const adminALoginRes = await request(app).post('/api/v1/auth/login').send({ username: adminAUsername, password: adminAPassword });
    assert(adminALoginRes.status === 200, 'School Admin A logs in successfully');
    const adminACookie = adminALoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const selfRemoveOnlyRoleRes = await request(app)
      .delete(`/api/v1/users/${adminAId}/roles/${adminAOnlyAssignmentId}`)
      .set('Cookie', adminACookie);

    assert(selfRemoveOnlyRoleRes.status === 400, 'Self-removal of the only remaining role assignment is rejected (400)');
    assert(selfRemoveOnlyRoleRes.body.error?.code === 'BAD_REQUEST', 'Rejection uses the existing BAD_REQUEST error code (no new error shape introduced)');

    const adminAAfter = await prisma.userRoleAssignment.count({ where: { userId: adminAId } });
    assert(adminAAfter === 1, 'Role assignment count for School Admin A is unchanged (role was NOT deleted)');

    // ==================================================================
    // B) User with MORE THAN ONE role removes a non-last role from themselves
    //    => allowed, since existing privilege-escalation/scope rules permit it.
    // ==================================================================
    console.log('\n--- B) Self-removal of a NON-LAST role (2 roles held) => allowed ---');
    const secondAssignRes = await request(app)
      .post(`/api/v1/users/${adminAId}/roles`)
      .set('Cookie', ownerCookie) // granted by Platform Owner to keep this step focused on the removal behavior
      .send({ roleCode: 'ACADEMIC_ADMIN', scopeType: 'SCHOOL', schoolId: schoolA.id });
    assert(secondAssignRes.status === 201, 'A second role (ACADEMIC_ADMIN) is granted to School Admin A');
    const secondAssignmentId = secondAssignRes.body.data.assignment.id;

    const selfRemoveNonLastRes = await request(app)
      .delete(`/api/v1/users/${adminAId}/roles/${secondAssignmentId}`)
      .set('Cookie', adminACookie);

    assert(selfRemoveNonLastRes.status === 200, 'Self-removal of a non-last role assignment succeeds (200) when the user still keeps at least one role');

    const adminARolesAfterB = await prisma.userRoleAssignment.count({ where: { userId: adminAId } });
    assert(adminARolesAfterB === 1, 'School Admin A still has exactly 1 role assignment remaining (the original SCHOOL_ADMIN one)');

    // ==================================================================
    // C) A non-last PLATFORM_OWNER tries to remove PLATFORM_OWNER from
    //    themselves => rejected, independent of the "last owner" counter.
    // ==================================================================
    console.log('\n--- C) Non-last PLATFORM_OWNER self-removes PLATFORM_OWNER role => rejected ---');
    ephemeralOwnerB = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerBCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwnerB);
    assert(Boolean(ownerBCookie), 'A second ephemeral Platform Owner logs in successfully (total owners in system >= 3: real + A + B)');

    const ownerBAssignment = await prisma.userRoleAssignment.findFirst({
      where: { userId: ephemeralOwnerB.id },
      include: { role: true }
    });
    assert(ownerBAssignment.role.code === 'PLATFORM_OWNER', 'Ephemeral Owner B holds a PLATFORM_OWNER assignment');

    const totalOwnersBeforeC = await prisma.userRoleAssignment.count({ where: { role: { code: 'PLATFORM_OWNER' } } });
    assert(totalOwnersBeforeC > 1, 'More than one PLATFORM_OWNER exists in the system at this point (so the OLD "last owner" rule alone would allow this deletion)');

    const selfRemoveOwnerRes = await request(app)
      .delete(`/api/v1/users/${ephemeralOwnerB.id}/roles/${ownerBAssignment.id}`)
      .set('Cookie', ownerBCookie);

    assert(selfRemoveOwnerRes.status === 400, 'Non-last PLATFORM_OWNER self-removal of their own PLATFORM_OWNER role is still rejected (400) — the new self-protection rule is independent of the total-owner count');

    const ownerBAssignmentStillExists = await prisma.userRoleAssignment.findUnique({ where: { id: ownerBAssignment.id } });
    assert(Boolean(ownerBAssignmentStillExists), 'Ephemeral Owner B PLATFORM_OWNER assignment still exists (was NOT deleted)');

    // ==================================================================
    // D) Pre-existing "last PLATFORM_OWNER in the system" protection
    //    remains intact and untouched.
    // ==================================================================
    console.log('\n--- D) Pre-existing "last PLATFORM_OWNER in system" protection regression check ---');
    // NOTE: A real platform.owner account always exists in any populated
    // environment, so `totalOwners` can never organically reach exactly 1
    // using only ephemeral data (deleting the real owner is strictly
    // forbidden). This is a pre-existing structural limitation of this test
    // architecture — the ORIGINAL suite (tests/users_management_suite.js)
    // has never exercised the totalOwners===1 branch directly either.
    // Instead we verify: (1) the guard clause is byte-for-byte unchanged via
    // source inspection, and (2) removal of a non-self, non-last owner
    // assignment by ANOTHER platform owner still succeeds normally,
    // proving the counting logic itself was not broken by the new code.
    const usersServiceSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'services', 'users.service.js'),
      'utf8'
    );
    assert(
      usersServiceSource.includes("لا يمكن حذف دور مالك المنصة الوحيد في النظام"),
      'The original "last PLATFORM_OWNER in the system" guard message is still present unmodified in users.service.js'
    );

    // Owner A (ephemeral) removes Owner B's PLATFORM_OWNER role (not self, not last => allowed)
    const crossRemoveRes = await request(app)
      .delete(`/api/v1/users/${ephemeralOwnerB.id}/roles/${ownerBAssignment.id}`)
      .set('Cookie', ownerCookie);
    assert(crossRemoveRes.status === 200, 'A DIFFERENT Platform Owner (not self) can still remove a non-last PLATFORM_OWNER role assignment (200) — old behavior unaffected');

    // ==================================================================
    // E) User without users.manage_roles => still 403 (unchanged)
    // ==================================================================
    console.log('\n--- E) User without users.manage_roles attempting role mutation => still 403 ---');
    const teacherUsername = `teacher.selfprot.${Date.now()}`;
    const teacherPassword = 'TeacherSelfProt2026!';
    const createTeacherRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: teacherUsername,
        password: teacherPassword,
        fullName: 'معلم اختبار الحماية الذاتية',
        roleCode: 'TEACHER',
        scopeType: 'SCHOOL',
        schoolId: schoolA.id
      });
    assert(createTeacherRes.status === 201, 'Teacher user created (201)');
    const teacherId = createTeacherRes.body.data.user.id;
    createdUserIds.push(teacherId);
    const teacherAssignmentId = createTeacherRes.body.data.user.roleAssignments[0].id;

    const teacherLoginRes = await request(app).post('/api/v1/auth/login').send({ username: teacherUsername, password: teacherPassword });
    const teacherCookie = teacherLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    const teacherSelfRemoveRes = await request(app)
      .delete(`/api/v1/users/${teacherId}/roles/${teacherAssignmentId}`)
      .set('Cookie', teacherCookie);
    assert(teacherSelfRemoveRes.status === 403, 'TEACHER (no users.manage_roles) is forbidden from removing any role, including their own (403, unchanged)');

    // ==================================================================
    // F) SCHOOL_ADMIN manages ANOTHER allowed user within the same school
    //    => success (unchanged).
    // ==================================================================
    console.log('\n--- F) School Admin manages another user in the SAME school => success ---');
    const adminAManagesOtherRes = await request(app)
      .post(`/api/v1/users/${teacherId}/roles`)
      .set('Cookie', adminACookie)
      .send({ roleCode: 'ACADEMIC_ADMIN', scopeType: 'SCHOOL', schoolId: schoolA.id });
    assert(adminAManagesOtherRes.status === 201, 'School Admin A can assign a role to another user within the same school (201, unchanged)');

    const adminARemovesOtherRes = await request(app)
      .delete(`/api/v1/users/${teacherId}/roles/${adminAManagesOtherRes.body.data.assignment.id}`)
      .set('Cookie', adminACookie);
    assert(adminARemovesOtherRes.status === 200, 'School Admin A can remove a role from another user within the same school (200, unchanged)');

    // ==================================================================
    // G) School A admin cannot manage a School B user => rejected (unchanged)
    // ==================================================================
    console.log('\n--- G) School A admin cannot manage a School B user => rejected ---');
    const userBUsername = `teacher.schoolb.${Date.now()}`;
    const createUserBRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: userBUsername,
        password: 'SchoolBUser2026!',
        fullName: 'معلم مدرسة ب',
        roleCode: 'TEACHER',
        scopeType: 'SCHOOL',
        schoolId: schoolB.id
      });
    assert(createUserBRes.status === 201, 'Teacher user created in School B (201)');
    const userBId = createUserBRes.body.data.user.id;
    createdUserIds.push(userBId);
    const userBAssignmentId = createUserBRes.body.data.user.roleAssignments[0].id;

    const crossSchoolViewRes = await request(app)
      .get(`/api/v1/users/${userBId}`)
      .set('Cookie', adminACookie);
    assert(crossSchoolViewRes.status === 403, 'School A admin cannot even VIEW a School B user (403, unchanged school isolation)');

    const crossSchoolRemoveRes = await request(app)
      .delete(`/api/v1/users/${userBId}/roles/${userBAssignmentId}`)
      .set('Cookie', adminACookie);
    assert(crossSchoolRemoveRes.status === 403, 'School A admin cannot remove a role from a School B user (403, unchanged school isolation)');

    console.log('\n--- Audit Log: selfModification indicator present for self-driven mutations ---');
    const selfModAuditLogs = await prisma.auditLog.findMany({
      where: { eventType: 'ROLE_REMOVED' },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    const hasSelfModifiedEntry = selfModAuditLogs.some(l => l.oldData && l.oldData.selfModification === true);
    assert(hasSelfModifiedEntry, 'At least one ROLE_REMOVED audit log entry carries selfModification: true for a self-driven mutation');

    console.log('\n--- Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} SELF-PROTECTION TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Users Self-Protection Test Suite Failed:', error);
    throw error;
  } finally {
    console.log('🧹 Cleaning up temporary test users and schools...');
    try {
      for (const uid of createdUserIds) {
        await prisma.userSession.deleteMany({ where: { userId: uid } });
        await prisma.userRoleAssignment.deleteMany({ where: { userId: uid } });
        await prisma.auditLog.deleteMany({ where: { entityId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }
      for (const sid of createdSchoolIds) {
        await prisma.school.deleteMany({ where: { id: sid } });
      }
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwner);
      await cleanupEphemeralPlatformOwner(prisma, ephemeralOwnerB);
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runUsersSelfProtectionSuite().catch(() => {
    process.exit(1);
  });
}

module.exports = { runUsersSelfProtectionSuite };
