import {
  ConfigRecord,
  UpgradeStatusRecord,
  ChannelRecord,
  ChannelStatus,
  ChainRecord,
  OperativeStatus,
  RevisionRecord,
  MessageType,
  InstructionChange,
  SubscriptionRecord,
  AcknowledgementRecord,
  AckStatus,
  AdminNonceRecord,
  AuditEventRecord,
  TxJournalEntry,
  JournalStatus,
} from '../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(`[Parser Validation Error] ${message}`);
    this.name = 'ValidationError';
  }
}

// -------------------------------------------------------------------------
// Helper Validators
// -------------------------------------------------------------------------

export function parseRawJson(input: unknown, context: string): unknown {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      throw new ValidationError(`${context}: Failed to parse JSON string payload.`);
    }
  }
  if (input !== null && typeof input === 'object') {
    return input;
  }
  throw new ValidationError(`${context}: Expected JSON string or object, got ${typeof input}.`);
}

export function ensureObject(val: unknown, context: string): Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    throw new ValidationError(`${context}: Expected a non-null object, got ${typeof val}.`);
  }
  return val as Record<string, unknown>;
}

export function ensureArray(val: unknown, context: string): unknown[] {
  if (!Array.isArray(val)) {
    throw new ValidationError(`${context}: Expected an array, got ${typeof val}.`);
  }
  return val;
}

export function ensureInteger(val: unknown, min: number, max: number, context: string): number {
  if (typeof val === 'string') {
    const num = Number(val);
    if (!Number.isInteger(num)) {
      throw new ValidationError(`${context}: String "${val}" is not a valid integer.`);
    }
    val = num;
  }
  if (typeof val !== 'number' || !Number.isInteger(val) || !Number.isFinite(val)) {
    throw new ValidationError(`${context}: Expected an integer, got ${typeof val} (${String(val)}).`);
  }
  if (val < min || val > max) {
    throw new ValidationError(`${context}: Value ${val} out of allowed range [${min}, ${max}].`);
  }
  return val;
}

export function ensureString(val: unknown, minLength: number, maxLength: number, context: string): string {
  if (typeof val !== 'string') {
    throw new ValidationError(`${context}: Expected string, got ${typeof val}.`);
  }
  if (val.length < minLength || val.length > maxLength) {
    throw new ValidationError(`${context}: String length ${val.length} out of bounds [${minLength}, ${maxLength}].`);
  }
  return val;
}

export function ensureBoolean(val: unknown, context: string): boolean {
  if (typeof val !== 'boolean') {
    throw new ValidationError(`${context}: Expected boolean, got ${typeof val}.`);
  }
  return val;
}

export function ensureAddress(val: unknown, context: string): string {
  if (typeof val !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(val)) {
    throw new ValidationError(`${context}: Expected 0x-prefixed 40-hex address, got "${String(val)}".`);
  }
  return val.toLowerCase();
}

export function ensureStringArray(val: unknown, minItems: number, maxItems: number, context: string): string[] {
  const arr = ensureArray(val, context);
  if (arr.length < minItems || arr.length > maxItems) {
    throw new ValidationError(`${context}: Array length ${arr.length} out of bounds [${minItems}, ${maxItems}].`);
  }
  return arr.map((item, idx) => ensureString(item, 1, 512, `${context}[${idx}]`));
}

export function ensureAddressArray(val: unknown, context: string): string[] {
  const arr = ensureArray(val, context);
  return arr.map((item, idx) => ensureAddress(item, `${context}[${idx}]`));
}

// -------------------------------------------------------------------------
// Parsers for all 16 Contract Views
// -------------------------------------------------------------------------

/**
 * 1. parseConfigJson (get_config_json)
 */
