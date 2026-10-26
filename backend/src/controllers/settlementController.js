// backend/src/controllers/settlementController.js
// Settlement proposals, mark-paid, confirmation, rejection, and UPI integration

const { query, withTransaction } = require('../db');
const { toPaise } = require('../utils/money');
const { generateUpiUri } = require('../utils/upi');
const { parsePaise } = require('../utils/validators');
const { calculateDetailedDebts } = require('../utils/debts');
const { calculateBalancesAndOptimization } = require('../utils/optimizer');

async function getPairwiseAvailableLimit(client, groupId, payerId, receiverId, excludeSettlementId = null) {
  const expensesRes = await client.query(
    `SELECT e.id, e.total_amount_paise, e.is_voided,
            (SELECT COALESCE(json_agg(json_build_object('user_id', ep.user_id, 'amount_paise', ep.amount_paise)), '[]'::json)
             FROM expense_payers ep WHERE ep.expense_id = e.id) AS payers,
            (SELECT COALESCE(json_agg(json_build_object('user_id', part.user_id, 'share_amount_paise', part.share_amount_paise)), '[]'::json)
             FROM expense_participants part WHERE part.expense_id = e.id) AS participants
     FROM expenses e
     WHERE e.group_id = $1 AND e.is_voided = false`,
    [groupId]
  );
  const confirmedRes = await client.query(
    `SELECT id, from_user, to_user, amount_paise, status
     FROM settlements
     WHERE group_id = $1 AND status = 'confirmed'`,
    [groupId]
  );
  const membersRes = await client.query(
    `SELECT u.id, u.name, u.upi_id
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );
  // marked_paid still does not affect balances, so reserve it until the receiver confirms.
  const pendingRes = await client.query(
    `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS amount_paise
     FROM settlements
     WHERE group_id = $1
       AND from_user = $2
       AND to_user = $3
       AND status IN ('pending', 'marked_paid')
       AND ($4::integer IS NULL OR id <> $4)`,
    [groupId, payerId, receiverId, excludeSettlementId]
  );

  const expenses = expensesRes.rows;
  const confirmedSettlements = confirmedRes.rows;
  const detailedDebt = calculateDetailedDebts(expenses, confirmedSettlements)
    .find((debt) => debt.fromUser === Number(payerId) && debt.toUser === Number(receiverId));
  const debtPaise = detailedDebt ? detailedDebt.amountPaise : 0;

  const { balances, suggestions } = calculateBalancesAndOptimization(
    expenses,
    confirmedSettlements,
    membersRes.rows
  );
  const payerBalance = balances.find((balance) => balance.userId === Number(payerId));
  const payerNetOwedPaise = Math.max(0, -(payerBalance?.netBalancePaise || 0));
  const matchingSuggestion = suggestions.find(
    (suggestion) => suggestion.fromUser === Number(payerId) && suggestion.toUser === Number(receiverId)
  );

  // The UI can prefill optimizer suggestions. Honor only this exact pair's suggestion,
  // capped by the payer's total net amount owed in the group.
  const suggestedDebtPaise = matchingSuggestion
    ? Math.min(matchingSuggestion.amountPaise, payerNetOwedPaise)
    : 0;
  const outstandingDebtPaise = Math.max(debtPaise, suggestedDebtPaise);
  const pendingPaise = Number(pendingRes.rows[0].amount_paise);

  return {
    outstandingDebtPaise,
    pendingPaise,
    availablePaise: Math.max(0, outstandingDebtPaise - pendingPaise),
  };
}

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

    const amountPaise = rawAmountPaise !== undefined
      ? parsePaise(rawAmountPaise, 'amountPaise')
      : toPaise(amountINR, 'amountINR');

    // Only the person who owes the money (the payer) can settle their debt
    if (fromUserId !== req.user.id) {
      return res.status(403).json({ error: 'You can only settle your own debts' });
    }

    // Validate and insert under a per-pair transaction lock so concurrent proposals
    // cannot reserve more than the available debt.
    const savedSettlement = await withTransaction(async (client) => {
      const smallerUserId = Math.min(fromUserId, toUserId);
      const largerUserId = Math.max(fromUserId, toUserId);
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`settlement:${groupId}:${smallerUserId}:${largerUserId}`]
      );

      const membersRes = await client.query(
        `SELECT user_id FROM group_members
         WHERE group_id = $1 AND user_id IN ($2, $3) AND status = 'active'
         ORDER BY user_id ASC
         FOR UPDATE`,
        [groupId, fromUserId, toUserId]
      );
      if (membersRes.rowCount < 2) {
        throw { status: 400, message: 'Both payer and recipient must be active members of the group' };
      }

      const limit = await getPairwiseAvailableLimit(client, groupId, fromUserId, toUserId);
      if (limit.outstandingDebtPaise === 0) {
        throw { status: 400, message: 'amount: you do not owe this member anything in this group.' };
      }
      if (amountPaise > limit.availablePaise) {
        throw {
          status: 400,
          message: `amount: ${amountPaise} exceeds the outstanding debt of ${limit.outstandingDebtPaise} (pending settlements reserve ${limit.pendingPaise}). Maximum allowed: ${limit.availablePaise}.`,
        };
      }

      const result = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, reference_id, notes, confirmed_at, confirmed_by)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NULL, NULL)
         RETURNING *`,
        [
          groupId,
          req.user.id,
          fromUserId,
          toUserId,
          amountPaise,
          paymentMethod,
          referenceId ? referenceId.trim() : null,
          notes ? notes.trim() : null,
        ]
      );
      const st = result.rows[0];

      // Record status history
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'pending', $2, $3)`,
        [
          st.id,
          req.user.id,
          notes || 'Payment recorded by payer (pending recipient confirmation)',
        ]
      );

      // Activity log
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'settlement', $3, 'created', $4)`,
        [
          groupId,
          req.user.id,
          st.id,
          JSON.stringify({
            fromUser: fromUserId,
            toUser: toUserId,
            amountPaise,
            status: 'pending',
          }),
        ]
      );

      return st;
    });

    res.status(201).json({
      message: 'Settlement payment recorded successfully and is pending confirmation from the recipient.',
      settlement: savedSettlement,
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
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

      // Check permission: strictly debtor/payer
      if (Number(st.from_user) !== Number(req.user.id)) {
        throw { status: 403, message: 'Only the payer can mark this settlement as paid' };
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

      // Permission check: strictly recipient (to_user).
      // Crucial: The payer themselves can NEVER confirm their own payment!
      if (Number(st.from_user) === Number(req.user.id)) {
        throw { status: 403, message: 'The payer cannot confirm their own payment. Only the receiver can confirm.' };
      }

      if (Number(st.to_user) !== Number(req.user.id)) {
        throw { status: 403, message: 'Only the receiver can confirm this payment' };
      }

      const limit = await getPairwiseAvailableLimit(
        client,
        groupId,
        Number(st.from_user),
        Number(st.to_user),
        settlementId
      );
      if (Number(st.amount_paise) > limit.availablePaise) {
        throw {
          status: 409,
          message: `Settlement amount ${st.amount_paise} exceeds the current available debt of ${limit.availablePaise} paise.`,
        };
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

      // Permission check: strictly recipient (to_user)
      if (Number(st.from_user) === Number(req.user.id)) {
        throw { status: 403, message: 'The payer cannot reject this payment. Only the receiver can reject.' };
      }

      if (Number(st.to_user) !== Number(req.user.id)) {
        throw { status: 403, message: 'Only the receiver can reject this payment' };
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

    const sharedGroupRes = await query(
      `SELECT 1
       FROM group_members caller_members
       JOIN group_members target_members
         ON target_members.group_id = caller_members.group_id
       WHERE caller_members.user_id = $1
         AND caller_members.status = 'active'
         AND target_members.user_id = $2
         AND target_members.status = 'active'
       LIMIT 1`,
      [req.user.id, uid]
    );
    if (sharedGroupRes.rowCount === 0) {
      return res.status(403).json({ error: 'You must share an active group with this user to view UPI details.' });
    }

    const userRes = await query('SELECT id, name, upi_id FROM users WHERE id = $1', [uid]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    const recipient = userRes.rows[0];
    if (!recipient.upi_id) {
      return res.status(400).json({ error: `${recipient.name} does not have a UPI ID registered on their profile.` });
    }

    const amountPaise = rawAmountPaise !== undefined
      ? parsePaise(rawAmountPaise, 'amountPaise')
      : toPaise(amountINR, 'amountINR');
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
