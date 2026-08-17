const { Client } = require('pg');

const DIRECT_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function verify() {
  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  console.log('=== 1. VERIFYING CREATED TABLES ===');
  const resTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log('Tables in public schema:');
  resTables.rows.forEach(r => console.log('  - ' + r.table_name));

  console.log('\n=== 2. VERIFYING ENUMS ===');
  const resEnums = await client.query(`
    SELECT t.typname as enum_name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid  
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `);
  resEnums.rows.forEach(r => console.log(`  - ${r.enum_name}: [${r.values}]`));

  console.log('\n=== 3. VERIFYING PARTIAL UNIQUE INDEXES ===');
  const resIndexes = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND (indexname LIKE 'uq_%' OR indexname LIKE '%_key' OR indexname LIKE '%_idx')
    ORDER BY tablename, indexname;
  `);
  resIndexes.rows.forEach(r => console.log(`  - ${r.indexname}: ${r.indexdef}`));

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
    ORDER BY tc.table_name, kcu.column_name;
  `);
  resFKs.rows.forEach(r => console.log(`  - ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name} (ON DELETE ${r.delete_rule})`));

  console.log('\n=== 5. VERIFYING ABSENCE OF FORBIDDEN TABLES ===');
  const forbiddenNames = ['students', 'teachers', 'academic_years', 'class_sections', 'promotion_batches', 'specializations', 'subjects', 'grades', 'educational_stages', 'school_sections', 'student_enrollments', 'teacher_assignments', 'teacher_subjects', 'promotion_batch_items'];
  const existingTableNames = resTables.rows.map(r => r.table_name);
  const foundForbidden = forbiddenNames.filter(name => existingTableNames.includes(name));
  
  if (foundForbidden.length === 0) {
    console.log('  [PASS] Zero forbidden tables exist in the database!');
  } else {
    console.error('  [FAIL] Forbidden tables found:', foundForbidden);
  }

  console.log('\n=== 6. VERIFYING MIGRATION RECORD IN DATABASE ===');
  const resMig = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations";
  `);
  console.log('Applied migrations:');
  resMig.rows.forEach(r => console.log(`  - ${r.migration_name} | Finished: ${r.finished_at} | Steps: ${r.applied_steps_count}`));

  await client.end();
}

verify().catch(console.error);
