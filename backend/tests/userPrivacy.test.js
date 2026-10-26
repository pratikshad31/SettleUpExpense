const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config');
const { pool, query } = require('../src/db');

describe('User lookup privacy', () => {
  let caller;
  let unrelatedUser;
  let sharedUser;
  let groupId;
  let callerToken;
  let searchTerm;
  let userIds = [];

  before(async () => {
    const uniqueTag = Date.now().toString();
    searchTerm = `F5Probe${uniqueTag}`;

    async function createUser(label) {
      const result = await query(
        `INSERT INTO users (name, email, password_hash, upi_id)
         VALUES ($1, $2, 'test-hash', $3) RETURNING id, name, email, upi_id`,
        [
          `${searchTerm} ${label}`,
          `${searchTerm.toLowerCase()}-${label.toLowerCase()}@example.com`,
          `${searchTerm.toLowerCase()}-${label.toLowerCase()}@upi`,
        ]
      );
      userIds.push(result.rows[0].id);
      return result.rows[0];
    }

    caller = await createUser('Caller');
    unrelatedUser = await createUser('Stranger');
    sharedUser = await createUser('Shared');

    const groupResult = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [`${searchTerm} group`, `${searchTerm.slice(-20)}G`, caller.id]
    );
    groupId = groupResult.rows[0].id;
    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'member', 'active')`,
      [groupId, caller.id, sharedUser.id]
    );

    callerToken = jwt.sign({ userId: caller.id }, JWT_SECRET, { expiresIn: '1h' });
  });

  after(async () => {
    if (groupId) await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
    await pool.end();
  });

  it('returns no search results for users with no shared group', async () => {
    const response = await request(app)
      .get('/api/users/search')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ q: `${searchTerm} Stranger` });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.users, []);
  });

  it('denies UPI lookup for an unrelated guessed numeric user ID', async () => {
    const response = await request(app)
      .get('/api/settlements/upi-details')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ toUserId: unrelatedUser.id, amountPaise: 100 });

    assert.equal(response.status, 403);
  });

  it('allows shared-group search and UPI lookup with minimal search fields', async () => {
    const searchResponse = await request(app)
      .get('/api/users/search')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ q: searchTerm });

    assert.equal(searchResponse.status, 200);
    assert.equal(searchResponse.body.users.length, 1);
    assert.deepEqual(Object.keys(searchResponse.body.users[0]).sort(), ['id', 'name']);
    assert.equal(searchResponse.body.users[0].id, sharedUser.id);

    const upiResponse = await request(app)
      .get('/api/settlements/upi-details')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ toUserId: sharedUser.id, amountPaise: 100 });

    assert.equal(upiResponse.status, 200);
    assert.equal(upiResponse.body.upiId, sharedUser.upi_id);
  });

  it('does not treat an inactive group member as shared', async () => {
    await query(
      `UPDATE group_members SET status = 'inactive'
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, sharedUser.id]
    );

    const searchResponse = await request(app)
      .get('/api/users/search')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ q: `${searchTerm} Shared` });
    assert.equal(searchResponse.status, 200);
    assert.deepEqual(searchResponse.body.users, []);

    const upiResponse = await request(app)
      .get('/api/settlements/upi-details')
      .set('Authorization', `Bearer ${callerToken}`)
      .query({ toUserId: sharedUser.id, amountPaise: 100 });
    assert.equal(upiResponse.status, 403);
  });
});
