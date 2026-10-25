// frontend/src/pages/LoginPage.jsx
// User login page with quick demo account buttons, password recovery modal, and clear validation

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRightLeft,
  Lock,
  Mail,
  ArrowRight,
  UserCheck,
  AlertCircle,
  Eye,
  EyeOff,
  HelpCircle,
  CheckCircle,
} from 'lucide-react';
import Modal from '../components/Modal';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetEmail = (email || '').trim().toLowerCase();
    const targetPassword = password || '';

    if (!targetEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (!targetPassword) {
      setError('Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      await login(targetEmail, targetPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err.message ||
          'Invalid email or password. Please check your credentials or click "Forgot Password?".'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError('');
    try {
      setLoading(true);
      await login(demoEmail.trim().toLowerCase(), 'password123');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to log in with demo account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setTimeout(() => {
      setForgotLoading(false);
      setForgotSubmitted(true);
    }, 800);
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
      <div style={{ maxWidth: 440, width: '100%' }}>
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
          <h2>Welcome to SettleUp</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.925rem' }}>
            Split expenses effortlessly, settle up with ease
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-md)' }}>
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 18 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email Address */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label" htmlFor="email">
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  name="email"
                  id="email"
                  autoComplete="email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  style={{ paddingLeft: 38 }}
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
            </div>

            {/* Password with Forgot Password link */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label className="form-label" htmlFor="password" style={{ marginBottom: 0 }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotSubmitted(false);
                    setIsForgotModalOpen(true);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--primary)',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  id="password"
                  autoComplete="current-password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  style={{ paddingLeft: 38, paddingRight: 40 }}
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
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              disabled={loading}
            >
              <span>{loading ? 'Signing In...' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Demo Logins */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <UserCheck size={14} />
              <span>One-Click Demo Logins</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleQuickLogin('aarav@example.com')}
                disabled={loading}
              >
                Aarav (Creator)
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleQuickLogin('priya@example.com')}
                disabled={loading}
              >
                Priya
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleQuickLogin('rohan@example.com')}
                disabled={loading}
              >
                Rohan
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleQuickLogin('vikram@example.com')}
                disabled={loading}
              >
                Vikram
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 20 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ fontWeight: 600, color: 'var(--primary)' }}>
            Create one now
          </Link>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <Modal
          isOpen={isForgotModalOpen}
          onClose={() => setIsForgotModalOpen(false)}
          title="Reset Your Password"
          maxWidth={440}
        >
          {forgotSubmitted ? (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#d1fae5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <CheckCircle size={26} />
              </div>
              <h4 style={{ marginBottom: 8 }}>Password Reset Link Sent</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                If an account exists for <strong>{forgotEmail}</strong>, we have sent password reset
                instructions to that address.
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginTop: 12,
                  background: 'var(--bg-subtle)',
                  padding: 10,
                  borderRadius: 6,
                }}
              >
                <strong>Tip:</strong> In this demo environment, pre-seeded accounts use the password{' '}
                <code>password123</code>, or you can update your password under Profile Settings once logged in.
              </p>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 18 }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} style={{ padding: '4px 0' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Enter the email address associated with your SettleUp account and we'll send you a link to reset your password.
              </p>

              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="form-label" htmlFor="forgotEmail">
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    id="forgotEmail"
                    className="form-input"
                    placeholder="name@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    style={{ paddingLeft: 38 }}
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
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={forgotLoading || !forgotEmail.trim()}
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
