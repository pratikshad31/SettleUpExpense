// backend/src/controllers/expenseController.js
// Expense creation, editing, voiding, versioning, and retrieval

const { query, withTransaction } = require('../db');
const { toPaise } = require('../utils/money');
const { calculateSplit } = require('../utils/splits');

function validationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Validate payers and ensure sum of contributions equals totalPaise
 */
function validatePayers(payers, totalPaise, groupMemberIds) {
  if (!Array.isArray(payers) || payers.length === 0) {
    throw validationError('At least one payer is required');
  }

  let sumPayers = 0;
  const seenPayers = new Set();
  const normalizedPayers = [];

  for (const p of payers) {
    const userId = Number(p.userId);
    const amountPaise = Number(p.amountPaise !== undefined ? p.amountPaise : toPaise(p.amountINR));

    if (isNaN(userId) || isNaN(amountPaise) || amountPaise <= 0) {
      throw validationError(`Invalid contribution for payer user #${p.userId}`);
    }
    if (!groupMemberIds.has(userId)) {
      throw validationError(`Payer #${userId} is not an active member of this group`);
    }
    if (seenPayers.has(userId)) {
      throw validationError(`Payer #${userId} appears more than once in payers list`);
    }

    seenPayers.add(userId);
    sumPayers += amountPaise;
    normalizedPayers.push({ userId, amountPaise });
  }

  if (sumPayers !== totalPaise) {
    const diff = (totalPaise - sumPayers) / 100;
    throw validationError(
      `Payer contributions sum (₹${(sumPayers / 100).toFixed(2)}) must equal total expense amount (₹${(totalPaise / 100).toFixed(2)}). Difference: ₹${diff.toFixed(2)}`
    );
  }

  return normalizedPayers;
}

/**
 * Create a new expense
 */
