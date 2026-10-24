// backend/tests/splits.test.js
// Unit tests for all 6 split methods and deterministic remainder distribution

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

describe('Financial Split Engine Tests', () => {
  describe('1. Equal Split', () => {
    it('should split evenly when total is cleanly divisible', () => {
      const res = calculateEqualSplit(30000, [1, 2, 3]); // ₹300 / 3
      assert.strictEqual(res.length, 3);
      assert.deepStrictEqual(res.map(r => r.sharePaise), [10000, 10000, 10000]);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 30000);
    });

    it('should distribute remainder deterministically to earliest user IDs', () => {
      const res = calculateEqualSplit(10000, [3, 1, 2]); // ₹100 / 3 = 3333 paise each + 1 remainder
      // Sorted IDs are [1, 2, 3], remainder 1 should go to user #1
      assert.strictEqual(res.length, 3);
      assert.strictEqual(res.find(r => r.userId === 1).sharePaise, 3334);
      assert.strictEqual(res.find(r => r.userId === 2).sharePaise, 3333);
      assert.strictEqual(res.find(r => r.userId === 3).sharePaise, 3333);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should throw if participant list is empty or total <= 0', () => {
      assert.throws(() => calculateEqualSplit(1000, []), /At least one participant/);
      assert.throws(() => calculateEqualSplit(0, [1, 2]), /greater than 0/);
    });
  });

  describe('2. Exact Amounts Split', () => {
    it('should accept valid exact amounts that sum to total', () => {
      const parts = [
        { userId: 1, amountPaise: 4000 },
        { userId: 2, amountPaise: 6000 },
      ];
      const res = calculateExactSplit(10000, parts);
      assert.strictEqual(res.length, 2);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject exact amounts that do not equal total', () => {
      const parts = [
        { userId: 1, amountPaise: 4000 },
        { userId: 2, amountPaise: 5000 }, // sum 9000 != 10000
      ];
      assert.throws(() => calculateExactSplit(10000, parts), /does not match total/);
    });

    it('should reject negative exact share', () => {
      const parts = [
        { userId: 1, amountPaise: -100 },
        { userId: 2, amountPaise: 10100 },
      ];
      assert.throws(() => calculateExactSplit(10000, parts), /negative exact share/);
    });
  });

  describe('3. Percentage Split', () => {
    it('should split according to percentages and handle rounding remainders', () => {
      // ₹100 split 33.33%, 33.33%, 33.34%
      const parts = [
        { userId: 1, percentage: 33.33 },
        { userId: 2, percentage: 33.33 },
        { userId: 3, percentage: 33.34 },
      ];
      const res = calculatePercentageSplit(10000, parts);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject percentages that do not sum to 100', () => {
      const parts = [
        { userId: 1, percentage: 50 },
        { userId: 2, percentage: 40 },
      ];
      assert.throws(() => calculatePercentageSplit(10000, parts), /must sum to 100%/);
    });
  });

  describe('4. Shares / Weights Split', () => {
    it('should divide proportionally by shares with remainder distribution', () => {
      const parts = [
        { userId: 1, shares: 2 },
        { userId: 2, shares: 1 },
      ];
      const res = calculateSharesSplit(10000, parts); // 2:1 ratio of ₹100 = 6667 and 3333
      assert.strictEqual(res.find(r => r.userId === 1).sharePaise, 6667);
      assert.strictEqual(res.find(r => r.userId === 2).sharePaise, 3333);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject zero or negative shares', () => {
      const parts = [
        { userId: 1, shares: 0 },
        { userId: 2, shares: 1 },
      ];
      assert.throws(() => calculateSharesSplit(10000, parts), /greater than 0/);
    });
  });

  describe('5. Adjustment Split', () => {
    it('should split equally and apply positive/negative adjustments', () => {
      // Total ₹100 (10000 paise), 2 users.
      // User 1 has +₹20 (2000 paise) adjustment, User 2 has 0 adjustment.
      // Net distributable = 10000 - 2000 = 8000. Base = 4000 each.
      // Final: User 1 = 4000 + 2000 = 6000. User 2 = 4000. Sum = 10000.
      const parts = [
        { userId: 1, adjustmentPaise: 2000 },
        { userId: 2, adjustmentPaise: 0 },
      ];
      const res = calculateAdjustmentSplit(10000, parts);
      assert.strictEqual(res.find(r => r.userId === 1).sharePaise, 6000);
      assert.strictEqual(res.find(r => r.userId === 2).sharePaise, 4000);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject if adjustments exceed total expense', () => {
      const parts = [
        { userId: 1, adjustmentPaise: 12000 },
        { userId: 2, adjustmentPaise: 0 },
      ];
      assert.throws(() => calculateAdjustmentSplit(10000, parts), /Total adjustments.*exceed total/);
    });
  });

  describe('6. Itemized Split', () => {
    it('should allocate individual items and distribute shared tax proportionally', () => {
      const items = [
        { name: 'Burger', amountPaise: 3000, assignedUserIds: [1] },
        { name: 'Pizza', amountPaise: 5000, assignedUserIds: [2] },
      ];
      // Total ₹100 (10000 paise). Item subtotal = 8000 paise. Shared tax = 2000 paise.
      // Proportional tax: User 1 has 3/8 of 2000 = 750 paise. User 2 has 5/8 of 2000 = 1250 paise.
      // Final: User 1 = 3750, User 2 = 6250. Sum = 10000.
      const res = calculateItemizedSplit(10000, items, 2000, [1, 2]);
      assert.strictEqual(res.find(r => r.userId === 1).sharePaise, 3750);
      assert.strictEqual(res.find(r => r.userId === 2).sharePaise, 6250);
      assert.strictEqual(res.reduce((s, r) => s + r.sharePaise, 0), 10000);
    });

    it('should reject if items total exceeds overall expense amount', () => {
      const items = [
        { name: 'Item 1', amountPaise: 8000, assignedUserIds: [1] },
        { name: 'Item 2', amountPaise: 4000, assignedUserIds: [2] },
      ];
      assert.throws(() => calculateItemizedSplit(10000, items), /Sum of items.*exceeds total/);
    });
  });

  describe('Master Split Dispatcher', () => {
    it('should correctly route each split type', () => {
      const eq = calculateSplit('equal', 5000, [1, 2]);
      assert.strictEqual(eq.reduce((s, r) => s + r.sharePaise, 0), 5000);

      const exact = calculateSplit('exact', 5000, [
        { userId: 1, amountPaise: 2500 },
        { userId: 2, amountPaise: 2500 },
      ]);
      assert.strictEqual(exact.reduce((s, r) => s + r.sharePaise, 0), 5000);
    });
  });
});