export function parseConfigJson(raw: unknown): ConfigRecord {
  const data = ensureObject(parseRawJson(raw, 'get_config_json'), 'get_config_json');

  return {
    max_channels: ensureInteger(data.max_channels, 1, 1000, 'get_config_json.max_channels'),
    max_chains_per_channel: ensureInteger(data.max_chains_per_channel, 1, 10000, 'get_config_json.max_chains_per_channel'),
    max_revisions_per_chain: ensureInteger(data.max_revisions_per_chain, 1, 1000, 'get_config_json.max_revisions_per_chain'),
    max_subscribers_per_channel: ensureInteger(data.max_subscribers_per_channel, 1, 100000, 'get_config_json.max_subscribers_per_channel'),
    min_zones_per_channel: ensureInteger(data.min_zones_per_channel, 1, 100, 'get_config_json.min_zones_per_channel'),
    max_zones_per_channel: ensureInteger(data.max_zones_per_channel, 1, 100, 'get_config_json.max_zones_per_channel'),
    max_traversal_depth: ensureInteger(data.max_traversal_depth, 1, 100, 'get_config_json.max_traversal_depth'),
    max_audit_events_per_channel: ensureInteger(data.max_audit_events_per_channel, 1, 10000, 'get_config_json.max_audit_events_per_channel'),
    max_nws_response_body_size: ensureInteger(data.max_nws_response_body_size, 1000, 10000000, 'get_config_json.max_nws_response_body_size'),
    max_headline_excerpt_length: ensureInteger(data.max_headline_excerpt_length, 10, 1000, 'get_config_json.max_headline_excerpt_length'),
    upgraders: ensureAddressArray(data.upgraders, 'get_config_json.upgraders'),
  };
}

/**
 * 2. parseUpgradeStatusJson (get_upgrade_status_json)
 */
export function parseUpgradeStatusJson(raw: unknown): UpgradeStatusRecord {
  const data = ensureObject(parseRawJson(raw, 'get_upgrade_status_json'), 'get_upgrade_status_json');

  return {
    upgraders: ensureAddressArray(data.upgraders, 'get_upgrade_status_json.upgraders'),
    code_size_bytes: ensureInteger(data.code_size_bytes, 0, 100000000, 'get_upgrade_status_json.code_size_bytes'),
    is_upgradable: ensureBoolean(data.is_upgradable, 'get_upgrade_status_json.is_upgradable'),
  };
}

/**
 * 3. parseChannelCount (get_channel_count)
 */
export function parseChannelCount(raw: unknown): number {
  return ensureInteger(raw, 0, 100000, 'get_channel_count');
}

/**
 * 4. parseChannelJson (get_channel_json)
 */
export function parseChannelJson(raw: unknown): ChannelRecord {
  const data = ensureObject(parseRawJson(raw, 'get_channel_json'), 'get_channel_json');

  const statusRaw = ensureString(data.status, 1, 20, 'get_channel_json.status');
  if (statusRaw !== 'DRAFT' && statusRaw !== 'ACTIVE' && statusRaw !== 'CLOSED') {
    throw new ValidationError(`get_channel_json.status: Invalid channel status "${statusRaw}".`);
  }

  return {
    channel_id: ensureInteger(data.channel_id, 1, 100000, 'get_channel_json.channel_id'),
    admin: ensureAddress(data.admin, 'get_channel_json.admin'),
    name: ensureString(data.name, 1, 64, 'get_channel_json.name'),
    client_nonce: ensureString(data.client_nonce, 1, 64, 'get_channel_json.client_nonce'),
    zones: ensureStringArray(data.zones, 1, 5, 'get_channel_json.zones'),
    status: statusRaw as ChannelStatus,
    chain_count: ensureInteger(data.chain_count, 0, 100000, 'get_channel_json.chain_count'),
    subscriber_count: ensureInteger(data.subscriber_count, 0, 1000000, 'get_channel_json.subscriber_count'),
    created_at: ensureString(data.created_at, 1, 64, 'get_channel_json.created_at'),
    activated_at: typeof data.activated_at === 'string' ? data.activated_at : '',
    closed_at: typeof data.closed_at === 'string' ? data.closed_at : '',
  };
}

/**
 * 5. parseChannelsJson (get_channels_json)
 */
export function parseChannelsJson(raw: unknown): ChannelRecord[] {
  const arr = ensureArray(parseRawJson(raw, 'get_channels_json'), 'get_channels_json');
  return arr.map((item, idx) => {
    try {
      return parseChannelJson(item);
    } catch (err: unknown) {
      throw new ValidationError(`get_channels_json[${idx}]: ${(err as Error).message}`);
    }
  });
}

/**
 * 6. parseChainCount (get_chain_count)
 */
export function parseChainCount(raw: unknown): number {
  return ensureInteger(raw, 0, 100000, 'get_chain_count');
}

/**
 * 7. parseChainJson (get_chain_json)
 */
