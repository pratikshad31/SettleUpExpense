// frontend/src/components/UpiQrModal.jsx
// Interactive UPI QR code scanner & payment launcher

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from './Modal';
import { Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { formatINR } from '../utils/formatters';

export default function UpiQrModal({ isOpen, onClose, details }) {
  const [copied, setCopied] = useState(false);

  if (!details) return null;

  const { recipientName, upiId, amountPaise, upiUri, note } = details;

  const handleCopyUpi = () => {
    if (upiId) {
      navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pay with UPI" maxWidth={480}>
      <div className="modal-body" style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          Scan with GPay, PhonePe, Paytm, or BHIM
        </p>

        {/* QR Code Container */}
        <div
          style={{
            background: '#ffffff',
            padding: 20,
            borderRadius: 'var(--radius-lg)',
            display: 'inline-block',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-light)',
            marginBottom: 20,
          }}
        >
          {upiUri ? (
            <QRCodeSVG
              value={upiUri}
              size={220}
              level="M"
              includeMargin={false}
            />
          ) : (
            <div style={{ padding: 40, color: 'var(--text-muted)' }}>
              UPI ID not available for this recipient
            </div>
          )}
        </div>

        {/* Payment Amount */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Amount to Pay</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary-dark)' }}>
            {formatINR(amountPaise)}
          </div>
        </div>

        {/* Recipient Details Card */}
        <div
          style={{
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            marginBottom: 20,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Paying to:</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            {recipientName}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fff',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-light)',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.9rem' }}>
              {upiId || 'No UPI ID provided'}
            </span>
            {upiId && (
              <button
                type="button"
                onClick={handleCopyUpi}
                className="btn btn-outline btn-sm"
                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              >
                {copied ? <Check size={14} style={{ color: 'var(--primary)' }} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Deep Link Action */}
        {upiUri && (
          <div style={{ marginBottom: 16 }}>
            <a
              href={upiUri}
              className="btn btn-primary"
              style={{ width: '100%', textDecoration: 'none' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              <span>Open in UPI App</span>
            </a>
          </div>
        )}

        {/* Disclaimer Alert */}
        <div className="alert alert-warning" style={{ fontSize: '0.8rem', textAlign: 'left' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Disclaimer:</strong> Launching a UPI application or scanning the QR code does not automatically verify payment. After completing the payment, please record or mark the payment as paid in SettleUp so the recipient can verify and confirm.
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button onClick={onClose} className="btn btn-secondary">
          Close
        </button>
      </div>
    </Modal>
  );
}
