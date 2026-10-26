// backend/src/routes/userRoutes.js
// User lookup routes

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../db');

router.use(authenticate);

/**
 * Search users by email or name (for adding members)
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (typeof q !== 'string' || q.trim().length < 2) {
      return res.json({ users: [] });
    }

    const term = `%${q.trim().toLowerCase()}%`;
    const result = await query(
      `SELECT u.id, u.name
       FROM users u
       WHERE u.id <> $2
         AND (LOWER(u.email) LIKE $1 OR LOWER(u.name) LIKE $1)
         AND EXISTS (
           SELECT 1
           FROM group_members caller_members
           JOIN group_members target_members
             ON target_members.group_id = caller_members.group_id
           WHERE caller_members.user_id = $2
             AND caller_members.status = 'active'
             AND target_members.user_id = u.id
             AND target_members.status = 'active'
         )
       ORDER BY u.name ASC
       LIMIT 10`,
      [term, req.user.id]
    );

    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
