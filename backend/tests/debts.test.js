// backend/tests/debts.test.js
// Unit tests for Detailed Person-to-Person Debts Policy

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateDetailedDebts } = require('../src/utils/debts');

describe('Module 4: Detailed Debts Policy (src/utils/debts.js)', () => {
  it('should calculate pairwise debts and cancel reciprocal obligations', () => {
    // Expense 1: User 1 paid ₹200 (20000 paise) for User 2
    // User 2 owes User 1 ₹200
    // Expense 2: User 2 paid ₹50 (5000 paise) for User 1
    // User 1 owes User 2 ₹50
    // Net result: User 2 owes User 1 ₹150 (15000 paise)
    const expenses = [
      {
        id: 1,
        total_amount_paise: 20000,
        payers: [{ user_id: 1, amount_paise: 20000 }],
        participants: [{ user_id: 2, share_amount_paise: 20000 }],
      },
      {
        id: 2,
        total_amount_paise: 5000,
        payers: [{ user_id: 2, amount_paise: 5000 }],
        participants: [{ user_id: 1, share_amount_paise: 5000 }],
      },
    ];

    const debts = calculateDetailedDebts(expenses, [], { 1: 'User 1', 2: 'User 2' });

    assert.strictEqual(debts.length, 1);
    assert.strictEqual(debts[0].fromUser, 2);
    assert.strictEqual(debts[0].toUser, 1);
    assert.strictEqual(debts[0].amountPaise, 15000);
  });

  it('should offset detailed debts when confirmed settlements are recorded', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 10000,
        payers: [{ user_id: 1, amount_paise: 10000 }],
        participants: [{ user_id: 2, share_amount_paise: 10000 }],
      },
    ];

    // User 2 paid User 1 ₹60 (6000 paise) confirmed
    const settlements = [
      { from_user: 2, to_user: 1, amount_paise: 6000, status: 'confirmed' },
    ];

    const debts = calculateDetailedDebts(expenses, settlements, { 1: 'U1', 2: 'U2' });

    assert.strictEqual(debts.length, 1);
    assert.strictEqual(debts[0].fromUser, 2);
    assert.strictEqual(debts[0].toUser, 1);
    assert.strictEqual(debts[0].amountPaise, 4000); // 10000 - 6000 = 4000
  });

  it('should ignore pending, marked_paid, and rejected settlements', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 10000,
        payers: [{ user_id: 1, amount_paise: 10000 }],
        participants: [{ user_id: 2, share_amount_paise: 10000 }],
      },
    ];

    const settlements = [
      { from_user: 2, to_user: 1, amount_paise: 3000, status: 'pending' },
      { from_user: 2, to_user: 1, amount_paise: 3000, status: 'marked_paid' },
      { from_user: 2, to_user: 1, amount_paise: 4000, status: 'rejected' },
    ];

    const debts = calculateDetailedDebts(expenses, settlements, { 1: 'U1', 2: 'U2' });
    // Still full 10000 paise owed
    assert.strictEqual(debts.length, 1);
    assert.strictEqual(debts[0].amountPaise, 10000);
  });

  it('should reverse debt direction if settlement is an overpayment', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 5000,
        payers: [{ user_id: 1, amount_paise: 5000 }],
        participants: [{ user_id: 2, share_amount_paise: 5000 }],
      },
    ];

    // User 2 pays User 1 8000 paise confirmed (overpayment of 3000)
    const settlements = [
      { from_user: 2, to_user: 1, amount_paise: 8000, status: 'confirmed' },
    ];

    const debts = calculateDetailedDebts(expenses, settlements, { 1: 'U1', 2: 'U2' });
    // User 1 now owes User 2 3000 paise
    assert.strictEqual(debts.length, 1);
    assert.strictEqual(debts[0].fromUser, 1);
    assert.strictEqual(debts[0].toUser, 2);
    assert.strictEqual(debts[0].amountPaise, 3000);
  });

  it('should remove debts completely when exactly settled', () => {
    const expenses = [
      {
        id: 1,
        total_amount_paise: 5000,
        payers: [{ user_id: 1, amount_paise: 5000 }],
        participants: [{ user_id: 2, share_amount_paise: 5000 }],
      },
    ];

    const settlements = [
      { from_user: 2, to_user: 1, amount_paise: 5000, status: 'confirmed' },
    ];

    const debts = calculateDetailedDebts(expenses, settlements);
    assert.strictEqual(debts.length, 0);
  });

  it('should properly divide multiple payer contributions among participants', () => {
    // Multiple payers: Payer 1 paid ₹60, Payer 2 paid ₹40 (Total ₹100)
    // Participant 3's share is ₹50
    // Payer 1 funded 60% of 50 = ₹30
    // Payer 2 funded 40% of 50 = ₹20
    const expenses = [
      {
        id: 1,
        total_amount_paise: 10000,
        payers: [
          { user_id: 1, amount_paise: 6000 },
          { user_id: 2, amount_paise: 4000 },
        ],
        participants: [
          { user_id: 3, share_amount_paise: 5000 },
          { user_id: 1, share_amount_paise: 2500 },
          { user_id: 2, share_amount_paise: 2500 },
        ],
      },
    ];

    const debts = calculateDetailedDebts(expenses, [], { 1: 'U1', 2: 'U2', 3: 'U3' });

    // User 3 owes User 1 ₹30 (3000 paise)
    // User 3 owes User 2 ₹20 (2000 paise)
    const d31 = debts.find((d) => d.fromUser === 3 && d.toUser === 1);
    const d32 = debts.find((d) => d.fromUser === 3 && d.toUser === 2);

    assert.ok(d31);
    assert.strictEqual(d31.amountPaise, 3000);
    assert.ok(d32);
    assert.strictEqual(d32.amountPaise, 2000);
  });

  it('should safely handle empty or null inputs', () => {
    assert.deepStrictEqual(calculateDetailedDebts(null, null), []);
    assert.deepStrictEqual(calculateDetailedDebts([], []), []);
  });
});
