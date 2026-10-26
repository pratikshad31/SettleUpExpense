// backend/src/db/index.js
// PostgreSQL direct connection wrapper using `pg` Pool

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const requiredDatabaseSettings = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME'];
const missingSettings = requiredDatabaseSettings.filter((name) => !process.env[name]?.trim());
if (missingSettings.length > 0) {
  throw new Error(`Missing required database environment variable(s): ${missingSettings.join(', ')}`);
}

const databasePort = Number(process.env.DB_PORT);
if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
  throw new Error('DB_PORT must be an integer between 1 and 65535.');
}

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: databasePort,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Execute a parameterized query
 * @param {string} text - SQL query
 * @param {Array} params - Parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development' && duration > 100) {
    console.debug('Slow query:', { text: text.substring(0, 60), duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Acquire a client from the pool
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Execute operations within a database transaction
 * Automatically commits on success, rolls back on error
 * @param {Function} callback - Function receiving the client
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
};
