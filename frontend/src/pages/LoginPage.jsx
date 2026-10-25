// frontend/src/pages/LoginPage.jsx
// User login page with quick demo account buttons

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRightLeft, Lock, Mail, ArrowRight, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError('Please enter your email address');
      return;
    }

    if (!targetPassword) {
      setError('Please enter your password');
      return;
    }

    try {
      setLoading(true);
      await login(targetEmail, targetPassword);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again.');
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
      setError(err.message || 'Unable to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
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
              marginBottom: 16,
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <ArrowRightLeft size={28} />
          </div>
          <h2>Welcome to SettleUp</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.95rem' }}>
            Shared expenses and settlement optimization for India
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {error && <div className="alert alert-danger">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
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
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                id="password"
                autoComplete="current-password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading}
            >
              <span>{loading ? 'Logging in...' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Demo Logins */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
            <div
              style={{
                fontSize: '0.8rem',
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

        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ fontWeight: 600 }}>
            Create one now
          </Link>
        </p>
      </div>
    </div>
  );
}
