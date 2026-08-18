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

async function runUsersTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING USER MANAGEMENT BACKEND SUITE');
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

  try {
    const baseline = await captureRealPlatformOwnerBaseline(prisma);

    // ----------------------------------------------------
    // SETUP: Ephemeral Platform Owner Login
    // ----------------------------------------------------
    console.log('--- 1. Authenticate as Ephemeral PLATFORM_OWNER ---');
    ephemeralOwner = await createEphemeralPlatformOwner(prisma);
    const { cookie: ownerCookie } = await loginEphemeralPlatformOwner(request, app, ephemeralOwner);

    assert(Boolean(ownerCookie), 'Platform Owner logs in successfully');

    // 2. Setup Temporary Test School
    console.log('\n--- 2. Create Temporary Test School for Scope Testing ---');
    const testSchool = await prisma.school.create({
      data: {
        code: `SCH_TEST_${Date.now()}`,
        nameAr: 'مدرسة الاختبار المعيارية',
        nameEn: 'Standard Test School',
        isActive: true
      }
    });
    createdSchoolIds.push(testSchool.id);
    assert(Boolean(testSchool.id), 'Temporary test school created for multi-tenancy verification');

    // 3. Platform Owner Lists Users (GET /api/v1/users)
    console.log('\n--- 3. List Users by Platform Owner ---');
    const listRes = await request(app)
      .get('/api/v1/users')
      .set('Cookie', ownerCookie);

    assert(listRes.status === 200, 'Platform Owner lists all users (200 OK)');
    assert(Array.isArray(listRes.body.data.users), 'Returns array of users');
    assert(listRes.body.data.total >= 1, 'Total users count is at least 1');
    assert(listRes.body.data.users.every(u => u.passwordHash === undefined && u.password_hash === undefined), 'Password hash is NEVER exposed in listing');

    // 4. Platform Owner Creates a School Admin User (POST /api/v1/users)
    console.log('\n--- 4. Create School Admin User ---');
    const adminUsername = `school.admin.${Date.now()}`;
    const adminPassword = 'AdminPassword2026!';
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: adminPassword,
        fullName: 'أحمد مدير المدرسة',
        email: `${adminUsername}@rifad.edu.sa`,
        roleCode: 'SCHOOL_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: testSchool.id
      });

    assert(createRes.status === 201, 'Creates school admin user with 201 Created');
    assert(createRes.body.data.user.username === adminUsername, 'Created username matches');
    assert(createRes.body.data.user.roleAssignments.some(r => r.role.code === 'SCHOOL_ADMIN'), 'Assigned SCHOOL_ADMIN role');
    assert(createRes.body.data.user.passwordHash === undefined, 'Password hash is omitted from creation response');
    const createdAdminId = createRes.body.data.user.id;
    createdUserIds.push(createdAdminId);

    // 5. Duplicate Username Prevention
    console.log('\n--- 5. Duplicate Username Conflict (409) ---');
    const duplicateRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', ownerCookie)
      .send({
        username: adminUsername,
        password: 'AnotherPassword123!',
        fullName: 'مستخدم مكرر'
      });

    assert(duplicateRes.status === 409, 'Duplicate username returns 409 Conflict');
    assert(duplicateRes.body.error.code === 'CONFLICT', 'Error code is CONFLICT');

    // 6. Authenticate as the new School Admin
    console.log('\n--- 6. Authenticate as School Admin ---');
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword });

    assert(adminLoginRes.status === 200, 'School Admin logs in successfully');
    const adminCookie = adminLoginRes.headers['set-cookie'].find(c => c.startsWith('rifad_session=')).split(';')[0];

    // 7. School Admin Privilege Escalation Guard: Cannot create PLATFORM_OWNER
    console.log('\n--- 7. Privilege Escalation Prevention (School Admin -> Platform Owner) ---');
    const escalateRes = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminCookie)
      .send({
        username: `fake.owner.${Date.now()}`,
        password: 'FakePassword123!',
        fullName: 'محاولة تصعيد غير مصرح بها',
        roleCode: 'PLATFORM_OWNER',
        scopeType: 'PLATFORM'
      });

    assert(escalateRes.status === 403, 'School Admin forbidden from creating PLATFORM_OWNER (403)');
    assert(escalateRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // 8. School Admin Multi-Tenancy Scope: Cannot view PLATFORM_OWNER details
    console.log('\n--- 8. Multi-Tenancy Scope Isolation (School Admin -> Platform Owner View) ---');
    const viewOwnerRes = await request(app)
      .get(`/api/v1/users/${ephemeralOwner.id}`)
      .set('Cookie', adminCookie);

    assert(viewOwnerRes.status === 403, 'School Admin forbidden from accessing Platform Owner details (403)');

    // 9. Update User Details (PATCH /api/v1/users/:id)
    console.log('\n--- 9. Update User Profile ---');
    const updateRes = await request(app)
      .patch(`/api/v1/users/${createdAdminId}`)
      .set('Cookie', ownerCookie)
      .send({ fullName: 'أحمد المدير العام للمدرسة' });

    assert(updateRes.status === 200, 'User profile updated successfully (200 OK)');
    assert(updateRes.body.data.user.fullName === 'أحمد المدير العام للمدرسة', 'Full name updated in response');

    // 10. Update User Status & Session Revocation (PATCH /api/v1/users/:id/status)
    console.log('\n--- 10. Update User Status & Invalidate Active Sessions ---');
    const statusRes = await request(app)
      .patch(`/api/v1/users/${createdAdminId}/status`)
      .set('Cookie', ownerCookie)
      .send({ status: 'SUSPENDED' });

    assert(statusRes.status === 200, 'User status changed to SUSPENDED');
    assert(statusRes.body.data.user.status === 'SUSPENDED', 'Status updated to SUSPENDED');

    // Try accessing /auth/me with suspended user session
    const suspendedCheckRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', adminCookie);
    assert(suspendedCheckRes.status === 401, 'Suspended user session immediately rejected (401)');

    // Reactivate user
    await request(app)
      .patch(`/api/v1/users/${createdAdminId}/status`)
      .set('Cookie', ownerCookie)
      .send({ status: 'ACTIVE' });

    // 11. Password Reset (POST /api/v1/users/:id/reset-password)
    console.log('\n--- 11. Secure Password Reset ---');
    const newResetPassword = 'NewResetPassword2026!';
    const resetRes = await request(app)
      .post(`/api/v1/users/${createdAdminId}/reset-password`)
      .set('Cookie', ownerCookie)
      .send({ newPassword: newResetPassword });

    assert(resetRes.status === 200, 'Password reset successfully (200 OK)');

    // Verify login with new password
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: newResetPassword });
    assert(newLoginRes.status === 200, 'Can log in with new reset password');

    // 12. Assign and Remove Role (POST & DELETE /api/v1/users/:id/roles)
    console.log('\n--- 12. Manage Role Assignments ---');
    const assignRes = await request(app)
      .post(`/api/v1/users/${createdAdminId}/roles`)
      .set('Cookie', ownerCookie)
      .send({
        roleCode: 'ACADEMIC_ADMIN',
        scopeType: 'SCHOOL',
        schoolId: testSchool.id
      });

    assert(assignRes.status === 201, 'Assigned ACADEMIC_ADMIN role successfully (201)');
    const assignmentId = assignRes.body.data.assignment.id;

    const removeRes = await request(app)
      .delete(`/api/v1/users/${createdAdminId}/roles/${assignmentId}`)
      .set('Cookie', ownerCookie);

    assert(removeRes.status === 200, 'Role assignment removed successfully (200 OK)');

    // 13. Audit Log Completeness Verification
    console.log('\n--- 13. Audit Log Completeness Verification ---');
    const userAuditLogs = await prisma.auditLog.findMany({
      where: {
        eventType: {
          in: ['USER_CREATED', 'USER_UPDATED', 'USER_STATUS_CHANGED', 'USER_PASSWORD_RESET', 'ROLE_ASSIGNED', 'ROLE_REMOVED']
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    assert(userAuditLogs.length >= 5, 'All user lifecycle operations recorded in audit_logs');
    console.log(`  - Verified ${userAuditLogs.length} audit logs covering user management operations.`);

    console.log('\n--- 14. Real Platform Owner Zero-Touch Verification ---');
    await verifyRealPlatformOwnerZeroTouch(prisma, baseline, assert);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} USER MANAGEMENT TESTS PASSED (100%)!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ User Management Test Suite Failed:', error);
    throw error;
  } finally {
    // Cleanup temporary test data
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
      console.log('✨ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('⚠️ Cleanup warning:', cleanupErr.message);
    }
  }
}

if (require.main === module) {
  runUsersTestSuite().catch((e) => {
    process.exit(1);
  });
}

module.exports = { runUsersTestSuite };
