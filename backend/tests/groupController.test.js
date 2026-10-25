// backend/tests/groupController.test.js
// Dedicated unit tests for groupController functions (src/controllers/groupController.js)

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const {
  createGroup,
  getUserGroups,
  getGroupDetails,
  joinGroupByInviteCode,
  addMember,
  updateMemberRole,
  leaveGroup,
} = require('../src/controllers/groupController');
const { pool, query } = require('../src/db');

describe('Group Controller (src/controllers/groupController.js)', () => {
  let testUser1, testUser2;

  before(async () => {
    const u1 = await query(
      `INSERT INTO users (name, email, password_hash) VALUES ('Grp User 1', 'grp1_${Date.now()}@example.com', 'h') RETURNING *`
    );
    const u2 = await query(
      `INSERT INTO users (name, email, password_hash) VALUES ('Grp User 2', 'grp2_${Date.now()}@example.com', 'h') RETURNING *`
    );
    testUser1 = u1.rows[0];
    testUser2 = u2.rows[0];
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

  describe('createGroup', () => {
    it('should reject missing group name', async () => {
      const req = { user: testUser1, body: { name: '' } };
      const res = createMockRes();
      await createGroup(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /name is required/i);
    });

    it('should create group, generate invite code, and make creator owner', async () => {
      const req = { user: testUser1, body: { name: 'Flat 402 Goa Trip', description: 'Fun trip' } };
      const res = createMockRes();
      await createGroup(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.group.name, 'Flat 402 Goa Trip');
      assert.ok(res.body.group.invite_code);
    });
  });

  describe('joinGroupByInviteCode', () => {
    let inviteCode;
    let createdGroupId;

    before(async () => {
      const req = { user: testUser1, body: { name: 'Join Test Group' } };
      const res = createMockRes();
      await createGroup(req, res, () => {});
      inviteCode = res.body.group.invite_code;
      createdGroupId = res.body.group.id;
    });

    it('should reject non-existent invite code', async () => {
      const req = { user: testUser2, body: { invite_code: 'INVALID99' } };
      const res = createMockRes();
      await joinGroupByInviteCode(req, res, () => {});
      assert.strictEqual(res.statusCode, 404);
      assert.match(res.body.error, /Invalid invitation code/i);
    });

    it('should join group successfully with valid invite code', async () => {
      const req = { user: testUser2, body: { invite_code: inviteCode } };
      const res = createMockRes();
      await joinGroupByInviteCode(req, res, () => {});
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.group.id, createdGroupId);
    });

    it('should return alreadyMember status if already an active member', async () => {
      const req = { user: testUser2, body: { invite_code: inviteCode } };
      const res = createMockRes();
      await joinGroupByInviteCode(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.alreadyMember, true);
      assert.strictEqual(res.body.group.id, createdGroupId);
    });
  });

  describe('updateMemberRole', () => {
    let groupId;
    before(async () => {
      const res = createMockRes();
      await createGroup({ user: testUser1, body: { name: 'Role Group' } }, res, () => {});
      groupId = res.body.group.id;
      await joinGroupByInviteCode({ user: testUser2, body: { invite_code: res.body.group.invite_code } }, createMockRes(), () => {});
    });

    it('should reject invalid role', async () => {
      const req = { groupId, params: { userId: testUser2.id }, body: { role: 'superadmin' }, user: testUser1, membership: { role: 'owner' } };
      const res = createMockRes();
      await updateMemberRole(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /must be either "admin" or "member"/i);
    });

    it('should update member role to admin', async () => {
      const req = { groupId, params: { userId: testUser2.id }, body: { role: 'admin' }, user: testUser1, membership: { role: 'owner' } };
      const res = createMockRes();
      await updateMemberRole(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.member.role, 'admin');
    });

    it('should prevent owner from demoting themselves', async () => {
      const req = { groupId, params: { userId: testUser1.id }, body: { role: 'member' }, user: testUser1, membership: { role: 'owner' } };
      const res = createMockRes();
      await updateMemberRole(req, res, () => {});
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.error, /owner cannot demote/i);
    });
  });

  describe('leaveGroup', () => {
    let groupId;
    before(async () => {
      const res = createMockRes();
      await createGroup({ user: testUser1, body: { name: 'Leave Group' } }, res, () => {});
      groupId = res.body.group.id;
      await joinGroupByInviteCode({ user: testUser2, body: { invite_code: res.body.group.invite_code } }, createMockRes(), () => {});
    });

    it('should allow user with ₹0 balance to leave group successfully', async () => {
      const req = { groupId, user: testUser2, membership: { role: 'member' } };
      const res = createMockRes();
      await leaveGroup(req, res, () => {});
      assert.strictEqual(res.statusCode, 200);
      assert.match(res.body.message, /left the group successfully/i);
    });
  });
});
