// backend/src/controllers/balanceController.js
// Net balances, detailed person-to-person debts, and settlement optimization

const { query } = require('../db');
const { calculateBalancesAndOptimization } = require('../utils/optimizer');
const { calculateDetailedDebts } = require('../utils/debts');
const { generateUpiUri } = require('../utils/upi');

/**
 * Helper to fetch all raw group financial data
 */
async function fetchGroupFinancialData(groupId) {
  // 1. Fetch non-voided expenses with payers and participants
  const expRes = await query(
    `SELECT e.id, e.total_amount_paise, e.is_voided,
            (SELECT json_agg(json_build_object('user_id', ep.user_id, 'amount_paise', ep.amount_paise))
             FROM expense_payers ep WHERE ep.expense_id = e.id) AS payers,
            (SELECT json_agg(json_build_object('user_id', part.user_id, 'share_amount_paise', part.share_amount_paise))
             FROM expense_participants part WHERE part.expense_id = e.id) AS participants
     FROM expenses e
     WHERE e.group_id = $1 AND e.is_voided = false`,
    [groupId]
  );

  // 2. Fetch confirmed settlements
  const stRes = await query(
    `SELECT id, from_user, to_user, amount_paise, status
     FROM settlements
     WHERE group_id = $1 AND status = 'confirmed'`,
    [groupId]
  );

  // 3. Fetch all group members (including inactive to preserve historical records)
  const membersRes = await query(
    `SELECT u.id, u.name, u.email, u.upi_id, gm.status, gm.role
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  return {
    expenses: expRes.rows,
    settlements: stRes.rows,
    members: membersRes.rows,
  };
}

/**
 * Get net balances and optimized settlement suggestions
 */
async function getGroupBalances(req, res, next) {
  try {
    const groupId = req.groupId;
    const { expenses, settlements, members } = await fetchGroupFinancialData(groupId);

    const { balances, suggestions, netSumPaise } = calculateBalancesAndOptimization(
      expenses,
      settlements,
      members
    );

    // Enrich suggestions with UPI URIs
    const enrichedSuggestions = suggestions.map((sug) => {
      let upiUri = null;
      if (sug.toUpiId && sug.amountPaise > 0) {
        try {
          upiUri = generateUpiUri({
            upiId: sug.toUpiId,
            recipientName: sug.toName,
            amountPaise: sug.amountPaise,
            note: `SettleUp debt payment to ${sug.toName}`,
          });
        } catch (_) {
          upiUri = null;
        }
      }

      return {
        ...sug,
        upiUri,
      };
    });

    res.json({
      groupId,
      balances,
      suggestions: enrichedSuggestions,
      netSumPaise,
      totalExpensesCount: expenses.length,
      confirmedSettlementsCount: settlements.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get detailed person-to-person debt graph
 */
async function getGroupDebts(req, res, next) {
  try {
    const groupId = req.groupId;
    const { expenses, settlements, members } = await fetchGroupFinancialData(groupId);

    const memberMap = new Map();
    for (const m of members) {
      memberMap.set(m.id, m.name);
    }

    const debts = calculateDetailedDebts(expenses, settlements, memberMap);
    const totalDebtPaise = debts.reduce((acc, d) => acc + d.amountPaise, 0);

    res.json({
      groupId,
      debts,
      totalDebtPaise,
      count: debts.length,
      policy: 'Deterministic proportional payer allocation with bilateral netting and confirmed settlement offset',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGroupBalances,
  getGroupDebts,
};
