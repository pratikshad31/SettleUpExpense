// backend/tests/groupAuth.test.js
// Dedicated tests for group authorization middleware (src/middleware/groupAuth.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { requireGroupMember, requireGroupAdmin, requireGroupOwner } = require('../src/middleware/groupAuth');
const { pool, query, withTransaction } = require('../src/db');

describe('Group Auth Middleware (src/middleware/groupAuth.js)', () => {
  let ownerUser, adminUser, regularUser, inactiveUser, nonMemberUser;
  let testGroup;

  before(async () => {
    // Create test users
    const users = await Promise.all([
      query(`INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner@grp.test', 'h') RETURNING id`),
      query(`INSERT INTO users (name, email, password_hash) VALUES ('Admin', 'admin@grp.test', 'h') RETURNING id`),
      query(`INSERT INTO users (name, email, password_hash) VALUES ('Regular', 'reg@grp.test', 'h') RETURNING id`),
      query(`INSERT INTO users (name, email, password_hash) VALUES ('Inactive', 'inact@grp.test', 'h') RETURNING id`),
      query(`INSERT INTO users (name, email, password_hash) VALUES ('NonMember', 'non@grp.test', 'h') RETURNING id`),
    ]);

    ownerUser = users[0].rows[0];
    adminUser = users[1].rows[0];
    regularUser = users[2].rows[0];
    inactiveUser = users[3].rows[0];
    nonMemberUser = users[4].rows[0];

    // Create test group
    const grpRes = await query(
      `INSERT INTO groups (name, invite_code, created_by)
       VALUES ('Auth Test Group', 'GRPAUTH1', $1)
       RETURNING id, name`,
      [ownerUser.id]
    );
    testGroup = grpRes.rows[0];

    // Add memberships
    await query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'admin', 'active'),
       ($1, $4, 'member', 'active'),
       ($1, $5, 'member', 'inactive')`,
      [testGroup.id, ownerUser.id, adminUser.id, regularUser.id, inactiveUser.id]
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

  describe('requireGroupMember', () => {
    it('should reject unauthenticated request', async () => {
      const req = { params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupMember(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject missing or invalid groupId param', async () => {
      const req = { user: regularUser, params: { groupId: 'invalid' } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupMember(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject non-members with 403', async () => {
      const req = { user: nonMemberUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupMember(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.error, /not a member/i);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject inactive members with 403', async () => {
      const req = { user: inactiveUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupMember(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.error, /inactive/i);
      assert.strictEqual(nextCalled, false);
    });

    it('should allow active members and populate req.membership and req.groupId', async () => {
      const req = { user: regularUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupMember(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.ok(req.membership);
      assert.strictEqual(req.membership.role, 'member');
      assert.strictEqual(req.groupId, testGroup.id);
    });
  });

  describe('requireGroupAdmin', () => {
    it('should reject regular member with 403', async () => {
      const req = { user: regularUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.error, /Admin or Owner privileges required/i);
      assert.strictEqual(nextCalled, false);
    });

    it('should allow admin user', async () => {
      const req = { user: adminUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    it('should allow owner user', async () => {
      const req = { user: ownerUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe('requireGroupOwner', () => {
    it('should reject regular member and admin with 403', async () => {
      const req = { user: adminUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupOwner(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, 403);
      assert.match(res.body.error, /Owner privileges required/i);
      assert.strictEqual(nextCalled, false);
    });

    it('should allow owner user', async () => {
      const req = { user: ownerUser, params: { groupId: testGroup.id } };
      const res = createMockRes();
      let nextCalled = false;

      await requireGroupOwner(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });
  });
});
