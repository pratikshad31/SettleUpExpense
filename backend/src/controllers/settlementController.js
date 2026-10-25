// backend/src/controllers/settlementController.js
// Settlement proposals, mark-paid, confirmation, rejection, and UPI integration

const { query, withTransaction } = require('../db');
const { toPaise } = require('../utils/money');
const { generateUpiUri } = require('../utils/upi');

/**
 * Propose or record a settlement payment
 */
async function createSettlement(req, res, next) {
  try {
    const groupId = req.groupId;
    const {
      fromUser,
      toUser,
      amountINR,
      amountPaise: rawAmountPaise,
      paymentMethod = 'upi',
      referenceId,
      notes,
    } = req.body;

    const fromUserId = Number(fromUser);
    const toUserId = Number(toUser);

    if (isNaN(fromUserId) || isNaN(toUserId)) {
      return res.status(400).json({ error: 'Valid fromUser and toUser are required' });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'A member cannot settle with themselves' });
    }

    const amountPaise = rawAmountPaise !== undefined ? Number(rawAmountPaise) : toPaise(amountINR);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      return res.status(400).json({ error: 'Settlement amount must be greater than 0' });
    }

    // Verify both users are active group members
    const membersRes = await query(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id IN ($2, $3) AND status = 'active'`,
      [groupId, fromUserId, toUserId]
    );

    if (membersRes.rowCount < 2) {
      return res.status(400).json({ error: 'Both payer and recipient must be active members of the group' });
    }

    const isDirectSettlement = req.body.status === 'confirmed' || req.body.settleImmediately === true;
    const initialStatus = isDirectSettlement ? 'confirmed' : 'pending';

    // Insert settlement inside a transaction
    const savedSettlement = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, reference_id, notes, confirmed_at, confirmed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${isDirectSettlement ? 'CURRENT_TIMESTAMP' : 'NULL'}, ${isDirectSettlement ? '$2' : 'NULL'})
         RETURNING *`,
        [
          groupId,
          req.user.id,
          fromUserId,
          toUserId,
          amountPaise,
          initialStatus,
          paymentMethod,
          referenceId ? referenceId.trim() : null,
          notes ? notes.trim() : null,
        ]
      );
      const st = result.rows[0];

      // Record status history
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, $2, $3, $4)`,
        [
          st.id,
          initialStatus,
          req.user.id,
          isDirectSettlement ? 'Payment recorded and marked as settled' : 'Settlement proposal created',
        ]
      );

      // Activity log
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'settlement', $3, $4, $5)`,
        [
          groupId,
          req.user.id,
          st.id,
          isDirectSettlement ? 'confirmed' : 'created',
          JSON.stringify({
            fromUser: fromUserId,
            toUser: toUserId,
            amountPaise,
            status: initialStatus,
          }),
        ]
      );

      return st;
    });

    res.status(201).json({
      message: isDirectSettlement
        ? 'Settlement payment recorded and marked as settled. Group balances have been updated.'
        : 'Settlement proposal created successfully',
      settlement: savedSettlement,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark a settlement as paid (called by debtor / creator when payment is sent)
 */
async function markPaid(req, res, next) {
  try {
    const settlementId = parseInt(req.params.settlementId, 10);
    const groupId = req.groupId;
    const { referenceId, notes } = req.body || {};

    const updated = await withTransaction(async (client) => {
      // Lock row for concurrency safety
      const lockRes = await client.query(
        'SELECT * FROM settlements WHERE id = $1 AND group_id = $2 FOR UPDATE',
        [settlementId, groupId]
      );

      if (lockRes.rowCount === 0) {
        throw { status: 404, message: 'Settlement not found' };
      }

      const st = lockRes.rows[0];
      if (st.status === 'confirmed') {
        throw { status: 400, message: 'Settlement is already confirmed' };
      }
      if (st.status === 'rejected') {
        throw { status: 400, message: 'Cannot mark a rejected settlement as paid' };
      }

      // Check permission: debtor or creator or group creator
      if (st.from_user !== req.user.id && st.created_by !== req.user.id && req.membership.role === 'member') {
        throw { status: 403, message: 'Only the payer or group creator can mark this settlement as paid' };
      }

      const prevStatus = st.status;

      const updateRes = await client.query(
        `UPDATE settlements 
         SET status = 'marked_paid', 
             marked_paid_at = CURRENT_TIMESTAMP,
             reference_id = COALESCE($1, reference_id),
             notes = COALESCE($2, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [referenceId ? referenceId.trim() : null, notes ? notes.trim() : null, settlementId]
      );

      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'marked_paid', $3, $4)`,
        [settlementId, prevStatus, req.user.id, notes || 'Marked as paid by user']
      );

      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'settlement', $3, 'marked_paid', $4)`,
        [
          groupId,
          req.user.id,
          settlementId,
          JSON.stringify({
            referenceId,
            amountPaise: st.amount_paise,
          }),
        ]
      );

      return updateRes.rows[0];
    });

    res.json({
      message: 'Settlement marked as paid. Waiting for recipient to confirm.',
      settlement: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Confirm a settlement (Concurrency-safe; strictly recipient to_user or admin)
 * Only confirmed settlements affect balances!
 */
async function confirmSettlement(req, res, next) {
  try {
    const settlementId = parseInt(req.params.settlementId, 10);
    const groupId = req.groupId;
    const { notes } = req.body || {};

    const confirmed = await withTransaction(async (client) => {
      // Concurrency safe lock with SELECT ... FOR UPDATE
      const lockRes = await client.query(
        'SELECT * FROM settlements WHERE id = $1 AND group_id = $2 FOR UPDATE',
        [settlementId, groupId]
      );

      if (lockRes.rowCount === 0) {
        throw { status: 404, message: 'Settlement not found' };
      }

      const st = lockRes.rows[0];
      if (st.status === 'confirmed') {
        throw { status: 400, message: 'Settlement has already been confirmed' };
      }
      if (st.status === 'rejected') {
        throw { status: 400, message: 'Cannot confirm a rejected settlement' };
      }

      // Permission check: strictly recipient (to_user) or group creator.
      // Crucial: The payer themselves can NEVER confirm their own payment!
      if (st.from_user === req.user.id) {
        throw { status: 403, message: 'The payer cannot confirm their own payment. Only the recipient or group creator can confirm.' };
      }

      if (st.to_user !== req.user.id && req.membership.role === 'member') {
        throw { status: 403, message: 'Only the payment recipient or group creator can confirm receipt of payment' };
      }

      const prevStatus = st.status;

      const updateRes = await client.query(
        `UPDATE settlements 
         SET status = 'confirmed', 
             confirmed_at = CURRENT_TIMESTAMP,
             confirmed_by = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [req.user.id, settlementId]
      );

      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'confirmed', $3, $4)`,
        [settlementId, prevStatus, req.user.id, notes || 'Payment confirmed by recipient']
      );

      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'settlement', $3, 'confirmed', $4)`,
        [
          groupId,
          req.user.id,
          settlementId,
          JSON.stringify({
            confirmedBy: req.user.name,
            amountPaise: st.amount_paise,
          }),
        ]
      );

      return updateRes.rows[0];
    });

    res.json({
      message: 'Settlement payment confirmed successfully. Balances have been updated.',
      settlement: confirmed,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reject a settlement (recipient or admin rejects invalid or unreceived payment)
 */
async function rejectSettlement(req, res, next) {
  try {
    const settlementId = parseInt(req.params.settlementId, 10);
    const groupId = req.groupId;
    const { reason = 'Payment rejected by recipient' } = req.body || {};

    const rejected = await withTransaction(async (client) => {
      const lockRes = await client.query(
        'SELECT * FROM settlements WHERE id = $1 AND group_id = $2 FOR UPDATE',
        [settlementId, groupId]
      );

      if (lockRes.rowCount === 0) {
        throw { status: 404, message: 'Settlement not found' };
      }

      const st = lockRes.rows[0];
      if (st.status === 'confirmed') {
        throw { status: 400, message: 'Cannot reject an already confirmed settlement' };
      }
      if (st.status === 'rejected') {
        throw { status: 400, message: 'Settlement is already rejected' };
      }

      // Permission check: recipient (to_user) or group creator
      if (st.to_user !== req.user.id && req.membership.role === 'member') {
        throw { status: 403, message: 'Only the payment recipient or group creator can reject this settlement' };
      }

      const prevStatus = st.status;

      const updateRes = await client.query(
        `UPDATE settlements 
         SET status = 'rejected', 
             rejected_at = CURRENT_TIMESTAMP,
             rejected_by = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [req.user.id, settlementId]
      );

      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'rejected', $3, $4)`,
        [settlementId, prevStatus, req.user.id, reason]
      );

      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'settlement', $3, 'rejected', $4)`,
        [
          groupId,
          req.user.id,
          settlementId,
          JSON.stringify({
            reason,
            amountPaise: st.amount_paise,
          }),
        ]
      );

      return updateRes.rows[0];
    });

    res.json({
      message: 'Settlement rejected',
      settlement: rejected,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all settlements for a group
 */
async function getGroupSettlements(req, res, next) {
  try {
    const groupId = req.groupId;

    const result = await query(
      `SELECT s.*,
              fu.name AS from_user_name, fu.email AS from_user_email, fu.upi_id AS from_user_upi,
              tu.name AS to_user_name, tu.email AS to_user_email, tu.upi_id AS to_user_upi,
              cu.name AS created_by_name,
              conf_u.name AS confirmed_by_name,
              rej_u.name AS rejected_by_name
       FROM settlements s
       JOIN users fu ON fu.id = s.from_user
       JOIN users tu ON tu.id = s.to_user
       JOIN users cu ON cu.id = s.created_by
       LEFT JOIN users conf_u ON conf_u.id = s.confirmed_by
       LEFT JOIN users rej_u ON rej_u.id = s.rejected_by
       WHERE s.group_id = $1
       ORDER BY s.created_at DESC`,
      [groupId]
    );

    // Enrich with safe UPI links
    const enriched = result.rows.map((row) => {
      let upiUri = null;
      if (row.to_user_upi && row.amount_paise > 0) {
        try {
          upiUri = generateUpiUri({
            upiId: row.to_user_upi,
            recipientName: row.to_user_name,
            amountPaise: row.amount_paise,
            note: `SettleUp payment to ${row.to_user_name}`,
          });
        } catch (_) {
          upiUri = null;
        }
      }

      return {
        ...row,
        upiUri,
      };
    });

    res.json({ settlements: enriched });
  } catch (err) {
    next(err);
  }
}

/**
 * Generate UPI URI for a settlement proposal or on-the-fly payment
 */
async function getUpiDetails(req, res, next) {
  try {
    const { toUserId, amountINR, amountPaise: rawAmountPaise, note } = req.query;

    const uid = parseInt(toUserId, 10);
    if (!uid || isNaN(uid)) {
      return res.status(400).json({ error: 'Valid toUserId is required' });
    }

    const userRes = await query('SELECT id, name, upi_id FROM users WHERE id = $1', [uid]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    const recipient = userRes.rows[0];
    if (!recipient.upi_id) {
      return res.status(400).json({ error: `${recipient.name} does not have a UPI ID registered on their profile.` });
    }

    const amountPaise = rawAmountPaise !== undefined ? Number(rawAmountPaise) : toPaise(amountINR);
    const upiUri = generateUpiUri({
      upiId: recipient.upi_id,
      recipientName: recipient.name,
      amountPaise,
      note: note || `SettleUp to ${recipient.name}`,
    });

    res.json({
      upiId: recipient.upi_id,
      recipientName: recipient.name,
      amountPaise,
      amountINR: (amountPaise / 100).toFixed(2),
      upiUri,
      disclaimer:
        'Opening a UPI app is not proof of payment. After transferring, please click "Mark as Paid" so the recipient can verify and confirm the settlement.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSettlement,
  markPaid,
  confirmSettlement,
  rejectSettlement,
  getGroupSettlements,
  getUpiDetails,
};
