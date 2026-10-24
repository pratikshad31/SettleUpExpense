// backend/tests/upi.test.js
// Dedicated unit tests for upi.js (UPI validation and NPCI URI generation)

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isValidUpiId, generateUpiUri } = require('../src/utils/upi');

describe('Module 3: UPI Utilities (src/utils/upi.js)', () => {
  describe('isValidUpiId(upiId)', () => {
    it('should validate standard UPI IDs', () => {
      assert.strictEqual(isValidUpiId('aarav@okhdfcbank'), true);
      assert.strictEqual(isValidUpiId('priya.sharma@paytm'), true);
      assert.strictEqual(isValidUpiId('rohan_99@upi'), true);
      assert.strictEqual(isValidUpiId('9876543210@ybl'), true);
      assert.strictEqual(isValidUpiId('  user@axisbank  '), true);
    });

    it('should reject invalid UPI IDs', () => {
      assert.strictEqual(isValidUpiId(''), false);
      assert.strictEqual(isValidUpiId(null), false);
      assert.strictEqual(isValidUpiId(undefined), false);
      assert.strictEqual(isValidUpiId('user@'), false);
      assert.strictEqual(isValidUpiId('@bank'), false);
      assert.strictEqual(isValidUpiId('invalid@@bank'), false);
      assert.strictEqual(isValidUpiId('spaces in name@bank'), false);
      assert.strictEqual(isValidUpiId(12345), false);
      assert.strictEqual(isValidUpiId({}), false);
    });
  });

  describe('generateUpiUri(options)', () => {
    it('should generate valid NPCI UPI payment deep link', () => {
      const uri = generateUpiUri({
        upiId: 'aarav@okhdfcbank',
        recipientName: 'Aarav Sharma',
        amountPaise: 25000, // ₹250.00
        note: 'Goa Trip Settlement',
      });

      assert.ok(uri.startsWith('upi://pay?'));
      assert.ok(uri.includes('pa=aarav%40okhdfcbank'));
      assert.ok(uri.includes('pn=Aarav%20Sharma'));
      assert.ok(uri.includes('am=250.00'));
      assert.ok(uri.includes('cu=INR'));
      assert.ok(uri.includes('tn=Goa%20Trip%20Settlement'));
    });

    it('should return empty string when upiId is omitted', () => {
      const uri = generateUpiUri({
        upiId: '',
        recipientName: 'Aarav Sharma',
        amountPaise: 25000,
      });
      assert.strictEqual(uri, '');
    });

    it('should reject invalid upiId or non-positive amount', () => {
      assert.throws(
        () =>
          generateUpiUri({
            upiId: 'invalid@@upi',
            recipientName: 'Test',
            amountPaise: 1000,
          }),
        /Invalid recipient UPI ID/i
      );

      assert.throws(
        () =>
          generateUpiUri({
            upiId: 'valid@upi',
            recipientName: 'Test',
            amountPaise: 0,
          }),
        /Valid positive amount in paise/i
      );

      assert.throws(
        () =>
          generateUpiUri({
            upiId: 'valid@upi',
            recipientName: 'Test',
            amountPaise: -500,
          }),
        /Valid positive amount in paise/i
      );
    });
  });
});
