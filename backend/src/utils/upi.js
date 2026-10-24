// backend/src/utils/upi.js
// Safe UPI link generator and validator

/**
 * Validates UPI ID format (e.g. user@okaxis, name@upi, 9876543210@paytm)
 * @param {string} upiId
 * @returns {boolean}
 */
function isValidUpiId(upiId) {
  if (!upiId || typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  // Standard UPI format: username@bankhandle (length between 3 and 100)
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9.\-_]{2,32}$/;
  return upiRegex.test(trimmed);
}

/**
 * Generate safe UPI URI for Indian digital payments apps (GPay, PhonePe, Paytm, BHIM)
 * @param {Object} options
 * @param {string} options.upiId - Recipient UPI Virtual Payment Address (e.g. user@okhdfcbank)
 * @param {string} options.recipientName - Payee display name
 * @param {number} options.amountPaise - Amount in integer paise
 * @param {string} [options.note] - Optional transaction note/reference
 * @returns {string} - NPCI formatted UPI URI
 */
function generateUpiUri({ upiId, recipientName, amountPaise, note = 'SettleUp settlement' }) {
  if (!upiId) {
    return '';
  }
  const cleanUpi = upiId.trim();
  if (!isValidUpiId(cleanUpi)) {
    throw new Error(`Invalid recipient UPI ID: ${upiId}`);
  }
  if (!amountPaise || isNaN(amountPaise) || Number(amountPaise) <= 0) {
    throw new Error('Valid positive amount in paise is required for UPI link');
  }

  const cleanName = (recipientName || 'Group Member').trim();
  const amountInr = (Number(amountPaise) / 100).toFixed(2);
  const cleanNote = (note || 'Expense Settlement').substring(0, 50).trim();

  const params = new URLSearchParams({
    pa: cleanUpi,
    pn: cleanName,
    am: amountInr,
    cu: 'INR',
    tn: cleanNote,
  });

  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

module.exports = {
  isValidUpiId,
  generateUpiUri,
};
