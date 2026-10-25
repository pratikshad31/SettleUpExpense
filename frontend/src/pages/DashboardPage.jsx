// frontend/src/pages/DashboardPage.jsx
// Groups dashboard with overall net balance summary and group actions

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import { formatINR } from '../utils/formatters';
import {
  Plus,
  KeyRound,
  Users,
  Receipt,
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await api.get('/groups');
      setGroups(data.groups || []);
    } catch (err) {
      setToast({ message: err.message || 'Failed to load groups', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // Compute overall balance across all groups
  const overallNetPaise = groups.reduce((acc, g) => acc + (g.myNetBalancePaise || 0), 0);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!createName.trim()) {
      setCreateError('Group name is required');
      return;
    }

    try {
      setCreateLoading(true);
      const res = await api.post('/groups', {
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      });
      setIsCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      setToast({ message: 'Group created successfully!', type: 'success' });
      await loadGroups();
      navigate(`/groups/${res.group.id}`);
    } catch (err) {
      setCreateError(err.message || 'Failed to create group');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    setJoinError('');
    const code = inviteCode ? inviteCode.replace(/\s+/g, '').toUpperCase() : '';
    if (!code) {
      setJoinError('Invite code is required');
      return;
    }

    try {
      setJoinLoading(true);
      const res = await api.post('/groups/join', {
        invite_code: code,
      });
      setIsJoinOpen(false);
      setInviteCode('');
      setToast({
        message: res.alreadyMember
          ? `You are already a member of ${res.group?.name || 'this group'}! Opening group...`
          : res.rejoined
          ? `Welcome back! Rejoined ${res.group?.name || 'group'} successfully.`
          : `Joined ${res.group?.name || 'group'} successfully!`,
        type: 'success',
      });
      await loadGroups();
      navigate(`/groups/${res.group.id}`);
    } catch (err) {
      setJoinError(err.message || 'Failed to join group');
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div>
      {/* Toast Notification */}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
      )}

      {/* Top Banner: Financial Overview & Quick Actions */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #0f766e 100%)',
          color: '#ffffff',
          padding: '28px 24px',
          border: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.875rem', opacity: 0.85, marginBottom: 4 }}>
              Total Balance Across Groups
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              {overallNetPaise > 0 ? (
                <>
                  <TrendingUp size={30} style={{ color: '#34d399' }} />
                  <span style={{ color: '#34d399' }}>+{formatINR(overallNetPaise)}</span>
                </>
              ) : overallNetPaise < 0 ? (
                <>
                  <TrendingDown size={30} style={{ color: '#f87171' }} />
                  <span style={{ color: '#fca5a5' }}>-{formatINR(Math.abs(overallNetPaise))}</span>
                </>
              ) : (
                <>
                  <CheckCircle size={30} style={{ color: '#a7f3d0' }} />
                  <span>₹0.00 (All Settled)</span>
                </>
              )}
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9, marginTop: 4 }}>
              {overallNetPaise > 0
                ? 'Overall, members owe you money.'
                : overallNetPaise < 0
                ? 'Overall, you have outstanding balances to settle.'
                : 'All your group expenses are fully settled up!'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="btn btn-primary"
              style={{ background: '#10b981', color: '#fff', boxShadow: 'var(--shadow-md)' }}
            >
              <Plus size={16} />
              <span>Create Group</span>
            </button>
            <button
              onClick={() => setIsJoinOpen(true)}
              className="btn btn-secondary"
              style={{ background: 'rgba(255, 255, 255, 0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
            >
              <KeyRound size={16} />
              <span>Join with Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Group List Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3>Your Groups ({groups.length})</h3>
      </div>

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading your groups...
        </div>
      ) : groups.length === 0 ? (
        /* Empty State */
        <div className="card empty-state">
          <Sparkles className="empty-state-icon" />
          <h4>No groups yet</h4>
          <p style={{ maxWidth: 400, margin: '8px auto 20px', fontSize: '0.925rem' }}>
            Create your first group for flat expenses, travel, or room sharing, or join an existing group with an invitation code.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setIsCreateOpen(true)} className="btn btn-primary">
              <Plus size={16} /> Create Group
            </button>
            <button onClick={() => setIsJoinOpen(true)} className="btn btn-secondary">
              <KeyRound size={16} /> Join with Code
            </button>
          </div>
        </div>
      ) : (
        /* Groups Grid */
        <div className="grid-2">
          {groups.map((grp) => {
            const net = grp.myNetBalancePaise || 0;
            return (
              <div
                key={grp.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onClick={() => navigate(`/groups/${grp.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <h4 style={{ fontSize: '1.15rem' }}>{grp.name}</h4>
                    <span className={`badge ${grp.display_role === 'creator' || grp.created_by === user?.id || grp.role === 'owner' ? 'badge-creator' : 'badge-member'}`}>
                      {grp.display_role === 'creator' || grp.created_by === user?.id || grp.role === 'owner' ? 'Creator' : 'Member'}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-muted)',
                      marginBottom: 16,
                      minHeight: 38,
                    }}
                  >
                    {grp.description || 'Shared group expenses'}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      fontSize: '0.825rem',
                      color: 'var(--text-muted)',
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={14} /> {grp.member_count} members
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Receipt size={14} /> {grp.expense_count} expenses
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--border-light)',
                    paddingTop: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                      Your Balance
                    </span>
                    <span
                      className={
                        net > 0 ? 'text-positive' : net < 0 ? 'text-negative' : 'text-neutral'
                      }
                      style={{ fontSize: '1rem' }}
                    >
                      {net > 0
                        ? `+${formatINR(net)}`
                        : net < 0
                        ? `-${formatINR(Math.abs(net))}`
                        : 'Settled'}
                    </span>
                  </div>

                  <span className="btn btn-outline btn-sm" style={{ padding: '6px 12px' }}>
                    <span>Open</span>
                    <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Group */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create a New Group"
        maxWidth={480}
      >
        <form onSubmit={handleCreateGroup}>
          <div className="modal-body">
            {createError && (
              <div className="alert alert-danger">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{createError}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Group Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Flat 301 Indiranagar or Manali Roadtrip"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <textarea
                className="form-textarea"
                rows="2"
                placeholder="What is this group for?"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>
            <div className="form-helper">
              A unique invitation code will automatically be generated for your group to share with friends.
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn btn-secondary"
              disabled={createLoading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createLoading}>
              {createLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Join Group */}
      <Modal
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        title="Join Group with Invite Code"
        maxWidth={440}
      >
        <form onSubmit={handleJoinGroup}>
          <div className="modal-body">
            {joinError && (
              <div className="alert alert-danger">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{joinError}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Invitation Code *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. FLAT402B"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.replace(/\s+/g, '').toUpperCase())}
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}
                autoFocus
                required
              />
            </div>
            <div className="form-helper">
              Enter the 8-character invitation code shared by the group creator or members.
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              onClick={() => setIsJoinOpen(false)}
              className="btn btn-secondary"
              disabled={joinLoading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={joinLoading}>
              {joinLoading ? 'Joining...' : 'Join Group'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
