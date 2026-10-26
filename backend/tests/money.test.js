// backend/tests/money.test.js
// Dedicated unit tests for money.js utility functions

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { toPaise, toINR, formatINR, isPositivePaise } = require('../src/utils/money');

describe('Module 1: Money Utilities (src/utils/money.js)', () => {
  describe('toPaise(amount)', () => {
    it('should convert standard integer and decimal INR amounts to paise', () => {
      assert.strictEqual(toPaise(100), 10000);
      assert.strictEqual(toPaise(150.5), 15050);
      assert.strictEqual(toPaise(150.55), 15055);
      assert.strictEqual(toPaise(0.01), 1);
      assert.throws(() => toPaise(0), (err) => err.status === 400 && /amountINR/.test(err.message));
      assert.strictEqual(toPaise(10000000), 1000000000);
      assert.throws(() => toPaise(10000000.01), (err) => err.status === 400);
    });

    it('should convert string INR values to paise', () => {
      assert.strictEqual(toPaise('100'), 10000);
      assert.strictEqual(toPaise('150.50'), 15050);
      assert.strictEqual(toPaise('0.99'), 99);
      assert.strictEqual(toPaise('  250.75  '), 25075);
    });

    it('should reject amounts with more than 2 decimal places', () => {
      assert.throws(() => toPaise('100.555'), /at most 2 decimal places/i);
      assert.throws(() => toPaise(100.555), /at most 2 decimal places/i);
      assert.throws(() => toPaise('0.001'), /at most 2 decimal places/i);
    });

    it('should reject invalid non-numeric strings and types', () => {
      const invalidValues = ['abc', '100abc', '', null, undefined, true, false, [], {}, Infinity, NaN];
      for (const value of invalidValues) {
        assert.throws(
          () => toPaise(value),
          (err) => err.status === 400 && /^amountINR: .+ Expected .+\.$/.test(err.message)
        );
      }
    });
  });

  describe('toINR(paise)', () => {
    it('should convert integer paise to INR float', () => {
      assert.strictEqual(toINR(10000), 100);
      assert.strictEqual(toINR(15050), 150.5);
      assert.strictEqual(toINR(99), 0.99);
      assert.strictEqual(toINR(0), 0);
      assert.strictEqual(toINR(-5000), -50);
      assert.strictEqual(toINR(BigInt(25000)), 250);
      assert.strictEqual(toINR('15050'), 150.5);
    });

    it('should reject non-integer or invalid paise', () => {
      assert.throws(() => toINR('abc'), /Invalid paise/i);
      assert.throws(() => toINR(null), /Invalid paise/i);
      assert.throws(() => toINR(undefined), /Invalid paise/i);
      assert.throws(() => toINR(true), /Invalid paise/i);
    });
  });

  describe('formatINR(paise)', () => {
    it('should format paise into Indian Rupee currency format', () => {
      const formatted = formatINR(152000);
      // In Indian numbering system: ₹1,520.00
      assert.match(formatted, /1,520\.00/);
      assert.match(formatted, /₹/);

      const zeroFormatted = formatINR(0);
      assert.match(zeroFormatted, /0\.00/);

      const largeFormatted = formatINR(10000000); // ₹1,00,000.00 (1 Lakh)
      assert.match(largeFormatted, /1,00,000\.00/);
    });
  });

  describe('isPositivePaise(val)', () => {
    it('should return true for positive integers', () => {
      assert.strictEqual(isPositivePaise(1), true);
      assert.strictEqual(isPositivePaise(10000), true);
      assert.strictEqual(isPositivePaise('500'), true);
      assert.strictEqual(isPositivePaise(BigInt(100)), true);
    });

    it('should return false for 0, negative numbers, floats, booleans, and non-numbers', () => {
      assert.strictEqual(isPositivePaise(0), false);
      assert.strictEqual(isPositivePaise(-100), false);
      assert.strictEqual(isPositivePaise(10.5), false);
      assert.strictEqual(isPositivePaise('10.5'), false);
      assert.strictEqual(isPositivePaise(true), false);
      assert.strictEqual(isPositivePaise(false), false);
      assert.strictEqual(isPositivePaise(null), false);
      assert.strictEqual(isPositivePaise(undefined), false);
      assert.strictEqual(isPositivePaise(''), false);
      assert.strictEqual(isPositivePaise('abc'), false);
      assert.strictEqual(isPositivePaise([]), false);
      assert.strictEqual(isPositivePaise({}), false);
    });
  });
});
