// backend/tests/authMiddleware.test.js
// Dedicated tests for authentication middleware (src/middleware/auth.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../src/middleware/auth');
const { pool, query } = require('../src/db');

describe('Auth Middleware (src/middleware/auth.js)', () => {
  let validToken;
  let nonExistentUserToken;
  let testUserId;
  const secret = process.env.JWT_SECRET;

  before(async () => {
    // Insert a test user
    const res = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Auth Test User', 'authtest@example.com', 'hash123')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    testUserId = res.rows[0].id;
    validToken = jwt.sign({ userId: testUserId }, secret, { expiresIn: '1h' });
    nonExistentUserToken = jwt.sign({ userId: 9999999 }, secret, { expiresIn: '1h' });
  });

  after(async () => {
    await pool.end();
  });

  function createMockRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  it('should return 401 if Authorization header is missing', async () => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /No token provided/i);
    assert.strictEqual(nextCalled, false);
  });

  it('should return 401 if header does not start with Bearer', async () => {
    const req = { headers: { authorization: 'Basic 12345' } };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /No token provided/i);
    assert.strictEqual(nextCalled, false);
  });

  it('should return 401 for invalid JWT signature', async () => {
    const req = { headers: { authorization: 'Bearer invalid.token.value' } };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /Invalid or expired/i);
    assert.strictEqual(nextCalled, false);
  });

  it('should reject an alg:none token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      userId: testUserId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url');
    const token = `${header}.${payload}.`;
    const res = createMockRes();

    await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => {});

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /Invalid or expired/i);
  });

  it('should reject a token with a tampered signature', async () => {
    const [header, payload, signature] = validToken.split('.');
    const replacement = signature[0] === 'a' ? 'b' : 'a';
    const tamperedToken = `${header}.${payload}.${replacement}${signature.slice(1)}`;
    const res = createMockRes();

    await authenticate({ headers: { authorization: `Bearer ${tamperedToken}` } }, res, () => {});

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /Invalid or expired/i);
  });

  it('should return 401 if token payload has no userId', async () => {
    const emptyPayloadToken = jwt.sign({ role: 'admin' }, secret, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${emptyPayloadToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /Invalid token payload/i);
    assert.strictEqual(nextCalled, false);
  });

  it('should return 401 if user in token no longer exists', async () => {
    const req = { headers: { authorization: `Bearer ${nonExistentUserToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.match(res.body.error, /no longer exists/i);
    assert.strictEqual(nextCalled, false);
  });

  it('should populate req.user and call next() for valid token', async () => {
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    await authenticate(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.ok(req.user);
    assert.strictEqual(req.user.id, testUserId);
    assert.strictEqual(req.user.email, 'authtest@example.com');
  });
});
