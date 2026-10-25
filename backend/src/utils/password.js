// backend/src/utils/password.js
// Password strength validation and common weak password detection

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
  'welcome',
  'welcome123',
  'iloveyou',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'princess',
  'football',
  'shadow',
  'abc12345',
]);

/**
 * Validates a password against strong password security policies:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 number (0-9)
 * - At least 1 special character (!@#$%^&* etc.)
 * - Rejects common weak passwords
 *
 * @param {string} password
 * @returns {{ isValid: boolean, error: string | null }}
 */
function validatePassword(password) {
  if (typeof password !== 'string' || !password) {
    return { isValid: false, error: 'Password is required' };
  }

  // Check common weak passwords (case-insensitive)
  const normalized = password.trim().toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return {
      isValid: false,
      error: 'This password is too common and easily guessed. Please choose a stronger password.',
    };
  }

  // Minimum length check
  if (password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  // Uppercase letter check
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one uppercase letter (A-Z)',
    };
  }

  // Lowercase letter check
  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one lowercase letter (a-z)',
    };
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one number (0-9)',
    };
  }

  // Special character check
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least one special character (!@#$%^&* etc.)',
    };
  }

  return { isValid: true, error: null };
}

/**
 * Calculates a password strength rating: 'Weak', 'Medium', or 'Strong'
 * @param {string} password
 * @returns {{ score: number, label: 'Weak' | 'Medium' | 'Strong' }}
 */
function calculatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { score: 0, label: 'Weak' };
  }

  let score = 0;
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) score += 15;

  const normalized = password.trim().toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return { score: 10, label: 'Weak' };
  }

  if (score < 50) {
    return { score, label: 'Weak' };
  } else if (score < 80) {
    return { score, label: 'Medium' };
  } else {
    return { score, label: 'Strong' };
  }
}

module.exports = {
  validatePassword,
  calculatePasswordStrength,
  COMMON_WEAK_PASSWORDS,
};
