// backend/src/controllers/groupController.js
// Group lifecycle and member management controller

const crypto = require('crypto');
const { query, withTransaction } = require('../db');
const { calculateBalancesAndOptimization } = require('../utils/optimizer');

/**
 * Generate a random 8-character uppercase invite code
 */
function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Create a new group
 */
async function createGroup(req, res, next) {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const inviteCode = generateInviteCode();

    const newGroup = await withTransaction(async (client) => {
      // 1. Create group
      const groupRes = await client.query(
        `INSERT INTO groups (name, description, invite_code, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name.trim(), description ? description.trim() : null, inviteCode, req.user.id]
      );
      const group = groupRes.rows[0];

      // 2. Add creator as owner
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [group.id, req.user.id]
      );

      // 3. Activity log
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'group', $3, 'created', $4)`,
        [group.id, req.user.id, group.id, JSON.stringify({ name: group.name })]
      );

      return group;
    });

    res.status(201).json({
      message: 'Group created successfully',
      group: newGroup,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all groups the current user is a member of (with net balance for that group)
 */
async function getUserGroups(req, res, next) {
  try {
    const userId = req.user.id;

    // Fetch groups user belongs to
    const groupsRes = await query(
      `SELECT g.id, g.name, g.description, g.invite_code, g.created_at, gm.role, gm.status,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND status = 'active')::int AS member_count,
              (SELECT COUNT(*) FROM expenses WHERE group_id = g.id AND is_voided = false)::int AS expense_count
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1 AND gm.status = 'active'
       ORDER BY g.created_at DESC`,
      [userId]
    );

    const groupsWithBalance = await Promise.all(
      groupsRes.rows.map(async (grp) => {
        // Calculate user balance for each group
        const expResult = await query(
          `SELECT e.id, e.total_amount_paise, e.is_voided,
                  (SELECT json_agg(json_build_object('user_id', ep.user_id, 'amount_paise', ep.amount_paise))
                   FROM expense_payers ep WHERE ep.expense_id = e.id) AS payers,
                  (SELECT json_agg(json_build_object('user_id', part.user_id, 'share_amount_paise', part.share_amount_paise))
                   FROM expense_participants part WHERE part.expense_id = e.id) AS participants
           FROM expenses e
           WHERE e.group_id = $1 AND e.is_voided = false`,
          [grp.id]
        );

        const stResult = await query(
          `SELECT from_user, to_user, amount_paise, status
           FROM settlements
           WHERE group_id = $1 AND status = 'confirmed'`,
          [grp.id]
        );

        const membersResult = await query(
          `SELECT u.id, u.name, u.upi_id
           FROM group_members gm
           JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id = $1`,
          [grp.id]
        );

        const { balances } = calculateBalancesAndOptimization(
          expResult.rows,
          stResult.rows,
          membersResult.rows
        );

        const myBal = balances.find((b) => b.userId === userId);

        return {
          ...grp,
          myNetBalancePaise: myBal ? myBal.netBalancePaise : 0,
        };
      })
    );

    res.json({ groups: groupsWithBalance });
  } catch (err) {
    next(err);
  }
}

/**
 * Get details of a single group including members
 */
async function getGroupDetails(req, res, next) {
  try {
    const groupId = req.groupId;

    const groupRes = await query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const membersRes = await query(
      `SELECT gm.id AS membership_id, gm.role, gm.status, gm.joined_at,
              u.id AS user_id, u.name, u.email, u.upi_id
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY 
         CASE WHEN gm.role = 'owner' THEN 1 WHEN gm.role = 'admin' THEN 2 ELSE 3 END,
         gm.joined_at ASC`,
      [groupId]
    );

    res.json({
      group: groupRes.rows[0],
      membership: req.membership,
      members: membersRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Join a group using an invite code
 */
async function joinGroupByInviteCode(req, res, next) {
  try {
    const { invite_code } = req.body;
    if (!invite_code || !invite_code.toString().trim()) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const cleanCode = invite_code.toString().replace(/\s+/g, '').toUpperCase();
    const groupRes = await query('SELECT * FROM groups WHERE UPPER(invite_code) = UPPER($1)', [cleanCode]);

    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Invalid invitation code. Group not found.' });
    }

    const group = groupRes.rows[0];
    const userId = req.user.id;

    // Check existing membership
    const memberRes = await query(
      'SELECT id, role, status FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, userId]
    );

    if (memberRes.rowCount > 0) {
      const existing = memberRes.rows[0];
      if (existing.status === 'active') {
        // Return 200 with alreadyMember flag so user is gracefully directed into group
        return res.status(200).json({
          message: 'You are already an active member of this group',
          group,
          alreadyMember: true,
        });
      }

      // Reactivate previously inactive member
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE group_members 
           SET status = 'active', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [existing.id]
        );
        await client.query(
          `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
           VALUES ($1, $2, 'membership', $3, 'joined', $4)`,
          [group.id, userId, userId, JSON.stringify({ note: 'Rejoined group' })]
        );
      });

      return res.json({
        message: 'Rejoined group successfully',
        group,
        rejoined: true,
      });
    }

    // New membership
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [group.id, userId]
      );
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'membership', $3, 'joined', $4)`,
        [group.id, userId, userId, JSON.stringify({ userName: req.user.name })]
      );
    });

    res.status(201).json({
      message: 'Joined group successfully',
      group,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add a member to group by email (admin/owner only)
 */
async function addMember(req, res, next) {
  try {
    const groupId = req.groupId;
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const userRes = await query('SELECT id, name, email FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User with this email is not registered on SettleUp' });
    }

    const targetUser = userRes.rows[0];

    const memberRes = await query(
      'SELECT id, status FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, targetUser.id]
    );

    if (memberRes.rowCount > 0) {
      if (memberRes.rows[0].status === 'active') {
        return res.status(400).json({ error: 'User is already an active member of this group' });
      }
      await query("UPDATE group_members SET status = 'active' WHERE id = $1", [memberRes.rows[0].id]);
    } else {
      await query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [groupId, targetUser.id]
      );
    }

    await query(
      `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
       VALUES ($1, $2, 'membership', $3, 'joined', $4)`,
      [groupId, req.user.id, targetUser.id, JSON.stringify({ addedBy: req.user.name, addedUser: targetUser.name })]
    );

    res.json({
      message: `${targetUser.name} added to the group successfully`,
      user: targetUser,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update member role (admin or owner only)
 */
async function updateMemberRole(req, res, next) {
  try {
    const groupId = req.groupId;
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either "admin" or "member"' });
    }

    if (targetUserId === req.user.id && req.membership.role === 'owner') {
      return res.status(400).json({ error: 'Group owner cannot demote themselves' });
    }

    const updateRes = await query(
      `UPDATE group_members 
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE group_id = $2 AND user_id = $3
       RETURNING *`,
      [role, groupId, targetUserId]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Target member not found in this group' });
    }

    await query(
      `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
       VALUES ($1, $2, 'membership', $3, 'role_changed', $4)`,
      [groupId, req.user.id, targetUserId, JSON.stringify({ newRole: role })]
    );

    res.json({
      message: 'Member role updated successfully',
      member: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Leave group (allowed ONLY if net balance is 0)
 */
async function leaveGroup(req, res, next) {
  try {
    const groupId = req.groupId;
    const userId = req.user.id;

    // Check balance
    const expResult = await query(
      `SELECT e.id, e.total_amount_paise, e.is_voided,
              (SELECT json_agg(json_build_object('user_id', ep.user_id, 'amount_paise', ep.amount_paise))
               FROM expense_payers ep WHERE ep.expense_id = e.id) AS payers,
              (SELECT json_agg(json_build_object('user_id', part.user_id, 'share_amount_paise', part.share_amount_paise))
               FROM expense_participants part WHERE part.expense_id = e.id) AS participants
       FROM expenses e
       WHERE e.group_id = $1 AND e.is_voided = false`,
      [groupId]
    );

    const stResult = await query(
      `SELECT from_user, to_user, amount_paise, status
       FROM settlements
       WHERE group_id = $1 AND status = 'confirmed'`,
      [groupId]
    );

    const membersResult = await query(
      `SELECT u.id, u.name, u.upi_id
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    const { balances } = calculateBalancesAndOptimization(
      expResult.rows,
      stResult.rows,
      membersResult.rows
    );

    const myBal = balances.find((b) => b.userId === userId);
    const netPaise = myBal ? myBal.netBalancePaise : 0;

    if (netPaise !== 0) {
      const netINR = (Math.abs(netPaise) / 100).toFixed(2);
      if (netPaise < 0) {
        return res.status(400).json({
          error: `Cannot leave group: You currently owe ₹${netINR}. Please settle all outstanding debts before leaving.`,
        });
      } else {
        return res.status(400).json({
          error: `Cannot leave group: You are still owed ₹${netINR}. Please settle up or confirm payments before leaving.`,
        });
      }
    }

    // If owner, check if other members exist
    if (req.membership.role === 'owner') {
      const otherMembers = await query(
        `SELECT user_id FROM group_members 
         WHERE group_id = $1 AND user_id != $2 AND status = 'active'`,
        [groupId, userId]
      );
      if (otherMembers.rowCount > 0) {
        // Automatically promote the earliest member to owner
        const nextOwnerId = otherMembers.rows[0].user_id;
        await query(
          `UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`,
          [groupId, nextOwnerId]
        );
      }
    }

    // Set membership to inactive (preserves historical financial records)
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE group_members 
         SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
         WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'membership', $3, 'left', $4)`,
        [groupId, userId, userId, JSON.stringify({ userName: req.user.name })]
      );
    });

    res.json({ message: 'You have left the group successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGroup,
  getUserGroups,
  getGroupDetails,
  joinGroupByInviteCode,
  addMember,
  updateMemberRole,
  leaveGroup,
};
