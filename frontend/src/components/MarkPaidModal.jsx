// frontend/src/components/MarkPaidModal.jsx
// Modal for marking a settlement as paid

import React, { useState } from 'react';
import Modal from './Modal';
import { formatINR } from '../utils/formatters';

export default function MarkPaidModal({ isOpen, onClose, onConfirm, settlement }) {
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!settlement) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setSubmitting(true);
      await onConfirm({
        settlementId: settlement.id,
        referenceId: referenceId.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to mark settlement as paid');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mark Settlement as Paid" maxWidth={460}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && <div className="alert alert-danger">{error}</div>}

          <p style={{ fontSize: '0.925rem', marginBottom: 16 }}>
            Mark payment of <strong>{formatINR(settlement.amount_paise)}</strong> to{' '}
            <strong>{settlement.to_user_name}</strong> as sent?
          </p>

          <div className="form-group">
            <label className="form-label">UPI Reference ID / Transaction ID</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. UPI/20261023/12345678"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
            />
            <div className="form-helper">
              Providing a UPI reference helps the recipient locate and confirm your payment quickly.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Note (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Sent via Google Pay"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="alert alert-warning" style={{ fontSize: '0.8rem', margin: 0 }}>
            Once marked as paid, the recipient ({settlement.to_user_name}) will be prompted to verify and confirm receipt in SettleUp.
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Marking...' : 'Confirm Marked Paid'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
