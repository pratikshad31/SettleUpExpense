// frontend/src/components/Toast.jsx
// Toast notification component

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;

  const isError = type === 'error';

  return (
    <div className="toast-container">
      <div className={`toast ${isError ? 'toast-error' : ''}`}>
        {isError ? (
          <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
        ) : (
          <CheckCircle2 size={18} style={{ color: 'var(--primary)' }} />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}
