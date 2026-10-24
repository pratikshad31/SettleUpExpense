// backend/tests/db.test.js
// Dedicated tests for database connection and transaction handling (src/db/index.js)

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const { pool, query, getClient, withTransaction } = require('../src/db');

describe('Database Wrapper (src/db/index.js)', () => {
  after(async () => {
    await pool.end();
  });

  describe('query(text, params)', () => {
    it('should execute a simple query successfully', async () => {
      const res = await query('SELECT 1 + 1 AS sum');
      assert.strictEqual(res.rowCount, 1);
      assert.strictEqual(res.rows[0].sum, 2);
    });

    it('should handle parameterized queries safely', async () => {
      const res = await query('SELECT $1::text AS greeting, $2::int AS count', ['Namaste', 42]);
      assert.strictEqual(res.rows[0].greeting, 'Namaste');
      assert.strictEqual(res.rows[0].count, 42);
    });

    it('should throw on syntax errors', async () => {
      await assert.rejects(async () => {
        await query('SELECT INVALID SYNTAX FROM');
      }, /syntax error/i);
    });
  });

  describe('getClient()', () => {
    it('should acquire client from pool and release it', async () => {
      const client = await getClient();
      assert.ok(client);
      const res = await client.query('SELECT NOW() AS now');
      assert.ok(res.rows[0].now);
      client.release();
    });
  });

  describe('withTransaction(callback)', () => {
    it('should commit successful queries and return value', async () => {
      const val = await withTransaction(async (client) => {
        const res = await client.query('SELECT 100 AS num');
        return res.rows[0].num;
      });
      assert.strictEqual(val, 100);
    });

    it('should rollback transaction on thrown error and rethrow', async () => {
      await assert.rejects(
        async () => {
          await withTransaction(async (client) => {
            await client.query('SELECT 1');
            throw new Error('Transaction abort simulation');
          });
        },
        /Transaction abort simulation/
      );
    });
  });
});
