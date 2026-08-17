const { Client } = require('pg');

const DIRECT_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function verify() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  console.log('=== 1. VERIFYING USERS TABLE ===');
  const resUsers = await client.query(`
    SELECT id, username, email, full_name, status, is_mfa_enabled, password_hash
    FROM users 
    WHERE deleted_at IS NULL;
  `);
  console.log(`Total Users Count: ${resUsers.rows.length} ${resUsers.rows.length === 1 ? '[PASS]' : '[FAIL]'}`);
  resUsers.rows.forEach(u => {
    const isArgon2 = u.password_hash.startsWith('$argon2id$');
    console.log(`  - Username: ${u.username}`);
    console.log(`  - Full Name: ${u.full_name}`);
    console.log(`  - Status: ${u.status}`);
    console.log(`  - Password Algorithm: ${isArgon2 ? 'Argon2id [SECURE PASS]' : 'UNKNOWN [FAIL]'}`);
  });

  console.log('\n=== 2. VERIFYING USER_ROLE_ASSIGNMENTS TABLE ===');
  const resAssignments = await client.query(`
    SELECT ura.id, u.username, r.code as role_code, ura.scope_type, ura.school_id, ura.section_division_id
    FROM user_role_assignments ura
    JOIN users u ON ura.user_id = u.id
    JOIN roles r ON ura.role_id = r.id;
  `);
  console.log(`Total Role Assignments: ${resAssignments.rows.length} ${resAssignments.rows.length === 1 ? '[PASS]' : '[FAIL]'}`);
  resAssignments.rows.forEach(a => {
    const isOwner = a.role_code === 'PLATFORM_OWNER';
    const isPlatformScope = a.scope_type === 'PLATFORM';
    const isSchoolNull = a.school_id === null;
    const isSectionNull = a.section_division_id === null;
    const valid = isOwner && isPlatformScope && isSchoolNull && isSectionNull;
    console.log(`  - User: ${a.username}`);
    console.log(`  - Role Code: ${a.role_code} ${isOwner ? '[PASS]' : '[FAIL]'}`);
    console.log(`  - Scope Type: ${a.scope_type} ${isPlatformScope ? '[PASS]' : '[FAIL]'}`);
    console.log(`  - School ID: ${a.school_id} ${isSchoolNull ? '[NULL - PASS]' : '[FAIL]'}`);
    console.log(`  - Section Division ID: ${a.section_division_id} ${isSectionNull ? '[NULL - PASS]' : '[FAIL]'}`);
    console.log(`  - Overall Assignment Integrity: ${valid ? '[PASS]' : '[FAIL]'}`);
  });

  console.log('\n=== 3. VERIFYING AUDIT_LOGS TABLE ===');
  const resAudit = await client.query(`
    SELECT id, request_id, event_type, entity_name, entity_id, action, new_data, created_at
    FROM audit_logs
    ORDER BY created_at DESC;
  `);
  console.log(`Total Audit Logs: ${resAudit.rows.length}`);
  resAudit.rows.forEach(log => {
    const hasReqId = Boolean(log.request_id);
    const isCreate = log.action === 'CREATE';
    const isUserEntity = log.entity_name === 'User';
    console.log(`  - Event Type: ${log.event_type}`);
    console.log(`  - Action: ${log.action} ${isCreate ? '[PASS]' : '[FAIL]'}`);
    console.log(`  - Entity: ${log.entity_name} (${log.entity_id}) ${isUserEntity ? '[PASS]' : '[FAIL]'}`);
    console.log(`  - Request ID: ${log.request_id} ${hasReqId ? '[PASS]' : '[FAIL]'}`);
    console.log(`  - Log Data Payload: ${JSON.stringify(log.new_data)}`);
  });

  console.log('\n=== 4. VERIFYING ZERO UNRELATED / OPERATIONAL / DEMO DATA ===');
  const tables = ['schools', 'students', 'teachers', 'specializations', 'student_enrollments', 'promotion_batches', 'import_batches'];
  let clean = true;
  for (const t of tables) {
    const resCount = await client.query(`SELECT COUNT(*) FROM "${t}";`);
    const count = parseInt(resCount.rows[0].count, 10);
    if (count > 0) {
      console.error(`  [FAIL] Data found in table ${t}: ${count} rows`);
      clean = false;
    } else {
      console.log(`  - ${t}: 0 rows [CLEAN]`);
    }
  }
  console.log(`Operational Data Isolation: ${clean ? '[PASS]' : '[FAIL]'}`);

  await client.end();
}

verify().catch(console.error);
