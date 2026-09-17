export type WalletBrand = 'MetaMask' | 'OKX Wallet' | 'Rabby';

export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, handler: (...args: unknown[]) => void) => void;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface DetectedWallet {
  id: string;
  brand: WalletBrand;
  name: string;
  icon?: string;
  provider: EIP1193Provider;
  isFallback: boolean;
}

export interface ConnectedWallet {
  address: string;
  chainId: number;
  brand: WalletBrand;
  provider: EIP1193Provider;
}

export type WalletPhase = 'DISCONNECTED' | 'DISCOVERING' | 'CHOOSER_OPEN' | 'CONNECTING' | 'CONNECTED' | 'WRONG_CHAIN' | 'ERROR';

export interface WalletSnapshot {
  phase: WalletPhase;
  detectedWallets: DetectedWallet[];
  activeWallet: ConnectedWallet | null;
  error: string | null;
}

export type TxStage =
  | 'IDLE'
  | 'WAITING_FOR_WALLET'
  | 'SUBMITTED'
  | 'WAITING_FOR_FINALITY'
  | 'VERIFYING_EXECUTION'
  | 'VERIFYING_READBACK'
  | 'SUCCESS'
  | 'REJECTED'
  | 'FAILED'
  | 'RECONCILIATION_REQUIRED';

export interface TxIntent {
  intentId: string;
  account: string;
  chainId: number;
  contractAddress: string;
  method: string;
  args: unknown[];
  createdAt: number;
}

export type JournalStatus = 'PENDING' | 'FINALIZED' | 'FAILED' | 'RECONCILED';

export interface TxJournalEntry extends TxIntent {
  hash: string;
  status: JournalStatus;
  error?: string;
  result?: unknown;
}

export interface WriteResult<T = unknown> {
  success: boolean;
  hash?: string;
  error?: string;
  data?: T;
}

export interface ConfigRecord {
  max_channels: number;
  max_chains_per_channel: number;
  max_revisions_per_chain: number;
  max_subscribers_per_channel: number;
  min_zones_per_channel: number;
  max_zones_per_channel: number;
  max_traversal_depth: number;
  max_audit_events_per_channel: number;
  max_nws_response_body_size: number;
  max_headline_excerpt_length: number;
  upgraders: string[];
}

export interface UpgradeStatusRecord {
  upgraders: string[];
  code_size_bytes: number;
  is_upgradable: boolean;
}

export type ChannelStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface ChannelRecord {
  channel_id: number;
  admin: string;
  name: string;
  client_nonce: string;
  zones: string[];
  status: ChannelStatus;
  chain_count: number;
  subscriber_count: number;
  created_at: string;
  activated_at: string;
  closed_at: string;
}

export type OperativeStatus =
  | 'ACTIVE'
  | 'UPDATED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'HOLD_UNRESOLVED';

export interface ChainRecord {
  channel_id: number;
  root_urn: string;
  active_urn: string;
  epoch: number;
  operative_status: OperativeStatus;
  revision_count: number;
  sent: string;
  effective: string;
  onset: string;
  expires: string;
  ends: string;
  updated: string;
  zones: string[];
  zone_overlap: boolean;
  severity: string;
  urgency: string;
  certainty: string;
  response: string;
  headline_excerpt: string;
  source_url: string;
  created_at: string;
}

export type MessageType = 'Alert' | 'Update' | 'Cancel' | 'UNKNOWN';
export type InstructionChange =
  | 'UNCHANGED'
  | 'NARROWED'
  | 'EXPANDED'
  | 'REPLACED'
  | 'REMOVED'
  | 'UNKNOWN';

export interface RevisionRecord {
  channel_id: number;
  root_urn: string;
  urn: string;
  parent_urn: string;
  revision_index: number;
  epoch: number;
  message_type: MessageType;
  operative_status: OperativeStatus;
  sent: string;
  effective: string;
  onset: string;
  expires: string;
  ends: string;
  updated: string;
  zones: string[];
  zone_overlap: boolean;
  severity: string;
  urgency: string;
  certainty: string;
  response: string;
  instruction_change: InstructionChange;
  headline_excerpt: string;
  instruction_text: string;
  event_fingerprint: string;
  instruction_fingerprint: string;
  evidence_fingerprint: string;
  source_url: string;
  observed_at: string;
}

export interface SubscriptionRecord {
  channel_id: number;
  account: string;
  is_subscribed: boolean;
  subscribed_at: string;
}

export type AckStatus = 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'STALE';

export interface AcknowledgementRecord {
  channel_id: number;
  root_urn: string;
  account: string;
  has_acknowledged: boolean;
  acknowledged_epoch: number;
  current_epoch: number;
  status: AckStatus;
  acknowledged_at: string;
}

export interface AdminNonceRecord {
  admin: string;
  client_nonce: string;
  is_used: boolean;
  channel_id: number;
}

export interface AuditEventRecord {
  channel_id: number;
  root_urn: string;
  event_type: string;
  candidate_urn: string;
  epoch: number;
  timestamp: string;
}

export interface PaginationParams {
  offset: number;
  limit: number;
}
