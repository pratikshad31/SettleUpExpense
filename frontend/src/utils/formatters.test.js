// frontend/src/utils/formatters.test.js
// Dedicated tests for frontend formatters

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatINR, formatDate, formatDateTime, inrToPaise } from './formatters.js';

describe('Frontend Formatters (src/utils/formatters.js)', () => {
  describe('formatINR(paise)', () => {
    it('should format paise into Indian Rupee format', () => {
      const res = formatINR(150000);
      assert.match(res, /1,500\.00/);
      assert.match(res, /₹/);
    });

    it('should handle zero, null, undefined, and NaN safely', () => {
      assert.match(formatINR(0), /0\.00/);
      assert.strictEqual(formatINR(null), '₹0.00');
      assert.strictEqual(formatINR(undefined), '₹0.00');
      assert.strictEqual(formatINR('abc'), '₹0.00');
    });
  });

  describe('formatDate(dateString)', () => {
    it('should format standard date strings', () => {
      const res = formatDate('2026-10-15');
      assert.match(res, /15/);
      assert.match(res, /Oct/);
      assert.match(res, /2026/);
    });

    it('should handle empty or invalid date strings safely', () => {
      assert.strictEqual(formatDate(''), '');
      assert.strictEqual(formatDate(null), '');
      assert.strictEqual(formatDate('invalid-date'), '');
    });
  });

  describe('formatDateTime(isoString)', () => {
    it('should format ISO datetime string', () => {
      const res = formatDateTime('2026-10-15T14:30:00.000Z');
      assert.ok(res.length > 5);
      assert.match(res, /Oct/);
    });

    it('should handle empty or invalid datetime strings safely', () => {
      assert.strictEqual(formatDateTime(''), '');
      assert.strictEqual(formatDateTime('not-a-date'), '');
    });
  });

  describe('inrToPaise(inr)', () => {
    it('should convert INR string or number to integer paise', () => {
      assert.strictEqual(inrToPaise('150.50'), 15050);
      assert.strictEqual(inrToPaise(100), 10000);
      assert.strictEqual(inrToPaise('0.99'), 99);
      assert.strictEqual(inrToPaise(0), 0);
    });

    it('should handle empty or invalid values safely', () => {
      assert.strictEqual(inrToPaise(''), 0);
      assert.strictEqual(inrToPaise(null), 0);
      assert.strictEqual(inrToPaise(undefined), 0);
      assert.strictEqual(inrToPaise('abc'), 0);
    });
  });
});
