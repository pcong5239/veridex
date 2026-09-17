import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { WalletModal } from '../components/WalletModal';
import { Header } from '../components/Header';
import { SafetyDisclosures } from '../components/SafetyDisclosures';
import { TxStatusBar } from '../components/TxStatusBar';
import { OperativeBulletin } from '../components/OperativeBulletin';
import { VerticalRevisionSpine } from '../components/VerticalRevisionSpine';
import { ChannelRail } from '../components/ChannelRail';
import { LandingPage } from '../components/LandingPage';
import { ChainRecord, RevisionRecord, ChannelRecord, DetectedWallet, ConnectedWallet } from '../types';

function cleanHtml(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, '');
}

describe('React Component Rendering & Accessibility', () => {
  describe('LandingPage', () => {
    it('renders the public layer, documentation, and explicit workspace actions', () => {
      const html = cleanHtml(renderToString(<LandingPage onEnterWorkspace={() => {}} />));
      expect(html).toContain('Know which public alert is operative.');
      expect(html).toContain('GenLayer documentation');
      expect(html).toContain('Open workspace');
      expect(html).toContain('Explore Veridex');
      expect(html).toContain('Open the live workspace');
      expect(html).toContain('Trust &amp; Safety');
      expect(html).toContain('always follow weather.gov');
      expect(html).not.toContain('Verified on GenLayer');
      expect(html).toContain('aria-hidden="true"');
    });
  });

  describe('ConfirmationModal', () => {
    it('renders accessible dialog attributes and confirmation content when open', () => {
      const html = cleanHtml(
        renderToString(
          <ConfirmationModal
            isOpen={true}
            title="Confirm Channel Closure"
            message="Are you sure you want to close this channel?"
            confirmLabel="Yes, Close Channel"
            cancelLabel="Cancel"
            isDestructive={true}
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        )
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="confirm-modal-title"');
      expect(html).toContain('aria-describedby="confirm-modal-desc"');
      expect(html).toContain('Confirm Channel Closure');
      expect(html).toContain('Are you sure you want to close this channel?');
      expect(html).toContain('Yes, Close Channel');
      expect(html).toContain('Cancel');
    });

    it('returns empty string when isOpen is false', () => {
      const html = cleanHtml(
        renderToString(
          <ConfirmationModal
            isOpen={false}
            title="Title"
            message="Msg"
            onConfirm={() => {}}
            onCancel={() => {}}
          />
        )
      );

      expect(html).toBe('');
    });
  });

  describe('WalletModal', () => {
    it('renders accessible wallet options and inline alert for connection error', () => {
      const wallets: DetectedWallet[] = [
        {
          id: 'mm-1',
          brand: 'MetaMask',
          name: 'MetaMask',
          icon: 'icon.png',
          provider: { request: vi.fn() },
          isFallback: false,
        },
      ];

      const html = cleanHtml(
        renderToString(
          <WalletModal
            isOpen={true}
            wallets={wallets}
            connectionError="Failed to switch chain"
            onSelectWallet={() => {}}
            onClose={() => {}}
          />
        )
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-describedby="wallet-modal-desc"');
      expect(html).toContain('Connect wallet');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Failed to switch chain');
      expect(html).toContain('MetaMask');
    });

    it('returns empty string when isOpen is false', () => {
      const html = cleanHtml(
        renderToString(
          <WalletModal
            isOpen={false}
            wallets={[]}
            connectionError={null}
            onSelectWallet={() => {}}
            onClose={() => {}}
          />
        )
      );

      expect(html).toBe('');
    });
  });

  describe('Header', () => {
    it('renders connect button when disconnected and address when connected', () => {
      const disconnectedHtml = cleanHtml(
        renderToString(
          <Header
            activeWallet={null}
            onOpenConnectModal={() => {}}
            onDisconnect={() => {}}
          />
        )
      );

      expect(disconnectedHtml).toContain('Veridex');
      expect(disconnectedHtml).toContain('Connect Wallet');

      const connectedWallet: ConnectedWallet = {
        address: '0x1234567890123456789012345678901234567890',
        chainId: 61997,
        brand: 'MetaMask',
        provider: { request: vi.fn() },
      };

      const connectedHtml = cleanHtml(
        renderToString(
          <Header
            activeWallet={connectedWallet}
            onOpenConnectModal={() => {}}
            onDisconnect={() => {}}
          />
        )
      );

      expect(connectedHtml).toContain('MetaMask: 0x1234...7890');
      expect(connectedHtml).toContain('Disconnect');
    });
  });

  describe('SafetyDisclosures', () => {
    it('renders operational safety banner', () => {
      const html = cleanHtml(renderToString(<SafetyDisclosures />));

      expect(html).toContain('OPERATIONAL NOTICE:');
      expect(html).toContain('National Weather Service');
    });
  });

  describe('TxStatusBar', () => {
    it('renders nothing on IDLE and status for active stages', () => {
      const idleHtml = cleanHtml(
        renderToString(
          <TxStatusBar
            stage="IDLE"
            hash={null}
            error={null}
            onDismiss={() => {}}
          />
        )
      );
      expect(idleHtml).toBe('');

      const submittedHtml = cleanHtml(
        renderToString(
          <TxStatusBar
            stage="SUBMITTED"
            hash="0xabcdef1234567890"
            error={null}
            onDismiss={() => {}}
          />
        )
      );
      expect(submittedHtml).toContain('data-transaction-phase="SUBMITTED"');
      expect(submittedHtml).toContain('tx-spinner');
      expect(submittedHtml).toContain('0xabcdef12...34567890');
      expect(submittedHtml).toContain('Copy hash');

      const phases = [
        'WAITING_FOR_WALLET',
        'WAITING_FOR_FINALITY',
        'VERIFYING_EXECUTION',
        'VERIFYING_READBACK',
        'SUCCESS',
        'REJECTED',
        'FAILED',
        'RECONCILIATION_REQUIRED',
      ] as const;
      for (const stage of phases) {
        const html = cleanHtml(renderToString(
          <TxStatusBar stage={stage} hash={stage === 'WAITING_FOR_WALLET' ? null : '0xabcdef1234567890'} error="Test error" onDismiss={() => {}} />
        ));
        expect(html).toContain(`data-transaction-phase="${stage}"`);
        if (['REJECTED', 'FAILED', 'RECONCILIATION_REQUIRED'].includes(stage)) {
          expect(html).toContain('role="alert"');
          expect(html).not.toContain('tx-spinner');
        }
      }
    });
  });

  describe('OperativeBulletin', () => {
    it('renders loading, empty, and populated bulletin states', () => {
      const loadingHtml = cleanHtml(
        renderToString(
          <OperativeBulletin chain={null} operativeRevision={null} isLoading={true} />
        )
      );
      expect(loadingHtml).toContain('Loading operative alert record...');

      const emptyHtml = cleanHtml(
        renderToString(
          <OperativeBulletin chain={null} operativeRevision={null} isLoading={false} />
        )
      );
      expect(emptyHtml).toContain('No alert chain selected');

      const mockChain: ChainRecord = {
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.root',
        active_urn: 'urn:oid:2.49.0.1.840.0.root',
        epoch: 1,
        operative_status: 'ACTIVE',
        revision_count: 1,
        sent: '2026-08-25T12:00:00Z',
        effective: '2026-08-25T12:00:00Z',
        onset: '',
        expires: '',
        ends: '',
        updated: '',
        zones: ['FLZ041'],
        zone_overlap: true,
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        response: 'Shelter',
        headline_excerpt: 'Tornado Warning Headline',
        source_url: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.root',
        created_at: '2026-08-25T12:00:00Z',
      };

      const mockRev: RevisionRecord = {
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.root',
        urn: 'urn:oid:2.49.0.1.840.0.root',
        parent_urn: '',
        revision_index: 0,
        epoch: 1,
        message_type: 'Alert',
        operative_status: 'ACTIVE',
        sent: '2026-08-25T12:00:00Z',
        effective: '',
        onset: '',
        expires: '',
        ends: '',
        updated: '',
        zones: ['FLZ041'],
        zone_overlap: true,
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        response: 'Shelter',
        instruction_change: 'REPLACED',
        headline_excerpt: 'Tornado Warning Headline',
        instruction_text: 'Take shelter in an interior hallway.',
        event_fingerprint: '0x1111111111111111111111111111111111111111111111111111111111111111',
        instruction_fingerprint: '0x2222222222222222222222222222222222222222222222222222222222222222',
        evidence_fingerprint: '0x3333333333333333333333333333333333333333333333333333333333333333',
        source_url: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.root',
        observed_at: '2026-08-25T12:00:00Z',
      };

      const populatedHtml = cleanHtml(
        renderToString(
          <OperativeBulletin chain={mockChain} operativeRevision={mockRev} isLoading={false} />
        )
      );

      expect(populatedHtml).toContain('ACTIVE ALERT');
      expect(populatedHtml).toContain('EPOCH 1');
      expect(populatedHtml).toContain('Tornado Warning Headline');
      expect(populatedHtml).toContain('Take shelter in an interior hallway.');
      expect(populatedHtml).toContain('FLZ041');
    });
  });

  describe('VerticalRevisionSpine', () => {
    it('renders revision nodes and timeline indicators', () => {
      const mockRevs: RevisionRecord[] = [
        {
          channel_id: 1,
          root_urn: 'urn:oid:2.49.0.1.840.0.root',
          urn: 'urn:oid:2.49.0.1.840.0.root',
          parent_urn: '',
          revision_index: 0,
          epoch: 1,
          message_type: 'Alert',
          operative_status: 'ACTIVE',
          sent: '2026-08-25T12:00:00Z',
          effective: '',
          onset: '',
          expires: '',
          ends: '',
          updated: '',
          zones: ['FLZ041'],
          zone_overlap: true,
          severity: 'Severe',
          urgency: 'Immediate',
          certainty: 'Observed',
          response: 'Shelter',
          instruction_change: 'UNCHANGED',
          headline_excerpt: 'Initial Alert',
          instruction_text: '',
          event_fingerprint: '',
          instruction_fingerprint: '',
          evidence_fingerprint: '',
          source_url: '',
          observed_at: '',
        },
      ];

      const html = cleanHtml(
        renderToString(
          <VerticalRevisionSpine
            revisions={mockRevs}
            activeRevisionIndex={0}
            acknowledgement={null}
            onSelectRevision={() => {}}
            isLoading={false}
          />
        )
      );

      expect(html).toContain('Revision Lineage Spine');
      expect(html).toContain('Revision #0');
      expect(html).toContain('Initial Alert');
    });
  });

  describe('ChannelRail', () => {
    it('renders channel cards with status and chain counts', () => {
      const channels: ChannelRecord[] = [
        {
          channel_id: 1,
          admin: '0x1111111111111111111111111111111111111111',
          name: 'Atlantic Coast Channel',
          client_nonce: 'nonce-1',
          zones: ['FLZ041', 'FLZ141'],
          status: 'ACTIVE',
          chain_count: 3,
          subscriber_count: 5,
          created_at: '2026-08-25T10:00:00Z',
          activated_at: '2026-08-25T10:05:00Z',
          closed_at: '',
        },
      ];

      const html = cleanHtml(
        renderToString(
          <ChannelRail
            channels={channels}
            selectedChannelId={1}
            onSelectChannel={() => {}}
            isLoading={false}
          />
        )
      );

      expect(html).toContain('#1 Atlantic Coast Channel');
      expect(html).toContain('ACTIVE');
      expect(html).toContain('3 chains');
    });
  });
});
