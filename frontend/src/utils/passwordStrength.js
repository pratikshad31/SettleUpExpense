// frontend/src/utils/passwordStrength.js
// Client-side password policy validation and strength evaluation

export const COMMON_WEAK_PASSWORDS = new Set([
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
 * Evaluates individual password rule requirements
 * @param {string} password
 * @returns {Array<{ id: string, label: string, met: boolean }>}
 */
export function getPasswordRuleChecks(password = '') {
  const pwd = password || '';
  const isCommon = COMMON_WEAK_PASSWORDS.has(pwd.trim().toLowerCase());

  return [
    {
      id: 'length',
      label: 'Minimum 8 characters',
      met: pwd.length >= 8,
    },
    {
      id: 'uppercase',
      label: 'At least 1 uppercase letter (A-Z)',
      met: /[A-Z]/.test(pwd),
    },
    {
      id: 'lowercase',
      label: 'At least 1 lowercase letter (a-z)',
      met: /[a-z]/.test(pwd),
    },
    {
      id: 'number',
      label: 'At least 1 number (0-9)',
      met: /[0-9]/.test(pwd),
    },
    {
      id: 'special',
      label: 'At least 1 special character (!@#$%^&* etc.)',
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd),
    },
    {
      id: 'notCommon',
      label: 'Not a common weak password',
      met: !isCommon && pwd.length > 0,
    },
  ];
}

/**
 * Calculates password strength level, score, and visual metadata
 * @param {string} password
 * @returns {{
 *   score: number,
 *   label: 'Weak' | 'Medium' | 'Strong',
 *   color: string,
 *   isStrong: boolean,
 *   rules: Array<{ id: string, label: string, met: boolean }>
 * }}
 */
export function evaluatePasswordStrength(password = '') {
  const pwd = password || '';
  const rules = getPasswordRuleChecks(pwd);

  if (!pwd) {
    return {
      score: 0,
      label: 'Weak',
      color: 'var(--text-muted, #94a3b8)',
      isStrong: false,
      rules,
    };
  }

  const isCommon = COMMON_WEAK_PASSWORDS.has(pwd.trim().toLowerCase());
  const coreRulesMet = rules.filter((r) => r.id !== 'notCommon' && r.met).length;

  if (isCommon || coreRulesMet <= 2 || pwd.length < 8) {
    return {
      score: 25,
      label: 'Weak',
      color: '#ef4444', // Red
      isStrong: false,
      rules,
    };
  }

  if (coreRulesMet >= 3 && coreRulesMet < 5) {
    return {
      score: 65,
      label: 'Medium',
      color: '#f59e0b', // Amber / Orange
      isStrong: false,
      rules,
    };
  }

  // All 5 core rules met and not common
  return {
    score: 100,
    label: 'Strong',
    color: '#10b981', // Emerald / Green
    isStrong: true,
    rules,
  };
}
