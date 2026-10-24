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
function calculateDetailedDebts(expenses, settlements, userMap = {}) {
  // Pairwise map: debts[fromUser][toUser] = amountPaise
  const debts = {};

  function addDebt(from, to, amount) {
    if (from === to || amount <= 0) return;
    if (!debts[from]) debts[from] = {};
    debts[from][to] = (debts[from][to] || 0) + amount;
  }

  // 1. Process Expenses
  for (const exp of expenses) {
    const total = Number(exp.total_amount_paise);
    if (!total || total <= 0) continue;

    const payers = [...(exp.payers || [])].sort((a, b) => Number(a.user_id) - Number(b.user_id));
    const participants = exp.participants || [];

    for (const part of participants) {
      const participantId = Number(part.user_id);
      const sharePaise = Number(part.share_amount_paise);
      if (sharePaise <= 0) continue;

      // Distribute participant's share across payers proportionally
      let allocated = 0;
      const payerAllocations = payers.map((payer) => {
        const payerId = Number(payer.user_id);
        const payerAmount = Number(payer.amount_paise);
        const raw = (sharePaise * payerAmount) / total;
        const base = Math.floor(raw);
        return {
          payerId,
          base,
          fraction: raw - base,
        };
      });

      const baseSum = payerAllocations.reduce((sum, p) => sum + p.base, 0);
      const remainder = sharePaise - baseSum;

      // Deterministic remainder distribution: sort by fraction desc, then payerId asc
      const sortedPayers = [...payerAllocations].sort((a, b) => {
        if (Math.abs(b.fraction - a.fraction) > 0.000001) {
          return b.fraction - a.fraction;
        }
        return a.payerId - b.payerId;
      });

      const bonusPayers = new Set(sortedPayers.slice(0, remainder).map((p) => p.payerId));

      for (const p of payerAllocations) {
        const finalPayerShare = p.base + (bonusPayers.has(p.payerId) ? 1 : 0);
        if (participantId !== p.payerId && finalPayerShare > 0) {
          addDebt(participantId, p.payerId, finalPayerShare);
        }
      }
    }
  }

  // 2. Subtract Confirmed Settlements
  for (const st of settlements) {
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
