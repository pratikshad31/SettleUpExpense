// backend/src/utils/debts.js
// Deterministic policy for detailed person-to-person debt calculation

/**
 * Calculate detailed person-to-person debts from raw expenses and confirmed settlements.
 * 
 * DETERMINISTIC POLICY:
 * 1. Proportional payer attribution:
 *    For each non-voided expense, each payer k funded a fraction (P_k / Total) of every
 *    participant m's share.
 *    Base debt(m -> k) = floor(Share_m * P_k / Total).
 *    Any rounding remainder is deterministically allocated to payers ordered by user_id ascending.
 *    Self-debt (m == k) is ignored.
 * 2. Cumulative aggregation:
 *    Accumulate pairwise debts across all non-voided expenses.
 * 3. Settlement offset:
 *    Each confirmed settlement (A paid B amount M) reduces Debt(A -> B) by M.
 *    If M > Debt(A -> B), the excess reverses direction to Debt(B -> A).
 * 4. Bilateral netting:
 *    For every user pair (A, B), cancel reciprocal debts so at most one direction remains.
 * 
 * @param {Array<{ id: number, total_amount_paise: number|bigint, payers: Array<{ user_id: number, amount_paise: number|bigint }>, participants: Array<{ user_id: number, share_amount_paise: number|bigint }> }>} expenses
 * @param {Array<{ from_user: number, to_user: number, amount_paise: number|bigint, status: string }>} settlements
 * @param {Map<number, string>|Object} userMap - Map of userId -> userName
 * @returns {Array<{ fromUser: number, fromName: string, toUser: number, toName: string, amountPaise: number }>}
 */
function calculateDetailedDebts(expenses = [], settlements = [], userMap = {}) {
  // Pairwise map: debts[fromUser][toUser] = amountPaise
  const debts = {};

  function addDebt(from, to, amount) {
    if (from === to || amount <= 0) return;
    if (!debts[from]) debts[from] = {};
    debts[from][to] = (debts[from][to] || 0) + amount;
  }

  // 1. Process Expenses
  for (const exp of (expenses || [])) {
    if (exp.is_voided) continue;

    const total = Number(exp.total_amount_paise);
    if (!total || total <= 0) continue;

    const payers = [...(exp.payers || [])].sort((a, b) => Number(a.user_id) - Number(b.user_id));
    const remainingShares = (exp.participants || [])
      .map((part) => ({
        participantId: Number(part.user_id),
        remainingPaise: Number(part.share_amount_paise),
      }))
      .filter((part) => part.remainingPaise > 0);

    // Source of truth: allocate each payer's amount once against the remaining participant shares.
    // This preserves exact payer and participant totals, so pairwise debts net to /balances.
    for (const payer of payers) {
      const payerId = Number(payer.user_id);
      const payerAmount = Number(payer.amount_paise);
      const availablePaise = remainingShares.reduce((sum, part) => sum + part.remainingPaise, 0);
      if (!Number.isSafeInteger(payerAmount) || payerAmount <= 0 || payerAmount > availablePaise) continue;

      const denominator = BigInt(availablePaise);
      const allocations = remainingShares.map((part) => {
        const numerator = BigInt(part.remainingPaise) * BigInt(payerAmount);
        const base = Number(numerator / denominator);
        return {
          ...part,
          base,
          remainder: numerator % denominator,
        };
      });
      const baseSum = allocations.reduce((sum, part) => sum + part.base, 0);
      const extraPaise = payerAmount - baseSum;

      // Largest exact remainders receive leftover paise; user ID breaks ties deterministically.
      const remainderOrder = [...allocations].sort((a, b) => {
        if (a.remainder === b.remainder) return a.participantId - b.participantId;
        return a.remainder > b.remainder ? -1 : 1;
      });
      const bonusParticipants = new Set(
        remainderOrder.slice(0, extraPaise).map((part) => part.participantId)
      );

      for (const allocation of allocations) {
        const amountPaise = allocation.base + (bonusParticipants.has(allocation.participantId) ? 1 : 0);
        const remainingShare = remainingShares.find((part) => part.participantId === allocation.participantId);
        remainingShare.remainingPaise -= amountPaise;
        if (allocation.participantId !== payerId && amountPaise > 0) {
          addDebt(allocation.participantId, payerId, amountPaise);
        }
      }
    }
  }

  // 2. Subtract Confirmed Settlements
  for (const st of (settlements || [])) {
    if (st.status !== 'confirmed') continue;
    const from = Number(st.from_user);
    const to = Number(st.to_user);
    const amount = Number(st.amount_paise);

    if (from === to || amount <= 0) continue;

    const currentForward = (debts[from] && debts[from][to]) || 0;
    if (amount <= currentForward) {
      debts[from][to] = currentForward - amount;
    } else {
      // Overpayment in settlement reverses debt
      const excess = amount - currentForward;
      if (debts[from]) debts[from][to] = 0;
      addDebt(to, from, excess);
    }
  }

  // 3. Bilateral Netting: Cancel reciprocal debts
  const userIds = new Set();
  for (const u1 in debts) {
    userIds.add(Number(u1));
    for (const u2 in debts[u1]) {
      userIds.add(Number(u2));
    }
  }

  const userList = [...userIds].sort((a, b) => a - b);
  const result = [];

  for (let i = 0; i < userList.length; i++) {
    for (let j = i + 1; j < userList.length; j++) {
      const u1 = userList[i];
      const u2 = userList[j];

      const d12 = (debts[u1] && debts[u1][u2]) || 0;
      const d21 = (debts[u2] && debts[u2][u1]) || 0;

      if (d12 > d21) {
        const net = d12 - d21;
        if (net > 0) {
          result.push({
            fromUser: u1,
            fromName: (userMap instanceof Map ? userMap.get(u1) : userMap[u1]) || `User #${u1}`,
            toUser: u2,
            toName: (userMap instanceof Map ? userMap.get(u2) : userMap[u2]) || `User #${u2}`,
            amountPaise: net,
          });
        }
      } else if (d21 > d12) {
        const net = d21 - d12;
        if (net > 0) {
          result.push({
            fromUser: u2,
            fromName: (userMap instanceof Map ? userMap.get(u2) : userMap[u2]) || `User #${u2}`,
            toUser: u1,
            toName: (userMap instanceof Map ? userMap.get(u1) : userMap[u1]) || `User #${u1}`,
            amountPaise: net,
          });
        }
      }
    }
  }

  // Sort deterministically: fromUser asc, toUser asc
  return result.sort((a, b) => {
    if (a.fromUser !== b.fromUser) return a.fromUser - b.fromUser;
    return a.toUser - b.toUser;
  });
}

module.exports = {
  calculateDetailedDebts,
};
