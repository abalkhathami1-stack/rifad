const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient();

async function bootstrapPlatformOwner() {
  console.log('🔒 Initializing PLATFORM_OWNER Bootstrap Procedure...');

  // 1. Check if a PLATFORM_OWNER already exists
  const existingOwnerRole = await prisma.role.findUnique({
    where: { code: 'PLATFORM_OWNER' }
  });

  if (!existingOwnerRole) {
    throw new Error('❌ Role [PLATFORM_OWNER] does not exist in the database. Please run seed baseline first.');
  }

  const existingAssignment = await prisma.userRoleAssignment.findFirst({
    where: {
      roleId: existingOwnerRole.id,
      scopeType: 'PLATFORM'
    },
    include: {
      user: true
    }
  });

  if (existingAssignment) {
    console.log(`⚠️ [ABORTED] A PLATFORM_OWNER already exists (User: ${existingAssignment.user.username}). Multiple bootstrap owners are strictly prohibited.`);
    return {
      status: 'ALREADY_EXISTS',
      user: existingAssignment.user.username
    };
  }

  // 2. Read bootstrap credentials securely from environment variables
  const username = process.env.BOOTSTRAP_OWNER_USERNAME || 'platform.owner';
  const rawPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || crypto.randomBytes(16).toString('hex') + '!Aa1';
  const email = process.env.BOOTSTRAP_OWNER_EMAIL || null;
  const fullName = process.env.BOOTSTRAP_OWNER_NAME || 'مالك المنصة النظامي';

  // Check if username is already taken
  const existingUser = await prisma.user.findFirst({
    where: { username, deletedAt: null }
  });

  if (existingUser) {
    throw new Error(`❌ Username [${username}] is already taken by another active user.`);
  }

  // 3. Hash password with Argon2id (OWASP & NIST recommended parameters)
  console.log('🔑 Hashing password using Argon2id algorithm...');
  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4     // 4 threads
  });

  const requestId = `req_bootstrap_${crypto.randomUUID()}`;

  // 4. Atomic Transaction: Create User + Assign PLATFORM_OWNER Role + Write AuditLog
  console.log('⚡ Executing atomic database transaction...');
  const result = await prisma.$transaction(async (tx) => {
    // a. Create User
    const user = await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName,
        status: 'ACTIVE',
        isMfaEnabled: false,
        failedLoginAttempts: 0
      }
    });

    // b. Assign Role
    const assignment = await tx.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: existingOwnerRole.id,
        scopeType: 'PLATFORM',
        schoolId: null,
        sectionDivisionId: null
      }
    });

    // c. Write Audit Log
    const auditLog = await tx.auditLog.create({
      data: {
        requestId,
        schoolId: null,
        userId: user.id,
        eventType: 'BOOTSTRAP_OWNER_INITIALIZED',
        entityName: 'User',
        entityId: user.id,
        action: 'CREATE',
        newData: {
          username: user.username,
          fullName: user.fullName,
          role: 'PLATFORM_OWNER',
          scopeType: 'PLATFORM'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'RIFAD-Bootstrap-CLI/1.0'
      }
    });

    return { user, assignment, auditLog };
  });

  console.log(`✅ PLATFORM_OWNER initialized successfully!`);
  console.log(`  - Username: ${result.user.username}`);
  console.log(`  - Role: PLATFORM_OWNER (Scope: PLATFORM)`);
  console.log(`  - AuditLog ID: ${result.auditLog.id}`);
  console.log(`  - Request ID: ${requestId}`);

  return {
    status: 'SUCCESS',
    username: result.user.username,
    userId: result.user.id,
    auditLogId: result.auditLog.id,
    generatedPassword: !process.env.BOOTSTRAP_OWNER_PASSWORD ? rawPassword : '[REDACTED_FROM_ENV]'
  };
}

if (require.main === module) {
  bootstrapPlatformOwner()
    .then((res) => {
      console.log(`\n🔒 Bootstrap execution completed with status: ${res.status}`);
      console.log(`🛡️ Credential Security: Password hashed securely with Argon2id (Zero Plaintext Logged).`);
    })
    .catch((e) => {
      console.error('❌ Bootstrap Error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { bootstrapPlatformOwner };
