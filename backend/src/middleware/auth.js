// backend/src/middleware/auth.js
// JWT verification middleware

const jwt = require('jsonwebtoken');
const { query } = require('../db');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'settleup_super_secret_jwt_key_2026_dev_india';

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }

    const userResult = await query(
      'SELECT id, name, email, upi_id, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'User associated with token no longer exists.' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
