const { calculateBalancesAndOptimization } = require('./optimizer');

async function getGroupFinancialSummary(client, groupId) {
  const expensesRes = await client.query(
    `SELECT e.id, e.total_amount_paise, e.is_voided,
            (SELECT json_agg(json_build_object('user_id', ep.user_id, 'amount_paise', ep.amount_paise))
             FROM expense_payers ep WHERE ep.expense_id = e.id) AS payers,
            (SELECT json_agg(json_build_object('user_id', part.user_id, 'share_amount_paise', part.share_amount_paise))
             FROM expense_participants part WHERE part.expense_id = e.id) AS participants
     FROM expenses e
     WHERE e.group_id = $1 AND e.is_voided = false`,
    [groupId]
  );
  const settlementsRes = await client.query(
    `SELECT id, from_user, to_user, amount_paise, status
     FROM settlements
     WHERE group_id = $1 AND status = 'confirmed'`,
    [groupId]
  );
  const membersRes = await client.query(
    `SELECT u.id, u.name, u.email, u.upi_id, gm.status, gm.role
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  const financialData = {
    expenses: expensesRes.rows,
    settlements: settlementsRes.rows,
    members: membersRes.rows,
  };
  const balances = calculateBalancesAndOptimization(
    financialData.expenses,
    financialData.settlements,
    financialData.members
  );

  return { ...financialData, ...balances };
}

module.exports = { getGroupFinancialSummary };
