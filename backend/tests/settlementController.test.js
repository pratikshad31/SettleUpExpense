// backend/tests/settlementController.test.js
// Dedicated tests for settlementController functions (src/controllers/settlementController.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  createSettlement,
  markPaid,
  confirmSettlement,
  rejectSettlement,
  getGroupSettlements,
  getUpiDetails,
} = require('../src/controllers/settlementController');
const { pool, query } = require('../src/db');

describe('Settlement Controller (src/controllers/settlementController.js)', () => {
  let payerUser, recipientUser, thirdUser;
  let testGroup;

  before(async () => {
    const u1 = await query(`INSERT INTO users (name, email, password_hash, upi_id) VALUES ('Payer', 'payer_${Date.now()}@example.com', 'h', 'payer@okhdfcbank') RETURNING *`);
    const u2 = await query(`INSERT INTO users (name, email, password_hash, upi_id) VALUES ('Recipient', 'recv_${Date.now()}@example.com', 'h', 'recv@okhdfcbank') RETURNING *`);
    const u3 = await query(`INSERT INTO users (name, email, password_hash) VALUES ('Third', 'third_${Date.now()}@example.com', 'h') RETURNING *`);
    payerUser = u1.rows[0];
    recipientUser = u2.rows[0];
    thirdUser = u3.rows[0];

    const grp = await query(
      `INSERT INTO groups (name, invite_code, created_by) VALUES ('Settlement Test Group', $1, $2) RETURNING *`,
      ['ST_' + Math.random().toString(36).substring(2, 7).toUpperCase(), payerUser.id]
    );
    testGroup = grp.rows[0];

    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'member', 'active'),
       ($1, $4, 'member', 'active')`,
      [testGroup.id, payerUser.id, recipientUser.id, thirdUser.id]
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

  describe('createSettlement', () => {
    it('should reject settling with self', async () => {
      const req = {
        groupId: testGroup.id,
        user: payerUser,
        body: { fromUser: payerUser.id, toUser: payerUser.id, amountINR: 100 },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /cannot settle with themselves/i);
    });

    it('should reject amount <= 0', async () => {
      const req = {
        groupId: testGroup.id,
        user: payerUser,
        body: { fromUser: payerUser.id, toUser: recipientUser.id, amountINR: 0 },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /greater than 0/i);
    });

    it('should create settlement proposal in pending status', async () => {
      const req = {
        groupId: testGroup.id,
        user: payerUser,
        body: {
          fromUser: payerUser.id,
          toUser: recipientUser.id,
          amountINR: 250,
          paymentMethod: 'upi',
          notes: 'Dinner settlement',
        },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.settlement.status, 'pending');
      assert.strictEqual(Number(res.body.settlement.amount_paise), 25000);
    });

    it('should always set status to pending when payer records a payment, even if confirmed was requested', async () => {
      const req = {
        groupId: testGroup.id,
        user: payerUser,
        body: {
          fromUser: payerUser.id,
          toUser: recipientUser.id,
          amountINR: 50,
          status: 'confirmed',
          settleImmediately: true,
          notes: 'Settled from suggestion',
        },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.settlement.status, 'pending');
      assert.strictEqual(res.body.settlement.confirmed_at, null);
    });

    it('should reject settling debt if logged-in user is not the payer', async () => {
      const req = {
        groupId: testGroup.id,
        user: recipientUser, // recipient, not the payer
        body: {
          fromUser: payerUser.id,
          toUser: recipientUser.id,
          amountINR: 50,
          status: 'confirmed',
          settleImmediately: true,
          notes: 'Unauthorized settlement attempt',
        },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.error, /only settle your own debts/i);
    });
  });

  describe('markPaid, confirmSettlement, and rejectSettlement', () => {
    let settlement;

    before(async () => {
      const req = {
        groupId: testGroup.id,
        user: payerUser,
        body: {
          fromUser: payerUser.id,
          toUser: recipientUser.id,
          amountINR: 500,
        },
      };
      const res = createMockRes();
      await createSettlement(req, res, () => {});
      settlement = res.body.settlement;
    });

    it('should allow payer to mark settlement as paid', async () => {
      const req = {
        groupId: testGroup.id,
        params: { settlementId: settlement.id },
        user: payerUser,
        membership: { role: 'member' },
        body: { referenceId: 'UPI/REF/999' },
      };
      const res = createMockRes();
      await markPaid(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.settlement.status, 'marked_paid');
    });

    it('should prevent payer from confirming their own payment', async () => {
      const req = {
        groupId: testGroup.id,
        params: { settlementId: settlement.id },
        user: payerUser,
        membership: { role: 'owner' },
      };
      const res = createMockRes();
      let errThrown = null;
      await confirmSettlement(req, res, (err) => {
        errThrown = err;
      });
      assert.ok(errThrown);
      assert.strictEqual(errThrown.status, 403);
      assert.match(errThrown.message, /payer cannot confirm their own payment/i);
    });

    it('should prevent unrelated third-party member or group owner from confirming if not the receiver', async () => {
      const req = {
        groupId: testGroup.id,
        params: { settlementId: settlement.id },
        user: thirdUser,
        membership: { role: 'owner' },
      };
      const res = createMockRes();
      let errThrown = null;
      await confirmSettlement(req, res, (err) => {
        errThrown = err;
      });
      assert.ok(errThrown);
      assert.strictEqual(errThrown.status, 403);
      assert.match(errThrown.message, /Only the receiver/i);
    });

    it('should allow recipient to confirm settlement', async () => {
      const req = {
        groupId: testGroup.id,
        params: { settlementId: settlement.id },
        user: recipientUser,
        membership: { role: 'member' },
      };
      const res = createMockRes();
      await confirmSettlement(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.settlement.status, 'confirmed');
    });

    it('should reject already confirmed settlement from being rejected or re-confirmed', async () => {
      const req = {
        groupId: testGroup.id,
        params: { settlementId: settlement.id },
        user: recipientUser,
        membership: { role: 'member' },
      };
      let errThrown = null;
      await rejectSettlement(req, createMockRes(), (err) => {
        errThrown = err;
      });
      assert.ok(errThrown);
      assert.strictEqual(errThrown.status, 400);
      assert.match(errThrown.message, /already confirmed/i);
    });
  });

  describe('getUpiDetails', () => {
    it('should generate valid UPI deep link and details for recipient with UPI ID', async () => {
      const req = {
        query: { toUserId: recipientUser.id, amountINR: '150.50', note: 'Dinner split' },
      };
      const res = createMockRes();
      await getUpiDetails(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.upiId, 'recv@okhdfcbank');
      assert.strictEqual(res.body.amountPaise, 15050);
      assert.ok(res.body.upiUri.startsWith('upi://pay?'));
    });

    it('should reject when recipient has no UPI ID registered', async () => {
      const req = {
        query: { toUserId: thirdUser.id, amountINR: '100' },
      };
      const res = createMockRes();
      await getUpiDetails(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /does not have a UPI ID registered/i);
    });
  });
});
