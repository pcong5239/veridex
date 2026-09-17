import React from 'react';
import { ConnectedWallet } from '../types';

interface HeaderProps {
  activeWallet: ConnectedWallet | null;
  onOpenConnectModal: () => void;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeWallet,
  onOpenConnectModal,
  onDisconnect,
}) => {
  const shortAddress = activeWallet
    ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-4)}`
    : null;

  return (
    <header className="masthead" role="banner">
      <div className="masthead-identity">
        <h1 className="masthead-title">Veridex</h1>
        <div className="network-badge" title="Studio development preview">
          <span className="network-dot" aria-hidden="true" />
          <span>GenLayer Studio Next</span>
        </div>
      </div>

      <div className="masthead-actions">
        {activeWallet ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-inverse)',
                backgroundColor: '#1e293b',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {activeWallet.brand}: {shortAddress}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenConnectModal}
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};
