// backend/tests/optimizer.test.js
// Unit tests for Net Balances and Settlement Optimization (Min-Cash-Flow)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateBalancesAndOptimization } = require('../src/utils/optimizer');

describe('Settlement Optimizer & Net Balance Tests', () => {
  it('should maintain zero-sum net balance invariant', () => {
    // 3 users: A, B, C
    // Expense: A paid ₹300 (30000 paise), split equally among A, B, C (10000 each)
    const expenses = [
      {
        id: 1,
        total_amount_paise: 30000,
        is_voided: false,
        payers: [{ user_id: 1, amount_paise: 30000 }],
        participants: [
          { user_id: 1, share_amount_paise: 10000 },
          { user_id: 2, share_amount_paise: 10000 },
          { user_id: 3, share_amount_paise: 10000 },
        ],
      },
    ];

    const members = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ];

    const { balances, suggestions, netSumPaise } = calculateBalancesAndOptimization(
      expenses,
      [],
      members
    );

    assert.strictEqual(netSumPaise, 0);

    // Alice: paid 300, share 100 => net +200 (+20000 paise)
    // Bob: paid 0, share 100 => net -100 (-10000 paise)
    // Charlie: paid 0, share 100 => net -100 (-10000 paise)
    const aliceBal = balances.find((b) => b.userId === 1);
    const bobBal = balances.find((b) => b.userId === 2);
    const charlieBal = balances.find((b) => b.userId === 3);

    assert.strictEqual(aliceBal.netBalancePaise, 20000);
    assert.strictEqual(bobBal.netBalancePaise, -10000);
    assert.strictEqual(charlieBal.netBalancePaise, -10000);

    // Suggestions: Bob -> Alice ₹100, Charlie -> Alice ₹100
    assert.strictEqual(suggestions.length, 2);
    const totalSuggested = suggestions.reduce((s, sug) => s + sug.amountPaise, 0);
    assert.strictEqual(totalSuggested, 20000);
  });

  it('should ignore voided expenses in balance calculation', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 10000,
        is_voided: true, // voided
        payers: [{ user_id: 1, amount_paise: 10000 }],
        participants: [
          { user_id: 1, share_amount_paise: 5000 },
          { user_id: 2, share_amount_paise: 5000 },
        ],
      },
    ];

    const members = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    const { balances, suggestions } = calculateBalancesAndOptimization(expenses, [], members);

    assert.strictEqual(balances.find((b) => b.userId === 1).netBalancePaise, 0);
    assert.strictEqual(balances.find((b) => b.userId === 2).netBalancePaise, 0);
    assert.strictEqual(suggestions.length, 0);
  });

  it('should adjust balances with confirmed settlements only', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 20000,
        is_voided: false,
        payers: [{ user_id: 1, amount_paise: 20000 }],
        participants: [
          { user_id: 1, share_amount_paise: 10000 },
          { user_id: 2, share_amount_paise: 10000 },
        ],
      },
    ];

    // Bob paid Alice ₹50 (5000 paise) confirmed, and ₹20 pending (pending must NOT affect balance)
    const settlements = [
      { from_user: 2, to_user: 1, amount_paise: 5000, status: 'confirmed' },
      { from_user: 2, to_user: 1, amount_paise: 2000, status: 'pending' },
      { from_user: 2, to_user: 1, amount_paise: 1000, status: 'rejected' },
    ];

    const members = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    const { balances, suggestions } = calculateBalancesAndOptimization(expenses, settlements, members);

    // Alice originally +10000, after receiving 5000 confirmed, net should be +5000
    // Bob originally -10000, after paying 5000 confirmed, net should be -5000
    assert.strictEqual(balances.find((b) => b.userId === 1).netBalancePaise, 5000);
    assert.strictEqual(balances.find((b) => b.userId === 2).netBalancePaise, -5000);

    // Outstanding suggestion should now be only ₹50 (5000 paise)
    assert.strictEqual(suggestions.length, 1);
    assert.strictEqual(suggestions[0].amountPaise, 5000);
  });

  it('should produce at most N - 1 settlement transactions for complex multi-party balances', () => {
    // 5 members with complex transactions
    const members = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
      { id: 4, name: 'D' },
      { id: 5, name: 'E' },
    ];

    const expenses = [
      {
        id: 1,
        total_amount_paise: 50000,
        is_voided: false,
        payers: [{ user_id: 1, amount_paise: 50000 }],
        participants: [
          { user_id: 1, share_amount_paise: 10000 },
          { user_id: 2, share_amount_paise: 10000 },
          { user_id: 3, share_amount_paise: 10000 },
          { user_id: 4, share_amount_paise: 10000 },
          { user_id: 5, share_amount_paise: 10000 },
        ],
      },
      {
        id: 2,
        total_amount_paise: 20000,
        is_voided: false,
        payers: [{ user_id: 2, amount_paise: 20000 }],
        participants: [
          { user_id: 2, share_amount_paise: 10000 },
          { user_id: 3, share_amount_paise: 10000 },
        ],
      },
    ];

    const { suggestions } = calculateBalancesAndOptimization(expenses, [], members);

    // Number of suggestions should be strictly <= N - 1 (<= 4)
    assert.ok(suggestions.length <= members.length - 1);
  });

  it('should safely handle empty or null inputs', () => {
    const res = calculateBalancesAndOptimization(null, null, null);
    assert.deepStrictEqual(res.balances, []);
    assert.deepStrictEqual(res.suggestions, []);
    assert.strictEqual(res.netSumPaise, 0);
  });
});
