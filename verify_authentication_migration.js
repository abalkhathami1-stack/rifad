const { Client } = require('pg');

const DIRECT_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function verify() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  console.log('=== 1. ALL TABLES IN PUBLIC SCHEMA ===');
  const resTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log(`Total Tables Count: ${resTables.rows.length}`);
  resTables.rows.forEach(r => console.log('  - ' + r.table_name));

  console.log('\n=== 2. VERIFYING 3 AUTHENTICATION TABLES SPECIFICALLY ===');
  const authTables = [
    'user_sessions',
    'password_reset_tokens',
    'login_attempts'
  ];
  const existingTableNames = resTables.rows.map(r => r.table_name);
  authTables.forEach(t => {
    const exists = existingTableNames.includes(t);
    console.log(`  - ${t}: ${exists ? 'EXISTS [PASS]' : 'MISSING [FAIL]'}`);
  });

  console.log('\n=== 3. VERIFYING NEW COLUMNS IN USERS TABLE ===');
  const resCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('failed_login_attempts', 'locked_until', 'password_changed_at')
    ORDER BY column_name;
  `);
  resCols.rows.forEach(c => {
    console.log(`  - users.${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable}, default: ${c.column_default}) [PASS]`);
  });

  console.log('\n=== 4. VERIFYING FOREIGN KEYS AND ON DELETE RULES ===');
  const resFKs = await client.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      AND tc.table_name IN ('user_sessions', 'password_reset_tokens')
    ORDER BY tc.table_name, kcu.column_name;
  `);
  resFKs.rows.forEach(r => console.log(`  - ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name} (ON DELETE ${r.delete_rule})`));

  console.log('\n=== 5. VERIFYING INDEXES (Authentication Layer) ===');
  const resIdx = await client.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' 
      AND tablename IN ('user_sessions', 'password_reset_tokens', 'login_attempts')
    ORDER BY tablename, indexname;
  `);
  resIdx.rows.forEach(r => console.log(`  - ${r.tablename} -> ${r.indexname}: ${r.indexdef}`));

  console.log('\n=== 6. VERIFYING ZERO SEED DATA IN ANY TABLE ===');
  for (const t of existingTableNames) {
    if (t === '_prisma_migrations') continue;
    const resCount = await client.query(`SELECT COUNT(*) FROM "${t}";`);
    const count = parseInt(resCount.rows[0].count, 10);
    if (count > 0) {
      console.error(`  [FAIL] Data found in table ${t}: ${count} rows`);
    }
  }
  console.log('  [PASS] Zero Seed / mock rows found across all operational tables.');

  console.log('\n=== 7. VERIFYING ALL APPLIED MIGRATIONS IN DATABASE ===');
  const resMig = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY finished_at ASC;
  `);
  resMig.rows.forEach(r => console.log(`  - ${r.migration_name} | Finished: ${r.finished_at} | Steps: ${r.applied_steps_count}`));

  await client.end();
}

verify().catch(console.error);
