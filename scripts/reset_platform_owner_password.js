/**
 * Administrative CLI Script: Reset Platform Owner Password
 * 
 * Purpose:
 * Safely resets the password for the single system account `platform.owner`.
 * 
 * Security Guarantees:
 * - Hardcoded target: strictly `platform.owner` (no dynamic username input).
 * - Interactive hidden input for password and confirmation (zero terminal echoing).
 * - Argon2id hashing with OWASP/NIST parameters (64MB memory, 3 iterations, 4 parallelism).
 * - Atomic Prisma transaction with 0 partial writes.
 * - Soft-revokes all existing sessions (`isRevoked = true`, zero deletion).
 * - Resets `failedLoginAttempts = 0`, `lockedUntil = null`, and updates `passwordChangedAt`.
 * - Preserves roles, status, scopes, permissions, and profile data completely untouched.
 * - Immutable Audit Log recording with truthful actor semantics (`userId = null`, source: `LOCAL_ADMIN_CLI`).
 * - Zero secrets logged or displayed.
 */

require('dotenv').config();
const readline = require('readline');
const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('../src/config/prisma');

const TARGET_USERNAME = 'platform.owner';
const REQUIRED_ROLE_CODE = 'PLATFORM_OWNER';
const CONFIRMATION_PHRASE = 'RESET PLATFORM OWNER';

/**
 * Prompts for user input in terminal while completely suppressing/masking characters.
 */
function promptHidden(query) {
  return new Promise((resolve) => {
    const stdout = process.stdout;
    const stdin = process.stdin;

    stdout.write(query);

    if (stdin.isTTY) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let password = '';

      const onData = (char) => {
        // Ctrl+C (Interrupt)
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdout.write('\n');
          process.exit(1);
        }

        // Enter / Return
        if (char === '\r' || char === '\n' || char === '\u0004') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(password);
          return;
        }

        // Backspace
        if (char === '\u0008' || char === '\x7f') {
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
          return;
        }

        // Accumulate character
        password += char;
      };

      stdin.on('data', onData);
    } else {
      // Non-interactive fallback (e.g. piped stream)
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Prompts for standard visible text input in terminal.
 */
function promptText(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resetPlatformOwnerPassword() {
  console.log('\n====================================================');
  console.log('🔒 RIFAD PLATFORM OWNER PASSWORD RESET TOOL');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // 1. Target Verification & Pre-flight Checks
  // ----------------------------------------------------
  console.log(`🔍 Verifying target account [${TARGET_USERNAME}] in database...`);

  // a. Find target user
  const targetUser = await prisma.user.findFirst({
    where: {
      username: TARGET_USERNAME,
      deletedAt: null
    },
    include: {
      roleAssignments: {
        include: {
          role: true
        }
      }
    }
  });

  if (!targetUser) {
    throw new Error(`❌ Target user [${TARGET_USERNAME}] does not exist in the database.`);
  }

  // b. Verify status
  if (targetUser.status !== 'ACTIVE') {
    throw new Error(`❌ Target user [${TARGET_USERNAME}] is not ACTIVE (current status: ${targetUser.status}).`);
  }

  // c. Verify PLATFORM_OWNER role assignment
  const platformOwnerAssignment = targetUser.roleAssignments.find(
    (a) => a.role.code === REQUIRED_ROLE_CODE && a.scopeType === 'PLATFORM' && a.schoolId === null
  );

  if (!platformOwnerAssignment) {
    throw new Error(`❌ Target user [${TARGET_USERNAME}] does not have an active [${REQUIRED_ROLE_CODE}] role with scope [PLATFORM].`);
  }

  // d. Verify no unexpected duplicate platform owners exist in the system
  const totalPlatformOwners = await prisma.userRoleAssignment.count({
    where: {
      role: { code: REQUIRED_ROLE_CODE },
      scopeType: 'PLATFORM'
    }
  });

  if (totalPlatformOwners !== 1) {
    throw new Error(`❌ System integrity violation: Expected exactly 1 PLATFORM_OWNER, but found ${totalPlatformOwners}.`);
  }

  // e. Count current active sessions
  const activeSessionsCount = await prisma.userSession.count({
    where: {
      userId: targetUser.id,
      isRevoked: false,
      expiresAt: { gt: new Date() }
    }
  });

  // ----------------------------------------------------
  // 2. Display Non-Sensitive Summary & Confirmation
  // ----------------------------------------------------
  console.log('----------------------------------------------------');
  console.log(`Target account:   ${targetUser.username}`);
  console.log(`Role:             ${REQUIRED_ROLE_CODE} (Scope: PLATFORM)`);
  console.log(`Status:           ${targetUser.status}`);
  console.log(`Active sessions:  ${activeSessionsCount}`);
  console.log('----------------------------------------------------\n');

  const confirmation = await promptText(`Type exactly "${CONFIRMATION_PHRASE}" to proceed: `);

  if (confirmation !== CONFIRMATION_PHRASE) {
    console.log('\n⚠️ [ABORTED] Confirmation phrase does not match. Operation cancelled with zero changes made.\n');
    return;
  }

  // ----------------------------------------------------
  // 3. Interactive Hidden Password Input
  // ----------------------------------------------------
  console.log('\n🔑 Please enter the new password (characters will not be displayed):');
  const newPassword = await promptHidden('New password: ');
  const confirmPassword = await promptHidden('Confirm new password: ');

  // ----------------------------------------------------
  // 4. Password Policy & Match Validation
  // ----------------------------------------------------
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('❌ Password policy violation: New password must be at least 8 characters long.');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('❌ Password validation error: Passwords do not match.');
  }

  // ----------------------------------------------------
  // 5. Argon2id Password Hashing
  // ----------------------------------------------------
  console.log('\n🛡️  Hashing password using Argon2id algorithm...');
  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,       // 3 iterations
    parallelism: 4     // 4 threads
  });

  const requestId = `req_reset_${crypto.randomUUID()}`;

  // ----------------------------------------------------
  // 6. Atomic Database Transaction Execution
  // ----------------------------------------------------
  console.log('⚡ Executing atomic database transaction...');

  await prisma.$transaction(async (tx) => {
    // a. Update User credentials, counters, and timestamp
    await tx.user.update({
      where: { id: targetUser.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    // b. Soft-revoke all existing user sessions
    await tx.userSession.updateMany({
      where: {
        userId: targetUser.id,
        isRevoked: false
      },
      data: {
        isRevoked: true
      }
    });

    // c. Write Immutable Audit Log
    await tx.auditLog.create({
      data: {
        requestId,
        schoolId: null,
        userId: null, // System / Local CLI execution
        eventType: 'PLATFORM_OWNER_PASSWORD_RESET',
        entityName: 'User',
        entityId: targetUser.id,
        action: 'UPDATE',
        newData: {
          reason: 'PLATFORM_OWNER_ADMINISTRATIVE_RESET',
          source: 'LOCAL_ADMIN_CLI'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'RIFAD-Admin-CLI/1.0'
      }
    });
  });

  // ----------------------------------------------------
  // 7. Completion Notification (Zero Secrets Output)
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('✅ Password reset completed successfully.');
  console.log('✅ All existing sessions revoked.');
  console.log('✅ No roles, permissions, scopes, or profile data were modified.');
  console.log('====================================================\n');
}

// Execute only when invoked directly from CLI
if (require.main === module) {
  resetPlatformOwnerPassword()
    .catch((err) => {
      console.error('\n❌ Execution Error:', err.message);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { resetPlatformOwnerPassword };
