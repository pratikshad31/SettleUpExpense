// backend/tests/randomizedFinancial.test.js
// Randomized property-based financial invariant tests

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateSplit } = require('../src/utils/splits');
const { calculateBalancesAndOptimization } = require('../src/utils/optimizer');
const { calculateDetailedDebts } = require('../src/utils/debts');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

describe('Randomized Financial Property Invariant Tests (100 Simulations)', () => {
  it('should maintain zero-sum balance and allocation invariants across 100 randomized groups', () => {
    const SPLIT_TYPES = ['equal', 'exact', 'percentage', 'shares', 'adjustment'];

    for (let sim = 1; sim <= 100; sim++) {
      // 1. Generate random group members (3 to 8 members)
      const numMembers = randomInt(3, 8);
      const members = Array.from({ length: numMembers }, (_, idx) => ({
        id: idx + 1,
        name: `Member_${idx + 1}`,
      }));
      const memberIds = members.map((m) => m.id);

      // 2. Generate random expenses (3 to 10 expenses)
      const numExpenses = randomInt(3, 10);
      const expenses = [];

      for (let eIdx = 1; eIdx <= numExpenses; eIdx++) {
        const totalPaise = randomInt(100, 50000); // ₹1.00 to ₹500.00
        const splitType = randomChoice(SPLIT_TYPES);

        // Random subset of participants (at least 2)
        const shuffled = [...memberIds].sort(() => Math.random() - 0.5);
        const participantCount = randomInt(2, memberIds.length);
        const selectedParticipants = shuffled.slice(0, participantCount);

        let participants = [];
        let splitData = null;

        if (splitType === 'equal') {
          splitData = selectedParticipants;
          participants = calculateSplit('equal', totalPaise, splitData, memberIds);
        } else if (splitType === 'exact') {
          // Distribute totalPaise randomly into exact parts
          let remaining = totalPaise;
          const exactParts = [];
          for (let i = 0; i < selectedParticipants.length; i++) {
            if (i === selectedParticipants.length - 1) {
              exactParts.push({ userId: selectedParticipants[i], amountPaise: remaining });
            } else {
              const remainingParticipants = selectedParticipants.length - i - 1;
              const portion = randomInt(1, remaining - remainingParticipants);
              exactParts.push({ userId: selectedParticipants[i], amountPaise: portion });
              remaining -= portion;
            }
          }
          splitData = exactParts;
          participants = calculateSplit('exact', totalPaise, splitData, memberIds);
        } else if (splitType === 'percentage') {
          // Random percentages summing to 100
          let remainingPct = 100;
          const pctParts = [];
          for (let i = 0; i < selectedParticipants.length; i++) {
            if (i === selectedParticipants.length - 1) {
              pctParts.push({ userId: selectedParticipants[i], percentage: remainingPct });
            } else {
              const portion = randomInt(1, Math.max(1, remainingPct - (selectedParticipants.length - i)));
              pctParts.push({ userId: selectedParticipants[i], percentage: portion });
              remainingPct -= portion;
            }
          }
          splitData = pctParts;
          participants = calculateSplit('percentage', totalPaise, splitData, memberIds);
        } else if (splitType === 'shares') {
          const shareParts = selectedParticipants.map((uid) => ({
            userId: uid,
            shares: randomInt(1, 5),
          }));
          splitData = shareParts;
          participants = calculateSplit('shares', totalPaise, splitData, memberIds);
        } else if (splitType === 'adjustment') {
          // Adjustments summing to 0 or modest amount
          const adjParts = selectedParticipants.map((uid, i) => ({
            userId: uid,
            adjustmentPaise: 0,
          }));
          splitData = adjParts;
          participants = calculateSplit('adjustment', totalPaise, splitData, memberIds);
        }

        // INVARIANT 1: Split sum must equal totalPaise exactly
        const splitSum = participants.reduce((s, p) => s + p.sharePaise, 0);
        assert.strictEqual(
          splitSum,
          totalPaise,
          `Simulation #${sim}, Expense #${eIdx}: Participant shares sum (${splitSum}) != totalPaise (${totalPaise}) for type ${splitType}`
        );

        // Payers: 1 or multiple payers
        const numPayers = randomInt(1, Math.min(3, memberIds.length));
        const payerCandidates = [...memberIds].sort(() => Math.random() - 0.5).slice(0, numPayers);
        let remPayerPaise = totalPaise;
        const payers = [];

        for (let pIdx = 0; pIdx < payerCandidates.length; pIdx++) {
          if (pIdx === payerCandidates.length - 1) {
            payers.push({ user_id: payerCandidates[pIdx], amount_paise: remPayerPaise });
          } else {
            const pAmt = randomInt(1, remPayerPaise - (payerCandidates.length - pIdx));
            payers.push({ user_id: payerCandidates[pIdx], amount_paise: pAmt });
            remPayerPaise -= pAmt;
          }
        }

        // INVARIANT 2: Payer sum must equal totalPaise exactly
        const payerSum = payers.reduce((s, p) => s + p.amount_paise, 0);
        assert.strictEqual(
          payerSum,
          totalPaise,
          `Simulation #${sim}, Expense #${eIdx}: Payer sum (${payerSum}) != totalPaise (${totalPaise})`
        );

        const isVoided = Math.random() < 0.15; // 15% chance of being voided

        expenses.push({
          id: eIdx,
          total_amount_paise: totalPaise,
          is_voided: isVoided,
          payers,
          participants: participants.map((p) => ({
            user_id: p.userId,
            share_amount_paise: p.sharePaise,
          })),
        });
      }

      // 3. Generate random settlements
      const numSettlements = randomInt(1, 5);
      const settlements = [];
      for (let sIdx = 1; sIdx <= numSettlements; sIdx++) {
        const u1 = randomChoice(memberIds);
        let u2 = randomChoice(memberIds);
        while (u2 === u1) u2 = randomChoice(memberIds);

        const status = randomChoice(['pending', 'marked_paid', 'confirmed', 'rejected']);
        settlements.push({
          from_user: u1,
          to_user: u2,
          amount_paise: randomInt(50, 5000),
          status,
        });
      }

      // 4. Calculate Net Balances and Optimization
      const { balances, suggestions, netSumPaise } = calculateBalancesAndOptimization(
        expenses,
        settlements,
        members
      );

      // INVARIANT 3: Sum of group net balances MUST BE STRICTLY 0
      assert.strictEqual(
        netSumPaise,
        0,
        `Simulation #${sim}: Net balance zero-sum invariant violated. Sum = ${netSumPaise}`
      );

      // INVARIANT 4: Optimized suggestions must not exceed debtors' obligations or creditors' claims
      const netMap = new Map(balances.map((b) => [b.userId, b.netBalancePaise]));
      const debtorPaid = {};
      const creditorReceived = {};

      for (const sug of suggestions) {
        assert.ok(sug.amountPaise > 0, `Suggestion amount must be > 0`);
        debtorPaid[sug.fromUser] = (debtorPaid[sug.fromUser] || 0) + sug.amountPaise;
        creditorReceived[sug.toUser] = (creditorReceived[sug.toUser] || 0) + sug.amountPaise;
      }

      for (const [uid, totalPaid] of Object.entries(debtorPaid)) {
        const net = netMap.get(Number(uid));
        assert.ok(net < 0, `Debtor in suggestion must have negative net balance`);
        assert.strictEqual(
          totalPaid,
          Math.abs(net),
          `Simulation #${sim}: Debtor #${uid} suggested payments (${totalPaid}) does not equal debt (${Math.abs(net)})`
        );
      }

      for (const [uid, totalRecv] of Object.entries(creditorReceived)) {
        const net = netMap.get(Number(uid));
        assert.ok(net > 0, `Creditor in suggestion must have positive net balance`);
        assert.strictEqual(
          totalRecv,
          net,
          `Simulation #${sim}: Creditor #${uid} suggested receipts (${totalRecv}) does not equal credit (${net})`
        );
      }

      // INVARIANT 5: Detailed debts must have no reciprocal cycles
      const memberMap = new Map(members.map((m) => [m.id, m.name]));
      const detailedDebts = calculateDetailedDebts(expenses, settlements, memberMap);

      for (const d of detailedDebts) {
        assert.ok(d.amountPaise > 0, `Detailed debt amount must be > 0`);
        assert.notStrictEqual(d.fromUser, d.toUser, `Detailed debt cannot be to self`);
        // Check reciprocal
        const reciprocal = detailedDebts.find((r) => r.fromUser === d.toUser && r.toUser === d.fromUser);
        assert.strictEqual(
          reciprocal,
          undefined,
          `Simulation #${sim}: Bilateral netting failure. Reciprocal debt exists between ${d.fromUser} and ${d.toUser}`
        );
      }
    }
  });
});
