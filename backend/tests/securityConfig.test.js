const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.CORS_ORIGINS = 'https://allowed.example';

const app = require('../src/app');
const { pool } = require('../src/db');

after(async () => {
  await pool.end();
});

describe('HTTP security configuration', () => {
  it('only emits CORS headers for allow-listed origins and enables Helmet headers', async () => {
    const allowed = await request(app)
      .get('/health')
      .set('Origin', 'https://allowed.example');
    assert.strictEqual(allowed.headers['access-control-allow-origin'], 'https://allowed.example');
    assert.strictEqual(allowed.headers['x-content-type-options'], 'nosniff');

    const disallowed = await request(app)
      .get('/health')
      .set('Origin', 'https://disallowed.example');
    assert.strictEqual(disallowed.headers['access-control-allow-origin'], undefined);
  });

  it('rejects JSON request bodies larger than 100kb', async () => {
    const payload = JSON.stringify({ content: 'x'.repeat(110 * 1024) });
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(payload);

    assert.strictEqual(response.status, 413);
  });
});
