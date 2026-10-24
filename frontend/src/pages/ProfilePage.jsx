// frontend/src/pages/ProfilePage.jsx
// User profile editing, UPI settings, and password updates

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import Toast from '../components/Toast';
import { User, Shield, CreditCard, Check, AlertCircle } from 'lucide-react';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [upiId, setUpiId] = useState(user?.upi_id || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [toast, setToast] = useState({ message: '', type: 'success' });

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    if (!name.trim()) {
      setProfileError('Name cannot be empty');
      return;
    }

    try {
      setProfileLoading(true);
      await updateProfile({ name: name.trim(), upi_id: upiId.trim() || undefined });
      setToast({ message: 'Profile updated successfully!', type: 'success' });
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      setPasswordLoading(true);
      await api.put('/auth/change-password', { currentPassword, newPassword });
      setToast({ message: 'Password changed successfully!', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
      )}

      <h2 style={{ marginBottom: 20 }}>Account Settings & Profile</h2>

      {/* Profile Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} style={{ color: 'var(--primary)' }} />
            <h4>Profile Information</h4>
          </div>
        </div>

        {profileError && <div className="alert alert-danger">{profileError}</div>}

        <form onSubmit={handleUpdateProfile}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address (Read-only)</label>
            <input
              type="email"
              className="form-input"
              value={user?.email || ''}
              disabled
              style={{ background: 'var(--bg-subtle)' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">UPI ID (VPA)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. username@okhdfcbank or 9876543210@paytm"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
            <div className="form-helper">
              Your UPI ID is used by other group members to generate seamless 1-click payment links and QR codes.
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={profileLoading}>
            {profileLoading ? 'Saving Changes...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>

      {/* Security & Password */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <h4>Change Password</h4>
          </div>
        </div>

        {passwordError && <div className="alert alert-danger">{passwordError}</div>}

        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="min 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-outline" disabled={passwordLoading}>
            {passwordLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
