const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');
const { leaveGroup } = require('../src/controllers/groupController');

describe('Expense edit and group leave concurrency', () => {
  const createdGroups = [];
  const createdUsers = [];
  let sequence = 0;

  after(async () => {
    await pool.query('DROP TRIGGER IF EXISTS f8_force_leave_failure ON activity_logs');
    await pool.query('DROP FUNCTION IF EXISTS f8_fail_leave_activity()');
    for (const groupId of createdGroups) {
      await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    }
    if (createdUsers.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUsers]);
    }
    await pool.end();
  });

  async function createScenario() {
    sequence += 1;
    const tag = `${Date.now()}_${sequence}`;
    async function createUser(label) {
      const result = await query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, 'test-hash') RETURNING id, name`,
        [`F8 ${label} ${tag}`, `f8-${label.toLowerCase()}-${tag}@example.com`]
      );
      createdUsers.push(result.rows[0].id);
      return result.rows[0];
    }

    const owner = await createUser('Owner');
    const member = await createUser('Member');
    const third = await createUser('Third');
    const group = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`F8 group ${tag}`, `F8_${tag}`, owner.id]
    );
    const groupId = group.rows[0].id;
    createdGroups.push(groupId);
    await query(
      `INSERT INTO group_members (group_id, user_id, role, status, joined_at) VALUES
       ($1, $2, 'owner', 'active', CURRENT_TIMESTAMP - INTERVAL '3 days'),
       ($1, $3, 'member', 'active', CURRENT_TIMESTAMP - INTERVAL '1 day'),
       ($1, $4, 'member', 'active', CURRENT_TIMESTAMP - INTERVAL '2 days')`,
      [groupId, owner.id, member.id, third.id]
    );

    const token = (user) => jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    return {
      owner,
      member,
      third,
      groupId,
      ownerToken: token(owner),
      memberToken: token(member),
      thirdToken: token(third),
    };
  }

  async function addDirectedDebt(scenario, debtorId, creditorId, amountPaise) {
    const expense = await query(
      `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, split_type)
       VALUES ($1, $2, $3, $4, 'exact') RETURNING id`,
      [scenario.groupId, creditorId, `F8 debt ${Date.now()}_${sequence}`, amountPaise]
    );
    const expenseId = expense.rows[0].id;
    await query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, $3)',
      [expenseId, creditorId, amountPaise]
    );
    await query(
      'INSERT INTO expense_participants (expense_id, user_id, share_amount_paise) VALUES ($1, $2, $3)',
      [expenseId, debtorId, amountPaise]
    );
    return expenseId;
  }

  async function createExpense(scenario) {
    const response = await request(app)
      .post(`/api/groups/${scenario.groupId}/expenses`)
      .set('Authorization', `Bearer ${scenario.ownerToken}`)
      .send({
        description: `F8 editable expense ${sequence}`,
        amountPaise: 10000,
        participantIds: [scenario.owner.id, scenario.member.id],
      });
    assert.equal(response.status, 201);
    return response.body.expense;
  }

  function editExpense(scenario, expense, version, description) {
    return request(app)
      .put(`/api/expenses/${expense.id}`)
      .set('Authorization', `Bearer ${scenario.ownerToken}`)
      .send({
        version,
        description,
        amountPaise: 10000,
        participantIds: [scenario.owner.id, scenario.member.id],
      });
  }

  function directLeave(scenario) {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const errors = [];
    return leaveGroup(
      { groupId: scenario.groupId, user: scenario.owner, membership: { role: 'owner' } },
      res,
      (error) => errors.push(error)
    ).then(() => ({ res, errors }));
  }

  it('returns one 200 and one 409 for simultaneous edits using the same version', async () => {
    const scenario = await createScenario();
    const expense = await createExpense(scenario);

    const responses = await Promise.all([
      editExpense(scenario, expense, expense.version, 'F8 concurrent edit A'),
      editExpense(scenario, expense, expense.version, 'F8 concurrent edit B'),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.match(responses.find((response) => response.status === 409).body.error, /updated by another request/i);

    const saved = await query('SELECT version FROM expenses WHERE id = $1', [expense.id]);
    const versions = await query('SELECT version FROM expense_versions WHERE expense_id = $1 ORDER BY version', [expense.id]);
    assert.equal(saved.rows[0].version, 2);
    assert.deepEqual(versions.rows.map((row) => row.version), [1, 2]);
  });

  it('lets only one parallel leave complete, promotes the earliest joined member, and denies later access', async () => {
    const scenario = await createScenario();
    const responses = await Promise.all([directLeave(scenario), directLeave(scenario)]);
    assert.deepEqual(responses.map(({ res }) => res.statusCode).sort(), [200, 403]);

    const memberships = await query(
      `SELECT user_id, role, status FROM group_members WHERE group_id = $1 ORDER BY user_id`,
      [scenario.groupId]
    );
    const ownerMembership = memberships.rows.find((row) => row.user_id === scenario.owner.id);
    const earliestMember = memberships.rows.find((row) => row.user_id === scenario.third.id);
    assert.equal(ownerMembership.status, 'inactive');
    assert.equal(earliestMember.role, 'owner');

    const access = await request(app)
      .get(`/api/groups/${scenario.groupId}`)
      .set('Authorization', `Bearer ${scenario.ownerToken}`);
    assert.equal(access.status, 403);
  });

  it('blocks leaving on a nonzero net balance with the paise amount', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.owner.id, scenario.member.id, 25000);

    const { res } = await directLeave(scenario);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'Cannot leave group: your net balance is -25000 paise. Settle up first.');

    const membership = await query(
      'SELECT status FROM group_members WHERE group_id = $1 AND user_id = $2',
      [scenario.groupId, scenario.owner.id]
    );
    assert.equal(membership.rows[0].status, 'active');
  });

  it('blocks leaving when the member is a payer or receiver on pending settlements', async () => {
    const scenario = await createScenario();
    await pool.query(
      `INSERT INTO settlements (group_id, created_by, from_user, to_user, amount_paise, status)
       VALUES ($1, $2, $2, $3, 1, 'pending'),
              ($1, $3, $4, $2, 1, 'pending')`,
      [scenario.groupId, scenario.owner.id, scenario.member.id, scenario.third.id]
    );

    const { res } = await directLeave(scenario);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'Cannot leave group: you have 2 pending settlement(s).');
  });

  it('serializes leaving against settlement creation and never leaves pending rows for inactive users', async () => {
    const scenario = await createScenario();
    await addDirectedDebt(scenario, scenario.owner.id, scenario.member.id, 100);
    await addDirectedDebt(scenario, scenario.third.id, scenario.owner.id, 100);

    const [leaveResponse, settlementResponse] = await Promise.all([
      request(app)
        .post(`/api/groups/${scenario.groupId}/leave`)
        .set('Authorization', `Bearer ${scenario.ownerToken}`)
        .send({}),
      request(app)
        .post(`/api/groups/${scenario.groupId}/settlements`)
        .set('Authorization', `Bearer ${scenario.ownerToken}`)
        .send({ fromUser: scenario.owner.id, toUser: scenario.member.id, amountPaise: 100 }),
    ]);

    const leaveWon = leaveResponse.status === 200;
    const createWon = settlementResponse.status === 201;
    assert.notEqual(leaveWon, createWon);

    const inactivePending = await query(
      `SELECT COUNT(*)::int AS count
       FROM settlements s
       JOIN group_members payer ON payer.group_id = s.group_id AND payer.user_id = s.from_user
       JOIN group_members receiver ON receiver.group_id = s.group_id AND receiver.user_id = s.to_user
       WHERE s.group_id = $1 AND s.status IN ('pending', 'marked_paid')
         AND (payer.status <> 'active' OR receiver.status <> 'active')`,
      [scenario.groupId]
    );
    assert.equal(inactivePending.rows[0].count, 0);
  });

  it('rolls back membership and owner promotion when a leave operation fails mid-transaction', async () => {
    const scenario = await createScenario();
    const functionName = 'f8_fail_leave_activity';
    await pool.query(`DROP TRIGGER IF EXISTS f8_force_leave_failure ON activity_logs`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await pool.query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.action = 'left' AND NEW.actor_id = ${scenario.owner.id} THEN
           RAISE EXCEPTION 'F8 simulated leave failure';
         END IF;
         RETURN NEW;
       END;
       $$`
    );
    await pool.query(
      `CREATE TRIGGER f8_force_leave_failure BEFORE INSERT ON activity_logs
       FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
    );

    try {
      const { res, errors } = await directLeave(scenario);
      assert.equal(res.statusCode, 200);
      assert.equal(errors.length, 1);
      const rows = await query(
        `SELECT user_id, role, status FROM group_members WHERE group_id = $1 ORDER BY user_id`,
        [scenario.groupId]
      );
      assert.equal(rows.rows.find((row) => row.user_id === scenario.owner.id).status, 'active');
      assert.equal(rows.rows.find((row) => row.user_id === scenario.owner.id).role, 'owner');
      assert.equal(rows.rows.find((row) => row.user_id === scenario.third.id).role, 'member');
      const leaveActivity = await query(
        `SELECT COUNT(*)::int AS count FROM activity_logs
         WHERE group_id = $1 AND actor_id = $2 AND action = 'left'`,
        [scenario.groupId, scenario.owner.id]
      );
      assert.equal(leaveActivity.rows[0].count, 0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS f8_force_leave_failure ON activity_logs');
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  });
});
