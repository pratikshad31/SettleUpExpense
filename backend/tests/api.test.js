// backend/tests/api.test.js
// Integration tests for SettleUpExpenses REST APIs

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');
const { seed } = require('../src/database/seed');

describe('API Integration Test Suite', () => {
  let aaravToken;
  let priyaToken;
  let flatGroupId;

  before(async () => {
    // Run seed to prepare database in known state
    await seed();

    // Login as Aarav
    const aaravLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aarav@example.com', password: 'password123' });
    assert.strictEqual(aaravLogin.status, 200);
    aaravToken = aaravLogin.body.token;

    // Login as Priya
    const priyaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya@example.com', password: 'password123' });
    assert.strictEqual(priyaLogin.status, 200);
    priyaToken = priyaLogin.body.token;

    // Fetch groups
    const grpRes = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(grpRes.status, 200);
    flatGroupId = grpRes.body.groups[0].id;
  });

  after(async () => {
    await pool.end();
  });

  describe('1. Authentication & Profiles', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Karan Mehra',
          email: 'karan@example.com',
          password: 'secretPassword123',
          upi_id: 'karan@okaxis',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'karan@example.com');
      assert.strictEqual(res.body.user.password_hash, undefined); // Never expose password hash!
    });

    it('should reject duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Another Aarav',
          email: 'aarav@example.com',
          password: 'password123',
        });

      assert.strictEqual(res.status, 409);
      assert.match(res.body.error, /already exists/);
    });

    it('should reject invalid login credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'aarav@example.com', password: 'wrongPassword' });

      assert.strictEqual(res.status, 401);
    });

    it('should fetch authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, 'aarav@example.com');
    });
  });

  describe('2. Groups & Permissions', () => {
    let testGroupInvite;
    let testGroupId;

    it('should create a new group with owner role and invite code', async () => {
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({
          name: 'Weekend Trekkers',
          description: 'Western Ghats hiking expenses',
        });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.group.invite_code);
      testGroupInvite = res.body.group.invite_code;
      testGroupId = res.body.group.id;
    });

    it('should allow another user to join group with invite code', async () => {
      const res = await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${priyaToken}`)
        .send({ invite_code: testGroupInvite });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.group.id, testGroupId);
    });

    it('should prevent user from leaving group with unsettled balance', async () => {
      // In flat group, Priya has non-zero balance
      const res = await request(app)
        .post(`/api/groups/${flatGroupId}/leave`)
        .set('Authorization', `Bearer ${priyaToken}`);

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Cannot leave group/);
    });
  });

  describe('3. Expenses & Splits', () => {
    it('should create an expense with multiple payers and equal split', async () => {
      // Group members: Aarav (1), Priya (2), Rohan (3), Ananya (4)
      const res = await request(app)
        .post(`/api/groups/${flatGroupId}/expenses`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({
          description: 'Weekend Groceries Multi-Payer',
          amountINR: 2000,
          category: 'Groceries',
          splitType: 'equal',
          payers: [
            { userId: 1, amountINR: 1200 },
            { userId: 2, amountINR: 800 },
          ],
          participantIds: [1, 2, 3, 4],
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(Number(res.body.expense.total_amount_paise), 200000);
    });

    it('should reject expense if payer contributions do not sum to total', async () => {
      const res = await request(app)
        .post(`/api/groups/${flatGroupId}/expenses`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({
          description: 'Mismatched Payers Expense',
          amountINR: 1000,
          splitType: 'equal',
          payers: [
            { userId: 1, amountINR: 600 },
            { userId: 2, amountINR: 300 }, // sum 900 != 1000
          ],
          participantIds: [1, 2],
        });

      assert.strictEqual(res.status, 400);
      assert.match(res.body.error, /Payer contributions sum/);
    });

    it('should void an expense and preserve audit record', async () => {
      // Create expense
      const createRes = await request(app)
        .post(`/api/groups/${flatGroupId}/expenses`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({
          description: 'Temporary Expense to Void',
          amountINR: 500,
          splitType: 'equal',
          participantIds: [1, 2],
        });
      const expId = createRes.body.expense.id;

      // Void it
      const voidRes = await request(app)
        .post(`/api/expenses/${expId}/void`)
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(voidRes.status, 200);
      assert.strictEqual(voidRes.body.expense.is_voided, true);

      // Verify details show voided status
      const getRes = await request(app)
        .get(`/api/expenses/${expId}`)
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(getRes.body.expense.is_voided, true);
      assert.ok(getRes.body.expense.voided_by);
    });
  });

  describe('4. Balances, Debts, and Settlement Workflow', () => {
    it('should calculate balances and verify zero-sum invariant', async () => {
      const res = await request(app)
        .get(`/api/groups/${flatGroupId}/balances`)
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.netSumPaise, 0);
      assert.ok(Array.isArray(res.body.balances));
      assert.ok(Array.isArray(res.body.suggestions));
    });

    it('should return detailed person-to-person debt graph', async () => {
      const res = await request(app)
        .get(`/api/groups/${flatGroupId}/debts`)
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.debts));
      assert.ok(res.body.policy);
    });

    it('should execute full settlement lifecycle: create -> mark_paid -> confirm', async () => {
      // 1. Aarav proposes paying Priya ₹250
      const createRes = await request(app)
        .post(`/api/groups/${flatGroupId}/settlements`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({
          fromUser: 1, // Aarav
          toUser: 2,   // Priya
          amountINR: 250,
          paymentMethod: 'upi',
          notes: 'Test settlement flow',
        });

      assert.strictEqual(createRes.status, 201);
      const stId = createRes.body.settlement.id;
      assert.strictEqual(createRes.body.settlement.status, 'pending');

      // 2. Aarav marks paid with UPI reference
      const markPaidRes = await request(app)
        .post(`/api/settlements/${stId}/mark-paid`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .send({ referenceId: 'UPI/TEST/12345' });

      assert.strictEqual(markPaidRes.status, 200);
      assert.strictEqual(markPaidRes.body.settlement.status, 'marked_paid');

      // 3. Aarav attempts to confirm (should be REJECTED - only recipient Priya can confirm)
      const unauthorizedConfirm = await request(app)
        .post(`/api/settlements/${stId}/confirm`)
        .set('Authorization', `Bearer ${aaravToken}`);

      assert.strictEqual(unauthorizedConfirm.status, 403);

      // 4. Priya (recipient) confirms receipt
      const confirmRes = await request(app)
        .post(`/api/settlements/${stId}/confirm`)
        .set('Authorization', `Bearer ${priyaToken}`);

      assert.strictEqual(confirmRes.status, 200);
      assert.strictEqual(confirmRes.body.settlement.status, 'confirmed');

      // 5. Duplicate confirmation should be rejected
      const duplicateConfirm = await request(app)
        .post(`/api/settlements/${stId}/confirm`)
        .set('Authorization', `Bearer ${priyaToken}`);

      assert.strictEqual(duplicateConfirm.status, 400);
    });

    it('should support Idempotency-Key header on settlement creation', async () => {
      const idempotencyKey = 'unique-key-xyz-987';

      const res1 = await request(app)
        .post(`/api/groups/${flatGroupId}/settlements`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          fromUser: 1,
          toUser: 2,
          amountINR: 100,
          paymentMethod: 'cash',
        });

      assert.strictEqual(res1.status, 201);
      const originalId = res1.body.settlement.id;

      // Duplicate request with same Idempotency-Key
      const res2 = await request(app)
        .post(`/api/groups/${flatGroupId}/settlements`)
        .set('Authorization', `Bearer ${aaravToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          fromUser: 1,
          toUser: 2,
          amountINR: 100,
          paymentMethod: 'cash',
        });

      assert.strictEqual(res2.status, 201);
      assert.strictEqual(res2.headers['x-cache-lookup'], 'HIT');
      assert.strictEqual(res2.body.settlement.id, originalId);
    });
  });
});