export function parseChainJson(raw: unknown): ChainRecord {
  const data = ensureObject(parseRawJson(raw, 'get_chain_json'), 'get_chain_json');

  const statusRaw = ensureString(data.operative_status, 1, 30, 'get_chain_json.operative_status');
  const validStatuses: OperativeStatus[] = ['ACTIVE', 'UPDATED', 'CANCELLED', 'EXPIRED', 'HOLD_UNRESOLVED'];
  if (!validStatuses.includes(statusRaw as OperativeStatus)) {
    throw new ValidationError(`get_chain_json.operative_status: Invalid status "${statusRaw}".`);
  }

  const rootUrn = ensureString(data.root_urn, 10, 256, 'get_chain_json.root_urn');
  const activeUrn = ensureString(data.active_urn, 10, 256, 'get_chain_json.active_urn');
  const sourceUrl = ensureString(data.source_url, 10, 512, 'get_chain_json.source_url');

  if (!sourceUrl.startsWith('https://')) {
    throw new ValidationError(`get_chain_json.source_url: Expected https:// URL, got "${sourceUrl}".`);
  }

  return {
    channel_id: ensureInteger(data.channel_id, 1, 100000, 'get_chain_json.channel_id'),
    root_urn: rootUrn,
    active_urn: activeUrn,
    epoch: ensureInteger(data.epoch, 1, 1000000, 'get_chain_json.epoch'),
    operative_status: statusRaw as OperativeStatus,
    revision_count: ensureInteger(data.revision_count, 1, 100000, 'get_chain_json.revision_count'),
    sent: ensureString(data.sent, 1, 64, 'get_chain_json.sent'),
    effective: typeof data.effective === 'string' ? data.effective : '',
    onset: typeof data.onset === 'string' ? data.onset : '',
    expires: typeof data.expires === 'string' ? data.expires : '',
    ends: typeof data.ends === 'string' ? data.ends : '',
    updated: typeof data.updated === 'string' ? data.updated : '',
    zones: ensureStringArray(data.zones, 0, 500, 'get_chain_json.zones'),
    zone_overlap: ensureBoolean(data.zone_overlap, 'get_chain_json.zone_overlap'),
    severity: typeof data.severity === 'string' ? data.severity : '',
    urgency: typeof data.urgency === 'string' ? data.urgency : '',
    certainty: typeof data.certainty === 'string' ? data.certainty : '',
    response: typeof data.response === 'string' ? data.response : '',
    headline_excerpt: typeof data.headline_excerpt === 'string' ? data.headline_excerpt : '',
    source_url: sourceUrl,
    created_at: ensureString(data.created_at, 1, 64, 'get_chain_json.created_at'),
  };
}

/**
 * 8. parseChainsJson (get_chains_json)
 */
export function parseChainsJson(raw: unknown): ChainRecord[] {
  const arr = ensureArray(parseRawJson(raw, 'get_chains_json'), 'get_chains_json');
  return arr.map((item, idx) => {
    try {
      return parseChainJson(item);
    } catch (err: unknown) {
      throw new ValidationError(`get_chains_json[${idx}]: ${(err as Error).message}`);
    }
  });
}

/**
 * 9. parseRevisionJson (get_revision_json & get_operative_alert_json)
 */
