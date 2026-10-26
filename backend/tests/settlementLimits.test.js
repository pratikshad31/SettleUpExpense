const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');

describe('Settlement debt limits', () => {
  const createdGroups = [];
  const createdUsers = [];
  let fixtureSequence = 0;

  after(async () => {
    for (const groupId of createdGroups) {
      await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    }
    if (createdUsers.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUsers]);
    }
    await pool.end();
  });

  async function createScenario({ thirdUser = false } = {}) {
    fixtureSequence += 1;
    const tag = `${Date.now()}_${fixtureSequence}`;
    async function createUser(label) {
      const result = await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, 'test-hash') RETURNING id, name`,
        [`F7 ${label} ${tag}`, `f7-${label.toLowerCase()}-${tag}@example.com`]
      );
      createdUsers.push(result.rows[0].id);
      return result.rows[0];
    }

    const payer = await createUser('Payer');
    const receiver = await createUser('Receiver');
    const third = thirdUser ? await createUser('Third') : null;
    const group = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`F7 group ${tag}`, `F7_${tag}`, payer.id]
    );
    const groupId = group.rows[0].id;
    createdGroups.push(groupId);

    await query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')`,
      [groupId, payer.id, receiver.id]
    );
    if (third) {
      await query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [groupId, third.id]
      );
    }

    function tokenFor(user) {
      return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    }

    return {
      payer,
      receiver,
      third,
      groupId,
      payerToken: tokenFor(payer),
      receiverToken: tokenFor(receiver),
      thirdToken: third ? tokenFor(third) : null,
    };
  }

  async function addDirectedDebt(scenario, debtorId, creditorId, amountPaise) {
    const expense = await query(
      `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, split_type)
       VALUES ($1, $2, $3, $4, 'exact') RETURNING id`,
      [scenario.groupId, creditorId, `F7 debt ${Date.now()} ${fixtureSequence}`, amountPaise]
    );
    const expenseId = expense.rows[0].id;
    await query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, $3)',
      [expenseId, creditorId, amountPaise]
    );
    await query(
      `INSERT INTO expense_participants (expense_id, user_id, share_amount_paise)
       VALUES ($1, $2, $3)`,
      [expenseId, debtorId, amountPaise]
    );
    return expenseId;
  }

  function createRequest(scenario, amountPaise, fromUser = scenario.payer, token = scenario.payerToken) {
    return request(app)
      .post(`/api/groups/${scenario.groupId}/settlements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fromUser: fromUser.id, toUser: scenario.receiver.id, amountPaise });
  }

  async function getPairSettlements(scenario) {
    return query(
      `SELECT id, amount_paise, status FROM settlements
       WHERE group_id = $1 AND from_user = $2 AND to_user = $3`,
      [scenario.groupId, scenario.payer.id, scenario.receiver.id]
    );
  }

  it('accepts a settlement equal to the net debt and rejects one paisa above it', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 100000);

    const exact = await createRequest(scenario, 100000);
    assert.equal(exact.status, 201);

    const over = await createRequest(scenario, 100001);
    assert.equal(over.status, 400);
    assert.match(over.body.error, /amount: 100001 exceeds the outstanding debt of 100000/);
  });

  it('rejects a settlement when the payer owes no money to the receiver', async () => {
    const scenario = await createScenario();
    const response = await createRequest(scenario, 1);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'amount: you do not owe this member anything in this group.');
  });

  it('rejects a settlement when the debt runs in the opposite direction', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.receiver.id, scenario.payer.id, 1000);

    const response = await createRequest(scenario, 1);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'amount: you do not owe this member anything in this group.');
  });

  it('nets opposite pairwise debts before applying the limit', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 500);
    await addDirectedDebt(scenario, scenario.receiver.id, scenario.payer.id, 200);

    const tooMuch = await createRequest(scenario, 301);
    assert.equal(tooMuch.status, 400);
    assert.match(tooMuch.body.error, /outstanding debt of 300/);

    const exact = await createRequest(scenario, 300);
    assert.equal(exact.status, 201);
  });

  it('subtracts pending pair settlements from the available debt', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 1000);

    const first = await createRequest(scenario, 600);
    assert.equal(first.status, 201);

    const overAvailable = await createRequest(scenario, 500);
    assert.equal(overAvailable.status, 400);
    assert.match(overAvailable.body.error, /outstanding debt of 1000 \(pending settlements reserve 600\)\. Maximum allowed: 400/);

    const remaining = await createRequest(scenario, 400);
    assert.equal(remaining.status, 201);
  });

  it('serializes concurrent creates so their combined amount cannot exceed the debt', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 1000);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => createRequest(scenario, 300))
    );
    assert.ok(responses.every((response) => response.status === 201 || response.status === 400));

    const settlements = await getPairSettlements(scenario);
    const totalReserved = settlements.rows
      .filter((settlement) => settlement.status === 'pending' || settlement.status === 'marked_paid')
      .reduce((sum, settlement) => sum + Number(settlement.amount_paise), 0);
    assert.ok(totalReserved <= 1000);
    assert.equal(settlements.rowCount, 3);
    assert.equal(totalReserved, 900);
  });

  it('rejects confirmation after the debt shrinks but still allows rejection', async () => {
    const scenario = await createScenario();
    const expenseId = await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 1000);
    const created = await createRequest(scenario, 800);
    assert.equal(created.status, 201);

    await pool.query('UPDATE expenses SET total_amount_paise = 500 WHERE id = $1', [expenseId]);
    await pool.query('UPDATE expense_payers SET amount_paise = 500 WHERE expense_id = $1', [expenseId]);
    await pool.query('UPDATE expense_participants SET share_amount_paise = 500 WHERE expense_id = $1', [expenseId]);

    const confirm = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/confirm`)
      .set('Authorization', `Bearer ${scenario.receiverToken}`)
      .send({});
    assert.equal(confirm.status, 409);

    const reject = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/reject`)
      .set('Authorization', `Bearer ${scenario.receiverToken}`)
      .send({ reason: 'Debt changed before payment confirmation' });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.settlement.status, 'rejected');
  });

  it('preserves payer-only creation and receiver confirmation, including double-confirm rejection and zero-sum balances', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 1000);
    const created = await createRequest(scenario, 1000);
    assert.equal(created.status, 201);

    const payerConfirm = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/confirm`)
      .set('Authorization', `Bearer ${scenario.payerToken}`)
      .send({});
    assert.equal(payerConfirm.status, 403);

    const confirmed = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/confirm`)
      .set('Authorization', `Bearer ${scenario.receiverToken}`)
      .send({});
    assert.equal(confirmed.status, 200);

    const doubleConfirm = await request(app)
      .post(`/api/settlements/${created.body.settlement.id}/confirm`)
      .set('Authorization', `Bearer ${scenario.receiverToken}`)
      .send({});
    assert.equal(doubleConfirm.status, 400);

    const balances = await request(app)
      .get(`/api/groups/${scenario.groupId}/balances`)
      .set('Authorization', `Bearer ${scenario.payerToken}`);
    assert.equal(balances.status, 200);
    assert.equal(balances.body.netSumPaise, 0);
    assert.equal(
      balances.body.balances.reduce((sum, balance) => sum + balance.netBalancePaise, 0),
      0
    );
  });

  it('allows a matching optimizer suggestion but caps it at the payer net owed amount', async () => {
    const scenario = await createScenario({ thirdUser: true });
    await addDirectedDebt(scenario, scenario.payer.id, scenario.third.id, 50);
    await addDirectedDebt(scenario, scenario.third.id, scenario.receiver.id, 50);

    const tooMuch = await createRequest(scenario, 51);
    assert.equal(tooMuch.status, 400);

    // The optimizer consolidates this indirect obligation into this exact payer/receiver suggestion.
    const matchingSuggestion = await createRequest(scenario, 50);
    assert.equal(matchingSuggestion.status, 201);
  });

  it('requires both settlement parties to remain active group members at creation', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.payer.id, scenario.receiver.id, 1000);
    await pool.query(
      `UPDATE group_members SET status = 'inactive' WHERE group_id = $1 AND user_id = $2`,
      [scenario.groupId, scenario.receiver.id]
    );

    const response = await createRequest(scenario, 100);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Both payer and recipient must be active members of the group');
  });
});
