import { describe, it, expect } from 'vitest';
import {
  parseConfigJson,
  parseUpgradeStatusJson,
  parseChannelCount,
  parseChannelJson,
  parseChannelsJson,
  parseChainCount,
  parseChainJson,
  parseChainsJson,
  parseRevisionJson,
  parseRevisionsJson,
  parseOperativeAlertJson,
  parseSubscriptionJson,
  parseAcknowledgementJson,
  parseAdminNonceJson,
  parseAuditEventsJson,
  parseSourceUrl,
  parseTxJournalEntries,
  ValidationError,
} from '../parsers/contractParsers';

describe('Schema-Validated Contract View Parsers', () => {
  describe('1. parseConfigJson (get_config_json)', () => {
    it('parses valid config object and JSON string', () => {
      const valid = {
        max_channels: 10,
        max_chains_per_channel: 20,
        max_revisions_per_chain: 15,
        max_subscribers_per_channel: 500,
        min_zones_per_channel: 1,
        max_zones_per_channel: 5,
        max_traversal_depth: 10,
        max_audit_events_per_channel: 100,
        max_nws_response_body_size: 65536,
        max_headline_excerpt_length: 280,
        upgraders: ['0x1111111111111111111111111111111111111111'],
      };
      const result = parseConfigJson(JSON.stringify(valid));
      expect(result.max_channels).toBe(10);
      expect(result.upgraders[0]).toBe('0x1111111111111111111111111111111111111111');
    });

    it('rejects malformed json and out-of-bound numbers', () => {
      expect(() => parseConfigJson('{ invalid json')).toThrow(ValidationError);
      expect(() => parseConfigJson({ max_channels: -1 })).toThrow(ValidationError);
      expect(() => parseConfigJson({ max_channels: 'not-a-number' })).toThrow(ValidationError);
      expect(() => parseConfigJson({ max_channels: 1.5 })).toThrow(ValidationError);
      expect(() => parseConfigJson(null)).toThrow(ValidationError);
    });
  });

  describe('2. parseUpgradeStatusJson (get_upgrade_status_json)', () => {
    it('parses valid upgrade status', () => {
      const valid = {
        upgraders: ['0x2222222222222222222222222222222222222222'],
        code_size_bytes: 4096,
        is_upgradable: true,
      };
      const result = parseUpgradeStatusJson(valid);
      expect(result.is_upgradable).toBe(true);
      expect(result.code_size_bytes).toBe(4096);
    });

    it('rejects invalid upgrader address or non-boolean upgradable', () => {
      expect(() =>
        parseUpgradeStatusJson({
          upgraders: ['0xinvalid'],
          code_size_bytes: 10,
          is_upgradable: true,
        })
      ).toThrow(ValidationError);

      expect(() =>
        parseUpgradeStatusJson({
          upgraders: [],
          code_size_bytes: 10,
          is_upgradable: 'true',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('3. parseChannelCount (get_channel_count)', () => {
    it('parses valid count', () => {
      expect(parseChannelCount(5)).toBe(5);
      expect(parseChannelCount('10')).toBe(10);
      expect(parseChannelCount(0)).toBe(0);
    });

    it('rejects negative numbers and non-integers', () => {
      expect(() => parseChannelCount(-1)).toThrow(ValidationError);
      expect(() => parseChannelCount(3.14)).toThrow(ValidationError);
      expect(() => parseChannelCount('abc')).toThrow(ValidationError);
    });
  });

  describe('4. parseChannelJson & 5. parseChannelsJson (get_channel_json, get_channels_json)', () => {
    it('parses valid channel records', () => {
      const validChannel = {
        channel_id: 1,
        admin: '0x3333333333333333333333333333333333333333',
        name: 'Atlantic Coast Channel',
        client_nonce: 'nonce-123',
        zones: ['FLZ041', 'FLZ141'],
        status: 'ACTIVE',
        chain_count: 2,
        subscriber_count: 10,
        created_at: '2026-08-25T10:00:00Z',
        activated_at: '2026-08-25T10:05:00Z',
        closed_at: '',
      };
      const single = parseChannelJson(validChannel);
      expect(single.name).toBe('Atlantic Coast Channel');
      expect(single.status).toBe('ACTIVE');

      const list = parseChannelsJson([validChannel]);
      expect(list.length).toBe(1);
    });

    it('rejects invalid channel status', () => {
      expect(() =>
        parseChannelJson({
          channel_id: 1,
          admin: '0x3333333333333333333333333333333333333333',
          name: 'Test',
          client_nonce: 'nonce-1',
          zones: ['FLZ041'],
          status: 'INVALID_STATUS',
          chain_count: 0,
          subscriber_count: 0,
          created_at: '2026-08-25T10:00:00Z',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('6. parseChainCount & 7. parseChainJson & 8. parseChainsJson', () => {
    it('parses valid chain count and chain records', () => {
      expect(parseChainCount(3)).toBe(3);
      expect(parseChainCount('12')).toBe(12);

      const validChain = {
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.965b9385b0d6',
        active_urn: 'urn:oid:2.49.0.1.840.0.965b9385b0d6',
        epoch: 1,
        operative_status: 'ACTIVE',
        revision_count: 1,
        sent: '2026-08-25T12:00:00Z',
        effective: '2026-08-25T12:00:00Z',
        onset: '',
        expires: '2026-08-25T18:00:00Z',
        ends: '',
        updated: '',
        zones: ['FLZ041'],
        zone_overlap: true,
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        response: 'Shelter',
        headline_excerpt: 'Tornado Warning for Coastal Florida',
        source_url: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.965b9385b0d6',
        created_at: '2026-08-25T12:01:00Z',
      };
      const chain = parseChainJson(validChain);
      expect(chain.operative_status).toBe('ACTIVE');
      expect(chain.epoch).toBe(1);

      const chains = parseChainsJson([validChain]);
      expect(chains.length).toBe(1);
    });

    it('rejects insecure non-https source_url', () => {
      expect(() =>
        parseChainJson({
          channel_id: 1,
          root_urn: 'urn:oid:2.49.0.1.840.0.965b',
          active_urn: 'urn:oid:2.49.0.1.840.0.965b',
          epoch: 1,
          operative_status: 'ACTIVE',
          revision_count: 1,
          sent: '2026-08-25T12:00:00Z',
          source_url: 'http://insecure-api.weather.gov',
          created_at: '2026-08-25T12:00:00Z',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('9. parseRevisionJson, 10. parseRevisionsJson & 11. parseOperativeAlertJson', () => {
    it('parses valid revision records with semantic instruction changes', () => {
      const validRev = {
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.965b',
        urn: 'urn:oid:2.49.0.1.840.0.965b',
        parent_urn: '',
        revision_index: 0,
        epoch: 1,
        message_type: 'Alert',
        operative_status: 'ACTIVE',
        sent: '2026-08-25T12:00:00Z',
        zones: ['FLZ041'],
        zone_overlap: true,
        instruction_change: 'REPLACED',
        headline_excerpt: 'Tornado Warning',
        instruction_text: 'Take immediate shelter in an interior room.',
        event_fingerprint: '0xaaa',
        instruction_fingerprint: '0xbbb',
        evidence_fingerprint: '0xccc',
        source_url: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.965b',
        observed_at: '2026-08-25T12:01:00Z',
      };
      const rev = parseRevisionJson(validRev);
      expect(rev.message_type).toBe('Alert');
      expect(rev.instruction_change).toBe('REPLACED');

      const op = parseOperativeAlertJson(validRev);
      expect(op.epoch).toBe(1);

      const revs = parseRevisionsJson([validRev]);
      expect(revs.length).toBe(1);
    });
  });

  describe('12. parseSubscriptionJson & 13. parseAcknowledgementJson', () => {
    it('parses subscriptions and acknowledgements correctly', () => {
      const sub = parseSubscriptionJson({
        channel_id: 1,
        account: '0x4444444444444444444444444444444444444444',
        is_subscribed: true,
        subscribed_at: '2026-08-25T12:00:00Z',
      });
      expect(sub.is_subscribed).toBe(true);

      const ack = parseAcknowledgementJson({
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.965b',
        account: '0x4444444444444444444444444444444444444444',
        has_acknowledged: true,
        acknowledged_epoch: 2,
        current_epoch: 2,
        status: 'ACKNOWLEDGED',
        acknowledged_at: '2026-08-25T12:30:00Z',
      });
      expect(ack.status).toBe('ACKNOWLEDGED');
      expect(ack.acknowledged_epoch).toBe(2);
    });
  });

  describe('14. parseAdminNonceJson, 15. parseAuditEventsJson & 16. parseSourceUrl', () => {
    it('parses admin nonce record', () => {
      const nonce = parseAdminNonceJson({
        admin: '0x5555555555555555555555555555555555555555',
        client_nonce: 'nonce-abc',
        is_used: true,
        channel_id: 2,
      });
      expect(nonce.is_used).toBe(true);
      expect(nonce.channel_id).toBe(2);
    });

    it('parses audit events list', () => {
      const events = parseAuditEventsJson([
        {
          channel_id: 1,
          root_urn: 'urn:oid:2.49.0.1.840.0.965b',
          event_type: 'VALID_UPDATE',
          candidate_urn: 'urn:oid:2.49.0.1.840.0.candidate',
          epoch: 2,
          timestamp: '2026-08-25T12:30:00Z',
        },
      ]);
      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('VALID_UPDATE');
    });

    it('parses source URL with strict weather.gov prefix', () => {
      const url = parseSourceUrl('https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.965b');
      expect(url).toBe('https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.965b');

      expect(() => parseSourceUrl('https://evil-site.com/alerts/123')).toThrow(ValidationError);
    });
  });

  describe('17. parseTxJournalEntries', () => {
    it('parses valid journal entries', () => {
      const validEntries = [
        {
          intentId: 'intent-1',
          account: '0x1111111111111111111111111111111111111111',
          chainId: 61997,
          contractAddress: '0x2222222222222222222222222222222222222222',
          method: 'create_channel',
          args: ['nonce-1', 'Test Channel', 'FLZ041'],
          createdAt: 1700000000000,
          hash: '0xhash1',
          status: 'PENDING',
        },
      ];
      const parsed = parseTxJournalEntries(validEntries);
      expect(parsed.length).toBe(1);
      expect(parsed[0].status).toBe('PENDING');
    });

    it('rejects journal entries with invalid status or bad addresses', () => {
      const invalid = [
        {
          intentId: 'intent-1',
          account: '0xinvalid',
          chainId: 61997,
          contractAddress: '0x2222222222222222222222222222222222222222',
          method: 'create_channel',
          args: [],
          createdAt: 1700000000000,
          hash: '',
          status: 'UNKNOWN_STATUS',
        },
      ];
      expect(() => parseTxJournalEntries(invalid)).toThrow(ValidationError);
    });
  });
});
