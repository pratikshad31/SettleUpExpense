// backend/src/controllers/activityController.js
// Chronological activity history for groups

const { query } = require('../db');

/**
 * Get activity logs for a group
 */
async function getGroupActivity(req, res, next) {
  try {
    const groupId = req.groupId;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM activity_logs a
       JOIN users u ON u.id = a.actor_id
       WHERE a.group_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [groupId, Math.min(parseInt(limit, 10) || 50, 100), parseInt(offset, 10) || 0]
    );

    res.json({ activities: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGroupActivity,
};
