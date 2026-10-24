// backend/tests/splits.test.js
// Dedicated unit tests for splits.js (All 6 Split Methods + Invariant checks)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateSharesSplit,
  calculateAdjustmentSplit,
  calculateItemizedSplit,
  calculateSplit,
} = require('../src/utils/splits');

describe('Module 2: Split Methods Utilities (src/utils/splits.js)', () => {
  describe('1. calculateEqualSplit(totalPaise, participantIds)', () => {
    it('should split evenly when total is cleanly divisible', () => {
      const res = calculateEqualSplit(3000, [1, 2, 3]);
      assert.strictEqual(res.length, 3);
      assert.deepStrictEqual(res.map((r) => r.sharePaise), [1000, 1000, 1000]);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 3000);
    });

    it('should deterministically distribute remainder paise to lowest user IDs first', () => {
      // 100 paise among 3 users -> 34, 33, 33 (remainder is 1)
      const res = calculateEqualSplit(100, [3, 1, 2]);
      assert.strictEqual(res[0].userId, 1);
      assert.strictEqual(res[0].sharePaise, 34);
      assert.strictEqual(res[1].userId, 2);
      assert.strictEqual(res[1].sharePaise, 33);
      assert.strictEqual(res[2].userId, 3);
      assert.strictEqual(res[2].sharePaise, 33);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 100);
    });

    it('should handle single participant', () => {
      const res = calculateEqualSplit(5555, [10]);
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].userId, 10);
      assert.strictEqual(res[0].sharePaise, 5555);
    });

    it('should deduplicate participant IDs', () => {
      const res = calculateEqualSplit(200, [1, 1, 2]);
      assert.strictEqual(res.length, 2);
      assert.strictEqual(res[0].sharePaise, 100);
      assert.strictEqual(res[1].sharePaise, 100);
    });

    it('should reject invalid participants or non-positive totalPaise', () => {
      assert.throws(() => calculateEqualSplit(0, [1, 2]), /Total amount must be greater than 0/i);
      assert.throws(() => calculateEqualSplit(-100, [1, 2]), /Total amount must be greater than 0/i);
      assert.throws(() => calculateEqualSplit(100, []), /At least one participant is required/i);
      assert.throws(() => calculateEqualSplit(100, null), /At least one participant is required/i);
    });
  });

  describe('2. calculateExactSplit(totalPaise, participants)', () => {
    it('should accept valid exact amounts that sum to totalPaise', () => {
      const participants = [
        { userId: 1, amountPaise: 4000 },
        { userId: 2, amountPaise: 6000 },
      ];
      const res = calculateExactSplit(10000, participants);
      assert.strictEqual(res.length, 2);
      assert.strictEqual(res[0].sharePaise, 4000);
      assert.strictEqual(res[1].sharePaise, 6000);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject if exact amounts sum does not match totalPaise', () => {
      const participants = [
        { userId: 1, amountPaise: 4000 },
        { userId: 2, amountPaise: 5000 },
      ];
      assert.throws(() => calculateExactSplit(10000, participants), /does not match total amount/i);
    });

    it('should reject negative exact share amounts', () => {
      const participants = [
        { userId: 1, amountPaise: 12000 },
        { userId: 2, amountPaise: -2000 },
      ];
      assert.throws(() => calculateExactSplit(10000, participants), /cannot have a negative exact share/i);
    });

    it('should reject duplicate participants', () => {
      const participants = [
        { userId: 1, amountPaise: 5000 },
        { userId: 1, amountPaise: 5000 },
      ];
      assert.throws(() => calculateExactSplit(10000, participants), /Duplicate participant detected/i);
    });
  });

  describe('3. calculatePercentageSplit(totalPaise, participants)', () => {
    it('should split by percentages accurately', () => {
      const participants = [
        { userId: 1, percentage: 50 },
        { userId: 2, percentage: 30 },
        { userId: 3, percentage: 20 },
      ];
      const res = calculatePercentageSplit(10000, participants);
      assert.strictEqual(res[0].sharePaise, 5000);
      assert.strictEqual(res[1].sharePaise, 3000);
      assert.strictEqual(res[2].sharePaise, 2000);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should deterministically award fractional remainder paise', () => {
      // 100 paise split 33.33%, 33.33%, 33.34%
      const participants = [
        { userId: 1, percentage: 33.33 },
        { userId: 2, percentage: 33.33 },
        { userId: 3, percentage: 33.34 },
      ];
      const res = calculatePercentageSplit(100, participants);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 100);
      const user3 = res.find((r) => r.userId === 3);
      assert.strictEqual(user3.sharePaise, 34);
    });

    it('should reject when percentages sum != 100', () => {
      const participants = [
        { userId: 1, percentage: 50 },
        { userId: 2, percentage: 40 },
      ];
      assert.throws(() => calculatePercentageSplit(10000, participants), /Percentages must sum to 100%/i);
    });

    it('should reject negative percentages', () => {
      const participants = [
        { userId: 1, percentage: 120 },
        { userId: 2, percentage: -20 },
      ];
      assert.throws(() => calculatePercentageSplit(10000, participants), /Percentage cannot be negative/i);
    });
  });

  describe('4. calculateSharesSplit(totalPaise, participants)', () => {
    it('should allocate shares based on proportional weights', () => {
      const participants = [
        { userId: 1, shares: 2 },
        { userId: 2, shares: 1 },
      ];
      const res = calculateSharesSplit(3000, participants);
      assert.strictEqual(res[0].sharePaise, 2000);
      assert.strictEqual(res[1].sharePaise, 1000);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 3000);
    });

    it('should handle fractional remainders fairly and deterministically', () => {
      const participants = [
        { userId: 1, shares: 1 },
        { userId: 2, shares: 1 },
        { userId: 3, shares: 1 },
      ];
      const res = calculateSharesSplit(100, participants);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 100);
      assert.strictEqual(res[0].sharePaise, 34);
      assert.strictEqual(res[1].sharePaise, 33);
      assert.strictEqual(res[2].sharePaise, 33);
    });

    it('should reject shares <= 0', () => {
      const participants = [
        { userId: 1, shares: 2 },
        { userId: 2, shares: 0 },
      ];
      assert.throws(() => calculateSharesSplit(1000, participants), /Shares must be greater than 0/i);
    });
  });

  describe('5. calculateAdjustmentSplit(totalPaise, participants)', () => {
    it('should split equally and apply positive and negative adjustments', () => {
      const participants = [
        { userId: 1, adjustmentPaise: 500 },
        { userId: 2, adjustmentPaise: -500 },
        { userId: 3, adjustmentPaise: 0 },
      ];
      const res = calculateAdjustmentSplit(3000, participants);
      assert.strictEqual(res[0].sharePaise, 1500);
      assert.strictEqual(res[1].sharePaise, 500);
      assert.strictEqual(res[2].sharePaise, 1000);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 3000);
    });

    it('should reject if adjustments sum exceeds total expense amount', () => {
      const participants = [
        { userId: 1, adjustmentPaise: 2000 },
        { userId: 2, adjustmentPaise: 2000 },
      ];
      assert.throws(() => calculateAdjustmentSplit(3000, participants), /Total adjustments .* exceed total expense/i);
    });

    it('should reject if adjustment results in negative final share', () => {
      const participants = [
        { userId: 1, adjustmentPaise: 500 },
        { userId: 2, adjustmentPaise: -1500 },
      ];
      assert.throws(() => calculateAdjustmentSplit(1000, participants), /results in a negative final share/i);
    });
  });

  describe('6. calculateItemizedSplit(totalPaise, items, sharedTaxPaise, allParticipantIds)', () => {
    it('should calculate individual item subtotals plus proportional tax/fees', () => {
      const items = [
        { name: 'Pizza', amountPaise: 8000, assignedUserIds: [1, 2] },
        { name: 'Drinks', amountPaise: 2000, assignedUserIds: [2] },
      ];
      const res = calculateItemizedSplit(11000, items, 1000, [1, 2]);
      assert.strictEqual(res.length, 2);
      assert.strictEqual(res[0].userId, 1);
      assert.strictEqual(res[0].sharePaise, 4400);
      assert.strictEqual(res[1].userId, 2);
      assert.strictEqual(res[1].sharePaise, 6600);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 11000);
    });

    it('should reject if items sum exceeds total expense', () => {
      const items = [
        { name: 'Expensive Item', amountPaise: 5000, assignedUserIds: [1] },
      ];
      assert.throws(() => calculateItemizedSplit(4000, items), /Sum of items .* exceeds total expense/i);
    });
  });

  describe('7. calculateSplit dispatcher', () => {
    it('should route to correct split handler', () => {
      const eq = calculateSplit('equal', 2000, [1, 2]);
      assert.strictEqual(eq.length, 2);
      assert.strictEqual(eq[0].sharePaise, 1000);

      const ex = calculateSplit('exact', 2000, [
        { userId: 1, amountPaise: 1500 },
        { userId: 2, amountPaise: 500 },
      ]);
      assert.strictEqual(ex[0].sharePaise, 1500);

      assert.throws(() => calculateSplit('nonexistent', 1000, []), /Unknown split type/i);
    });
  });
});
