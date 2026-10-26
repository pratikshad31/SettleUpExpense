// frontend/src/components/ConfirmModal.jsx
// In-app modern confirmation & prompt dialog (replaces native browser window.confirm / window.prompt)

import { useRef } from 'react';
import Modal from './Modal';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger', // 'danger' | 'warning' | 'info'
  inputPlaceholder = null, // If set, renders input field inside modal (for rejection reasons, notes, etc.)
  initialInputValue = '',
  loading = false,
}) {
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(inputPlaceholder !== null ? inputRef.current?.value : undefined);
  };

  const isDanger = type === 'danger';
  const isWarning = type === 'warning';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth={440}>
      <div className="modal-body" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: isDanger ? '#fee2e2' : isWarning ? '#fef3c7' : 'var(--primary-light)',
              color: isDanger ? '#dc2626' : isWarning ? '#d97706' : 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isDanger || isWarning ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
          </div>
          <div style={{ flex: 1 }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
                color: 'var(--text-main)',
                lineHeight: 1.5,
                fontWeight: 500,
              }}
            >
              {message}
            </p>

            {inputPlaceholder !== null && (
              <div style={{ marginTop: 14 }}>
                <input
                  key={initialInputValue}
                  type="text"
                  className="form-input"
                  placeholder={inputPlaceholder}
                  defaultValue={initialInputValue}
                  ref={inputRef}
                  autoFocus
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        className="modal-footer"
        style={{
          padding: '14px 24px',
          background: 'var(--bg-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="btn btn-outline"
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
