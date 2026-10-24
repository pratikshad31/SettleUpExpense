// frontend/src/utils/formatters.js
// Monetary and date formatting helpers

/**
 * Format paise into Indian Rupee string (₹)
 * Example: 150000 -> ₹1,500.00
 */
export function formatINR(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) {
    return '₹0.00';
  }
  const inr = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(inr);
}

/**
 * Format date string (e.g. 2026-10-15 -> 15 Oct 2026)
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format relative or full time for activity logs
 */
export function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Convert user INR input to integer paise
 */
export function inrToPaise(inr) {
  if (inr === '' || inr === null || inr === undefined) return 0;
  const num = parseFloat(inr);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
