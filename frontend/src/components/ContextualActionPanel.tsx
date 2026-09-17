import React, { useEffect, useState } from 'react';
import {
  ConnectedWallet,
  ChannelRecord,
  ChainRecord,
  RevisionRecord,
  SubscriptionRecord,
  AcknowledgementRecord,
} from '../types';
import { writeManager } from '../services/writeManager';
import { ConfirmationModal } from './ConfirmationModal';

export const isValidNwsUrn = (value: string): boolean =>
  value.trim().length >= 16 && value.trim().length <= 256 &&
  /^urn:oid:2\.49\.0\.1\.840\.0\.[A-Za-z0-9._-]+$/.test(value.trim());

interface ContextualActionPanelProps {
  activeWallet: ConnectedWallet | null;
  selectedChannel: ChannelRecord | null;
  selectedChain: ChainRecord | null;
  operativeRevision: RevisionRecord | null;
  subscription: SubscriptionRecord | null;
  acknowledgement: AcknowledgementRecord | null;
  onRefreshData: () => void;
  onOpenConnectModal: () => void;
  onModalStateChange: (isOpen: boolean) => void;
}

export const ContextualActionPanel: React.FC<ContextualActionPanelProps> = ({
  activeWallet,
  selectedChannel,
  selectedChain,
  operativeRevision,
  subscription,
  acknowledgement,
  onRefreshData,
  onOpenConnectModal,
  onModalStateChange,
}) => {
  type TabType = 'READER' | 'ADMIN' | 'REFRESHER' | 'SUBSCRIBER';
  const [activeTab, setActiveTab] = useState<TabType>('READER');

  // Form states
  // Admin: Create Channel
  const [nonceInput, setNonceInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [zonesInput, setZonesInput] = useState('FLZ041,FLZ141');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  useEffect(() => onModalStateChange(isCloseModalOpen), [isCloseModalOpen, onModalStateChange]);

  // Refresher: Ingest Alert
  const [ingestUrnInput, setIngestUrnInput] = useState('');
  // Refresher: Refresh Chain
  const [candidateUrnInput, setCandidateUrnInput] = useState('');
  const [refresherError, setRefresherError] = useState<string | null>(null);

  // Subscriber error
  const [subscriberError, setSubscriberError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Handlers ---

  // Admin Actions
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWallet) return onOpenConnectModal();
    setAdminError(null);

    const nonce = nonceInput.trim();
    const name = nameInput.trim();
    const zones = zonesInput
      .split(',')
      .map((z) => z.trim().toUpperCase())
      .filter(Boolean);

    if (!nonce || nonce.length < 1 || nonce.length > 64) {
      return setAdminError('Client nonce must be between 1 and 64 characters.');
    }
    if (!name || name.length < 1 || name.length > 64) {
      return setAdminError('Channel name must be between 1 and 64 characters.');
    }
    if (zones.length < 1 || zones.length > 5) {
      return setAdminError('Please provide between 1 and 5 comma-separated UGC zones.');
    }
    const zoneRegex = /^[A-Z]{2}[CZEM][0-9]{3}$/;
    for (const z of zones) {
      if (!zoneRegex.test(z)) {
        return setAdminError(`Zone "${z}" is invalid. Expected standard UGC code (e.g. FLZ041, CAC001).`);
      }
    }

    try {
      setIsSubmitting(true);
      const res = await writeManager.createChannel(activeWallet, nonce, name, zones);
      if (res.success) {
        setNonceInput('');
        setNameInput('');
        onRefreshData();
      } else if (res.error) {
        setAdminError(res.error);
      }
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivateChannel = async () => {
    if (!activeWallet || !selectedChannel) return;
    setAdminError(null);
    try {
      setIsSubmitting(true);
      const res = await writeManager.activateChannel(activeWallet, selectedChannel.channel_id);
      if (res.success) onRefreshData();
      else if (res.error) setAdminError(res.error);
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseChannelConfirm = async () => {
    setIsCloseModalOpen(false);
    if (!activeWallet || !selectedChannel) return;
    setAdminError(null);
    try {
      setIsSubmitting(true);
      const res = await writeManager.closeChannel(activeWallet, selectedChannel.channel_id);
      if (res.success) onRefreshData();
      else if (res.error) setAdminError(res.error);
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refresher Actions
  const handleIngestAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWallet || !selectedChannel) return onOpenConnectModal();
    setRefresherError(null);

    const urn = ingestUrnInput.trim();
    if (!isValidNwsUrn(urn)) {
      return setRefresherError('Invalid NWS URN. Expected format: urn:oid:2.49.0.1.840.0...');
    }

    try {
      setIsSubmitting(true);
      const res = await writeManager.ingestAlert(activeWallet, selectedChannel.channel_id, urn);
      if (res.success) {
        setIngestUrnInput('');
        onRefreshData();
      } else if (res.error) {
        setRefresherError(res.error);
      }
    } catch (err: unknown) {
      setRefresherError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshChain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWallet || !selectedChannel || !selectedChain) return onOpenConnectModal();
    setRefresherError(null);

    const candidate = candidateUrnInput.trim();
    if (!isValidNwsUrn(candidate)) {
      return setRefresherError('Invalid candidate NWS URN format.');
    }

    try {
      setIsSubmitting(true);
      const res = await writeManager.refreshChain(activeWallet, selectedChannel.channel_id, selectedChain.root_urn, candidate);
      if (res.success) {
        setCandidateUrnInput('');
        onRefreshData();
      } else if (res.error) {
        setRefresherError(res.error);
      }
    } catch (err: unknown) {
      setRefresherError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeriveExpiry = async () => {
    if (!activeWallet || !selectedChannel || !selectedChain) return;
    setRefresherError(null);
    try {
      setIsSubmitting(true);
      const res = await writeManager.deriveExpiry(activeWallet, selectedChannel.channel_id, selectedChain.root_urn);
      if (res.success) onRefreshData();
      else if (res.error) setRefresherError(res.error);
    } catch (err: unknown) {
      setRefresherError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Subscriber Actions
  const handleToggleSubscription = async () => {
    if (!activeWallet || !selectedChannel) return onOpenConnectModal();
    setSubscriberError(null);
    try {
      setIsSubmitting(true);
      const isSubbed = subscription?.is_subscribed;
      const res = isSubbed
        ? await writeManager.unsubscribeChannel(activeWallet, selectedChannel.channel_id)
        : await writeManager.subscribeChannel(activeWallet, selectedChannel.channel_id);

      if (res.success) onRefreshData();
      else if (res.error) setSubscriberError(res.error);
    } catch (err: unknown) {
      setSubscriberError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!activeWallet || !selectedChannel || !selectedChain) return onOpenConnectModal();
    setSubscriberError(null);
    try {
      setIsSubmitting(true);
      const res = await writeManager.acknowledge(
        activeWallet,
        selectedChannel.channel_id,
        selectedChain.root_urn,
        selectedChain.epoch
      );
      if (res.success) onRefreshData();
      else if (res.error) setSubscriberError(res.error);
    } catch (err: unknown) {
      setSubscriberError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isChannelAdmin =
    activeWallet && selectedChannel && activeWallet.address.toLowerCase() === selectedChannel.admin.toLowerCase();

  return (
    <section className="action-panel" aria-label="Contextual Actions and Operational Controls">
      <nav className="panel-tabs" aria-label="Operational Roles Navigation">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'READER' ? 'active' : ''}`}
          onClick={() => setActiveTab('READER')}
        >
          Public Reader
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'REFRESHER' ? 'active' : ''}`}
          onClick={() => setActiveTab('REFRESHER')}
        >
          Permissionless Refresher
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'SUBSCRIBER' ? 'active' : ''}`}
          onClick={() => setActiveTab('SUBSCRIBER')}
        >
          Subscriber
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'ADMIN' ? 'active' : ''}`}
          onClick={() => setActiveTab('ADMIN')}
        >
          Channel Admin {isChannelAdmin && '★'}
        </button>
      </nav>

      {/* Reader Tab */}
      {activeTab === 'READER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700 }}>{activeWallet ? 'Connected Public Verification' : 'Disconnected Public Verification'}</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            You are reading Veridex's public GenLayer consensus record. Alert revisions and normalized instruction changes remain available without connecting a wallet.
          </p>
          {operativeRevision && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a
                href={operativeRevision.source_url || `https://api.weather.gov/alerts/${operativeRevision.urn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Inspect Official NWS Source (weather.gov) ↗
              </a>
            </div>
          )}
        </div>
      )}

      {/* Refresher Tab */}
      {activeTab === 'REFRESHER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Permissionless Revision Refresher</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Anyone can ingest root alerts or submit revision candidates to update an active alert chain on-chain.
          </p>

          {refresherError && (
            <div className="badge badge-error" style={{ padding: '6px', width: '100%', whiteSpace: 'pre-wrap' }}>
              {refresherError}
            </div>
          )}

          {!selectedChannel ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Select a channel from the left rail to ingest or refresh alert chains.
            </div>
          ) : selectedChannel.status !== 'ACTIVE' ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Channel #{selectedChannel.channel_id} is in {selectedChannel.status} status. Only ACTIVE channels accept alert ingestions.
            </div>
          ) : (
            <>
              {/* Ingest Alert Form */}
              <form className="action-form" onSubmit={handleIngestAlert}>
                <h4 style={{ fontSize: '13px', fontWeight: 600 }}>1. Ingest New Root Alert</h4>
                <div className="form-group">
                  <label htmlFor="ingest-urn">NWS Alert Root URN</label>
                  <input
                    id="ingest-urn"
                    type="text"
                    className="form-input font-mono"
                    placeholder="urn:oid:2.49.0.1.840.0.965b..."
                    value={ingestUrnInput}
                    onChange={(e) => setIngestUrnInput(e.target.value)}
                    aria-invalid={ingestUrnInput.trim() !== '' && !isValidNwsUrn(ingestUrnInput)}
                    aria-describedby="ingest-urn-help ingest-urn-error"
                    required
                  />
                  <span id="ingest-urn-help" className="form-help">
                    Must start with urn:oid:2.49.0.1.840.0. Derived API endpoint will be verified by GenLayer validators.
                  </span>
                  {ingestUrnInput.trim() !== '' && !isValidNwsUrn(ingestUrnInput) && (
                    <span id="ingest-urn-error" className="form-help" role="alert">Enter a complete NWS alert URN.</span>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !isValidNwsUrn(ingestUrnInput)}
                >
                  {activeWallet ? 'Ingest Alert to Channel' : 'Connect Wallet to Ingest'}
                </button>
              </form>

              {/* Refresh Chain Form */}
              {selectedChain && (
                <form className="action-form" onSubmit={handleRefreshChain} style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600 }}>2. Submit Revision Update / Cancel Candidate</h4>
                  <div className="form-group">
                    <label htmlFor="candidate-urn">Candidate NWS Revision URN</label>
                    <input
                      id="candidate-urn"
                      type="text"
                      className="form-input font-mono"
                      placeholder="urn:oid:2.49.0.1.840.0.b87c..."
                      value={candidateUrnInput}
                      onChange={(e) => setCandidateUrnInput(e.target.value)}
                      aria-invalid={candidateUrnInput.trim() !== '' && !isValidNwsUrn(candidateUrnInput)}
                      aria-describedby="candidate-urn-help candidate-urn-error"
                      required
                    />
                    <span id="candidate-urn-help" className="form-help">
                      Candidate alert referencing root URN {selectedChain.root_urn.slice(0, 30)}...
                    </span>
                    {candidateUrnInput.trim() !== '' && !isValidNwsUrn(candidateUrnInput) && (
                      <span id="candidate-urn-error" className="form-help" role="alert">Enter a complete NWS revision URN.</span>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting || !isValidNwsUrn(candidateUrnInput)}
                  >
                    {activeWallet ? 'Submit Revision Candidate' : 'Connect Wallet to Submit'}
                  </button>

                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleDeriveExpiry}
                      disabled={isSubmitting || selectedChain.operative_status === 'EXPIRED'}
                    >
                      Derive Time-Based Expiry
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* Subscriber Tab */}
      {activeTab === 'SUBSCRIBER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Channel Subscription & Acknowledgement</h3>

          {subscriberError && (
            <div className="badge badge-error" style={{ padding: '6px', width: '100%', whiteSpace: 'pre-wrap' }}>
              {subscriberError}
            </div>
          )}

          {!selectedChannel ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Select a channel to manage subscription.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <strong>Channel #{selectedChannel.channel_id} ({selectedChannel.name})</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Subscription Status: {subscription?.is_subscribed ? 'SUBSCRIBED' : 'NOT SUBSCRIBED'}
                  </div>
                </div>
                <button
                  type="button"
                  className={subscription?.is_subscribed ? 'btn btn-danger' : 'btn btn-primary'}
                  onClick={handleToggleSubscription}
                  disabled={isSubmitting}
                >
                  {activeWallet
                    ? subscription?.is_subscribed
                      ? 'Unsubscribe'
                      : 'Subscribe'
                    : 'Connect Wallet'}
                </button>
              </div>

              {selectedChain && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong>Chain Epoch #{selectedChain.epoch} Acknowledgement</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Status: {acknowledgement ? acknowledgement.status : 'UNACKNOWLEDGED'}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAcknowledge}
                      disabled={isSubmitting || acknowledgement?.status === 'ACKNOWLEDGED'}
                    >
                      {acknowledgement?.status === 'ACKNOWLEDGED'
                        ? 'Epoch Acknowledged'
                        : 'Acknowledge Epoch'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Channel Admin Tab */}
      {activeTab === 'ADMIN' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700 }}>Channel Administrator Lifecycle</h3>

          {adminError && (
            <div className="badge badge-error" style={{ padding: '6px', width: '100%', whiteSpace: 'pre-wrap' }}>
              {adminError}
            </div>
          )}

          {/* Create Channel Form */}
          <form className="action-form" onSubmit={handleCreateChannel}>
            <h4 style={{ fontSize: '13px', fontWeight: 600 }}>Create New Alert Channel</h4>

            <div className="form-group">
              <label htmlFor="client-nonce">Client Nonce (Idempotency Key)</label>
              <input
                id="client-nonce"
                type="text"
                className="form-input font-mono"
                placeholder="e.g. fl-emergency-desk-01"
                value={nonceInput}
                onChange={(e) => setNonceInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="channel-name">Channel Name</label>
              <input
                id="channel-name"
                type="text"
                className="form-input"
                placeholder="e.g. Florida Atlantic Coast Watch"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="channel-zones">UGC Zones (1 to 5 comma-separated codes)</label>
              <input
                id="channel-zones"
                type="text"
                className="form-input font-mono"
                placeholder="FLZ041,FLZ141,FLZ142"
                value={zonesInput}
                onChange={(e) => setZonesInput(e.target.value)}
                required
              />
              <span className="form-help">
                Standard NWS UGC codes matching ^[A-Z]&#123;2&#125;[CZEM][0-9]&#123;3&#125;$ (e.g. FLZ041, CAC001).
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !nameInput.trim() || !nonceInput.trim()}
            >
              {activeWallet ? 'Create Channel' : 'Connect Wallet to Create'}
            </button>
          </form>

          {/* Manage Selected Channel */}
          {selectedChannel && isChannelAdmin && (
            <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600 }}>
                Manage Channel #{selectedChannel.channel_id} ({selectedChannel.status})
              </h4>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedChannel.status === 'DRAFT' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleActivateChannel}
                    disabled={isSubmitting}
                  >
                    Activate Channel (DRAFT → ACTIVE)
                  </button>
                )}

                {selectedChannel.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setIsCloseModalOpen(true)}
                    disabled={isSubmitting}
                  >
                    Close Channel (Irreversible)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* In-App Confirmation Modal for Irreversible Actions */}
      <ConfirmationModal
        isOpen={isCloseModalOpen}
        title="Confirm Channel Closure"
        message={`Are you sure you want to CLOSE Channel #${selectedChannel?.channel_id} (${selectedChannel?.name})? This action is permanent and irreversible on the GenLayer consensus ledger.`}
        confirmLabel="Close Channel"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleCloseChannelConfirm}
        onCancel={() => setIsCloseModalOpen(false)}
      />
    </section>
  );
};
