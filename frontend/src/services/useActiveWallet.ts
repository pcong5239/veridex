import { useState, useEffect } from 'react';
import { walletManager } from './walletManager';
import { writeManager } from './writeManager';
import { DetectedWallet, TxStage } from '../types';
import { rpcClient } from './rpcClient';

export function useActiveWallet() {
  const [walletSnapshot, setWalletSnapshot] = useState(() => walletManager.getSnapshot());
  const [txStage, setTxStage] = useState<TxStage>(() => writeManager.getStage());
  const [txHash, setTxHash] = useState<string | null>(() => writeManager.getHash());
  const [txError, setTxError] = useState<string | null>(() => writeManager.getError());

  useEffect(() => {
    const unsubWallet = walletManager.subscribe(() => {
      setWalletSnapshot(walletManager.getSnapshot());
      rpcClient.invalidateCache();
    });

    const unsubWrite = writeManager.subscribe(() => {
      setTxStage(writeManager.getStage());
      setTxHash(writeManager.getHash());
      setTxError(writeManager.getError());
    });

    return () => {
      unsubWallet();
      unsubWrite();
    };
  }, []);

  return {
    activeWallet: walletSnapshot.phase === 'CONNECTED' ? walletSnapshot.activeWallet : null,
    connectedWallet: walletSnapshot.activeWallet,
    detectedWallets: walletSnapshot.detectedWallets,
    walletPhase: walletSnapshot.phase,
    walletError: walletSnapshot.error,
    txStage,
    txHash,
    txError,
    connectWallet: (wallet: DetectedWallet) => walletManager.connectWallet(wallet),
    openWalletChooser: () => walletManager.openChooser(),
    closeWalletChooser: () => walletManager.closeChooser(),
    recoverNetwork: () => walletManager.recoverNetwork(),
    disconnect: () => walletManager.disconnect(),
    resetTxState: () => writeManager.resetState(),
  };
}
