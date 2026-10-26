// backend/src/utils/money.js
// Monetary manipulation in integer paise (1 INR = 100 Paise)

const { parsePaise } = require('./validators');

function invalidInr(fieldName, problem) {
  const error = new Error(
    `${fieldName}: ${problem}. Expected a positive INR amount with at most 2 decimal places that converts to 1–1000000000 paise.`
  );
  error.status = 400;
  return error;
}

/**
 * Convert INR (number or string, e.g. 150.50) to integer Paise (15050)
 * Uses precise rounding to prevent binary floating point artifacts.
 * Rejects values with more than 2 decimal places or invalid types.
 * @param {number|string} amount
 * @returns {number}
 */
function toPaise(amount, fieldName = 'amountINR') {
  if (amount === null || amount === undefined || amount === '') {
    throw invalidInr(fieldName, 'must not be empty');
  }
  if (typeof amount !== 'number' && typeof amount !== 'string') {
    throw invalidInr(fieldName, 'must be a number or numeric string');
  }

  let num;
  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw invalidInr(fieldName, 'must be a valid numeric amount');
    }
    if (trimmed.includes('.')) {
      const decimals = trimmed.split('.')[1];
      if (decimals.length > 2) {
        throw invalidInr(fieldName, 'must have at most 2 decimal places');
      }
    }
    num = Number(trimmed);
  } else {
    num = amount;
    if (isNaN(num)) {
      throw invalidInr(fieldName, 'must be a valid numeric amount');
    }
    if (!isFinite(num)) {
      throw invalidInr(fieldName, 'must be finite');
    }
    const numStr = num.toString();
    if (numStr.includes('.')) {
      const decimals = numStr.split('.')[1];
      if (decimals.length > 2) {
        throw invalidInr(fieldName, 'must have at most 2 decimal places');
      }
    }
  }

  const roundedPaise = Math.round(num * 100);
  return parsePaise(roundedPaise, fieldName);
}

/**
 * Convert integer Paise to INR float (e.g. 15050 -> 150.5)
 * @param {number|string|bigint} paise
 * @returns {number}
 */
function toINR(paise) {
  if (
    paise === null ||
    paise === undefined ||
    typeof paise === 'boolean' ||
    Array.isArray(paise) ||
    (typeof paise === 'object' && typeof paise !== 'bigint')
  ) {
    throw new Error(`Invalid paise: ${paise}`);
  }

  if (typeof paise === 'string') {
    const trimmed = paise.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`Invalid paise: ${paise}`);
    }
  }

  const p = typeof paise === 'bigint' ? Number(paise) : Number(paise);
  if (isNaN(p) || !Number.isInteger(p)) {
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
  if (
    val === null ||
    val === undefined ||
    typeof val === 'boolean' ||
    Array.isArray(val) ||
    (typeof val === 'object' && typeof val !== 'bigint')
  ) {
    return false;
  }

  if (typeof val === 'bigint') {
    return val > 0n;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) {
      return false;
    }
  }

  const n = Number(val);
  return Number.isInteger(n) && n > 0;
}

module.exports = {
  toPaise,
  toINR,
  formatINR,
  isPositivePaise,
};
