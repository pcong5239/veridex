import React from 'react';
import { TxStage } from '../types';
import { appConfig } from '../config';

interface TxStatusBarProps {
  stage: TxStage;
  hash: string | null;
  error: string | null;
  onDismiss: () => void;
}

export const TxStatusBar: React.FC<TxStatusBarProps> = ({
  stage,
  hash,
  error,
  onDismiss,
}) => {
  if (stage === 'IDLE') return null;

  const shortHash = hash ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : null;
  const explorerUrl = hash ? `${appConfig.explorerBaseUrl}/tx/${hash}` : null;

  let message = '';
  let stageClass = '';

  switch (stage) {
    case 'FEE_REVIEW':
      message = 'Review the exact fee before opening your wallet.';
      break;
    case 'WAITING_FOR_WALLET':
      message = 'Confirm this transaction in your wallet.';
      break;
    case 'SUBMITTED':
      message = 'Transaction submitted. Waiting for network finality...';
      break;
    case 'WAITING_FOR_FINALITY':
      message = 'Waiting for GenLayer consensus and finality.';
      break;
    case 'VERIFYING_EXECUTION':
      message = 'Finalized. Verifying the execution result.';
      break;
    case 'VERIFYING_READBACK':
      message = 'Verifying the resulting contract state.';
      break;
    case 'SUCCESS':
      message = 'Transaction verified and finalized successfully.';
      stageClass = 'stage-success';
      break;
    case 'FAILED':
      message = error || 'Transaction failed due to an unknown error.';
      stageClass = 'stage-failed';
      break;
    case 'REJECTED':
      message = 'The wallet request was rejected. No transaction was submitted.';
      stageClass = 'stage-failed';
      break;
    case 'RECONCILIATION_REQUIRED':
      message = error || 'The submitted transaction needs reconciliation before another attempt.';
      stageClass = 'stage-failed';
      break;
  }

  const isPending = !['SUCCESS', 'REJECTED', 'FAILED', 'RECONCILIATION_REQUIRED'].includes(stage);
  const showSpinner = isPending && stage !== 'FEE_REVIEW';
  const isFailure = ['REJECTED', 'FAILED', 'RECONCILIATION_REQUIRED'].includes(stage);

  return (
    <div
      className={`tx-status-bar ${stageClass}`}
      data-transaction-phase={stage}
      role={isFailure ? 'alert' : 'status'}
      aria-live={isFailure ? 'assertive' : 'polite'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {showSpinner && <span className="tx-spinner" aria-hidden="true" />}
        <span>{message}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'inherit',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'underline',
            }}
          >
            {shortHash}
          </a>
        )}
        {hash && (
          <button type="button" className="tx-copy" onClick={() => navigator.clipboard?.writeText(hash)}>
            Copy hash
          </button>
        )}
      </div>

      {!isPending && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
};
