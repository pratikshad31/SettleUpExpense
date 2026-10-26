// backend/src/controllers/balanceController.js
// Net balances, detailed person-to-person debts, and settlement optimization

const { pool } = require('../db');
const { calculateDetailedDebts } = require('../utils/debts');
const { generateUpiUri } = require('../utils/upi');
const { getGroupFinancialSummary } = require('../utils/groupBalances');

/**
 * Get net balances and optimized settlement suggestions
 */
async function getGroupBalances(req, res, next) {
  try {
    const groupId = req.groupId;
    const { expenses, settlements, balances, suggestions, netSumPaise } =
      await getGroupFinancialSummary(pool, groupId);

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
    const { expenses, settlements, members } = await getGroupFinancialSummary(pool, groupId);

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
