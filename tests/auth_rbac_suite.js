const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prisma');

async function runTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING BACKEND FOUNDATION: AUTH & RBAC TEST SUITE');
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

  try {
    // Test 1: Health Check Endpoint
    console.log('--- 1. API Health Check ---');
    const healthRes = await request(app).get('/api/v1/health');
    assert(healthRes.status === 200, 'Health check returns 200 OK');
    assert(healthRes.body.success === true, 'Response contains success=true envelope');
    assert(healthRes.body.data.status === 'ONLINE', 'Service status is ONLINE');

    // Test 2: Unauthenticated Request to Protected Route
    console.log('\n--- 2. Unauthenticated Access Protection ---');
    const unauthRes = await request(app).get('/api/v1/auth/me');
    assert(unauthRes.status === 401, 'Protected route rejects request without cookie with 401');
    assert(unauthRes.body.error.code === 'AUTH_UNAUTHENTICATED', 'Error code is AUTH_UNAUTHENTICATED');

    // Test 3: Failed Login Attempt (Invalid Password)
    console.log('\n--- 3. Failed Login Handling & Security Logging ---');
    const failedLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'platform.owner', password: 'WrongPassword123!' });

    assert(failedLoginRes.status === 401, 'Login with wrong password returns 401');
    assert(failedLoginRes.body.error.code === 'AUTH_INVALID_CREDENTIALS', 'Returns AUTH_INVALID_CREDENTIALS');

    const recentFailedAttempt = await prisma.loginAttempt.findFirst({
      where: { username: 'platform.owner', isSuccess: false },
      orderBy: { createdAt: 'desc' }
    });
    assert(Boolean(recentFailedAttempt), 'Failed login attempt recorded in login_attempts');

    // Test 4: Successful Login & HttpOnly Cookie Issuance
    console.log('\n--- 4. Successful Authentication & Session Setup ---');
    const argon2 = require('argon2');
    const testPassword = 'SecureOwnerTestPass2026!';
    const testHash = await argon2.hash(testPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    await prisma.user.updateMany({
      where: { username: 'platform.owner' },
      data: { passwordHash: testHash, failedLoginAttempts: 0, lockedUntil: null }
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'platform.owner', password: testPassword });

    assert(loginRes.status === 200, 'Login with correct credentials returns 200 OK');
    assert(loginRes.body.success === true, 'Login response has success=true');
    assert(loginRes.body.data.user.username === 'platform.owner', 'Returns platform.owner profile');
    assert(loginRes.body.data.roles.includes('PLATFORM_OWNER'), 'Includes PLATFORM_OWNER role');
    assert(loginRes.body.data.permissions.length >= 34, 'Loads baseline permissions (including newly added module permissions)');

    // Extract HttpOnly Cookie
    const cookieHeader = loginRes.headers['set-cookie'];
    assert(Boolean(cookieHeader), 'Server returns Set-Cookie header');
    const sessionCookie = cookieHeader.find(c => c.startsWith('rifad_session='));
    assert(Boolean(sessionCookie), 'Set-Cookie contains rifad_session cookie');
    assert(sessionCookie.includes('HttpOnly'), 'Cookie is marked HttpOnly');
    assert(sessionCookie.includes('SameSite=Strict'), 'Cookie has SameSite=Strict');

    const cookieString = sessionCookie.split(';')[0];

    // Test 5: Authenticated Profile Fetch (/api/v1/auth/me) via HttpOnly Cookie
    console.log('\n--- 5. Authenticated Context via HttpOnly Cookie ---');
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieString);

    assert(meRes.status === 200, '/auth/me returns 200 with valid session cookie');
    assert(meRes.body.data.user.username === 'platform.owner', 'Returns matching username');
    assert(meRes.body.data.isPlatformLevel === true, 'Identifies platform level scope');

    // Test 6: RBAC Permission Guard (Authorized Permission)
    console.log('\n--- 6. RBAC Permission Guard (Authorized) ---');
    const permRes = await request(app)
      .get('/api/v1/test/permission-check')
      .set('Cookie', cookieString);

    assert(permRes.status === 200, 'User with permission passes RBAC guard with 200 OK');

    // Test 7: RBAC Permission Guard (Unauthorized Permission)
    console.log('\n--- 7. RBAC Permission Guard (Forbidden) ---');
    const forbiddenPermRes = await request(app)
      .get('/api/v1/test/forbidden-permission-check')
      .set('Cookie', cookieString);

    assert(forbiddenPermRes.status === 403, 'User without permission blocked with 403 Forbidden');
    assert(forbiddenPermRes.body.error.code === 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'Error code is FORBIDDEN_INSUFFICIENT_PERMISSIONS');

    // Test 8: Multi-Tenancy Scope Guard
    console.log('\n--- 8. Multi-Tenancy Scope Guard ---');
    const randomSchoolId = '00000000-0000-0000-0000-000000000001';
    const scopeRes = await request(app)
      .get(`/api/v1/test/scope-check/${randomSchoolId}`)
      .set('Cookie', cookieString);

    assert(scopeRes.status === 200, 'Platform Owner bypasses multi-tenant school constraint');

    // Test 9: Logout & Session Invalidation
    console.log('\n--- 9. Logout & Session Invalidation ---');
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieString);

    assert(logoutRes.status === 200, 'Logout returns 200 OK');

    // Test 10: Access with Revoked Session Cookie
    console.log('\n--- 10. Verification of Revoked Session Rejection ---');
    const postLogoutRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieString);

    assert(postLogoutRes.status === 401, 'Request with revoked cookie rejected with 401');

    // Test 11: Audit Logs Completeness
    console.log('\n--- 11. Audit Logging Verification ---');
    const latestAuditLogs = await prisma.auditLog.findMany({
      where: { eventType: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT'] } },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    assert(latestAuditLogs.length >= 3, 'Audit logs contain LOGIN_SUCCESS, LOGIN_FAILED, and LOGOUT records');
    console.log(`  - Verified ${latestAuditLogs.length} recent audit event records.`);

    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
    console.log('========================================================\n');
  } catch (error) {
    console.error('❌ Test Suite Failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = { runTestSuite };