async function createExpense(req, res, next) {
  try {
    const groupId = req.groupId;
    const {
      description,
      amountINR,
      amountPaise: rawAmountPaise,
      category = 'General',
      notes,
      expenseDate,
      splitType = 'equal',
      payers, // Array of { userId, amountPaise } or { userId, amountINR }
      splitData, // Split parameters or participant objects
      participantIds, // Array of user IDs (for equal split or fallback)
      items, // For itemized split: [{ name, amountPaise, assignedUserIds }]
    } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Expense description is required' });
    }

    const totalPaise = rawAmountPaise !== undefined ? Number(rawAmountPaise) : toPaise(amountINR);
    if (isNaN(totalPaise) || totalPaise <= 0) {
      return res.status(400).json({ error: 'Expense total amount must be greater than 0' });
    }

    // Fetch active group members
    const membersRes = await query(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND status = 'active'`,
      [groupId]
    );
    const activeMemberIds = new Set(membersRes.rows.map((r) => r.user_id));

    // Handle single or multiple payers
    let normalizedPayers = [];
    if (!payers || payers.length === 0) {
      // Default: current user paid full amount
      normalizedPayers = [{ userId: req.user.id, amountPaise: totalPaise }];
    } else {
      normalizedPayers = validatePayers(payers, totalPaise, activeMemberIds);
    }

    // Calculate splits using financial engine
    let calculatedParticipants = [];
    let processedItems = [];

    try {
      if (splitType === 'itemized') {
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: 'At least one item is required for itemized expense' });
        }

        processedItems = items.map((it) => ({
          name: (it.name || 'Item').trim(),
          amountPaise: it.amountPaise !== undefined ? Number(it.amountPaise) : toPaise(it.amountINR),
          assignedUserIds: (it.assignedUserIds || []).map(Number),
        }));

        calculatedParticipants = calculateSplit('itemized', totalPaise, {
          items: processedItems,
          sharedTaxPaise: req.body.sharedTaxPaise || 0,
        }, [...activeMemberIds]);
      } else {
        calculatedParticipants = calculateSplit(
          splitType,
          totalPaise,
          splitData,
          participantIds || [...activeMemberIds]
        );
      }
    } catch (splitErr) {
      splitErr.status = 400;
      throw splitErr;
    }

    // Verify all participants are active members
    for (const p of calculatedParticipants) {
      if (!activeMemberIds.has(p.userId)) {
        return res.status(400).json({ error: `Participant #${p.userId} is not an active member of this group` });
      }
    }

    // Verify participant sum equals totalPaise
    const sumParticipants = calculatedParticipants.reduce((acc, p) => acc + p.sharePaise, 0);
    if (sumParticipants !== totalPaise) {
      return res.status(400).json({
        error: `Participant shares sum (₹${(sumParticipants / 100).toFixed(2)}) does not equal total (₹${(totalPaise / 100).toFixed(2)})`,
      });
    }

    // Insert into DB inside a transaction
    const savedExpense = await withTransaction(async (client) => {
      // 1. Insert expense record
      const expRes = await client.query(
        `INSERT INTO expenses 
         (group_id, created_by, description, total_amount_paise, category, notes, expense_date, split_type)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8)
         RETURNING *`,
        [
          groupId,
          req.user.id,
          description.trim(),
          totalPaise,
          category.trim() || 'General',
          notes ? notes.trim() : null,
          expenseDate || null,
          splitType,
        ]
      );
      const exp = expRes.rows[0];

      // 2. Insert payers
      for (const p of normalizedPayers) {
        await client.query(
          `INSERT INTO expense_payers (expense_id, user_id, amount_paise)
           VALUES ($1, $2, $3)`,
          [exp.id, p.userId, p.amountPaise]
        );
      }

      // 3. Insert participants
      for (const p of calculatedParticipants) {
        await client.query(
          `INSERT INTO expense_participants (expense_id, user_id, share_amount_paise, share_value, adjustment_paise)
           VALUES ($1, $2, $3, $4, $5)`,
          [exp.id, p.userId, p.sharePaise, p.shareValue || 0, p.adjustmentPaise || 0]
        );
      }

      // 4. Insert items if itemized
      if (splitType === 'itemized' && processedItems.length > 0) {
        for (const item of processedItems) {
          await client.query(
            `INSERT INTO expense_items (expense_id, item_name, amount_paise, assigned_user_ids)
             VALUES ($1, $2, $3, $4)`,
            [exp.id, item.name, item.amountPaise, JSON.stringify(item.assignedUserIds)]
          );
        }
      }

      // 5. Save initial snapshot in version history
      const snapshot = {
        expense: exp,
        payers: normalizedPayers,
        participants: calculatedParticipants,
        items: processedItems,
      };

      await client.query(
        `INSERT INTO expense_versions (expense_id, version, snapshot, modified_by, reason)
         VALUES ($1, 1, $2, $3, 'Initial creation')`,
        [exp.id, JSON.stringify(snapshot), req.user.id]
      );

      // 6. Log activity
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'expense', $3, 'created', $4)`,
        [
          groupId,
          req.user.id,
          exp.id,
          JSON.stringify({
            description: exp.description,
            amountPaise: exp.total_amount_paise,
            splitType: exp.split_type,
          }),
        ]
      );

      return exp;
    });

    res.status(201).json({
      message: 'Expense added successfully',
      expense: savedExpense,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all expenses for a group (filter by category, payer, status)
 */
async function getGroupExpenses(req, res, next) {
  try {
    const groupId = req.groupId;
    const { category, payerId, includeVoided = 'false' } = req.query;

    let queryText = `
      SELECT e.*, u.name AS created_by_name,
        (SELECT json_agg(json_build_object('userId', ep.user_id, 'name', pu.name, 'amountPaise', ep.amount_paise))
         FROM expense_payers ep
         JOIN users pu ON pu.id = ep.user_id
         WHERE ep.expense_id = e.id) AS payers,
        (SELECT json_agg(json_build_object('userId', pt.user_id, 'name', ptu.name, 'shareAmountPaise', pt.share_amount_paise, 'shareValue', pt.share_value, 'adjustmentPaise', pt.adjustment_paise))
         FROM expense_participants pt
         JOIN users ptu ON ptu.id = pt.user_id
         WHERE pt.expense_id = e.id) AS participants,
        (SELECT json_agg(json_build_object('id', ei.id, 'name', ei.item_name, 'amountPaise', ei.amount_paise, 'assignedUserIds', ei.assigned_user_ids))
         FROM expense_items ei
         WHERE ei.expense_id = e.id) AS items
      FROM expenses e
      JOIN users u ON u.id = e.created_by
      WHERE e.group_id = $1
    `;

    const params = [groupId];

    if (includeVoided !== 'true') {
      queryText += ' AND e.is_voided = false';
    }

    if (category) {
      params.push(category);
      queryText += ` AND e.category = $${params.length}`;
    }

    if (payerId) {
      params.push(Number(payerId));
      queryText += ` AND EXISTS (SELECT 1 FROM expense_payers WHERE expense_id = e.id AND user_id = $${params.length})`;
    }

    queryText += ' ORDER BY e.expense_date DESC, e.created_at DESC';

    const result = await query(queryText, params);
    res.json({ expenses: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Get single expense details with version history
 */
async function getExpenseDetails(req, res, next) {
  try {
    const expenseId = parseInt(req.params.expenseId, 10);

    const expRes = await query(
      `SELECT e.*, u.name AS created_by_name, vu.name AS voided_by_name,
        (SELECT json_agg(json_build_object('userId', ep.user_id, 'name', pu.name, 'amountPaise', ep.amount_paise))
         FROM expense_payers ep
         JOIN users pu ON pu.id = ep.user_id
         WHERE ep.expense_id = e.id) AS payers,
        (SELECT json_agg(json_build_object('userId', pt.user_id, 'name', ptu.name, 'shareAmountPaise', pt.share_amount_paise, 'shareValue', pt.share_value, 'adjustmentPaise', pt.adjustment_paise))
         FROM expense_participants pt
         JOIN users ptu ON ptu.id = pt.user_id
         WHERE pt.expense_id = e.id) AS participants,
        (SELECT json_agg(json_build_object('id', ei.id, 'name', ei.item_name, 'amountPaise', ei.amount_paise, 'assignedUserIds', ei.assigned_user_ids))
         FROM expense_items ei
         WHERE ei.expense_id = e.id) AS items
       FROM expenses e
       JOIN users u ON u.id = e.created_by
       LEFT JOIN users vu ON vu.id = e.voided_by
       WHERE e.id = $1`,
      [expenseId]
    );

    if (expRes.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const versionsRes = await query(
      `SELECT ev.version, ev.snapshot, ev.reason, ev.created_at, u.name AS modified_by_name
       FROM expense_versions ev
       JOIN users u ON u.id = ev.modified_by
       WHERE ev.expense_id = $1
       ORDER BY ev.version DESC`,
      [expenseId]
    );

    res.json({
      expense: expRes.rows[0],
      versions: versionsRes.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing expense (creates new version, preserves historical snapshot)
 */
async function updateExpense(req, res, next) {
  try {
    const expenseId = parseInt(req.params.expenseId, 10);
    const groupId = req.groupId;
    const {
      description,
      amountINR,
      amountPaise: rawAmountPaise,
      category = 'General',
      notes,
      expenseDate,
      splitType = 'equal',
      payers,
      splitData,
      participantIds,
      items,
      reason = 'Updated expense details',
    } = req.body;

    const existingRes = await query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [expenseId, groupId]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const currentExpense = existingRes.rows[0];
    if (currentExpense.is_voided) {
      return res.status(400).json({ error: 'Cannot update a voided expense' });
    }

    // Permission check: only expense creator or group creator
    if (currentExpense.created_by !== req.user.id && req.membership.role === 'member') {
      return res.status(403).json({ error: 'Only the creator of this expense or the group creator can edit it' });
    }

    const totalPaise = rawAmountPaise !== undefined ? Number(rawAmountPaise) : toPaise(amountINR);
    if (isNaN(totalPaise) || totalPaise <= 0) {
      return res.status(400).json({ error: 'Expense amount must be greater than 0' });
    }

    const membersRes = await query(
      `SELECT user_id FROM group_members WHERE group_id = $1 AND status = 'active'`,
      [groupId]
    );
    const activeMemberIds = new Set(membersRes.rows.map((r) => r.user_id));

    let normalizedPayers = [];
    if (!payers || payers.length === 0) {
      normalizedPayers = [{ userId: currentExpense.created_by, amountPaise: totalPaise }];
    } else {
      normalizedPayers = validatePayers(payers, totalPaise, activeMemberIds);
    }

    let calculatedParticipants = [];
    let processedItems = [];

    if (splitType === 'itemized') {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required for itemized expense' });
      }
      processedItems = items.map((it) => ({
        name: (it.name || 'Item').trim(),
        amountPaise: it.amountPaise !== undefined ? Number(it.amountPaise) : toPaise(it.amountINR),
        assignedUserIds: (it.assignedUserIds || []).map(Number),
      }));

      calculatedParticipants = calculateSplit('itemized', totalPaise, {
        items: processedItems,
        sharedTaxPaise: req.body.sharedTaxPaise || 0,
      }, [...activeMemberIds]);
    } else {
      calculatedParticipants = calculateSplit(
        splitType,
        totalPaise,
        splitData,
        participantIds || [...activeMemberIds]
      );
    }

    const nextVersion = currentExpense.version + 1;

    const updatedExpense = await withTransaction(async (client) => {
      // 1. Update expense row
      const updateRes = await client.query(
        `UPDATE expenses 
         SET description = $1, total_amount_paise = $2, category = $3, notes = $4,
             expense_date = COALESCE($5::date, CURRENT_DATE), split_type = $6,
             version = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING *`,
        [
          description.trim(),
          totalPaise,
          category.trim() || 'General',
          notes ? notes.trim() : null,
          expenseDate || null,
          splitType,
          nextVersion,
          expenseId,
        ]
      );
      const exp = updateRes.rows[0];

      // 2. Refresh payers
      await client.query('DELETE FROM expense_payers WHERE expense_id = $1', [expenseId]);
      for (const p of normalizedPayers) {
        await client.query(
          `INSERT INTO expense_payers (expense_id, user_id, amount_paise)
           VALUES ($1, $2, $3)`,
          [exp.id, p.userId, p.amountPaise]
        );
      }

      // 3. Refresh participants
      await client.query('DELETE FROM expense_participants WHERE expense_id = $1', [expenseId]);
      for (const p of calculatedParticipants) {
        await client.query(
          `INSERT INTO expense_participants (expense_id, user_id, share_amount_paise, share_value, adjustment_paise)
           VALUES ($1, $2, $3, $4, $5)`,
          [exp.id, p.userId, p.sharePaise, p.shareValue || 0, p.adjustmentPaise || 0]
        );
      }

      // 4. Refresh items
      await client.query('DELETE FROM expense_items WHERE expense_id = $1', [expenseId]);
      if (splitType === 'itemized' && processedItems.length > 0) {
        for (const item of processedItems) {
          await client.query(
            `INSERT INTO expense_items (expense_id, item_name, amount_paise, assigned_user_ids)
             VALUES ($1, $2, $3, $4)`,
            [exp.id, item.name, item.amountPaise, JSON.stringify(item.assignedUserIds)]
          );
        }
      }

      // 5. Save version snapshot
      const snapshot = {
        expense: exp,
        payers: normalizedPayers,
        participants: calculatedParticipants,
        items: processedItems,
      };

      await client.query(
        `INSERT INTO expense_versions (expense_id, version, snapshot, modified_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [exp.id, nextVersion, JSON.stringify(snapshot), req.user.id, reason]
      );

      // 6. Log activity
      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'expense', $3, 'updated', $4)`,
        [
          groupId,
          req.user.id,
          exp.id,
          JSON.stringify({
            description: exp.description,
            amountPaise: exp.total_amount_paise,
            version: nextVersion,
            reason,
          }),
        ]
      );

      return exp;
    });

    res.json({
      message: 'Expense updated successfully',
      expense: updatedExpense,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Void an expense (never permanently deletes financial records)
 */
async function voidExpense(req, res, next) {
  try {
    const expenseId = parseInt(req.params.expenseId, 10);
    const groupId = req.groupId;

    const existingRes = await query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [expenseId, groupId]);
    if (existingRes.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const currentExpense = existingRes.rows[0];
    if (currentExpense.is_voided) {
      return res.status(400).json({ error: 'Expense is already voided' });
    }

    // Permission check
    if (currentExpense.created_by !== req.user.id && req.membership.role === 'member') {
      return res.status(403).json({ error: 'Only the creator of this expense or the group creator can void it' });
    }

    const voidedExpense = await withTransaction(async (client) => {
      const updateRes = await client.query(
        `UPDATE expenses 
         SET is_voided = true, voided_by = $1, voided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [req.user.id, expenseId]
      );

      await client.query(
        `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
         VALUES ($1, $2, 'expense', $3, 'voided', $4)`,
        [
          groupId,
          req.user.id,
          expenseId,
          JSON.stringify({
            description: currentExpense.description,
            amountPaise: currentExpense.total_amount_paise,
          }),
        ]
      );

      return updateRes.rows[0];
    });

    res.json({
      message: 'Expense voided successfully',
      expense: voidedExpense,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createExpense,
  getGroupExpenses,
  getExpenseDetails,
  updateExpense,
  voidExpense,
};
