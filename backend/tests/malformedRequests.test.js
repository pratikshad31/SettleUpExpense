const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');

describe('Malformed request handling', () => {
  let user;
  let groupId;
  let token;

  before(async () => {
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userResult = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Malformed request user', $1, 'test-hash') RETURNING id`,
      [`malformed-${tag}@example.com`]
    );
    user = userResult.rows[0];
    const groupResult = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`Malformed requests ${tag}`, `MR_${tag}`, user.id]
    );
    groupId = groupResult.rows[0].id;
    await query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [groupId, user.id]
    );
    token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
  });

  after(async () => {
    if (groupId) await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    if (user?.id) await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    await pool.end();
  });

  it('returns clean 4xx responses for malformed bodies, types, and strings', async () => {
    const cases = [
      ['missing body', () => request(app).post('/api/auth/login')],
      ['wrong content type', () => request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'text/plain')
        .send('email=user@example.com&password=not-a-form')],
      ['invalid JSON', () => request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":')],
      ['array instead of object', () => request(app)
        .post('/api/auth/login')
        .send([])],
      ['string where paise number is expected', () => request(app)
        .post(`/api/groups/${groupId}/settlements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromUser: user.id, toUser: user.id + 1, amountPaise: '100' })],
      ['null byte', () => request(app)
        .post('/api/auth/login')
        .send({ email: 'bad\u0000@example.com', password: 'not-a-password' })],
      ['emoji', () => request(app)
        .post('/api/auth/login')
        .send({ email: '💰', password: 'not-a-password' })],
      ['SQL-looking input', () => request(app)
        .post('/api/auth/login')
        .send({ email: "' OR 1=1 --", password: 'not-a-password' })],
    ];

    const results = [];
    for (const [name, makeRequest] of cases) {
      const response = await makeRequest();
      results.push({ name, response });
    }

    for (const { name, response } of results) {
      assert.ok(response.status >= 400 && response.status < 500, `${name} returned ${response.status}`);
      assert.equal(typeof response.body.error, 'string', `${name} has a clear error response`);
      assert.equal(Object.hasOwn(response.body, 'stack'), false, `${name} does not expose a stack`);
    }
    assert.equal(results.find(({ name }) => name === 'array instead of object').response.body.error,
      'Request body must be a JSON object');
    assert.equal(results.find(({ name }) => name === 'null byte').response.status, 400);
  });
});
