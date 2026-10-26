// All API monetary limits are in integer paise. Rs. 1 crore is 1,000,000,000 paise.
const MAX_AMOUNT_PAISE = 1000000000;

function invalidPaise(fieldName, problem, minimum, maximum) {
  const error = new Error(
    `${fieldName}: ${problem}. Expected an integer paise amount from ${minimum} to ${maximum}.`
  );
  error.status = 400;
  return error;
}

function parseBoundedPaise(value, fieldName, minimum, maximum) {
  let paise = value;

  if (typeof paise === 'string') {
    const trimmed = paise.trim();
    const pattern = minimum < 0 ? /^-?\d+$/ : /^\d+$/;
    if (!pattern.test(trimmed)) {
      throw invalidPaise(fieldName, 'must be a whole-number paise value', minimum, maximum);
    }
    paise = Number(trimmed);
  }

  if (typeof paise !== 'number' || !Number.isSafeInteger(paise)) {
    throw invalidPaise(fieldName, 'must be a safe integer', minimum, maximum);
  }
  if (paise < minimum) {
    const problem = (fieldName === 'totalPaise' || fieldName === 'amountINR') && minimum === 1
      ? 'Total amount must be greater than 0'
      : fieldName.endsWith('.sharePaise') && paise < 0
        ? 'results in a negative final share'
        : `must be at least ${minimum}`;
    throw invalidPaise(fieldName, problem, minimum, maximum);
  }
  if (paise > maximum) {
    throw invalidPaise(fieldName, `must not exceed ${maximum}`, minimum, maximum);
  }

  return paise;
}

function parsePaise(value, fieldName = 'amountPaise') {
  return parseBoundedPaise(value, fieldName, 1, MAX_AMOUNT_PAISE);
}

function parseNonNegativePaise(value, fieldName = 'amountPaise') {
  return parseBoundedPaise(value, fieldName, 0, MAX_AMOUNT_PAISE);
}

function parseSignedPaise(value, fieldName = 'amountPaise') {
  return parseBoundedPaise(value, fieldName, -MAX_AMOUNT_PAISE, MAX_AMOUNT_PAISE);
}

module.exports = {
  MAX_AMOUNT_PAISE,
  parsePaise,
  parseNonNegativePaise,
  parseSignedPaise,
};
