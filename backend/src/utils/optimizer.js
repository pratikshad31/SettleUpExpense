// backend/src/utils/optimizer.js
// Settlement optimization algorithm (Deterministic Greedy Min-Cash-Flow)

/**
 * Calculate net balances and optimized settlement suggestions.
 * 
 * ALGORITHM SPECIFICATION:
 * - Net balance: Net(u) = (Paid_u - Owed_u) + (SettlementPaid_u - SettlementReceived_u)
 *   where positive means receivable (creditor), negative means payable (debtor).
 * - Net balances sum to exactly 0 (verified).
 * - Creditors (balance > 0) sorted descending by credit amount, tie-breaking by userId ascending.
 * - Debtors (balance < 0) sorted ascending by balance (largest absolute debt first), tie-breaking by userId ascending.
 * - In each step, match the largest debtor with the largest creditor:
 *     payment = min(|Net(Debtor)|, Net(Creditor))
 * - Both updated; process repeats until all balances reach 0.
 * 
 * Note: While greedy settlement is known to produce an optimal or near-optimal number
 * of transactions (at most N - 1 transactions) in O(N log N) time, finding the absolute
 * theoretical minimum in all arbitrary subset-sum cases is NP-complete. This greedy
 * heuristic is deterministic, robust, and mathematically bounded by net balances.
 * 
 * @param {Array<{ id: number, total_amount_paise: number|bigint, payers: Array<{ user_id: number, amount_paise: number|bigint }>, participants: Array<{ user_id: number, share_amount_paise: number|bigint }> }>} expenses
 * @param {Array<{ from_user: number, to_user: number, amount_paise: number|bigint, status: string }>} settlements
 * @param {Array<{ id: number, name: string, upi_id?: string }>} groupMembers
 * @returns {{ balances: Array<{ userId: number, name: string, upiId: string|null, totalPaidPaise: number, totalOwedPaise: number, netBalancePaise: number }>, suggestions: Array<{ fromUser: number, fromName: string, toUser: number, toName: string, toUpiId: string|null, amountPaise: number }> }}
 */
function calculateBalancesAndOptimization(expenses, settlements, groupMembers = []) {
  const memberMap = new Map();
  for (const m of groupMembers) {
    memberMap.set(Number(m.id), {
      name: m.name,
      upiId: m.upi_id || null,
    });
  }

  // Running totals
  const totalPaid = {};
  const totalOwed = {};
  const settlementPaid = {};
  const settlementReceived = {};

  // Initialize all known group members
  for (const m of groupMembers) {
    const id = Number(m.id);
    totalPaid[id] = 0;
    totalOwed[id] = 0;
    settlementPaid[id] = 0;
    settlementReceived[id] = 0;
  }

  // 1. Process Active (non-voided) Expenses
  for (const exp of expenses) {
    if (exp.is_voided) continue;

    for (const p of exp.payers || []) {
      const uid = Number(p.user_id);
      totalPaid[uid] = (totalPaid[uid] || 0) + Number(p.amount_paise);
    }

    for (const part of exp.participants || []) {
      const uid = Number(part.user_id);
      totalOwed[uid] = (totalOwed[uid] || 0) + Number(part.share_amount_paise);
    }
  }

  // 2. Process Confirmed Settlements ONLY
  for (const st of settlements) {
    if (st.status !== 'confirmed') continue;

    const from = Number(st.from_user);
    const to = Number(st.to_user);
    const amt = Number(st.amount_paise);

    settlementPaid[from] = (settlementPaid[from] || 0) + amt;
    settlementReceived[to] = (settlementReceived[to] || 0) + amt;
  }

  // Collect all unique user IDs involved
  const allUserIds = new Set([
    ...groupMembers.map((m) => Number(m.id)),
    ...Object.keys(totalPaid).map(Number),
    ...Object.keys(totalOwed).map(Number),
    ...Object.keys(settlementPaid).map(Number),
    ...Object.keys(settlementReceived).map(Number),
  ]);

  const balances = [];
  const creditors = [];
  const debtors = [];
  let sumNetBalances = 0;

  for (const uid of [...allUserIds].sort((a, b) => a - b)) {
    const paid = totalPaid[uid] || 0;
    const owed = totalOwed[uid] || 0;
    const sPaid = settlementPaid[uid] || 0;
    const sRecv = settlementReceived[uid] || 0;

    const net = (paid - owed) + (sPaid - sRecv);
    sumNetBalances += net;

    const memberInfo = memberMap.get(uid) || { name: `User #${uid}`, upiId: null };

    balances.push({
      userId: uid,
      name: memberInfo.name,
      upiId: memberInfo.upiId,
      totalPaidPaise: paid,
      totalOwedPaise: owed,
      settlementPaidPaise: sPaid,
      settlementReceivedPaise: sRecv,
      netBalancePaise: net,
    });

    if (net > 0) {
      creditors.push({ userId: uid, name: memberInfo.name, upiId: memberInfo.upiId, amount: net });
    } else if (net < 0) {
      debtors.push({ userId: uid, name: memberInfo.name, upiId: memberInfo.upiId, amount: -net });
    }
  }

  // Invariant verification: sum of net balances MUST be 0
  if (Math.abs(sumNetBalances) > 0) {
    console.warn(`Zero-sum balance invariant check warning: sum = ${sumNetBalances} paise`);
  }

  // 3. Settlement Optimization Algorithm
  // Sort creditors descending by amount, tie-break by userId asc
  creditors.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.userId - b.userId;
  });

  // Sort debtors descending by debt amount, tie-break by userId asc
  debtors.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.userId - b.userId;
  });

  const suggestions = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    const payment = Math.min(creditor.amount, debtor.amount);
    if (payment > 0) {
      suggestions.push({
        fromUser: debtor.userId,
        fromName: debtor.name,
        toUser: creditor.userId,
        toName: creditor.name,
        toUpiId: creditor.upiId,
        amountPaise: payment,
      });

      creditor.amount -= payment;
      debtor.amount -= payment;
    }

    if (creditor.amount === 0) cIdx++;
    if (debtor.amount === 0) dIdx++;
  }

  return {
    balances,
    suggestions,
    netSumPaise: sumNetBalances,
  };
}

module.exports = {
  calculateBalancesAndOptimization,
};
