const { Client } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const DIRECT_URL = "postgresql://neondb_owner:npg_KQMR7E4FomwG@ep-fragrant-cherry-b2n0fy9z.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function testConnection(name, connectionString) {
  console.log(`\n=============================================`);
  console.log(`Testing connection: ${name}`);
  console.log(`=============================================`);
  const client = new Client({ connectionString });
  try {
    const startTime = Date.now();
    await client.connect();
    const duration = Date.now() - startTime;
    console.log(`[SUCCESS] Connected to ${name} in ${duration}ms`);

    // 1. Basic Server Info
    const resVersion = await client.query('SELECT version(), current_database(), current_user, inet_server_addr(), inet_server_port()');
    console.log(`PostgreSQL Info:`, resVersion.rows[0]);

    // 2. Check public tables
    const resTables = await client.query(`
      SELECT table_schema, table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name;
    `);
    console.log(`Existing Tables Count (non-system): ${resTables.rows.length}`);
    if (resTables.rows.length > 0) {
      console.log('Tables found:', resTables.rows);
    } else {
      console.log('No user tables found in database (Clean state).');
    }

    // 3. Check custom types / enums
    const resEnums = await client.query(`
      SELECT n.nspname as schema, t.typname as enum_name, e.enumlabel as enum_value
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      JOIN pg_namespace n ON n.oid = t.typnamespace
      ORDER BY enum_name, e.enumsortorder;
    `);
    console.log(`Existing Custom Enums Count: ${resEnums.rows.length}`);
    if (resEnums.rows.length > 0) {
      console.log('Enums found:', resEnums.rows);
    } else {
      console.log('No custom enums found (Clean state).');
    }

    // 4. Check extensions
    const resExt = await client.query(`
      SELECT extname, extversion FROM pg_extension;
    `);
    console.log('Installed Extensions:', resExt.rows.map(r => `${r.extname} (${r.extversion})`).join(', '));

    await client.end();
    return { success: true, tableCount: resTables.rows.length, enumCount: resEnums.rows.length };
  } catch (err) {
    console.error(`[FAILURE] Connection ${name} failed:`, err.message);
    try { await client.end(); } catch (e) {}
    return { success: false, error: err.message };
  }
}

async function runAll() {
  const resultPooled = await testConnection('DATABASE_URL (Pooled / Neon PgBouncer)', DATABASE_URL);
  const resultDirect = await testConnection('DIRECT_URL (Direct / Neon Unpooled)', DIRECT_URL);

  console.log('\n=============================================');
  console.log('SUMMARY OF CHECKS:');
  console.log('=============================================');
  console.log(`1. DATABASE_URL working: ${resultPooled.success ? 'YES' : 'NO'}`);
  console.log(`2. DIRECT_URL working: ${resultDirect.success ? 'YES' : 'NO'}`);
  console.log(`3. Clean Database (Zero tables & Zero enums): ${resultDirect.tableCount === 0 && resultDirect.enumCount === 0 ? 'YES' : 'NO'}`);
}

runAll();
