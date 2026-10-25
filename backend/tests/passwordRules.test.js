// backend/tests/passwordRules.test.js
// Unit tests for password validation and strength rules

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validatePassword, calculatePasswordStrength } = require('../src/utils/password');

describe('Password Policy & Strength Rules (src/utils/password.js)', () => {
  it('should reject missing or empty passwords', () => {
    assert.strictEqual(validatePassword('').isValid, false);
    assert.strictEqual(validatePassword(null).isValid, false);
    assert.strictEqual(validatePassword(undefined).isValid, false);
    assert.match(validatePassword('').error, /Password is required/);
  });

  it('should reject passwords shorter than 8 characters', () => {
    const res = validatePassword('Pass1!');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error, /at least 8 characters/);
  });

  it('should reject passwords without an uppercase letter', () => {
    const res = validatePassword('custompass123!');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error, /uppercase letter/);
  });

  it('should reject passwords without a lowercase letter', () => {
    const res = validatePassword('CUSTOMPASS123!');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error, /lowercase letter/);
  });

  it('should reject passwords without a number', () => {
    const res = validatePassword('CustomPassword!@#');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error, /number/);
  });

  it('should reject passwords without a special character', () => {
    const res = validatePassword('CustomPassword123');
    assert.strictEqual(res.isValid, false);
    assert.match(res.error, /special character/);
  });

  it('should reject common weak passwords even if length matches', () => {
    assert.strictEqual(validatePassword('password').isValid, false);
    assert.strictEqual(validatePassword('12345678').isValid, false);
    assert.strictEqual(validatePassword('qwerty123').isValid, false);
    assert.match(validatePassword('12345678').error, /too common/i);
  });

  it('should accept a compliant strong password', () => {
    const res = validatePassword('StrongP@ssw0rd!');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.error, null);
  });

  it('should correctly rate password strength as Weak, Medium, or Strong', () => {
    assert.strictEqual(calculatePasswordStrength('12345').label, 'Weak');
    assert.strictEqual(calculatePasswordStrength('CustomPass1').label, 'Medium');
    assert.strictEqual(calculatePasswordStrength('StrongP@ssw0rd2026!').label, 'Strong');
  });
});
