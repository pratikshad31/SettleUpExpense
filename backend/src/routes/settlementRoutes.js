// backend/src/routes/settlementRoutes.js
// Settlement state transitions and UPI operations

const express = require('express');
const router = express.Router();
const settlementController = require('../controllers/settlementController');
const { authenticate } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const { query } = require('../db');

router.use(authenticate);

/**
 * Middleware to load settlement and check user belongs to its group
 */
async function requireSettlementGroupMember(req, res, next) {
  try {
    const settlementId = parseInt(req.params.settlementId, 10);
    if (!settlementId || isNaN(settlementId)) {
      return res.status(400).json({ error: 'Valid settlementId is required' });
    }

    const stRes = await query('SELECT group_id, from_user, to_user, status FROM settlements WHERE id = $1', [settlementId]);
    if (stRes.rowCount === 0) {
      return res.status(404).json({ error: 'Settlement not found' });
    }

    const groupId = stRes.rows[0].group_id;
    const memberRes = await query(
      `SELECT role, status FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user.id]
    );

    if (memberRes.rowCount === 0 || memberRes.rows[0].status !== 'active') {
      return res.status(403).json({ error: 'You do not have access to this settlement' });
    }

    req.groupId = groupId;
    req.membership = memberRes.rows[0];
    req.settlementMeta = stRes.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// UPI utility endpoint
router.get('/upi-details', settlementController.getUpiDetails);

// Status transition endpoints
router.post(
  '/:settlementId/mark-paid',
  requireSettlementGroupMember,
  idempotency(),
  settlementController.markPaid
);

router.post(
  '/:settlementId/confirm',
  requireSettlementGroupMember,
  idempotency(),
  settlementController.confirmSettlement
);

router.post(
  '/:settlementId/reject',
  requireSettlementGroupMember,
  idempotency(),
  settlementController.rejectSettlement
);

module.exports = router;
