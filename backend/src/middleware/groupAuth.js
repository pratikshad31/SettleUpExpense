// backend/src/middleware/groupAuth.js
// Group membership and authorization middleware

const { query } = require('../db');

/**
 * Middleware to verify that the logged-in user is a member of the group
 */
async function requireGroupMember(req, res, next) {
  try {
    const groupId = parseInt(req.params.groupId || req.params.id, 10);
    if (!groupId || isNaN(groupId)) {
      return res.status(400).json({ error: 'Valid Group ID is required in URL parameter' });
    }

    const membershipResult = await query(
      `SELECT gm.id, gm.group_id, gm.user_id, gm.role, gm.status, g.name AS group_name
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.group_id = $1 AND gm.user_id = $2`,
      [groupId, req.user.id]
    );

    if (membershipResult.rowCount === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const membership = membershipResult.rows[0];
    if (membership.status !== 'active') {
      return res.status(403).json({ error: 'Your membership in this group is inactive' });
    }

    req.membership = membership;
    req.groupId = groupId;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware to verify user is admin or owner
 */
async function requireGroupAdmin(req, res, next) {
  try {
    await requireGroupMember(req, res, () => {
      if (req.membership.role !== 'admin' && req.membership.role !== 'owner') {
        return res.status(403).json({ error: 'Admin or Owner privileges required for this action' });
      }
      next();
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware to verify user is group owner
 */
async function requireGroupOwner(req, res, next) {
  try {
    await requireGroupMember(req, res, () => {
      if (req.membership.role !== 'owner') {
        return res.status(403).json({ error: 'Owner privileges required for this action' });
      }
      next();
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireGroupMember,
  requireGroupAdmin,
  requireGroupOwner,
};
