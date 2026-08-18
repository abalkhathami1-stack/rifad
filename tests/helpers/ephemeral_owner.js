const argon2 = require('argon2');

/**
 * Unified Test Helper for Ephemeral Platform Owner
 * Guarantees 100% isolation from the real seed `platform.owner` account.
 */

async function captureRealPlatformOwnerBaseline(prisma) {
  const realOwner = await prisma.user.findFirst({
    where: { username: 'platform.owner' },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      roleAssignments: {
        select: { id: true, roleId: true, scopeType: true }
      }
    }
  });

  if (!realOwner) {
    throw new Error('Baseline Check Failed: platform.owner user not found in database');
  }

  const now = new Date();
  const activeSessionsCount = await prisma.userSession.count({
    where: {
      userId: realOwner.id,
      isRevoked: false,
      expiresAt: { gt: now }
    }
  });

  return {
    id: realOwner.id,
    username: realOwner.username,
    passwordHash: realOwner.passwordHash,
    status: realOwner.status,
    failedLoginAttempts: realOwner.failedLoginAttempts,
    lockedUntil: realOwner.lockedUntil,
    activeSessionsCount,
    roleAssignmentsCount: realOwner.roleAssignments.length
  };
}

async function createEphemeralPlatformOwner(prisma) {
  const platformOwnerRole = await prisma.role.findFirst({
    where: { code: 'PLATFORM_OWNER' }
  });

  if (!platformOwnerRole) {
    throw new Error('Setup Failed: PLATFORM_OWNER role not found in database');
  }

  const suffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const username = `test.ephemeral.owner.${suffix}`;
  const password = `TestPass_${suffix}!EphemeralOwner`;

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4
  });

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      fullName: 'مالك منصة تجريبي مؤقت',
      status: 'ACTIVE'
    }
  });

  const roleAssignment = await prisma.userRoleAssignment.create({
    data: {
      userId: user.id,
      roleId: platformOwnerRole.id,
      scopeType: 'PLATFORM'
    }
  });

  return {
    user,
    id: user.id,
    username,
    password,
    passwordHash,
    roleAssignment
  };
}

async function loginEphemeralPlatformOwner(request, app, ephemeralOwner) {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      username: ephemeralOwner.username,
      password: ephemeralOwner.password
    });

  if (loginRes.status !== 200) {
    throw new Error(`Ephemeral Platform Owner login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  const setCookie = loginRes.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('No Set-Cookie header returned for Ephemeral Platform Owner login');
  }

  const sessionCookieStr = setCookie.find(c => c.startsWith('rifad_session='));
  if (!sessionCookieStr) {
    throw new Error('rifad_session cookie not found in response');
  }

  const cookie = sessionCookieStr.split(';')[0];
  return {
    cookie,
    response: loginRes,
    user: loginRes.body.data?.user
  };
}

async function cleanupEphemeralPlatformOwner(prisma, ephemeralOwner) {
  if (!ephemeralOwner) return;

  const userId = typeof ephemeralOwner === 'string' ? ephemeralOwner : (ephemeralOwner.id || ephemeralOwner.user?.id);
  const username = typeof ephemeralOwner === 'string' ? null : (ephemeralOwner.username || ephemeralOwner.user?.username);

  if (!userId) return;

  try {
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId } });

    if (username && username.startsWith('test.ephemeral.')) {
      await prisma.loginAttempt.deleteMany({ where: { username } });
    }

    await prisma.user.deleteMany({ where: { id: userId } });
  } catch (err) {
    console.error(`⚠️ Warning during ephemeral owner cleanup (${userId}):`, err.message);
  }
}

async function verifyRealPlatformOwnerZeroTouch(prisma, baseline, assertFn) {
  if (!baseline) return;

  const realOwner = await prisma.user.findFirst({
    where: { username: 'platform.owner' },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      roleAssignments: {
        select: { id: true, roleId: true, scopeType: true }
      }
    }
  });

  const now = new Date();
  const activeSessions = await prisma.userSession.count({
    where: {
      userId: baseline.id,
      isRevoked: false,
      expiresAt: { gt: now }
    }
  });

  const isHashUntouched = realOwner.passwordHash === baseline.passwordHash;
  const isStatusActive = realOwner.status === 'ACTIVE';
  const isNoNewActiveSessions = activeSessions === 0;
  const isRolesUntouched = realOwner.roleAssignments.length === baseline.roleAssignmentsCount;

  if (typeof assertFn === 'function') {
    assertFn(isHashUntouched, 'Zero-Touch: Real platform.owner passwordHash was NOT touched or modified');
    assertFn(isNoNewActiveSessions, 'Zero-Touch: 0 active sessions exist for real platform.owner');
    assertFn(isStatusActive, 'Zero-Touch: Real platform.owner status remains ACTIVE');
    assertFn(isRolesUntouched, 'Zero-Touch: Real platform.owner roles remained untouched');
  }

  return {
    isHashUntouched,
    isStatusActive,
    isNoNewActiveSessions,
    isRolesUntouched,
    currentActiveSessions: activeSessions
  };
}

module.exports = {
  captureRealPlatformOwnerBaseline,
  createEphemeralPlatformOwner,
  loginEphemeralPlatformOwner,
  cleanupEphemeralPlatformOwner,
  verifyRealPlatformOwnerZeroTouch
};
