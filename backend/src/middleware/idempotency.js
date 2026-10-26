// Idempotency protection middleware for mutation requests

const crypto = require('crypto');
const { query } = require('../db');

function requestHash(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

function routeTemplate(req) {
  const pathTemplate = typeof req.route?.path === 'string' ? req.route.path : req.path;
  return `${req.method.toUpperCase()}${req.baseUrl || ''}${pathTemplate}`;
}

function idempotency(ttlHours = 24) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    if (!key || typeof key !== 'string' || !req.user) {
      return next();
    }

    const cleanKey = key.trim();
    if (!cleanKey) return next();
    if (cleanKey.length > 100) {
      return res.status(400).json({ error: 'Idempotency-Key must be 100 characters or fewer.' });
    }

    const userId = req.user.id;
    const route = routeTemplate(req);
    const bodyHash = requestHash(req.body);

    try {
      let reservationId;

      // A unique scoped INSERT reserves the key before the controller can run.
      for (let attempt = 0; attempt < 5; attempt++) {
        const reserved = await query(
          `INSERT INTO idempotency_records
             (idempotency_key, user_id, route, request_hash, status, response_code, response_body, expires_at)
           VALUES ($1, $2, $3, $4, 'in_progress', NULL, NULL,
                   CURRENT_TIMESTAMP + ($5 * INTERVAL '1 hour'))
           ON CONFLICT (user_id, route, idempotency_key) DO NOTHING
           RETURNING id`,
          [cleanKey, userId, route, bodyHash, ttlHours]
        );

        if (reserved.rowCount > 0) {
          reservationId = reserved.rows[0].id;
          break;
        }

        const existing = await query(
          `SELECT id, request_hash, status, response_code, response_body,
                  expires_at <= CURRENT_TIMESTAMP AS is_expired
           FROM idempotency_records
           WHERE user_id = $1 AND route = $2 AND idempotency_key = $3`,
          [userId, route, cleanKey]
        );

        if (existing.rowCount === 0) continue;
        const record = existing.rows[0];

        if (record.is_expired) {
          await query(
            'DELETE FROM idempotency_records WHERE id = $1 AND expires_at <= CURRENT_TIMESTAMP',
            [record.id]
          );
          continue;
        }

        if (record.request_hash !== bodyHash) {
          return res.status(422).json({ error: 'Idempotency-Key was already used with a different request body.' });
        }

        if (record.status === 'in_progress') {
          return res.status(409).json({ error: 'A request with this Idempotency-Key is still in progress. Retry later.' });
        }

        if (record.status === 'complete') {
          res.setHeader('X-Cache-Lookup', 'HIT');
          const responseBody = typeof record.response_body === 'string'
            ? JSON.parse(record.response_body)
            : record.response_body;
          return res.status(record.response_code).json(responseBody);
        }
      }

      if (!reservationId) {
        return res.status(409).json({ error: 'Could not reserve this Idempotency-Key. Retry later.' });
      }

      const originalJson = res.json.bind(res);
      let finalized = false;
      res.json = (body) => {
        if (finalized) return originalJson(body);
        finalized = true;
        const responseCode = res.statusCode;

        const finalizeReservation = responseCode >= 500
          ? query('DELETE FROM idempotency_records WHERE id = $1', [reservationId])
          : query(
            `UPDATE idempotency_records
             SET status = 'complete', response_code = $2, response_body = $3::jsonb,
                 expires_at = CURRENT_TIMESTAMP + ($4 * INTERVAL '1 hour')
             WHERE id = $1 AND status = 'in_progress'`,
            [reservationId, responseCode, JSON.stringify(body ?? null), ttlHours]
          );

        return finalizeReservation
          .catch(() => {
            // Keep a failed completion write reserved until TTL expiry to prevent duplicate side effects.
            console.error('Failed to finalize idempotency response.');
          })
          .then(() => originalJson(body));
      };

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { idempotency };
