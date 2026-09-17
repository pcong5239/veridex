import React, { useState, useEffect, useCallback } from 'react';
import { appConfig } from './config';
import { useActiveWallet } from './services/useActiveWallet';
import { rpcClient } from './services/rpcClient';
import {
  ChannelRecord,
  ChainRecord,
  RevisionRecord,
  SubscriptionRecord,
  AcknowledgementRecord,
  ConfigRecord,
  UpgradeStatusRecord,
  AuditEventRecord,
} from './types';
import { Header } from './components/Header';
import { SafetyDisclosures } from './components/SafetyDisclosures';
import { TxStatusBar } from './components/TxStatusBar';
import { WalletModal } from './components/WalletModal';
import { ChannelRail } from './components/ChannelRail';
import { OperativeBulletin } from './components/OperativeBulletin';
import { VerticalRevisionSpine } from './components/VerticalRevisionSpine';
import { ContextualActionPanel } from './components/ContextualActionPanel';
import { AuditArea } from './components/AuditArea';

export const Workspace: React.FC = () => {
  const {
    activeWallet,
    connectedWallet,
    detectedWallets,
    walletPhase,
    walletError,
    txStage,
    txHash,
    txError,
    connectWallet,
    openWalletChooser,
    closeWalletChooser,
    recoverNetwork,
    disconnect,
    resetTxState,
  } = useActiveWallet();

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [walletConnectError, setWalletConnectError] = useState<string | null>(null);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  // Contract State
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [chains, setChains] = useState<ChainRecord[]>([]);
  const [selectedRootUrn, setSelectedRootUrn] = useState<string | null>(null);

  // Truth-Label Separation: Operative revision is authoritative; inspecting index is UI-only
  const [operativeRevision, setOperativeRevision] = useState<RevisionRecord | null>(null);
  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [inspectingRevisionIndex, setInspectingRevisionIndex] = useState<number | null>(null);

  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<AcknowledgementRecord | null>(null);

  const [config, setConfig] = useState<ConfigRecord | null>(null);
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatusRecord | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);

  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [isLoadingChain, setIsLoadingChain] = useState(false);

  // Load Channels and General Contract Parameters
  const loadInitialData = useCallback(async (signal?: AbortSignal) => {
    if (!appConfig.isConfigured) return;
    try {
      setIsLoadingChannels(true);
      setInitialLoadError(null);
      const [chList, cfg, upg] = await Promise.allSettled([
        rpcClient.getChannels(0, 50, false, signal),
        rpcClient.getConfig(false, signal),
        rpcClient.getUpgradeStatus(false, signal),
      ]);

      if (chList.status === 'rejected' || cfg.status === 'rejected' || upg.status === 'rejected') {
        if (!signal?.aborted) {
          setInitialLoadError('Current contract state could not be verified. No empty state is being claimed. Please retry the read.');
        }
        return;
      }
      if (chList.status === 'fulfilled') {
        setChannels(chList.value);
        if (chList.value.length > 0 && selectedChannelId === null) {
          setSelectedChannelId(chList.value[0].channel_id);
        }
      }
      if (cfg.status === 'fulfilled') setConfig(cfg.value);
      if (upg.status === 'fulfilled') setUpgradeStatus(upg.value);
    } catch {
      // Handled via state
    } finally {
      if (!signal?.aborted) setIsLoadingChannels(false);
    }
  }, [selectedChannelId]);

  // Load Selected Channel Details (Chains, Audit Events, Subscription)
  const loadChannelData = useCallback(async (channelId: number, signal?: AbortSignal) => {
    if (!appConfig.isConfigured) return;
    try {
      setIsLoadingChain(true);
      const [chainsRes, auditsRes] = await Promise.allSettled([
        rpcClient.getChains(channelId, 0, 50, false, signal),
        rpcClient.getAllAuditEvents(channelId, signal),
      ]);

      if (chainsRes.status === 'fulfilled') {
        setChains(chainsRes.value);
        if (chainsRes.value.length > 0) {
          setSelectedRootUrn(chainsRes.value[0].root_urn);
        } else {
          setSelectedRootUrn(null);
          setOperativeRevision(null);
          setRevisions([]);
          setInspectingRevisionIndex(null);
        }
      }

      if (auditsRes.status === 'fulfilled') {
        setAuditEvents(auditsRes.value);
      }

      if (activeWallet) {
        try {
          const sub = await rpcClient.getSubscription(channelId, activeWallet.address, false, signal);
          setSubscription(sub);
        } catch {
          setSubscription(null);
        }
      }
    } finally {
      if (!signal?.aborted) setIsLoadingChain(false);
    }
  }, [activeWallet]);

  // Load Selected Chain Revisions & Operative Alert
  const loadChainData = useCallback(async (channelId: number, rootUrn: string, signal?: AbortSignal) => {
    if (!appConfig.isConfigured) return;
    try {
      setIsLoadingChain(true);
      const [opRes, revsRes] = await Promise.allSettled([
        rpcClient.getOperativeAlert(channelId, rootUrn, false, signal),
        rpcClient.getRevisions(channelId, rootUrn, 0, 50, false, signal),
      ]);

      if (opRes.status === 'fulfilled') {
        setOperativeRevision(opRes.value);
        setInspectingRevisionIndex(opRes.value.revision_index);
      }
      if (revsRes.status === 'fulfilled') {
        setRevisions(revsRes.value);
      }

      if (activeWallet) {
        try {
          const ack = await rpcClient.getAcknowledgement(channelId, rootUrn, activeWallet.address, false, signal);
          setAcknowledgement(ack);
        } catch {
          setAcknowledgement(null);
        }
      }
    } finally {
      if (!signal?.aborted) setIsLoadingChain(false);
    }
  }, [activeWallet]);

  useEffect(() => {
    const controller = new AbortController();
    loadInitialData(controller.signal);
    return () => controller.abort();
  }, [loadInitialData]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedChannelId !== null) {
      loadChannelData(selectedChannelId, controller.signal);
    }
    return () => controller.abort();
  }, [selectedChannelId, loadChannelData]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedChannelId !== null && selectedRootUrn !== null) {
      loadChainData(selectedChannelId, selectedRootUrn, controller.signal);
    }
    return () => controller.abort();
  }, [selectedChannelId, selectedRootUrn, loadChainData]);

  const selectedChannel = channels.find((c) => c.channel_id === selectedChannelId) || null;
  const selectedChain = chains.find((c) => c.root_urn === selectedRootUrn) || null;

  const handleRefreshAll = () => {
    rpcClient.invalidateCache();
    loadInitialData();
    if (selectedChannelId !== null) {
      loadChannelData(selectedChannelId);
      if (selectedRootUrn !== null) {
        loadChainData(selectedChannelId, selectedRootUrn);
      }
    }
  };

  return (
    <div className="veridex-root">
      <div inert={isWalletModalOpen || isConfirmationModalOpen ? true : undefined}>
      <Header
        activeWallet={connectedWallet}
        onOpenConnectModal={() => {
          setWalletConnectError(null);
          openWalletChooser();
          setIsWalletModalOpen(true);
        }}
        onDisconnect={disconnect}
      />

      <SafetyDisclosures />

      <main className="veridex-container">
        {walletPhase === 'WRONG_CHAIN' && (
          <div className="badge badge-error config-alert" role="alert">
            <span>{walletError}</span>{' '}
            <button type="button" className="btn btn-secondary" onClick={() => recoverNetwork().catch((error) => setWalletConnectError(String(error)))}>
              Switch network
            </button>
          </div>
        )}
        {/* Missing Contract Address Alert */}
        {!appConfig.isConfigured && (
          <div
            className="badge badge-error config-alert"
            style={{ padding: 'var(--space-4)', fontSize: '13px', borderRadius: 'var(--radius-md)' }}
            role="alert"
          >
            <strong>CONFIGURATION REQUIRED:</strong> {appConfig.configError}
          </div>
        )}

        {/* Transaction Status Bar */}
        <TxStatusBar
          stage={txStage}
          hash={txHash}
          error={txError}
          onDismiss={resetTxState}
        />

        {initialLoadError && (
          <div className="badge badge-error config-alert" role="alert" style={{ padding: 'var(--space-4)' }}>
            <span>{initialLoadError}</span>{' '}
            <button type="button" className="btn btn-secondary" onClick={handleRefreshAll}>
              Retry contract read
            </button>
          </div>
        )}

        {!initialLoadError && <>
        {/* Veridex verification workspace */}
        <div className="desk-workspace">
          {/* Left Rail: Channels List */}
          <ChannelRail
            channels={channels}
            selectedChannelId={selectedChannelId}
            onSelectChannel={(chId) => {
              setSelectedChannelId(chId);
            }}
            isLoading={isLoadingChannels}
          />

          {/* Right Surface: Operative Bulletin, Timeline Spine, Action Panel */}
          <div className="operative-surface">
            <OperativeBulletin
              chain={selectedChain}
              operativeRevision={operativeRevision}
              isLoading={isLoadingChain}
            />

            <VerticalRevisionSpine
              revisions={revisions}
              activeRevisionIndex={inspectingRevisionIndex ?? (operativeRevision?.revision_index ?? 0)}
              acknowledgement={acknowledgement}
              onSelectRevision={(revIdx) => {
                // Truth-Label Isolation: only update inspecting state; do NOT overwrite operativeRevision
                setInspectingRevisionIndex(revIdx);
              }}
              isLoading={isLoadingChain}
            />

            <ContextualActionPanel
              activeWallet={activeWallet}
              selectedChannel={selectedChannel}
              selectedChain={selectedChain}
              operativeRevision={operativeRevision}
              subscription={subscription}
              acknowledgement={acknowledgement}
              onRefreshData={handleRefreshAll}
              onOpenConnectModal={() => {
                setWalletConnectError(null);
                openWalletChooser();
                setIsWalletModalOpen(true);
              }}
              onModalStateChange={setIsConfirmationModalOpen}
            />
          </div>
        </div>

        {/* Auditor Ledger & Diagnostics Area */}
        <AuditArea
          config={config}
          upgradeStatus={upgradeStatus}
          auditEvents={auditEvents}
          isLoading={isLoadingChannels || isLoadingChain}
        />
        </>}
      </main>
      </div>

      {/* Wallet Selector Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        wallets={detectedWallets}
        connectionError={walletConnectError}
        onSelectWallet={async (wallet) => {
          try {
            setWalletConnectError(null);
            await connectWallet(wallet);
            closeWalletChooser();
            setIsWalletModalOpen(false);
          } catch (err: unknown) {
            setWalletConnectError(err instanceof Error ? err.message : String(err));
          }
        }}
        onClose={() => {
          setWalletConnectError(null);
          closeWalletChooser();
          setIsWalletModalOpen(false);
        }}
      />
    </div>
  );
};
