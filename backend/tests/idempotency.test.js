const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');

describe('Idempotency', () => {
  let payerA;
  let payerB;
  let payerC;
  let groupId;
  let tokenA;
  let tokenB;
  const userIds = [];
  const uniqueTag = Date.now().toString();

  before(async () => {
    async function createUser(label) {
      const result = await query(
        `INSERT INTO users (name, email, password_hash, upi_id)
         VALUES ($1, $2, 'test-hash', $3) RETURNING id`,
        [`F6 ${label} ${uniqueTag}`, `f6-${label.toLowerCase()}-${uniqueTag}@example.com`, `f6-${label.toLowerCase()}@upi`]
      );
      userIds.push(result.rows[0].id);
      return result.rows[0];
    }

    payerA = await createUser('A');
    payerB = await createUser('B');
    payerC = await createUser('C');
    const group = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`F6 group ${uniqueTag}`, `F6_${uniqueTag}`, payerA.id]
    );
    groupId = group.rows[0].id;
    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'member', 'active'),
       ($1, $4, 'member', 'active')`,
      [groupId, payerA.id, payerB.id, payerC.id]
    );

    const debtToA = await query(
      `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, split_type)
       VALUES ($1, $2, $3, 100000, 'exact') RETURNING id`,
      [groupId, payerB.id, `F6 debt to A ${uniqueTag}`]
    );
    await query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, 100000)',
      [debtToA.rows[0].id, payerB.id]
    );
    await query(
      'INSERT INTO expense_participants (expense_id, user_id, share_amount_paise) VALUES ($1, $2, 100000)',
      [debtToA.rows[0].id, payerA.id]
    );

    const debtToB = await query(
      `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, split_type)
       VALUES ($1, $2, $3, 100000, 'exact') RETURNING id`,
      [groupId, payerC.id, `F6 debt to B ${uniqueTag}`]
    );
    await query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, 100000)',
      [debtToB.rows[0].id, payerC.id]
    );
    await query(
      'INSERT INTO expense_participants (expense_id, user_id, share_amount_paise) VALUES ($1, $2, 100000)',
      [debtToB.rows[0].id, payerB.id]
    );

    tokenA = jwt.sign({ userId: payerA.id }, JWT_SECRET, { expiresIn: '1h' });
    tokenB = jwt.sign({ userId: payerB.id }, JWT_SECRET, { expiresIn: '1h' });
  });

  after(async () => {
    if (groupId) await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
    await pool.end();
  });

  function settlementPost(token, fromUser, toUser, key, body = {}) {
    return request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ fromUser, toUser, amountPaise: 500, ...body });
  }

  async function waitForRecord(key, userId) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await query(
        `SELECT id FROM idempotency_records WHERE idempotency_key = $1 AND user_id = $2`,
        [key, userId]
      );
      if (result.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  it('creates one settlement for five concurrent requests with the same key', async () => {
    const key = `F6-settlement-concurrent-${uniqueTag}`;
    const notes = `${key}-note`;
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE settlements IN SHARE MODE');

    const responsePromises = Array.from(
      { length: 5 },
      () => settlementPost(tokenA, payerA.id, payerB.id, key, { notes })
    );
    let conflictResponse;
    let conflictTimer;
    try {
      conflictResponse = await Promise.race([
        ...responsePromises.map((responsePromise) => responsePromise.then((response) => (
          response.status === 409 ? response : new Promise(() => {})
        ))),
        new Promise((resolve) => {
          conflictTimer = setTimeout(() => resolve(null), 1500);
        }),
      ]);
    } finally {
      clearTimeout(conflictTimer);
      await blocker.query('ROLLBACK');
      blocker.release();
    }

    const responses = await Promise.all(responsePromises);

    assert.equal(conflictResponse?.status, 409, 'concurrent duplicate should see the reserved in-progress key');
    assert.ok(responses.every((response) => response.status === 201 || response.status === 409));
    const createdIds = responses
      .filter((response) => response.status === 201)
      .map((response) => response.body.settlement.id);
    assert.ok(createdIds.length >= 1);
    assert.equal(new Set(createdIds).size, 1);

    const count = await query(
      'SELECT COUNT(*)::int AS count FROM settlements WHERE group_id = $1 AND notes = $2',
      [groupId, notes]
    );
    assert.equal(count.rows[0].count, 1);
  });

  it('keeps the same key independent between users and preserves the first response', async () => {
    const key = `F6-settlement-two-users-${uniqueTag}`;
    const first = await settlementPost(tokenA, payerA.id, payerB.id, key, { notes: `${key}-a` });
    await waitForRecord(key, payerA.id);
    const second = await settlementPost(tokenB, payerB.id, payerC.id, key, { notes: `${key}-b` });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.settlement.id, second.body.settlement.id);

    await waitForRecord(key, payerB.id);
    const firstRetry = await settlementPost(tokenA, payerA.id, payerB.id, key, { notes: `${key}-a` });
    assert.equal(firstRetry.status, 201);
    assert.equal(firstRetry.headers['x-cache-lookup'], 'HIT');
    assert.equal(firstRetry.body.settlement.id, first.body.settlement.id);

    const records = await query(
      `SELECT response_body FROM idempotency_records
       WHERE idempotency_key = $1 AND user_id = $2`,
      [key, payerA.id]
    );
    const storedBody = typeof records.rows[0].response_body === 'string'
      ? JSON.parse(records.rows[0].response_body)
      : records.rows[0].response_body;
    assert.equal(storedBody.settlement.id, first.body.settlement.id);
  });

  it('does not replay a response for a different route with the same key', async () => {
    const key = `F6-settlement-different-route-${uniqueTag}`;
    const created = await settlementPost(tokenA, payerA.id, payerB.id, key, { notes: `${key}-note` });
    assert.equal(created.status, 201);
    await waitForRecord(key, payerA.id);

    const markedPaid = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/mark-paid`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({ referenceId: `${key}-reference` });

    assert.equal(markedPaid.status, 200);
    assert.equal(markedPaid.body.settlement.status, 'marked_paid');
  });

  it('returns 422 when the same user, route, and key are reused with a different body', async () => {
    const key = `F6-settlement-different-body-${uniqueTag}`;
    const first = await settlementPost(tokenA, payerA.id, payerB.id, key, { notes: `${key}-first` });
    assert.equal(first.status, 201);
    await waitForRecord(key, payerA.id);

    const differentBody = await settlementPost(tokenA, payerA.id, payerB.id, key, {
      amountPaise: 700,
      notes: `${key}-changed`,
    });
    assert.equal(differentBody.status, 422);

    const count = await query(
      'SELECT COUNT(*)::int AS count FROM settlements WHERE group_id = $1 AND notes LIKE $2',
      [groupId, `${key}%`]
    );
    assert.equal(count.rows[0].count, 1);
  });

  it('creates one expense when retried with the same key', async () => {
    const key = `F6-expense-retry-${uniqueTag}`;
    const description = `${key} expense`;
    const sendExpense = () => request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({ description, amountPaise: 1000, participantIds: [payerA.id, payerB.id] });

    const responses = await Promise.all([sendExpense(), sendExpense()]);
    assert.ok(responses.every((response) => response.status === 201 || response.status === 409));
    const createdIds = responses
      .filter((response) => response.status === 201)
      .map((response) => response.body.expense.id);
    assert.ok(createdIds.length >= 1);
    assert.equal(new Set(createdIds).size, 1);

    const count = await query(
      'SELECT COUNT(*)::int AS count FROM expenses WHERE group_id = $1 AND description = $2',
      [groupId, description]
    );
    assert.equal(count.rows[0].count, 1);
  });

  it('releases the reservation after a 5xx so a corrected retry can run', async () => {
    const key = `F6-expense-release-${uniqueTag}`;
    const failed = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({
        description: `${key} failed date`,
        amountPaise: 1000,
        participantIds: [payerA.id, payerB.id],
        expenseDate: 'not-a-date',
      });
    assert.equal(failed.status, 500);

    const reservation = await query(
      `SELECT COUNT(*)::int AS count FROM idempotency_records
       WHERE idempotency_key = $1 AND user_id = $2`,
      [key, payerA.id]
    );
    assert.equal(reservation.rows[0].count, 0);

    const retried = await request(app)
      .post(`/api/groups/${groupId}/expenses`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send({
        description: `${key} corrected`,
        amountPaise: 1000,
        participantIds: [payerA.id, payerB.id],
      });
    assert.equal(retried.status, 201);
  });
});
