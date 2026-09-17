import React, { useEffect, useRef } from 'react';
import { DetectedWallet } from '../types';

interface WalletModalProps {
  isOpen: boolean;
  wallets: DetectedWallet[];
  connectionError?: string | null;
  onSelectWallet: (wallet: DetectedWallet) => void;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  wallets,
  connectionError,
  onSelectWallet,
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus the first button in modal
      const firstBtn = modalRef.current?.querySelector('button');
      firstBtn?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        } else if (e.key === 'Tab') {
          // Trap focus
          const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        aria-describedby="wallet-modal-desc"
      >
        <div className="modal-header">
          <h2 id="wallet-modal-title" className="modal-title">
            Connect wallet
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '2px 8px', fontSize: '12px' }}
            onClick={onClose}
            aria-label="Close wallet selection modal"
          >
            ✕
          </button>
        </div>

        <p id="wallet-modal-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Choose an available wallet to continue securely.
        </p>

        {connectionError && (
          <div
            className="badge badge-error"
            style={{ padding: 'var(--space-2) var(--space-3)', width: '100%', fontSize: '12px', borderRadius: 'var(--radius-sm)' }}
            role="alert"
          >
            {connectionError}
          </div>
        )}

        {wallets.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            No supported wallet was detected. Enable a compatible wallet extension and try again.
          </div>
        ) : (
          <ul className="wallet-option-list">
            {wallets.map((wallet) => (
              <li key={wallet.id}>
                <button
                  type="button"
                  className="wallet-option-btn"
                  onClick={() => onSelectWallet(wallet)}
                >
                  {wallet.icon ? (
                    <img src={wallet.icon} alt="" className="wallet-icon-img" />
                  ) : (
                    <span className="wallet-icon-fallback" aria-hidden="true">
                      {wallet.brand === 'MetaMask' ? 'MM' : wallet.brand === 'Rabby' ? 'R' : 'OKX'}
                    </span>
                  )}
                  <span>{wallet.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
