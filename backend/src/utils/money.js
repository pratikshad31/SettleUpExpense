// backend/src/utils/money.js
// Monetary manipulation in integer paise (1 INR = 100 Paise)

/**
 * Convert INR (number or string, e.g. 150.50) to integer Paise (15050)
 * Uses precise rounding to prevent binary floating point artifacts.
 * @param {number|string} amount
 * @returns {number}
 */
function toPaise(amount) {
  if (amount === null || amount === undefined || amount === '') {
    throw new Error('Amount cannot be null or empty');
  }
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  if (!isFinite(num)) {
    throw new Error('Amount must be finite');
  }
  // Max 2 decimal places allowed
  const roundedPaise = Math.round(num * 100);
  return roundedPaise;
}

/**
 * Convert integer Paise to INR float (e.g. 15050 -> 150.5)
 * @param {number|string|bigint} paise
 * @returns {number}
 */
function toINR(paise) {
  const p = typeof paise === 'bigint' ? Number(paise) : parseInt(paise, 10);
  if (isNaN(p)) {
    throw new Error(`Invalid paise: ${paise}`);
  }
  return p / 100;
}

/**
 * Format paise into Indian Rupee currency string with symbol (₹)
 * Example: 152000 paise -> ₹1,520.00
 * @param {number|bigint} paise
 * @returns {string}
 */
function formatINR(paise) {
  const inr = toINR(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(inr);
}

/**
 * Check if a number is a valid positive integer paise
 * @param {any} val
 * @returns {boolean}
 */
function isPositivePaise(val) {
  const n = Number(val);
  return Number.isInteger(n) && n > 0;
}

module.exports = {
  toPaise,
  toINR,
  formatINR,
  isPositivePaise,
};
