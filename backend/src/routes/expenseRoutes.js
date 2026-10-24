// backend/src/routes/expenseRoutes.js
// Individual expense operations (view, update, void)

const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middleware/auth');
const { query } = require('../db');

// Require authentication for all expense routes
router.use(authenticate);

/**
 * Middleware to load expense and check that requesting user is a member of its group
 */
async function requireExpenseGroupMember(req, res, next) {
  try {
    const expenseId = parseInt(req.params.expenseId, 10);
    if (!expenseId || isNaN(expenseId)) {
      return res.status(400).json({ error: 'Valid expenseId is required' });
    }

    const expRes = await query('SELECT group_id, created_by, is_voided FROM expenses WHERE id = $1', [expenseId]);
    if (expRes.rowCount === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const groupId = expRes.rows[0].group_id;
    const memberRes = await query(
      `SELECT role, status FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user.id]
    );

    if (memberRes.rowCount === 0 || memberRes.rows[0].status !== 'active') {
      return res.status(403).json({ error: 'You do not have access to this expense' });
    }

    req.groupId = groupId;
    req.membership = memberRes.rows[0];
    req.currentExpenseMeta = expRes.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/:expenseId', requireExpenseGroupMember, expenseController.getExpenseDetails);
router.put('/:expenseId', requireExpenseGroupMember, expenseController.updateExpense);
router.post('/:expenseId/void', requireExpenseGroupMember, expenseController.voidExpense);

module.exports = router;
