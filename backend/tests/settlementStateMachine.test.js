const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');

describe('Settlement state transition matrix', () => {
  let payer;
  let receiver;
  let groupId;
  let payerToken;
  let receiverToken;

  before(async () => {
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payerResult = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('State payer', $1, 'test-hash') RETURNING id`,
      [`state-payer-${tag}@example.com`]
    );
    const receiverResult = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('State receiver', $1, 'test-hash') RETURNING id`,
      [`state-receiver-${tag}@example.com`]
    );
    payer = payerResult.rows[0];
    receiver = receiverResult.rows[0];

    const groupResult = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`State matrix ${tag}`, `SM_${tag}`, payer.id]
    );
    groupId = groupResult.rows[0].id;

    await query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')`,
      [groupId, payer.id, receiver.id]
    );

    const expenseResult = await query(
      `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, split_type)
       VALUES ($1, $2, 'Settlement state matrix debt', 2000, 'exact') RETURNING id`,
      [groupId, receiver.id]
    );
    await query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, 2000)',
      [expenseResult.rows[0].id, receiver.id]
    );
    await query(
      `INSERT INTO expense_participants (expense_id, user_id, share_amount_paise)
       VALUES ($1, $2, 2000)`,
      [expenseResult.rows[0].id, payer.id]
    );

    payerToken = jwt.sign({ userId: payer.id }, JWT_SECRET, { expiresIn: '1h' });
    receiverToken = jwt.sign({ userId: receiver.id }, JWT_SECRET, { expiresIn: '1h' });
  });

  after(async () => {
    if (groupId) await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    if (payer?.id && receiver?.id) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [[payer.id, receiver.id]]);
    }
    await pool.end();
  });

  it('enforces legal roles and terminal states across mark, confirm, and reject', async () => {
    async function createSettlement(amountPaise) {
      const response = await request(app)
        .post(`/api/groups/${groupId}/settlements`)
        .set('Authorization', `Bearer ${payerToken}`)
        .send({ fromUser: payer.id, toUser: receiver.id, amountPaise });
      assert.equal(response.status, 201, response.body.error);
      return response.body.settlement.id;
    }

    async function transition(action, id, token) {
      return request(app)
        .post(`/api/settlements/${id}/${action}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }

    const firstId = await createSettlement(1000);
    const secondId = await createSettlement(1000);

    const payerConfirmPending = await transition('confirm', firstId, payerToken);
    const receiverMarkPending = await transition('mark-paid', firstId, receiverToken);
    const payerMark = await transition('mark-paid', firstId, payerToken);
    const payerMarkAgain = await transition('mark-paid', firstId, payerToken);
    const markConfirmed = await transition('confirm', firstId, receiverToken);
    const markConfirmedAgain = await transition('mark-paid', firstId, payerToken);
    const confirmAgain = await transition('confirm', firstId, receiverToken);
    const rejectConfirmed = await transition('reject', firstId, receiverToken);
    const rejectSecond = await transition('reject', secondId, receiverToken);
    const markRejected = await transition('mark-paid', secondId, payerToken);
    const confirmMissing = await transition('confirm', 2147483000, receiverToken);

    assert.deepEqual(
      [
        payerConfirmPending.status,
        receiverMarkPending.status,
        payerMark.status,
        payerMarkAgain.status,
        markConfirmed.status,
        markConfirmedAgain.status,
        confirmAgain.status,
        rejectConfirmed.status,
        rejectSecond.status,
        markRejected.status,
        confirmMissing.status,
      ],
      [403, 403, 200, 400, 200, 400, 400, 400, 200, 400, 404]
    );
    assert.match(payerMarkAgain.body.error, /already marked as paid/i);
    assert.match(markConfirmedAgain.body.error, /already confirmed/i);
    assert.match(markRejected.body.error, /rejected/i);
    assert.match(confirmMissing.body.error, /not found/i);
  });
});
