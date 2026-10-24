// backend/src/middleware/idempotency.js
// Idempotency protection middleware for payment and settlement requests

const { query } = require('../db');

/**
 * Idempotency middleware
 * Checks if the request contains an 'Idempotency-Key' or 'x-idempotency-key' header.
 * If cached, re-serves the stored response to prevent duplicate executions.
 */
function idempotency(ttlHours = 24) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    if (!key || typeof key !== 'string' || !req.user) {
      return next();
    }

    const cleanKey = key.trim().substring(0, 100);
    const userId = req.user.id;
    const route = req.originalUrl || req.url;

    try {
      const existing = await query(
        `SELECT response_code, response_body 
         FROM idempotency_records 
         WHERE idempotency_key = $1 AND user_id = $2 AND expires_at > CURRENT_TIMESTAMP`,
        [cleanKey, userId]
      );

      if (existing.rowCount > 0) {
        const record = existing.rows[0];
        res.setHeader('X-Cache-Lookup', 'HIT');
        return res.status(record.response_code).json(record.response_body);
      }

      // Monkey-patch res.json to capture output and save record
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful or client error statuses (2xx, 4xx), not internal 5xx
        if (res.statusCode < 500) {
          query(
            `INSERT INTO idempotency_records 
             (idempotency_key, user_id, route, response_code, response_body, expires_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + ($6 || ' hours')::INTERVAL)
             ON CONFLICT (idempotency_key) DO UPDATE 
             SET response_code = EXCLUDED.response_code, 
                 response_body = EXCLUDED.response_body, 
                 expires_at = EXCLUDED.expires_at`,
            [cleanKey, userId, route, res.statusCode, JSON.stringify(body), ttlHours]
          ).catch((err) => {
            console.error('Failed to store idempotency record:', err.message);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error('Idempotency middleware error:', err);
      next();
    }
  };
}

module.exports = { idempotency };
