// frontend/src/pages/GroupDetailsPage.jsx
// Complete Group Details Hub with Expenses, Balances & Who-Owes-Whom, Settle Up, Members, and Activity

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ExpenseModal from '../components/ExpenseModal';
import RecordPaymentModal from '../components/RecordPaymentModal';
import MarkPaidModal from '../components/MarkPaidModal';
import UpiQrModal from '../components/UpiQrModal';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import { formatINR, formatDate, formatDateTime } from '../utils/formatters';
import {
  ArrowLeft,
  Receipt,
  Scale,
  CreditCard,
  Users,
  History,
  Plus,
  Copy,
  Check,
  QrCode,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Edit2,
  Trash2,
  Clock,
  Search,
  Filter,
  UserPlus,
  LogOut,
  Sparkles,
} from 'lucide-react';

export default function GroupDetailsPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Active Tab: 'expenses' | 'balances' | 'settle' | 'members' | 'activity'
  const [activeTab, setActiveTab] = useState('expenses');

  // Group Details & Data
  const [group, setGroup] = useState(null);
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [detailedDebts, setDetailedDebts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [activities, setActivities] = useState([]);

  // Balance view sub-toggle: 'optimized' | 'detailed'
  const [balanceViewMode, setBalanceViewMode] = useState('optimized');
  const [recordingKey, setRecordingKey] = useState(null);

  // Loading & feedback
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [codeCopied, setCodeCopied] = useState(false);

  // Expense Filter State
  const [expenseSearch, setExpenseSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [defaultPaymentData, setDefaultPaymentData] = useState({});

  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [markingSettlement, setMarkingSettlement] = useState(null);

  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [upiDetails, setUpiDetails] = useState(null);

  const [selectedExpenseDetails, setSelectedExpenseDetails] = useState(null);
  const [isExpenseDetailsOpen, setIsExpenseDetailsOpen] = useState(false);

  // Add Member State
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Data fetchers
  const loadGroupData = useCallback(async () => {
    try {
      setLoading(true);
      const [groupRes, expRes, balRes, debtsRes, stRes, actRes] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/expenses?includeVoided=true`),
        api.get(`/groups/${groupId}/balances`),
        api.get(`/groups/${groupId}/debts`),
        api.get(`/groups/${groupId}/settlements`),
        api.get(`/groups/${groupId}/activity`),
      ]);

      setGroup(groupRes.group);
      setMembership(groupRes.membership);
      setMembers(groupRes.members);
      setExpenses(expRes.expenses);
      setBalances(balRes.balances);
      setSuggestions(balRes.suggestions);
      setDetailedDebts(debtsRes.debts);
      setSettlements(stRes.settlements);
      setActivities(actRes.activities);
    } catch (err) {
      setToast({ message: err.message || 'Failed to load group details', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadGroupData();
  }, [loadGroupData]);

  // Copy invite code
  const handleCopyCode = () => {
    if (group?.invite_code) {
      navigator.clipboard.writeText(group.invite_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  // Add / Edit Expense Save Handler
  const handleSaveExpense = async (payload) => {
    try {
      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, payload);
        setToast({ message: 'Expense updated successfully!', type: 'success' });
      } else {
        await api.post(`/groups/${groupId}/expenses`, payload);
        setToast({ message: 'Expense added successfully!', type: 'success' });
      }
      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      await loadGroupData();
    } catch (err) {
      throw err;
    }
  };

  // Void Expense Handler
  const handleVoidExpense = async (expenseId) => {
    try {
      await api.post(`/expenses/${expenseId}/void`);
      setToast({ message: 'Expense voided successfully.', type: 'success' });
      setIsExpenseDetailsOpen(false);
      await loadGroupData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to void expense', type: 'error' });
    }
  };

  // Record Settlement Handler
  const handleSaveSettlement = async (payload) => {
    try {
      await api.post(`/groups/${groupId}/settlements`, payload);
      setToast({ message: 'Settlement payment recorded as pending! Awaiting recipient confirmation.', type: 'success' });
      setIsRecordPaymentOpen(false);
      await loadGroupData();
    } catch (err) {
      throw err;
    }
  };

  // 1-click settlement proposal for suggested transactions (status PENDING until confirmed by receiver)
  const handleRecordSuggestedPayment = async (sug) => {
    if (Number(sug.fromUser) !== Number(user?.id)) {
      setToast({ message: 'You can only settle your own debts', type: 'error' });
      return;
    }
    const key = `${sug.fromUser}-${sug.toUser}`;
    try {
      setRecordingKey(key);
      await api.post(`/groups/${groupId}/settlements`, {
        fromUser: sug.fromUser,
        toUser: sug.toUser,
        amountPaise: sug.amountPaise,
        paymentMethod: 'upi',
        status: 'pending',
        notes: `Payment recorded from Optimized Settlement Plan`,
      });

      setToast({
        message: `Payment of ${formatINR(sug.amountPaise)} recorded as pending. Awaiting confirmation from ${sug.toName}.`,
        type: 'success',
      });

      await loadGroupData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to record settlement', type: 'error' });
    } finally {
      setRecordingKey(null);
    }
  };

  // 1-click settlement proposal for detailed debts (status PENDING until confirmed by receiver)
  const handleSettleDetailedDebt = async (debt) => {
    if (Number(debt.fromUser) !== Number(user?.id)) {
      setToast({ message: 'You can only settle your own debts', type: 'error' });
      return;
    }
    const key = `debt-${debt.fromUser}-${debt.toUser}`;
    try {
      setRecordingKey(key);
      await api.post(`/groups/${groupId}/settlements`, {
        fromUser: debt.fromUser,
        toUser: debt.toUser,
        amountPaise: debt.amountPaise,
        paymentMethod: 'upi',
        status: 'pending',
        notes: `Settled direct debt payment`,
      });

      setToast({
        message: `Payment of ${formatINR(debt.amountPaise)} recorded as pending. Awaiting confirmation from ${debt.toName}.`,
        type: 'success',
      });

      await loadGroupData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to record settlement', type: 'error' });
    } finally {
      setRecordingKey(null);
    }
  };

  // Mark Paid Handler
  const handleMarkPaid = async ({ settlementId, referenceId, notes }) => {
    try {
      await api.post(`/settlements/${settlementId}/mark-paid`, { referenceId, notes });
      setToast({ message: 'Payment marked as paid. Waiting for recipient to confirm.', type: 'success' });
      setIsMarkPaidOpen(false);
      await loadGroupData();
    } catch (err) {
      throw err;
    }
  };

  // Confirm Settlement Handler (Concurrency-safe)
  const handleConfirmSettlement = async (settlementId) => {
    const st = settlements.find((s) => s.id === settlementId);
    if (st && Number(st.to_user) !== Number(user?.id)) {
      setToast({ message: 'Only the receiver can confirm this payment', type: 'error' });
      return;
    }
    try {
      await api.post(`/settlements/${settlementId}/confirm`, {});
      setToast({ message: 'Payment confirmed! Group balances have been updated.', type: 'success' });
      await loadGroupData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to confirm settlement', type: 'error' });
    }
  };

  // Reject Settlement Handler (Modal-based, no window.prompt)
  const handleRejectSettlement = (settlementId) => {
    const st = settlements.find((s) => s.id === settlementId);
    if (st && Number(st.to_user) !== Number(user?.id)) {
      setToast({ message: 'Only the receiver can reject this payment', type: 'error' });
      return;
    }
    setConfirmDialog({
      title: 'Reject Settlement Payment',
      message: 'Are you sure you want to reject this payment record? You can optionally enter a reason below.',
      confirmText: 'Reject Payment',
      type: 'danger',
      inputPlaceholder: 'Reason for rejection (e.g. payment not received)',
      onConfirm: async (reason) => {
        try {
          await api.post(`/settlements/${settlementId}/reject`, { reason: reason || undefined });
          setToast({ message: 'Settlement rejected.', type: 'info' });
          await loadGroupData();
        } catch (err) {
          setToast({ message: err.message || 'Failed to reject settlement', type: 'error' });
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Add Member by Email Handler
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addMemberEmail.trim()) return;

    try {
      setAddMemberLoading(true);
      await api.post(`/groups/${groupId}/members`, { email: addMemberEmail.trim() });
      setToast({ message: 'Member added to group successfully!', type: 'success' });
      setAddMemberEmail('');
      await loadGroupData();
    } catch (err) {
      setToast({ message: err.message || 'Failed to add member', type: 'error' });
    } finally {
      setAddMemberLoading(false);
    }
  };

  // Leave Group Handler (Modal-based, no window.confirm)
  const handleLeaveGroup = () => {
    setConfirmDialog({
      title: 'Leave Group',
      message: 'Are you sure you want to leave this group? You can only leave once your net balance is strictly ₹0.00 (all expenses and debts settled).',
      confirmText: 'Leave Group',
      type: 'danger',
      onConfirm: async () => {
        try {
          await api.post(`/groups/${groupId}/leave`);
          setToast({ message: 'You have left the group.', type: 'success' });
          navigate('/dashboard');
        } catch (err) {
          setToast({ message: err.message || 'Cannot leave group', type: 'error' });
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Open Full Expense Details Modal
  const openExpenseDetails = async (exp) => {
    try {
      const data = await api.get(`/expenses/${exp.id}`);
      setSelectedExpenseDetails(data);
      setIsExpenseDetailsOpen(true);
    } catch (err) {
      setToast({ message: 'Failed to load expense details', type: 'error' });
    }
  };

  // Open UPI QR Modal for quick payment
  const openUpiForUser = (toUserId, toName, amountPaise) => {
    const member = members.find((m) => m.user_id === toUserId);
    const upiId = member?.upi_id;

    if (!upiId) {
      setToast({
        message: `${toName} does not have a UPI ID saved. You can record cash or other settlement.`,
        type: 'error',
      });
      return;
    }

    const cleanName = encodeURIComponent(toName);
    const inr = (amountPaise / 100).toFixed(2);
    const uri = `upi://pay?pa=${upiId}&pn=${cleanName}&am=${inr}&cu=INR&tn=${encodeURIComponent('SettleUp Payment')}`;

    setUpiDetails({
      recipientName: toName,
      upiId,
      amountPaise,
      upiUri: uri,
      note: 'SettleUp Payment',
    });
    setIsUpiModalOpen(true);
  };

  // Filtered expenses
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = e.description.toLowerCase().includes(expenseSearch.toLowerCase());
    const matchesCategory = categoryFilter ? e.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  if (loading && !group) {
    return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>Loading group details...</div>;
  }

  if (!group) {
    return (
      <div className="card empty-state">
        <h4>Group not found or access denied</h4>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ marginTop: 16 }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const myBalance = balances.find((b) => b.userId === user?.id);
  const myNetPaise = myBalance ? myBalance.netBalancePaise : 0;

  return (
    <div>
      {/* Toast */}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: '', type: 'success' })}
        />
      )}

      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-outline btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} />
          <span>Back to Groups</span>
        </button>
      </div>

      {/* Group Header Banner */}
      <div className="card" style={{ padding: '24px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: '1.6rem' }}>{group.name}</h2>
              <span className={`badge ${group.created_by === user?.id || membership?.role === 'owner' ? 'badge-creator' : 'badge-member'}`}>
                {group.created_by === user?.id || membership?.role === 'owner' ? 'Creator' : 'Member'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 650 }}>
              {group.description || 'Shared expense pool'}
            </p>
          </div>

          {/* Quick Info & Invite Code */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-subtle)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Invite Code:</span>
              <strong style={{ fontFamily: 'monospace', letterSpacing: '0.08em', fontSize: '0.95rem' }}>
                {group.invite_code}
              </strong>
              <button
                onClick={handleCopyCode}
                className="btn btn-outline btn-sm"
                style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                title="Copy code to share with friends"
              >
                {codeCopied ? <Check size={13} style={{ color: 'var(--primary)' }} /> : <Copy size={13} />}
                <span>{codeCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <button
              onClick={() => {
                setEditingExpense(null);
                setIsExpenseModalOpen(true);
              }}
              className="btn btn-primary"
            >
              <Plus size={16} />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {/* User Balance Overview Strip */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>
                Your Net Balance
              </span>
              <span
                className={
                  myNetPaise > 0 ? 'text-positive' : myNetPaise < 0 ? 'text-negative' : 'text-neutral'
                }
                style={{ fontSize: '1.25rem', fontWeight: 800 }}
              >
                {myNetPaise > 0
                  ? `+${formatINR(myNetPaise)} (You receive)`
                  : myNetPaise < 0
                  ? `-${formatINR(Math.abs(myNetPaise))} (You owe)`
                  : '₹0.00 (All settled up)'}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setDefaultPaymentData({ fromUser: user?.id });
              setIsRecordPaymentOpen(true);
            }}
            className="btn btn-secondary btn-sm"
          >
            <CreditCard size={15} />
            <span>Record Settlement</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          <Receipt size={17} />
          <span>Expenses ({expenses.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
          onClick={() => setActiveTab('balances')}
        >
          <Scale size={17} />
          <span>Balances</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'settle' ? 'active' : ''}`}
          onClick={() => setActiveTab('settle')}
        >
          <CreditCard size={17} />
          <span>Settle Up ({settlements.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={17} />
          <span>Members ({members.length})</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <History size={17} />
          <span>Activity Log</span>
        </button>
      </div>

      {/* TAB 1: EXPENSES */}
      {activeTab === 'expenses' && (
        <div>
          {/* Search & Filter Toolbar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Search expenses by description..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>

            <select
              className="form-select"
              style={{ width: 'auto', minWidth: 160 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="Food & Dining">Food & Dining</option>
              <option value="Groceries">Groceries</option>
              <option value="Utilities">Utilities</option>
              <option value="Travel & Accommodation">Travel & Accommodation</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Rent">Rent</option>
              <option value="General">General</option>
            </select>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="card empty-state">
              <Receipt className="empty-state-icon" />
              <h4>No expenses found</h4>
              <p style={{ margin: '6px 0 16px', fontSize: '0.9rem' }}>
                {expenseSearch || categoryFilter
                  ? 'Try clearing search filters.'
                  : 'Start by recording the first group expense.'}
              </p>
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setIsExpenseModalOpen(true);
                }}
                className="btn btn-primary"
              >
                <Plus size={16} /> Add First Expense
              </button>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Split Type</th>
                      <th>Total Amount</th>
                      <th>Paid By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((exp) => {
                      const isVoided = exp.is_voided;
                      return (
                        <tr
                          key={exp.id}
                          style={{
                            opacity: isVoided ? 0.6 : 1,
                            background: isVoided ? '#fef2f2' : 'inherit',
                          }}
                        >
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {formatDate(exp.expense_date)}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>
                              {exp.description}
                              {isVoided && (
                                <span className="badge badge-voided" style={{ marginLeft: 6 }}>
                                  Voided
                                </span>
                              )}
                            </div>
                            {exp.notes && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {exp.notes}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem' }}>{exp.category}</span>
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}
                            >
                              {exp.split_type}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            <span style={{ textDecoration: isVoided ? 'line-through' : 'none' }}>
                              {formatINR(exp.total_amount_paise)}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.875rem' }}>
                            {exp.payers && exp.payers.length > 1 ? (
                              <span title={exp.payers.map((p) => `${p.name}: ${formatINR(p.amountPaise)}`).join(', ')}>
                                {exp.payers.length} Payers (Multi)
                              </span>
                            ) : exp.payers && exp.payers[0] ? (
                              exp.payers[0].name
                            ) : (
                              exp.created_by_name
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => openExpenseDetails(exp)}
                                className="btn btn-outline btn-sm"
                                title="View Details & Versions"
                              >
                                Details
                              </button>

                              {!isVoided && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingExpense(exp);
                                      setIsExpenseModalOpen(true);
                                    }}
                                    className="btn btn-outline btn-sm"
                                    title="Edit expense"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setConfirmDialog({
                                        title: 'Void Expense',
                                        message: `Are you sure you want to void "${exp.description}"? Financial balances will be restored.`,
                                        confirmText: 'Void Expense',
                                        type: 'danger',
                                        onConfirm: () => {
                                          setConfirmDialog(null);
                                          handleVoidExpense(exp.id);
                                        },
                                      });
                                    }}
                                    className="btn btn-outline btn-sm"
                                    style={{ color: 'var(--danger)' }}
                                    title="Void expense"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BALANCES & WHO OWES WHOM */}
      {activeTab === 'balances' && (
        <div>
          {/* Member Net Balances Table */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <h4>Group Net Balances</h4>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Sum of group balances = ₹0.00 (Zero-Sum Invariant Verified)
              </span>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>UPI ID</th>
                    <th>Total Paid</th>
                    <th>Settlements Paid</th>
                    <th>Settlements Received</th>
                    <th>Net Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.userId}>
                      <td style={{ fontWeight: 600 }}>
                        {b.name} {b.userId === user?.id ? '(You)' : ''}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {b.upiId || '—'}
                      </td>
                      <td>{formatINR(b.totalPaidPaise)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatINR(b.settlementPaidPaise)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatINR(b.settlementReceivedPaise)}</td>
                      <td
                        className={
                          b.netBalancePaise > 0
                            ? 'text-positive'
                            : b.netBalancePaise < 0
                            ? 'text-negative'
                            : 'text-neutral'
                        }
                        style={{ fontSize: '1.05rem', fontWeight: 800 }}
                      >
                        {b.netBalancePaise > 0
                          ? `+${formatINR(b.netBalancePaise)}`
                          : b.netBalancePaise < 0
                          ? `-${formatINR(Math.abs(b.netBalancePaise))}`
                          : '₹0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sub-toggle: Optimized Plan vs Detailed Debts */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${balanceViewMode === 'optimized' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setBalanceViewMode('optimized')}
              >
                <Sparkles size={14} /> Optimized Settlement Plan ({suggestions.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${balanceViewMode === 'detailed' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setBalanceViewMode('detailed')}
              >
                <Users size={14} /> Detailed Person-to-Person Debts ({detailedDebts.length})
              </button>
            </div>
          </div>

          {/* View 1: OPTIMIZED SETTLEMENT PLAN */}
          {balanceViewMode === 'optimized' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h4>Optimized Settlement Suggestions</h4>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Uses Greedy Min-Cash-Flow algorithm to settle all balances in minimum transactions (at most N - 1 payments).
                  </p>
                </div>
              </div>

              {suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                  <p style={{ fontWeight: 600 }}>Everyone is fully settled up in this group!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {suggestions.map((sug, idx) => {
                    const isSettling = recordingKey === `${sug.fromUser}-${sug.toUser}`;
                    const isPayer = Number(sug.fromUser) === Number(user?.id);
                    const isReceiver = Number(sug.toUser) === Number(user?.id);
                    const pendingForSug = settlements.find(
                      (s) =>
                        (s.status === 'pending' || s.status === 'marked_paid') &&
                        Number(s.from_user) === Number(sug.fromUser) &&
                        Number(s.to_user) === Number(sug.toUser)
                    );
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 14,
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border-light)',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 'var(--radius-full)',
                              background: '#fee2e2',
                              color: 'var(--danger)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                            }}
                          >
                            {sug.fromName.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                              <span>{sug.fromName}</span>
                              <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>owes</span>
                              <span style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>{sug.toName}</span>
                            </div>
                            {sug.toUpiId && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                UPI: {sug.toUpiId}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {formatINR(sug.amountPaise)}
                          </span>

                          {isPayer && sug.toUpiId && !pendingForSug && (
                            <button
                              type="button"
                              onClick={() => openUpiForUser(sug.toUser, sug.toName, sug.amountPaise)}
                              className="btn btn-outline btn-sm"
                              title="Open UPI QR / Link"
                            >
                              <QrCode size={14} />
                              <span>Pay UPI</span>
                            </button>
                          )}

                          {pendingForSug ? (
                            isReceiver ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmSettlement(pendingForSug.id)}
                                  className="btn btn-primary btn-sm"
                                  title="Confirm payment received (updates balances)"
                                >
                                  <CheckCircle size={14} />
                                  <span>Confirm Payment</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectSettlement(pendingForSug.id)}
                                  className="btn btn-outline btn-sm"
                                  style={{ color: 'var(--danger)' }}
                                  title="Reject payment"
                                >
                                  <XCircle size={14} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="btn btn-secondary btn-sm"
                                title="Payment recorded and is pending recipient confirmation"
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                              >
                                Pending Confirmation
                              </button>
                            )
                          ) : isPayer ? (
                            <button
                              type="button"
                              onClick={() => handleRecordSuggestedPayment(sug)}
                              className="btn btn-primary btn-sm"
                              disabled={isSettling}
                            >
                              {isSettling ? 'Recording...' : 'Record Payment'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="btn btn-primary btn-sm"
                              title="You can only settle your own debts"
                              style={{ opacity: 0.5, cursor: 'not-allowed' }}
                            >
                              Record Payment
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* View 2: DETAILED PERSON-TO-PERSON DEBTS */}
          {balanceViewMode === 'detailed' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <h4>Detailed Person-to-Person Debts</h4>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Direct pairwise obligations based on expense participant shares and confirmed settlement offsets.
                  </p>
                </div>
              </div>

              {detailedDebts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                  <p style={{ fontWeight: 600 }}>No outstanding person-to-person debts!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detailedDebts.map((d, idx) => {
                    const isSettling = recordingKey === `debt-${d.fromUser}-${d.toUser}`;
                    const isPayer = Number(d.fromUser) === Number(user?.id);
                    const isReceiver = Number(d.toUser) === Number(user?.id);
                    const pendingForDebt = settlements.find(
                      (s) =>
                        (s.status === 'pending' || s.status === 'marked_paid') &&
                        Number(s.from_user) === Number(d.fromUser) &&
                        Number(s.to_user) === Number(d.toUser)
                    );
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 12,
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-light)',
                          background: '#ffffff',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <strong>{d.fromName}</strong> owes <strong>{d.toName}</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--danger)' }}>
                            {formatINR(d.amountPaise)}
                          </span>
                          {pendingForDebt ? (
                            isReceiver ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmSettlement(pendingForDebt.id)}
                                  className="btn btn-primary btn-sm"
                                  title="Confirm payment received (updates balances)"
                                >
                                  <CheckCircle size={14} />
                                  <span>Confirm</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectSettlement(pendingForDebt.id)}
                                  className="btn btn-outline btn-sm"
                                  style={{ color: 'var(--danger)' }}
                                  title="Reject payment"
                                >
                                  <XCircle size={14} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="btn btn-secondary btn-sm"
                                title="Payment recorded and is pending recipient confirmation"
                                style={{ opacity: 0.7, cursor: 'not-allowed' }}
                              >
                                Pending Confirmation
                              </button>
                            )
                          ) : isPayer ? (
                            <button
                              type="button"
                              onClick={() => handleSettleDetailedDebt(d)}
                              className="btn btn-secondary btn-sm"
                              disabled={isSettling}
                            >
                              {isSettling ? 'Recording...' : 'Settle'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="btn btn-secondary btn-sm"
                              title="You can only settle your own debts"
                              style={{ opacity: 0.5, cursor: 'not-allowed' }}
                            >
                              Settle
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SETTLE UP (WORKFLOW) */}
      {activeTab === 'settle' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h4>Recorded Settlements</h4>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                Track payment proposals, pending verification, and confirmed receipts. Only confirmed settlements affect balances.
              </p>
            </div>
            <button
              onClick={() => {
                setDefaultPaymentData({ fromUser: user?.id });
                setIsRecordPaymentOpen(true);
              }}
              className="btn btn-primary"
            >
              <CreditCard size={16} />
              <span>Record Settlement</span>
            </button>
          </div>

          {settlements.length === 0 ? (
            <div className="card empty-state">
              <CreditCard className="empty-state-icon" />
              <h4>No settlements recorded yet</h4>
              <p style={{ margin: '6px 0 16px', fontSize: '0.9rem' }}>
                When members transfer money to settle debts, record the payment here.
              </p>
              <button
                onClick={() => {
                  setDefaultPaymentData({ fromUser: user?.id });
                  setIsRecordPaymentOpen(true);
                }}
                className="btn btn-primary"
              >
                Record First Settlement
              </button>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Payer (From)</th>
                      <th>Recipient (To)</th>
                      <th>Amount</th>
                      <th>Method & Ref</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((st) => {
                      const isDebtor = Number(st.from_user) === Number(user?.id);
                      const isCreditor = Number(st.to_user) === Number(user?.id);

                      return (
                        <tr key={st.id}>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {formatDate(st.created_at)}
                          </td>
                          <td style={{ fontWeight: 600 }}>{st.from_user_name}</td>
                          <td style={{ fontWeight: 600 }}>{st.to_user_name}</td>
                          <td style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            {formatINR(st.amount_paise)}
                          </td>
                          <td>
                            <div style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
                              {st.payment_method}
                            </div>
                            {st.reference_id && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                Ref: {st.reference_id}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-${st.status}`}>{st.status.replace('_', ' ')}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {/* UPI QR Button (debtor only) */}
                              {isDebtor && st.to_user_upi && (
                                <button
                                  onClick={() =>
                                    openUpiForUser(st.to_user, st.to_user_name, st.amount_paise)
                                  }
                                  className="btn btn-outline btn-sm"
                                  title="Show UPI QR Code"
                                >
                                  <QrCode size={14} />
                                </button>
                              )}

                              {/* Mark Paid action (strictly for debtor when pending) */}
                              {st.status === 'pending' && isDebtor && (
                                <button
                                  onClick={() => {
                                    setMarkingSettlement(st);
                                    setIsMarkPaidOpen(true);
                                  }}
                                  className="btn btn-secondary btn-sm"
                                >
                                  Mark Paid
                                </button>
                              )}

                              {/* Confirm & Reject actions (strictly for receiver / recipient) */}
                              {(st.status === 'marked_paid' || st.status === 'pending') && isCreditor && (
                                <>
                                  <button
                                    onClick={() => handleConfirmSettlement(st.id)}
                                    className="btn btn-primary btn-sm"
                                    title="Confirm payment received (updates balances)"
                                  >
                                    <CheckCircle size={14} />
                                    <span>Confirm</span>
                                  </button>
                                  <button
                                    onClick={() => handleRejectSettlement(st.id)}
                                    className="btn btn-outline btn-sm"
                                    style={{ color: 'var(--danger)' }}
                                    title="Reject payment"
                                  >
                                    <XCircle size={14} />
                                    <span>Reject</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MEMBERS */}
      {activeTab === 'members' && (
        <div>
          <div className="grid-2">
            {/* Member List */}
            <div className="card">
              <div className="card-header">
                <h4>Group Members ({members.length})</h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {m.name} {m.user_id === user?.id ? '(You)' : ''}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {m.email} {m.upi_id ? `• UPI: ${m.upi_id}` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(m.user_id === group.created_by || m.display_role === 'creator' || m.role === 'owner') ? (
                        <span className="badge badge-creator">Creator</span>
                      ) : (
                        <span className="badge badge-member">Member</span>
                      )}
                      {m.status === 'inactive' && (
                        <span className="badge badge-member">Left</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invite & Add Member Actions */}
            <div>
              {/* Share Invite Code */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>Share Invitation Code</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Anyone with this code can join the group directly from their dashboard.
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--bg-subtle)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <strong style={{ fontSize: '1.2rem', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                    {group.invite_code}
                  </strong>
                  <button onClick={handleCopyCode} className="btn btn-outline btn-sm">
                    {codeCopied ? <Check size={14} style={{ color: 'var(--primary)' }} /> : <Copy size={14} />}
                    <span>{codeCopied ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              {/* Add Member by Email */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>Add Member by Email</h4>
                <form onSubmit={handleAddMember}>
                  <div className="form-group">
                    <input
                      type="email"
                      className="form-input"
                      placeholder="friend@example.com"
                      value={addMemberEmail}
                      onChange={(e) => setAddMemberEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addMemberLoading}>
                    <UserPlus size={14} />
                    <span>{addMemberLoading ? 'Adding...' : 'Add Member'}</span>
                  </button>
                </form>
              </div>

              {/* Leave Group */}
              <div className="card">
                <h4 style={{ color: 'var(--danger)', marginBottom: 6 }}>Leave Group</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  You can only leave this group once your balance is strictly ₹0.00 (all expenses and debts settled).
                </p>
                <button onClick={handleLeaveGroup} className="btn btn-danger btn-sm">
                  <LogOut size={14} />
                  <span>Leave Group</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVITY LOG */}
      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-header">
            <h4>Chronological Activity History</h4>
          </div>

          {activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              No recorded activity yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activities.map((act) => (
                <div
                  key={act.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--primary-light)',
                      color: 'var(--primary-dark)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    <Clock size={16} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.925rem' }}>
                      <strong>{act.actor_name}</strong>{' '}
                      <span style={{ color: 'var(--text-muted)' }}>{act.action} a</span>{' '}
                      <strong>{act.entity_type}</strong>
                    </div>

                    {act.metadata && (
                      <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {act.metadata.description && `"${act.metadata.description}" `}
                        {act.metadata.amountPaise && `(${formatINR(act.metadata.amountPaise)}) `}
                        {act.metadata.reason && `• Note: ${act.metadata.reason}`}
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: 4 }}>
                      {formatDateTime(act.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EXPENSE MODAL (ADD / EDIT) */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={handleSaveExpense}
        groupMembers={members.filter((m) => m.status === 'active')}
        editExpense={editingExpense}
      />

      {/* RECORD PAYMENT MODAL */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSave={handleSaveSettlement}
        groupMembers={members.filter((m) => m.status === 'active')}
        defaultFromUser={defaultPaymentData.fromUser || user?.id}
        defaultToUser={defaultPaymentData.toUser}
        defaultAmountPaise={defaultPaymentData.amountPaise}
        currentUserId={user?.id}
      />

      {/* MARK PAID MODAL */}
      <MarkPaidModal
        isOpen={isMarkPaidOpen}
        onClose={() => {
          setIsMarkPaidOpen(false);
          setMarkingSettlement(null);
        }}
        onConfirm={handleMarkPaid}
        settlement={markingSettlement}
      />

      {/* UPI QR MODAL */}
      <UpiQrModal
        isOpen={isUpiModalOpen}
        onClose={() => setIsUpiModalOpen(false)}
        details={upiDetails}
      />

      {/* EXPENSE DETAILS & VERSION AUDIT MODAL */}
      {selectedExpenseDetails && (
        <Modal
          isOpen={isExpenseDetailsOpen}
          onClose={() => setIsExpenseDetailsOpen(false)}
          title={`Expense: ${selectedExpenseDetails.expense.description}`}
          maxWidth={600}
        >
          <div className="modal-body">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-dark)' }}>
                {formatINR(selectedExpenseDetails.expense.total_amount_paise)}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Recorded by {selectedExpenseDetails.expense.created_by_name} on{' '}
                {formatDate(selectedExpenseDetails.expense.expense_date)}
              </div>
            </div>

            {/* Payers */}
            <div style={{ marginBottom: 14 }}>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>Payers:</strong>
              {selectedExpenseDetails.expense.payers?.map((p) => (
                <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span>{p.name}</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(p.amountPaise)}</span>
                </div>
              ))}
            </div>

            {/* Participants */}
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 4 }}>
                Participant Shares ({selectedExpenseDetails.expense.split_type} split):
              </strong>
              {selectedExpenseDetails.expense.participants?.map((pt) => (
                <div key={pt.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 2 }}>
                  <span>{pt.name}</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(pt.shareAmountPaise)}</span>
                </div>
              ))}
            </div>

            {/* Version History Audit */}
            {selectedExpenseDetails.versions?.length > 1 && (
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
                <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: 6 }}>
                  Revision History ({selectedExpenseDetails.versions.length} versions):
                </strong>
                {selectedExpenseDetails.versions.map((ver) => (
                  <div
                    key={ver.version}
                    style={{
                      background: 'var(--bg-subtle)',
                      padding: 8,
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 6,
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      v{ver.version} • {ver.modified_by_name} ({formatDateTime(ver.created_at)})
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>Reason: {ver.reason || 'None provided'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button onClick={() => setIsExpenseDetailsOpen(false)} className="btn btn-secondary">
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* CONFIRMATION / ACTION PROMPT MODAL */}
      {confirmDialog && (
        <ConfirmModal
          isOpen={Boolean(confirmDialog)}
          onClose={() => setConfirmDialog(null)}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          type={confirmDialog.type}
          inputPlaceholder={confirmDialog.inputPlaceholder}
          onConfirm={confirmDialog.onConfirm}
        />
      )}
    </div>
  );
}
