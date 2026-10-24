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
    if (!q || q.trim().length < 2) {
      return res.json({ users: [] });
    }

    const term = `%${q.trim().toLowerCase()}%`;
    const result = await query(
      `SELECT id, name, email, upi_id 
       FROM users 
       WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1
       ORDER BY name ASC 
       LIMIT 10`,
      [term]
    );

    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
