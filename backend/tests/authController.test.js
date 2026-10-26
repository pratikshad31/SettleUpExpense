// backend/tests/authController.test.js
// Dedicated unit tests for authController functions (src/controllers/authController.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { signup, login, me, updateProfile, changePassword } = require('../src/controllers/authController');
const { pool, query } = require('../src/db');

describe('Auth Controller (src/controllers/authController.js)', () => {
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

  describe('signup(req, res, next)', () => {
    it('should reject missing name', async () => {
      const req = { body: { name: '', email: 'test@ex.com', password: 'password123' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Name is required/);
    });

    it('should reject invalid email format', async () => {
      const req = { body: { name: 'Test', email: 'not-an-email', password: 'password123' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /valid email/);
    });

    it('should reject password with less than 8 characters', async () => {
      const req = { body: { name: 'Test', email: 'test1@ex.com', password: '123' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /at least 8 characters/);
    });

    it('should reject weak password missing special character or uppercase', async () => {
      const req = { body: { name: 'Test', email: 'test_weak@ex.com', password: 'password123' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error);
    });

    it('should reject invalid UPI ID format', async () => {
      const req = { body: { name: 'Test', email: 'test2@ex.com', password: 'SecurePassword123!', upi_id: 'invalid@@vpa' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Invalid UPI ID format/);
    });

    it('should register valid user with token and exclude password_hash', async () => {
      const uniqueEmail = `user_${Date.now()}@example.com`;
      const req = { body: { name: 'New Dev', email: uniqueEmail, password: 'SecurePassword123!', upi_id: 'dev@okhdfcbank' } };
      const res = createMockRes();
      await signup(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, uniqueEmail);
      assert.strictEqual(res.body.user.password_hash, undefined);
    });
  });

  describe('login(req, res, next)', () => {
    const userEmail = `login_${Date.now()}@example.com`;
    const userPassword = 'MyLoginPass123!';

    before(async () => {
      const res = createMockRes();
      await signup({ body: { name: 'Login User', email: userEmail, password: userPassword } }, res, () => {});
    });

    it('should reject missing email or password', async () => {
      const req = { body: { email: '', password: '' } };
      const res = createMockRes();
      await login(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Email and password are required/);
    });

    it('should reject wrong password with 401', async () => {
      const req = { body: { email: userEmail, password: 'wrongPassword' } };
      const res = createMockRes();
      await login(req, res, () => {});
      assert.strictEqual(res.statusCode, 401);
      assert.match(res.body.error, /Invalid email or password/);
    });

    it('returns the same 401 and compares a dummy hash for an unknown email', async () => {
      const originalCompare = bcrypt.compare;
      const comparedHashes = [];
      bcrypt.compare = async (password, hash, ...args) => {
        comparedHashes.push(hash);
        return originalCompare.call(bcrypt, password, hash, ...args);
      };

      try {
        const unknownRes = createMockRes();
        await login({ body: { email: `missing_${Date.now()}@example.com`, password: 'wrongPassword' } }, unknownRes, () => {});

        const wrongPasswordRes = createMockRes();
        await login({ body: { email: userEmail, password: 'wrongPassword' } }, wrongPasswordRes, () => {});

        assert.strictEqual(unknownRes.statusCode, 401);
        assert.strictEqual(wrongPasswordRes.statusCode, 401);
        assert.strictEqual(unknownRes.body.error, wrongPasswordRes.body.error);
        assert.strictEqual(comparedHashes.length, 2);
        assert.notStrictEqual(comparedHashes[0], comparedHashes[1]);
      } finally {
        bcrypt.compare = originalCompare;
      }
    });

    it('should login successfully with correct credentials', async () => {
      const req = { body: { email: userEmail, password: userPassword } };
      const res = createMockRes();
      await login(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, userEmail);
    });
  });

  describe('me(req, res)', () => {
    it('should return req.user', async () => {
      const req = { user: { id: 10, name: 'Current User' } };
      const res = createMockRes();
      await me(req, res);
      assert.strictEqual(res.body.user.id, 10);
    });
  });

  describe('updateProfile(req, res, next)', () => {
    let testUser;
    before(async () => {
      const uniqueEmail = `profile_${Date.now()}@example.com`;
      const res = createMockRes();
      await signup({ body: { name: 'Initial Name', email: uniqueEmail, password: 'SecurePassword123!' } }, res, () => {});
      testUser = res.body.user;
    });

    it('should reject empty name', async () => {
      const req = { user: testUser, body: { name: '' } };
      const res = createMockRes();
      await updateProfile(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /cannot be empty/);
    });

    it('should update name and UPI ID successfully', async () => {
      const req = { user: testUser, body: { name: 'Updated Name', upi_id: 'updated@okhdfcbank' } };
      const res = createMockRes();
      await updateProfile(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.user.name, 'Updated Name');
      assert.strictEqual(res.body.user.upi_id, 'updated@okhdfcbank');
    });
  });

  describe('changePassword(req, res, next)', () => {
    let testUser;
    const initialPass = 'InitialPassword123!';
    before(async () => {
      const uniqueEmail = `changepass_${Date.now()}@example.com`;
      const res = createMockRes();
      await signup({ body: { name: 'Pass User', email: uniqueEmail, password: initialPass } }, res, () => {});
      testUser = res.body.user;
    });

    it('should reject incorrect current password', async () => {
      const req = { user: testUser, body: { currentPassword: 'wrongCurrentPassword', newPassword: 'BrandNewPassword123!' } };
      const res = createMockRes();
      await changePassword(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /Current password is incorrect/);
    });

    it('should reject weak new password', async () => {
      const req = { user: testUser, body: { currentPassword: initialPass, newPassword: '123' } };
      const res = createMockRes();
      await changePassword(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /at least 8 characters/);
    });

    it('should change password successfully', async () => {
      const req = { user: testUser, body: { currentPassword: initialPass, newPassword: 'BrandNewPassword123!' } };
      const res = createMockRes();
      await changePassword(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.match(res.body.message, /Password changed successfully/);
    });
  });
});
