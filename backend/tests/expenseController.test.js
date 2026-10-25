// backend/tests/expenseController.test.js
// Dedicated tests for expenseController functions (src/controllers/expenseController.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createExpense, updateExpense, voidExpense, getExpenseDetails } = require('../src/controllers/expenseController');
const { pool, query } = require('../src/db');

describe('Expense Controller (src/controllers/expenseController.js)', () => {
  let user1, user2, user3;
  let testGroup;

  before(async () => {
    const u1 = await query(`INSERT INTO users (name, email, password_hash) VALUES ('Exp User 1', 'exp1_${Date.now()}@example.com', 'h') RETURNING *`);
    const u2 = await query(`INSERT INTO users (name, email, password_hash) VALUES ('Exp User 2', 'exp2_${Date.now()}@example.com', 'h') RETURNING *`);
    const u3 = await query(`INSERT INTO users (name, email, password_hash) VALUES ('Exp User 3', 'exp3_${Date.now()}@example.com', 'h') RETURNING *`);
    user1 = u1.rows[0];
    user2 = u2.rows[0];
    user3 = u3.rows[0];

    const grp = await query(
      `INSERT INTO groups (name, invite_code, created_by) VALUES ('Expense Testing Group', $1, $2) RETURNING *`,
      ['EXP_' + Math.random().toString(36).substring(2, 7).toUpperCase(), user1.id]
    );
    testGroup = grp.rows[0];

    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'member', 'active'),
       ($1, $4, 'member', 'active')`,
      [testGroup.id, user1.id, user2.id, user3.id]
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

  describe('createExpense', () => {
    it('should reject missing description', async () => {
      const req = {
        groupId: testGroup.id,
        user: user1,
        body: { description: '', amountINR: 100 },
      };
      const res = createMockRes();
      await createExpense(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /description is required/i);
    });

    it('should reject non-positive amount', async () => {
      const req = {
        groupId: testGroup.id,
        user: user1,
        body: { description: 'Dinner', amountINR: 0 },
      };
      const res = createMockRes();
      await createExpense(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /greater than 0/i);
    });

    it('should create expense, store payers, participants, version 1, and activity', async () => {
      const req = {
        groupId: testGroup.id,
        user: user1,
        body: {
          description: 'Team Dinner',
          amountINR: 300,
          category: 'Food & Dining',
          splitType: 'equal',
          participantIds: [user1.id, user2.id, user3.id],
        },
      };
      const res = createMockRes();
      await createExpense(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.expense.description, 'Team Dinner');
      assert.strictEqual(Number(res.body.expense.total_amount_paise), 30000);
      assert.strictEqual(res.body.expense.version, 1);
    });
  });

  describe('updateExpense and voidExpense', () => {
    let createdExp;

    before(async () => {
      const req = {
        groupId: testGroup.id,
        user: user1,
        body: {
          description: 'Original Movie',
          amountINR: 600,
          splitType: 'equal',
          participantIds: [user1.id, user2.id],
        },
      };
      const res = createMockRes();
      await createExpense(req, res, () => {});
      createdExp = res.body.expense;
    });

    it('should allow non-creator regular group member to edit and update expense', async () => {
      const req = {
        groupId: testGroup.id,
        params: { expenseId: createdExp.id },
        user: user2,
        membership: { role: 'member' },
        body: {
          description: 'Member Updated Expense',
          amountINR: 600,
          splitType: 'equal',
          participantIds: [user1.id, user2.id],
          reason: 'Updated by group member',
        },
      };
      const res = createMockRes();
      await updateExpense(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.expense.description, 'Member Updated Expense');
      assert.strictEqual(Number(res.body.expense.total_amount_paise), 60000);
    });

    it('should allow creator to update expense, incrementing version to 2', async () => {
      const req = {
        groupId: testGroup.id,
        params: { expenseId: createdExp.id },
        user: user1,
        membership: { role: 'owner' },
        body: {
          description: 'Updated Movie & Popcorn',
          amountINR: 750,
          splitType: 'equal',
          participantIds: [user1.id, user2.id],
          reason: 'Added popcorn',
        },
      };
      const res = createMockRes();
      await updateExpense(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.expense.version, 3);
      assert.strictEqual(Number(res.body.expense.total_amount_paise), 75000);
    });

    it('should void expense, record voided_by, and prevent subsequent updates', async () => {
      const voidReq = {
        groupId: testGroup.id,
        params: { expenseId: createdExp.id },
        user: user1,
        membership: { role: 'owner' },
      };
      const voidRes = createMockRes();
      await voidExpense(voidReq, voidRes, () => {});
      assert.strictEqual(voidRes.statusCode, 200);
      assert.strictEqual(voidRes.body.expense.is_voided, true);

      // Attempt update on voided expense
      const updateReq = {
        groupId: testGroup.id,
        params: { expenseId: createdExp.id },
        user: user1,
        membership: { role: 'owner' },
        body: { description: 'Try Edit Voided', amountINR: 500 },
      };
      const updateRes = createMockRes();
      await updateExpense(updateReq, updateRes, () => {});
      assert.strictEqual(updateRes.statusCode, 400);
      assert.match(updateRes.body.error, /Cannot update a voided expense/i);
    });
  });
});