export function parseRevisionJson(raw: unknown): RevisionRecord {
  const data = ensureObject(parseRawJson(raw, 'get_revision_json'), 'get_revision_json');

  const msgTypeRaw = ensureString(data.message_type, 1, 20, 'get_revision_json.message_type');
  const validMsgTypes: MessageType[] = ['Alert', 'Update', 'Cancel', 'UNKNOWN'];
  const message_type = validMsgTypes.includes(msgTypeRaw as MessageType) ? (msgTypeRaw as MessageType) : 'UNKNOWN';

  const statusRaw = ensureString(data.operative_status, 1, 30, 'get_revision_json.operative_status');
  const validStatuses: OperativeStatus[] = ['ACTIVE', 'UPDATED', 'CANCELLED', 'EXPIRED', 'HOLD_UNRESOLVED'];
  if (!validStatuses.includes(statusRaw as OperativeStatus)) {
    throw new ValidationError(`get_revision_json.operative_status: Invalid status "${statusRaw}".`);
  }

  const instructionRaw = typeof data.instruction_change === 'string' ? data.instruction_change : 'UNKNOWN';
  const validInstructions: InstructionChange[] = ['UNCHANGED', 'NARROWED', 'EXPANDED', 'REPLACED', 'REMOVED', 'UNKNOWN'];
  const instruction_change = validInstructions.includes(instructionRaw as InstructionChange)
    ? (instructionRaw as InstructionChange)
    : 'UNKNOWN';

  const rootUrn = ensureString(data.root_urn, 10, 256, 'get_revision_json.root_urn');
  const urn = ensureString(data.urn, 10, 256, 'get_revision_json.urn');
  const sourceUrl = typeof data.source_url === 'string' ? data.source_url : '';

  return {
    channel_id: ensureInteger(data.channel_id, 1, 100000, 'get_revision_json.channel_id'),
    root_urn: rootUrn,
    urn: urn,
    parent_urn: typeof data.parent_urn === 'string' ? data.parent_urn : '',
    revision_index: ensureInteger(data.revision_index, 0, 100000, 'get_revision_json.revision_index'),
    epoch: ensureInteger(data.epoch, 1, 1000000, 'get_revision_json.epoch'),
    message_type,
    operative_status: statusRaw as OperativeStatus,
    sent: ensureString(data.sent, 1, 64, 'get_revision_json.sent'),
    effective: typeof data.effective === 'string' ? data.effective : '',
    onset: typeof data.onset === 'string' ? data.onset : '',
    expires: typeof data.expires === 'string' ? data.expires : '',
    ends: typeof data.ends === 'string' ? data.ends : '',
    updated: typeof data.updated === 'string' ? data.updated : '',
    zones: ensureStringArray(data.zones, 0, 500, 'get_revision_json.zones'),
    zone_overlap: ensureBoolean(data.zone_overlap, 'get_revision_json.zone_overlap'),
    severity: typeof data.severity === 'string' ? data.severity : '',
    urgency: typeof data.urgency === 'string' ? data.urgency : '',
    certainty: typeof data.certainty === 'string' ? data.certainty : '',
    response: typeof data.response === 'string' ? data.response : '',
    instruction_change,
    headline_excerpt: typeof data.headline_excerpt === 'string' ? data.headline_excerpt : '',
    instruction_text: typeof data.instruction_text === 'string' ? data.instruction_text : '',
    event_fingerprint: typeof data.event_fingerprint === 'string' ? data.event_fingerprint : '',
    instruction_fingerprint: typeof data.instruction_fingerprint === 'string' ? data.instruction_fingerprint : '',
    evidence_fingerprint: typeof data.evidence_fingerprint === 'string' ? data.evidence_fingerprint : '',
    source_url: sourceUrl,
    observed_at: typeof data.observed_at === 'string' ? data.observed_at : '',
  };
}

/**
 * 10. parseRevisionsJson (get_revisions_json)
 */
export function parseRevisionsJson(raw: unknown): RevisionRecord[] {
  const arr = ensureArray(parseRawJson(raw, 'get_revisions_json'), 'get_revisions_json');
  return arr.map((item, idx) => {
    try {
      return parseRevisionJson(item);
    } catch (err: unknown) {
      throw new ValidationError(`get_revisions_json[${idx}]: ${(err as Error).message}`);
    }
  });
}

/**
 * 11. parseOperativeAlertJson (get_operative_alert_json)
 */
export function parseOperativeAlertJson(raw: unknown): RevisionRecord {
  return parseRevisionJson(raw);
}

/**
 * 12. parseSubscriptionJson (get_subscription_json)
 */
export function parseSubscriptionJson(raw: unknown): SubscriptionRecord {
  const data = ensureObject(parseRawJson(raw, 'get_subscription_json'), 'get_subscription_json');

  return {
    channel_id: ensureInteger(data.channel_id, 1, 100000, 'get_subscription_json.channel_id'),
    account: ensureAddress(data.account, 'get_subscription_json.account'),
    is_subscribed: ensureBoolean(data.is_subscribed, 'get_subscription_json.is_subscribed'),
    subscribed_at: typeof data.subscribed_at === 'string' ? data.subscribed_at : '',
  };
}

/**
 * 13. parseAcknowledgementJson (get_acknowledgement_json)
 */
export function parseAcknowledgementJson(raw: unknown): AcknowledgementRecord {
  const data = ensureObject(parseRawJson(raw, 'get_acknowledgement_json'), 'get_acknowledgement_json');

  const statusRaw = ensureString(data.status, 1, 20, 'get_acknowledgement_json.status');
  const validStatuses: AckStatus[] = ['UNACKNOWLEDGED', 'ACKNOWLEDGED', 'STALE'];
  if (!validStatuses.includes(statusRaw as AckStatus)) {
    throw new ValidationError(`get_acknowledgement_json.status: Invalid status "${statusRaw}".`);
  }

  return {
    channel_id: ensureInteger(data.channel_id, 1, 100000, 'get_acknowledgement_json.channel_id'),
    root_urn: ensureString(data.root_urn, 10, 256, 'get_acknowledgement_json.root_urn'),
    account: ensureAddress(data.account, 'get_acknowledgement_json.account'),
    has_acknowledged: ensureBoolean(data.has_acknowledged, 'get_acknowledgement_json.has_acknowledged'),
    acknowledged_epoch: ensureInteger(data.acknowledged_epoch, 0, 1000000, 'get_acknowledgement_json.acknowledged_epoch'),
    current_epoch: ensureInteger(data.current_epoch, 1, 1000000, 'get_acknowledgement_json.current_epoch'),
    status: statusRaw as AckStatus,
    acknowledged_at: typeof data.acknowledged_at === 'string' ? data.acknowledged_at : '',
  };
}

