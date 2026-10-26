// backend/src/database/migrate.js
// Migration runner: executes schema.sql and ensures schema conformity

const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('../db');

async function migrate() {
  console.log('--- Starting Database Migration ---');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const idempotencyMigrationPath = path.join(__dirname, 'migrations', '001_idempotency_scope.sql');
  const idempotencyMigrationSql = fs.readFileSync(idempotencyMigrationPath, 'utf8');

  try {
    // Check if older incompatible prototype tables exist
    const checkUsers = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email'
    `);

    if (checkUsers.rowCount === 0) {
      const usersExists = await pool.query(`
        SELECT to_regclass('public.users') AS exists
      `);
      if (usersExists.rows[0].exists) {
        console.log('Detected older prototype tables without email/paise. Dropping obsolete tables to establish unified schema...');
        await pool.query(`
          DROP TABLE IF EXISTS activity_logs CASCADE;
          DROP TABLE IF EXISTS settlement_status_history CASCADE;
          DROP TABLE IF EXISTS settlements CASCADE;
          DROP TABLE IF EXISTS expense_versions CASCADE;
          DROP TABLE IF EXISTS expense_items CASCADE;
          DROP TABLE IF EXISTS expense_participants CASCADE;
          DROP TABLE IF EXISTS expense_payers CASCADE;
          DROP TABLE IF EXISTS expense_splits CASCADE;
          DROP TABLE IF EXISTS expenses CASCADE;
          DROP TABLE IF EXISTS group_members CASCADE;
          DROP TABLE IF EXISTS groups CASCADE;
          DROP TABLE IF EXISTS users CASCADE;
          DROP TABLE IF EXISTS idempotency_records CASCADE;
        `);
      }
    }

    await withTransaction(async (client) => {
      console.log('Executing schema.sql...');
      await client.query(schemaSql);
      console.log('Executing 001_idempotency_scope.sql...');
      await client.query(idempotencyMigrationSql);
    });

    console.log('✓ Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrate };
