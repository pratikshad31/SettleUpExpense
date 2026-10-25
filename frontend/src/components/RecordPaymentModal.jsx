// frontend/src/components/RecordPaymentModal.jsx
// Modal for recording or proposing a settlement payment

import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { AlertCircle } from 'lucide-react';
import { inrToPaise } from '../utils/formatters';

export default function RecordPaymentModal({
  isOpen,
  onClose,
  onSave,
  groupMembers,
  defaultFromUser = null,
  defaultToUser = null,
  defaultAmountPaise = null,
}) {
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [amountINR, setAmountINR] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');

    if (groupMembers && groupMembers.length >= 2) {
      setFromUser(defaultFromUser ? defaultFromUser.toString() : groupMembers[0].user_id.toString());
      setToUser(
        defaultToUser
          ? defaultToUser.toString()
          : (groupMembers[1] ? groupMembers[1].user_id.toString() : '')
      );
    }

    if (defaultAmountPaise) {
      setAmountINR((Number(defaultAmountPaise) / 100).toFixed(2));
    } else {
      setAmountINR('');
    }

    setPaymentMethod('upi');
    setReferenceId('');
    setNotes('');
  }, [isOpen, defaultFromUser, defaultToUser, defaultAmountPaise, groupMembers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const fromId = Number(fromUser);
    const toId = Number(toUser);
    const amountPaise = inrToPaise(amountINR);

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
        status: 'confirmed',
        settleImmediately: true,
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
              required
            >
              {groupMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
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