/**
 * 14. parseAdminNonceJson (get_admin_nonce_json)
 */
export function parseAdminNonceJson(raw: unknown): AdminNonceRecord {
  const data = ensureObject(parseRawJson(raw, 'get_admin_nonce_json'), 'get_admin_nonce_json');

  return {
    admin: ensureAddress(data.admin, 'get_admin_nonce_json.admin'),
    client_nonce: ensureString(data.client_nonce, 1, 64, 'get_admin_nonce_json.client_nonce'),
    is_used: ensureBoolean(data.is_used, 'get_admin_nonce_json.is_used'),
    channel_id: ensureInteger(data.channel_id, 0, 100000, 'get_admin_nonce_json.channel_id'),
  };
}

/**
 * 15. parseAuditEventsJson (get_audit_events_json)
 */
export function parseAuditEventsJson(raw: unknown): AuditEventRecord[] {
  const arr = ensureArray(parseRawJson(raw, 'get_audit_events_json'), 'get_audit_events_json');
  return arr.map((item, idx) => {
    const data = ensureObject(item, `get_audit_events_json[${idx}]`);
    return {
      channel_id: ensureInteger(data.channel_id, 1, 100000, `get_audit_events_json[${idx}].channel_id`),
      root_urn: ensureString(data.root_urn, 0, 256, `get_audit_events_json[${idx}].root_urn`),
      event_type: ensureString(data.event_type, 1, 64, `get_audit_events_json[${idx}].event_type`),
      candidate_urn: typeof data.candidate_urn === 'string' ? data.candidate_urn : '',
      epoch: ensureInteger(data.epoch, 0, 1000000, `get_audit_events_json[${idx}].epoch`),
      timestamp: ensureString(data.timestamp, 1, 64, `get_audit_events_json[${idx}].timestamp`),
    };
  });
}

/**
 * 16. parseSourceUrl (get_source_url)
 */
export function parseSourceUrl(raw: unknown): string {
  const url = ensureString(raw, 10, 512, 'get_source_url');
  if (!url.startsWith('https://api.weather.gov/alerts/')) {
    throw new ValidationError(`get_source_url: Expected URL starting with https://api.weather.gov/alerts/, got "${url}".`);
  }
  return url;
}

/**
 * Runtime-Safe Transaction Journal Validator
 */
export function parseTxJournalEntries(raw: unknown): TxJournalEntry[] {
  const arr = ensureArray(parseRawJson(raw, 'tx_journal'), 'tx_journal');
  const validStatuses: JournalStatus[] = ['PENDING', 'FINALIZED', 'FAILED', 'RECONCILED'];

  return arr.map((item, idx) => {
    const obj = ensureObject(item, `tx_journal[${idx}]`);
    const status = ensureString(obj.status, 1, 20, `tx_journal[${idx}].status`);
    if (!validStatuses.includes(status as JournalStatus)) {
      throw new ValidationError(`tx_journal[${idx}].status: Invalid status "${status}".`);
    }

    return {
      intentId: ensureString(obj.intentId, 1, 128, `tx_journal[${idx}].intentId`),
      account: ensureAddress(obj.account, `tx_journal[${idx}].account`),
      chainId: ensureInteger(obj.chainId, 1, 10000000, `tx_journal[${idx}].chainId`),
      contractAddress: ensureAddress(obj.contractAddress, `tx_journal[${idx}].contractAddress`),
      method: ensureString(obj.method, 1, 64, `tx_journal[${idx}].method`),
      args: ensureArray(obj.args, `tx_journal[${idx}].args`),
      createdAt: ensureInteger(obj.createdAt, 0, Number.MAX_SAFE_INTEGER, `tx_journal[${idx}].createdAt`),
      hash: typeof obj.hash === 'string' ? obj.hash : '',
      status: status as JournalStatus,
      error: typeof obj.error === 'string' ? obj.error : undefined,
      result: obj.result,
    };
  });
}
