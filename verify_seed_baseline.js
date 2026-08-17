const { Client } = require('pg');

const DIRECT_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function verify() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  console.log('=== 1. VERIFYING ROLES COUNT & CODES ===');
  const resRoles = await client.query(`
    SELECT code, name_ar, name_en, is_system_role 
    FROM roles 
    ORDER BY code;
  `);
  console.log(`Total Roles Count: ${resRoles.rows.length} ${resRoles.rows.length === 6 ? '[PASS]' : '[FAIL]'}`);
  resRoles.rows.forEach(r => console.log(`  - ${r.code} (${r.name_ar})`));

  const expectedRoleCodes = [
    'PLATFORM_OWNER',
    'SCHOOL_ADMIN',
    'ACADEMIC_ADMIN',
    'REGISTRAR',
    'TEACHER',
    'AUDITOR'
  ];
  const actualRoleCodes = resRoles.rows.map(r => r.code);
  const allRolesFound = expectedRoleCodes.every(code => actualRoleCodes.includes(code));
  console.log(`All 6 Expected Roles Found: ${allRolesFound ? '[PASS]' : '[FAIL]'}`);

  console.log('\n=== 2. VERIFYING PERMISSIONS COUNT & MODULES ===');
  const resPerms = await client.query(`
    SELECT module, COUNT(*) as count
    FROM permissions 
    GROUP BY module 
    ORDER BY module;
  `);
  let totalPerms = 0;
  resPerms.rows.forEach(m => {
    totalPerms += parseInt(m.count, 10);
    console.log(`  - Module [${m.module}]: ${m.count} permissions`);
  });
  console.log(`Total Granular Permissions: ${totalPerms} ${totalPerms === 34 ? '[PASS]' : '[FAIL]'}`);

  console.log('\n=== 3. VERIFYING ROLE_PERMISSIONS MAPPINGS ===');
  const resRolePerms = await client.query(`
    SELECT r.code, COUNT(rp.permission_id) as permissions_count
    FROM roles r
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    GROUP BY r.code
    ORDER BY permissions_count DESC;
  `);
  let totalMappings = 0;
  resRolePerms.rows.forEach(rp => {
    totalMappings += parseInt(rp.permissions_count, 10);
    console.log(`  - ${rp.code}: ${rp.permissions_count} permissions assigned`);
  });
  console.log(`Total Role-Permission Links: ${totalMappings}`);

  console.log('\n=== 4. VERIFYING ZERO OPERATIONAL / DEMO / MOCK DATA ===');
  const operationalTables = [
    'schools',
    'users',
    'students',
    'teachers',
    'specializations',
    'student_enrollments',
    'class_sections',
    'teacher_assignments',
    'promotion_batches',
    'import_batches'
  ];
  let zeroData = true;
  for (const t of operationalTables) {
    const resCount = await client.query(`SELECT COUNT(*) FROM "${t}";`);
    const count = parseInt(resCount.rows[0].count, 10);
    if (count > 0) {
      console.error(`  [FAIL] Data found in table ${t}: ${count} rows`);
      zeroData = false;
    } else {
      console.log(`  - ${t}: 0 rows [CLEAN]`);
    }
  }
  console.log(`Operational Data Isolation: ${zeroData ? '[PASS]' : '[FAIL]'}`);

  await client.end();
}

verify().catch(console.error);
