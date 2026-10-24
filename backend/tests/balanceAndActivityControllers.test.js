// backend/tests/balanceAndActivityControllers.test.js
// Dedicated tests for balanceController and activityController

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { getGroupBalances, getGroupDebts } = require('../src/controllers/balanceController');
const { getGroupActivity } = require('../src/controllers/activityController');
const { pool, query } = require('../src/db');
const { createExpense } = require('../src/controllers/expenseController');
const { createSettlement, confirmSettlement } = require('../src/controllers/settlementController');

describe('Balance & Activity Controllers', () => {
  let userA, userB;
  let testGroup;

  before(async () => {
    const u1 = await query(`INSERT INTO users (name, email, password_hash, upi_id) VALUES ('Alice', 'alice_${Date.now()}@example.com', 'h', 'alice@upi') RETURNING *`);
    const u2 = await query(`INSERT INTO users (name, email, password_hash, upi_id) VALUES ('Bob', 'bob_${Date.now()}@example.com', 'h', 'bob@upi') RETURNING *`);
    userA = u1.rows[0];
    userB = u2.rows[0];

    const grp = await query(
      `INSERT INTO groups (name, invite_code, created_by) VALUES ('Balance Test Group', 'BALTEST1', $1) RETURNING *`,
      [userA.id]
    );
    testGroup = grp.rows[0];

    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'member', 'active')`,
      [testGroup.id, userA.id, userB.id]
    );

    // Expense: Alice pays ₹200 for Alice and Bob (100 each)
    await createExpense(
      {
        groupId: testGroup.id,
        user: userA,
        body: {
          description: 'Groceries',
          amountINR: 200,
          splitType: 'equal',
          participantIds: [userA.id, userB.id],
        },
      },
      { statusCode: 200, status() { return this; }, json() {} },
      () => {}
    );
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

  describe('getGroupBalances', () => {
    it('should return group balances, zero-sum invariant, and suggestions with upiUri', async () => {
      const req = { groupId: testGroup.id };
      const res = createMockRes();

      await getGroupBalances(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.netSumPaise, 0);
      assert.strictEqual(res.body.balances.length, 2);

      const alice = res.body.balances.find((b) => b.userId === userA.id);
      const bob = res.body.balances.find((b) => b.userId === userB.id);

      // Alice is owed ₹100 (+10000 paise), Bob owes ₹100 (-10000 paise)
      assert.strictEqual(alice.netBalancePaise, 10000);
      assert.strictEqual(bob.netBalancePaise, -10000);

      // Suggestion: Bob -> Alice ₹100 with UPI URI
      assert.strictEqual(res.body.suggestions.length, 1);
      assert.strictEqual(res.body.suggestions[0].fromUser, userB.id);
      assert.strictEqual(res.body.suggestions[0].toUser, userA.id);
      assert.strictEqual(res.body.suggestions[0].amountPaise, 10000);
      assert.ok(res.body.suggestions[0].upiUri);
      assert.ok(res.body.suggestions[0].upiUri.includes('alice%40upi'));
    });
  });

  describe('getGroupDebts', () => {
    it('should return detailed person-to-person debt graph and policy', async () => {
      const req = { groupId: testGroup.id };
      const res = createMockRes();

      await getGroupDebts(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.debts.length, 1);
      assert.strictEqual(res.body.debts[0].fromUser, userB.id);
      assert.strictEqual(res.body.debts[0].toUser, userA.id);
      assert.strictEqual(res.body.debts[0].amountPaise, 10000);
      assert.ok(res.body.policy);
    });
  });

  describe('getGroupActivity', () => {
    it('should return chronological activity logs', async () => {
      const req = { groupId: testGroup.id, query: { limit: 10, offset: 0 } };
      const res = createMockRes();

      await getGroupActivity(req, res, () => {});

      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.activities));
      assert.ok(res.body.activities.length > 0);
      assert.ok(res.body.activities[0].action);
      assert.ok(res.body.activities[0].actor_name);
    });
  });
});
