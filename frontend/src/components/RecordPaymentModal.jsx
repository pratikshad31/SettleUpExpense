// frontend/src/components/RecordPaymentModal.jsx
// Modal for recording or proposing a settlement payment

import { useState } from 'react';
import Modal from './Modal';
import { AlertCircle } from 'lucide-react';
import { inrToPaise } from '../utils/formatters';

export default function RecordPaymentModal(props) {
  if (!props.isOpen) return null;
  const key = [
    props.defaultFromUser ?? '',
    props.defaultToUser ?? '',
    props.defaultAmountPaise ?? '',
    props.currentUserId ?? '',
    (props.groupMembers || []).map((member) => member.user_id).join(','),
  ].join('|');
  return <RecordPaymentModalForm key={key} {...props} />;
}

function RecordPaymentModalForm({
  isOpen,
  onClose,
  onSave,
  groupMembers,
  defaultFromUser = null,
  defaultToUser = null,
  defaultAmountPaise = null,
  currentUserId = null,
}) {
  const initialFromUser = groupMembers && groupMembers.length >= 2
    ? (defaultFromUser
      ? defaultFromUser.toString()
      : (currentUserId ? currentUserId.toString() : groupMembers[0].user_id.toString()))
    : '';
  const remainingMembers = (groupMembers || [])
    .filter((member) => member.user_id.toString() !== initialFromUser);
  const initialToUser = groupMembers && groupMembers.length >= 2
    ? (defaultToUser
      ? defaultToUser.toString()
      : (remainingMembers[0]?.user_id?.toString() || groupMembers[1]?.user_id?.toString() || ''))
    : '';
  const [fromUser, setFromUser] = useState(initialFromUser);
  const [toUser, setToUser] = useState(initialToUser);
  const [amountINR, setAmountINR] = useState(
    defaultAmountPaise ? (Number(defaultAmountPaise) / 100).toFixed(2) : ''
  );
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const fromId = Number(fromUser);
    const toId = Number(toUser);
    const amountPaise = inrToPaise(amountINR);

    if (currentUserId && fromId !== Number(currentUserId)) {
      setError('You can only settle your own debts');
      return;
    }

    if (fromId === toId) {
      setError('Payer and recipient cannot be the same member');
      return;
    }

    if (amountPaise <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({
        fromUser: fromId,
        toUser: toId,
        amountPaise,
        paymentMethod,
        referenceId: referenceId.trim() || undefined,
        notes: notes.trim() || undefined,
        status: 'pending',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record settlement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Settlement Payment" maxWidth={500}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Who Paid? (Payer / Debtor) *</label>
            <select
              className="form-select"
              value={fromUser}
              onChange={(e) => setFromUser(e.target.value)}
              disabled={Boolean(currentUserId)}
              title={currentUserId ? 'You can only settle your own debts' : undefined}
              required
            >
              {groupMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} {currentUserId && Number(m.user_id) === Number(currentUserId) ? '(You)' : ''}
                </option>
              ))}
            </select>
            {currentUserId && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                You can only settle your own debts
              </small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Who Received? (Recipient / Creditor) *</label>
            <select
              className="form-select"
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
              required
            >
              {groupMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} {m.upi_id ? `(UPI: ${m.upi_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="form-input"
              placeholder="0.00"
              value={amountINR}
              onChange={(e) => setAmountINR(e.target.value)}
              required
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select
                className="form-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                <option value="cash">Cash in hand</option>
                <option value="bank_transfer">Net Banking / NEFT / IMPS</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Reference ID (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="UPI txn ref or UTR"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Cleared Goa trip accommodation"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="alert alert-info" style={{ fontSize: '0.8rem', margin: 0 }}>
            Recording this payment will mark it as <strong>Settled</strong> and immediately recalculate all group balances in real time.
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
