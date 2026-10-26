// frontend/src/pages/SignupPage.jsx
// User registration page with real-time password strength and validation

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authState';
import {
  ArrowRightLeft,
  ArrowRight,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from 'lucide-react';
import { evaluatePasswordStrength } from '../utils/passwordStrength';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signup } = useAuth();
  const navigate = useNavigate();

  // Evaluate password strength in real time
  const strength = evaluatePasswordStrength(password);

  // Field validation checks
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
  const isNameValid = (name || '').trim().length >= 2;
  const isPasswordValid = strength.isStrong;
  const doPasswordsMatch = password.length > 0 && confirmPassword === password;

  const errors = {
    name:
      (touched.name || submitAttempted) && !isNameValid
        ? 'Please enter your full name (at least 2 characters)'
        : '',
    email:
      (touched.email || submitAttempted) && !isEmailValid
        ? 'Please enter a valid email address'
        : '',
    password:
      (touched.password || submitAttempted) && !isPasswordValid
        ? 'Password must satisfy all security rules below'
        : '',
    confirmPassword:
      (touched.confirmPassword || submitAttempted) && !doPasswordsMatch
        ? confirmPassword.length === 0
          ? 'Please confirm your password'
          : 'Passwords do not match'
        : '',
  };

  const isFormValid = isNameValid && isEmailValid && isPasswordValid && doPasswordsMatch;

  // Concrete list of what is blocking submission (shown when the user clicks the button)
  const validationIssues = [];
  if (!isNameValid) {
    validationIssues.push('Full name must be at least 2 characters');
  }
  if (!isEmailValid) {
    validationIssues.push('Enter a valid email address (e.g. name@example.com)');
  }
  if (!isPasswordValid) {
    if (password.length === 0) {
      validationIssues.push('Password is required');
    } else {
      const unmetRules = strength.rules.filter((r) => !r.met).map((r) => r.label);
      validationIssues.push(`Password still needs: ${unmetRules.join(', ')}`);
    }
  }
  if (!doPasswordsMatch) {
    validationIssues.push(
      confirmPassword.length === 0 ? 'Confirm your password' : 'Passwords do not match'
    );
  }

  const showValidationSummary = submitAttempted && !isFormValid && validationIssues.length > 0;

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });
    setSubmitAttempted(true);
    setServerError('');

    if (!isFormValid) {
      // Never silently ignore: validationIssues are rendered as a summary above the form
      return;
    }

    try {
      setLoading(true);
      await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      navigate('/dashboard');
    } catch (err) {
      setServerError(err.message || 'Registration failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ maxWidth: 460, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: 'var(--primary)',
              color: '#fff',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <ArrowRightLeft size={28} />
          </div>
          <h2>Create Your Account</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.925rem' }}>
            Split expenses effortlessly, settle up with ease
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)' }}>
          {serverError && (
            <div className="alert alert-danger" style={{ marginBottom: 20 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{serverError}</span>
            </div>
          )}

          {/* Submit-time validation summary: explains exactly what blocks "Get Started" */}
          {showValidationSummary && (
            <div className="alert alert-danger" style={{ marginBottom: 20 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Please fix the following to continue:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {validationIssues.map((issue) => (
                    <li key={issue} style={{ fontSize: '0.85rem' }}>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Full Name */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label" htmlFor="name">
                Full Name *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="name"
                  id="name"
                  autoComplete="name"
                  className={`form-input ${errors.name ? 'is-invalid' : ''}`}
                  placeholder="e.g. Aarav Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => handleBlur('name')}
                  style={{
                    paddingLeft: 38,
                    borderColor: errors.name ? 'var(--danger, #ef4444)' : undefined,
                  }}
                  required
                />
                <User
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>
              {errors.name && (
                <div
                  style={{
                    color: 'var(--danger, #ef4444)',
                    fontSize: '0.8rem',
                    marginTop: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertCircle size={13} />
                  <span>{errors.name}</span>
                </div>
              )}
            </div>

            {/* Email Address */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label" htmlFor="email">
                Email Address *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  name="email"
                  id="email"
                  autoComplete="email"
                  className={`form-input ${errors.email ? 'is-invalid' : ''}`}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  style={{
                    paddingLeft: 38,
                    borderColor: errors.email ? 'var(--danger, #ef4444)' : undefined,
                  }}
                  required
                />
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>
              {errors.email && (
                <div
                  style={{
                    color: 'var(--danger, #ef4444)',
                    fontSize: '0.8rem',
                    marginTop: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertCircle size={13} />
                  <span>{errors.email}</span>
                </div>
              )}
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label" htmlFor="password">
                Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  id="password"
                  autoComplete="new-password"
                  className={`form-input ${errors.password ? 'is-invalid' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  style={{
                    paddingLeft: 38,
                    paddingRight: 40,
                    borderColor: errors.password ? 'var(--danger, #ef4444)' : undefined,
                  }}
                  required
                />
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 0,
                    display: 'flex',
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Real-time Password Strength Meter */}
              {password.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Password Strength:
                    </span>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: strength.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {strength.label}
                    </span>
                  </div>

                  {/* Segmented Strength Bar */}
                  <div
                    style={{
                      height: 6,
                      background: '#e2e8f0',
                      borderRadius: 3,
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        background: strength.score >= 25 ? strength.color : '#e2e8f0',
                        borderRadius: 2,
                        transition: 'background 0.3s ease',
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        background: strength.score >= 65 ? strength.color : '#e2e8f0',
                        borderRadius: 2,
                        transition: 'background 0.3s ease',
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        background: strength.score >= 100 ? strength.color : '#e2e8f0',
                        borderRadius: 2,
                        transition: 'background 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Real-time Rules Checklist */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr',
                      gap: 4,
                      marginTop: 10,
                      background: 'var(--bg-subtle, #f8fafc)',
                      padding: 10,
                      borderRadius: 'var(--radius-sm, 6px)',
                      border: '1px solid var(--border-light, #e2e8f0)',
                    }}
                  >
                    {strength.rules.map((rule) => (
                      <div
                        key={rule.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          fontSize: '0.78rem',
                          color: rule.met ? '#059669' : '#dc2626',
                          fontWeight: rule.met ? 600 : 500,
                        }}
                      >
                        {rule.met ? (
                          <Check size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                        ) : (
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: '#fca5a5',
                              margin: '0 2px',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errors.password && (
                <div
                  style={{
                    color: 'var(--danger, #ef4444)',
                    fontSize: '0.8rem',
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertCircle size={13} />
                  <span>{errors.password}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="form-group" style={{ marginBottom: 22 }}>
              <label className="form-label" htmlFor="confirmPassword">
                Confirm Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  id="confirmPassword"
                  autoComplete="new-password"
                  className={`form-input ${errors.confirmPassword ? 'is-invalid' : ''}`}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  style={{
                    paddingLeft: 38,
                    paddingRight: 40,
                    borderColor: errors.confirmPassword ? 'var(--danger, #ef4444)' : undefined,
                  }}
                  required
                />
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 0,
                    display: 'flex',
                  }}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {errors.confirmPassword && (
                <div
                  style={{
                    color: 'var(--danger, #ef4444)',
                    fontSize: '0.8rem',
                    marginTop: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AlertCircle size={13} />
                  <span>{errors.confirmPassword}</span>
                </div>
              )}

              {touched.confirmPassword && doPasswordsMatch && (
                <div
                  style={{
                    color: '#059669',
                    fontSize: '0.8rem',
                    marginTop: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Check size={13} />
                  <span>Passwords match!</span>
                </div>
              )}
            </div>

            {/* Submit Button — stays clickable so a click always produces feedback */}
            <button
              type="submit"
              className="btn btn-primary"
              // Keep focus in the field on mousedown: blurring would render the
              // validation line above and shift this button out from under the
              // cursor between mousedown and mouseup, swallowing the first click.
              onMouseDown={(e) => e.preventDefault()}
              style={{
                width: '100%',
                marginTop: 4,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'wait' : 'pointer',
              }}
              disabled={loading}
              aria-disabled={loading}
            >
              <span>{loading ? 'Creating Account...' : 'Get Started'}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600, color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
