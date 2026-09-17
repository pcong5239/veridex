import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { executionResultNumberToName, transactionsStatusNumberToName } from 'genlayer-js/types';
import {
  ConnectedWallet,
  TxIntent,
  TxJournalEntry,
  TxStage,
  WriteResult,
  JournalStatus,
  ChannelRecord,
  ChainRecord,
  RevisionRecord,
  SubscriptionRecord,
  AcknowledgementRecord,
} from '../types';
import { appConfig } from '../config';
import { parseTxJournalEntries } from '../parsers/contractParsers';
import { rpcClient } from './rpcClient';

const JOURNAL_STORAGE_KEY = 'veridex_tx_journal_v1';

export type ReceiptClassification =
  | { type: 'NON_TERMINAL'; status: string }
  | { type: 'FINALIZED_SUCCESS'; result?: unknown }
  | { type: 'FINALIZED_FAILURE'; error: string }
  | { type: 'TERMINAL_AMBIGUOUS'; rawReceipt: unknown };

function safeJsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function getWriteProvider(wallet: ConnectedWallet): ConnectedWallet['provider'] {
  if (wallet.brand !== 'OKX Wallet') return wallet.provider;
  return {
    request: ({ method, params }) => {
      if (method !== 'eth_sendTransaction' || !Array.isArray(params) ||
          typeof params[0] !== 'object' || params[0] === null) {
        return wallet.provider.request({ method, params });
      }
      const transaction = { ...(params[0] as Record<string, unknown>) };
      delete transaction.nonce;
      delete transaction.type;
      delete transaction.chainId;
      delete transaction.gasPrice;
      return wallet.provider.request({ method, params: [transaction] });
    },
  };
}

function publicWriteError(message: string, walletBrand: ConnectedWallet['brand'], userRejected: boolean): string {
  if (userRejected) return 'The wallet request was rejected. No transaction was submitted.';
  if (/invalid (transaction )?params|invalid transaction parameters|internal error|thông số giao dịch/i.test(message)) {
    return `${walletBrand} could not prepare this transaction. No transaction was submitted. Reconnect the wallet and try again.`;
  }
  return message.replace(/\s*Version:\s*viem@[^\s]+\s*$/i, '').trim();
}

function isDefinitePreBroadcastError(message: string, code?: unknown): boolean {
  return Number(code) === -32602 ||
    /invalid (transaction )?params|invalid transaction parameters|thông số giao dịch không hợp lệ/i.test(message);
}

export class WriteManager {
  private currentStage: TxStage = 'IDLE';
  private currentHash: string | null = null;
  private currentError: string | null = null;
  private listeners: Array<() => void> = [];
  private isProcessing = false;
  private volatilePendingLocks = new Set<string>();
  private monitoringController: AbortController | null = null;
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.reconcileJournal();
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  public getStage(): TxStage {
    return this.currentStage;
  }

  public getHash(): string | null {
    return this.currentHash;
  }

  public getError(): string | null {
    return this.currentError;
  }

  public resetState(): void {
    if (!this.isProcessing) {
      this.currentStage = 'IDLE';
      this.currentHash = null;
      this.currentError = null;
      this.notify();
    }
  }

  public cancelMonitoring(): void {
    this.monitoringController?.abort();
    this.monitoringController = null;
  }

  private abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('The operation was aborted.', 'AbortError')); }, { once: true });
    });
  }

  public probeStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__veridex_storage_probe__';
      window.localStorage.setItem(testKey, 'probe_val');
      const val = window.localStorage.getItem(testKey);
      window.localStorage.removeItem(testKey);
      return val === 'probe_val';
    } catch {
      return false;
    }
  }

  public loadJournal(): TxJournalEntry[] {
    if (!this.probeStorage()) throw new Error('Fail-closed: Local storage is unavailable.');
    const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    try {
      return parseTxJournalEntries(raw);
    } catch {
      throw new Error('Fail-closed: Transaction journal is malformed.');
    }
  }

  public saveJournal(entries: TxJournalEntry[]): boolean {
    if (!this.probeStorage()) return false;
    try {
      window.localStorage.setItem(JOURNAL_STORAGE_KEY, safeJsonStringify(entries.slice(-20)));
      return true;
    } catch {
      return false;
    }
  }

  public getJournal(): TxJournalEntry[] {
    try {
      return this.loadJournal();
    } catch {
      return [];
    }
  }

  public clearJournal(): void {
    if (this.probeStorage()) {
      window.localStorage.removeItem(JOURNAL_STORAGE_KEY);
      this.volatilePendingLocks.clear();
      this.notify();
    }
  }

  public async reconcileJournal(): Promise<void> {
    let journal: TxJournalEntry[];
    try {
      journal = this.loadJournal();
    } catch {
      return;
    }
    let journalChanged = false;
    for (const entry of journal) {
      if (entry.status === 'PENDING' && !entry.hash && isDefinitePreBroadcastError(entry.error || '')) {
        entry.status = 'FAILED';
        entry.error = 'The wallet could not prepare this transaction. No transaction was submitted.';
        journalChanged = true;
      }
    }
    if (journalChanged) this.saveJournal(journal);
    const pending = journal.filter((e) => e.status === 'PENDING' && e.hash);
    if (pending.length === 0) return;

    for (const entry of pending) {
      try {
        const rawClient = rpcClient.getRawClient();
        const receipt = await rawClient.getTransaction({
          hash: entry.hash as Parameters<typeof rawClient.getTransaction>[0]['hash'],
        });

        const classified = this.classifyReceipt(receipt);
        if (classified.type === 'FINALIZED_SUCCESS') {
          entry.status = 'FINALIZED';
        } else if (classified.type === 'FINALIZED_FAILURE') {
          entry.status = 'FAILED';
          entry.error = classified.error;
        }
      } catch {
        // Leave pending for subsequent reconciliation
      }
    }
    this.saveJournal(journal);
    this.notify();
  }

  public async checkPendingTx(hash: string): Promise<JournalStatus> {
    const journal = this.loadJournal();
    const entry = journal.find((e) => e.hash === hash);
    if (!entry) {
      throw new Error(`Transaction hash ${hash} not found in local journal.`);
    }

    try {
      const rawClient = rpcClient.getRawClient();
      const receipt = await rawClient.getTransaction({
        hash: hash as Parameters<typeof rawClient.getTransaction>[0]['hash'],
      });

      const classified = this.classifyReceipt(receipt);
      if (classified.type === 'FINALIZED_SUCCESS') {
        entry.status = 'FINALIZED';
        this.saveJournal(journal);
        this.notify();
        return 'FINALIZED';
      }
      if (classified.type === 'FINALIZED_FAILURE') {
        entry.status = 'FAILED';
        entry.error = classified.error;
        this.saveJournal(journal);
        this.notify();
        return 'FAILED';
      }
      return 'PENDING';
    } catch {
      return entry.status;
    }
  }

  public classifyReceipt(receipt: unknown): ReceiptClassification {
    if (!receipt || typeof receipt !== 'object') {
      return { type: 'NON_TERMINAL', status: 'NULL_OR_PENDING' };
    }

    const r = receipt as {
      status?: unknown;
      statusName?: string;
      txExecutionResultName?: string;
      txExecutionResult?: unknown;
      execution_result?: { status?: string; error?: string; result?: unknown };
      error?: string;
    };

    const statusValue = typeof r.status === 'number'
      ? (transactionsStatusNumberToName as Record<string, string>)[String(r.status)] ?? r.status
      : r.status;
    const executionValue = typeof r.txExecutionResult === 'number'
      ? (executionResultNumberToName as Record<string, string>)[String(r.txExecutionResult)] ?? r.txExecutionResult
      : r.txExecutionResult;
    const status = String(r.statusName ?? statusValue ?? '').toUpperCase();
    const execution = String(r.txExecutionResultName ?? executionValue ?? '').toUpperCase();

    // The browser SDK can expose the raw numeric enum fields before its
    // derived names are attached. GenLayer status 7 + execution result 1 is
    // the same FINALIZED / FINISHED_WITH_RETURN pair returned by the SDK CLI.
    if (r.status === 7 && r.txExecutionResult === 1) {
      return { type: 'FINALIZED_SUCCESS' };
    }

    const hasCurrentSdkFields = r.statusName !== undefined || r.txExecutionResultName !== undefined || r.txExecutionResult !== undefined;
    if (hasCurrentSdkFields && (status === 'ACCEPTED' || status === 'FINALIZED')) {
      if (execution === 'FINISHED_WITH_RETURN') return { type: 'FINALIZED_SUCCESS' };
      if (execution === 'NOT_VOTED' || execution === 'UNDETERMINED' || execution === '') {
        return { type: 'NON_TERMINAL', status: `${status}:${execution || 'PENDING_EXECUTION'}` };
      }
      if (['FINISHED_WITH_ERROR', 'TIMEOUT', 'NONDET_DISAGREE', 'DETERMINISTIC_VIOLATION'].includes(execution)) {
        return { type: 'FINALIZED_FAILURE', error: r.error || `Transaction execution ended with ${execution}` };
      }
      return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
    }

    if (['UNINITIALIZED', 'PENDING', 'PROPOSED', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'UNDETERMINED', 'APPEAL_REVEALING', 'APPEAL_COMMITTING', 'LEADER_REVEALING', ''].includes(status)) {
      return { type: 'NON_TERMINAL', status: status || 'PENDING' };
    }

    if (status === 'FINALIZED') {
      if (r.execution_result) {
        const execStatus = (r.execution_result.status || '').toUpperCase();
        if (execStatus === 'SUCCESS') {
          return { type: 'FINALIZED_SUCCESS', result: r.execution_result.result };
        }
        if (execStatus === 'ERROR' || execStatus === 'FAILED') {
          const execErr = r.execution_result.error || r.error || 'Transaction finalized with execution error';
          return { type: 'FINALIZED_FAILURE', error: execErr };
        }
        return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
      }
      return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
    }

    if (status === 'SUCCESS') return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };

    if (status === 'REJECTED' || status === 'FAILED' || status === 'ERROR') {
      return { type: 'FINALIZED_FAILURE', error: r.error || `Transaction failed with status ${status}` };
    }

    return { type: 'TERMINAL_AMBIGUOUS', rawReceipt: receipt };
  }

  public async executeWrite<T = unknown>(
    wallet: ConnectedWallet,
    method: string,
    args: unknown[],
    readbackFn: () => Promise<T>,
    verifyReadback: (data: T) => boolean = (data) => data !== undefined && data !== null
  ): Promise<WriteResult<T>> {
    await this.ready;

    // 1. Single-Flight Lock
    if (this.isProcessing) {
      throw new Error('Another transaction is currently in flight. Please wait.');
    }

    if (!appConfig.isConfigured) {
      throw new Error(appConfig.configError || 'Contract not configured.');
    }

    // 2. Storage probe check
    if (!this.probeStorage()) {
      throw new Error('Fail-closed: Local storage is unavailable for transaction intent journaling.');
    }

    // 3. Prevent duplicate in-flight submission for identical intent
    const lockKey = `${wallet.address.toLowerCase()}:${wallet.chainId}:${appConfig.contractAddress.toLowerCase()}:${method}:${safeJsonStringify(args)}`;
    if (this.volatilePendingLocks.has(lockKey)) {
      throw new Error('Identical transaction intent is already pending in volatile lock.');
    }

    this.isProcessing = true;
    this.volatilePendingLocks.add(lockKey);
    this.currentStage = 'WAITING_FOR_WALLET';
    this.currentHash = null;
    this.currentError = null;
    this.notify();

    const intentId = `intent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const intent: TxIntent = {
      intentId,
      account: wallet.address,
      chainId: wallet.chainId,
      contractAddress: appConfig.contractAddress,
      method,
      args,
      createdAt: Date.now(),
    };

    let journal: TxJournalEntry[];
    try {
      journal = this.loadJournal();
    } catch (error) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw error;
    }

    const scopedPending = journal.find(
      (entry) =>
        entry.status === 'PENDING' &&
        entry.account.toLowerCase() === wallet.address.toLowerCase() &&
        entry.chainId === wallet.chainId &&
        entry.contractAddress.toLowerCase() === appConfig.contractAddress.toLowerCase()
    );

    const existing = journal.find(
      (entry) =>
        entry.status === 'PENDING' &&
        entry.account.toLowerCase() === wallet.address.toLowerCase() &&
        entry.chainId === wallet.chainId &&
        entry.contractAddress.toLowerCase() === appConfig.contractAddress.toLowerCase() &&
        entry.method === method &&
        safeJsonStringify(entry.args) === safeJsonStringify(args)
    );

    if (scopedPending && !existing) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error(`Transaction ${scopedPending.hash} is still unresolved. Reconcile that hash before submitting another write.`);
    }

    if (existing) {
      try {
        const recovered = await readbackFn();
        if (verifyReadback(recovered)) {
          existing.status = 'RECONCILED';
          existing.result = recovered;
          if (!this.saveJournal(journal)) {
            throw new Error('Recovered transaction, but journal cleanup could not be persisted. Retry remains blocked.');
          }
          this.volatilePendingLocks.delete(lockKey);
          this.isProcessing = false;
          return { success: true, hash: existing.hash || undefined, data: recovered };
        }
      } catch (error) {
        this.volatilePendingLocks.delete(lockKey);
        this.isProcessing = false;
        throw error;
      }
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error(`This transaction intent is still unresolved${existing.hash ? ` (${existing.hash})` : ''}. Verify authoritative state before retrying.`);
    }

    const journalEntry: TxJournalEntry = {
      ...intent,
      hash: '',
      status: 'PENDING',
    };
    journal.push(journalEntry);
    const saved = this.saveJournal(journal);
    if (!saved) {
      this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
      throw new Error('Fail-closed: Failed to persist transaction intent to journal before signing.');
    }

    let hashExists = false;
    let submissionAttempted = false;
    let confirmedFailure = false;
    let releaseLock = true;

    try {
      this.currentStage = 'WAITING_FOR_WALLET';
      this.notify();

      // 4. Dedicated Provider Write Routing
      const writeClient = createClient({
        chain: studioDevnet,
        provider: getWriteProvider(wallet) as any,
        account: wallet.address as `0x${string}`,
      });
      const liveChain = await wallet.provider.request({ method: 'eth_chainId' });
      const liveAccounts = await wallet.provider.request({ method: 'eth_accounts' }) as string[];
      if (typeof liveChain !== 'string' || parseInt(liveChain, 16) !== appConfig.chainId || liveAccounts?.[0]?.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error('Wallet provider/account/network changed; reconnect before signing.');
      }

      const writeRequest = {
        address: appConfig.contractAddress as `0x${string}`,
        functionName: method,
        args: args as any,
        value: 0n,
      };
      const initialEstimate = await writeClient.estimateTransactionFeesForWrite(writeRequest);
      const initialFees = {
        distribution: initialEstimate.distribution,
        messageAllocations: initialEstimate.messageAllocations,
        feeValue: initialEstimate.feeValue,
      };
      const simulation = await writeClient.simulateWriteContract({ ...writeRequest, fees: initialFees, includeReceipt: true });
      const estimate = await writeClient.estimateTransactionFeesFromSimulation({ simulation });
      const exactFees = {
        distribution: estimate.distribution,
        messageAllocations: estimate.messageAllocations,
        feeValue: estimate.feeValue,
      };
      submissionAttempted = true;
      const hash = await writeClient.writeContract({ ...writeRequest, fees: exactFees });

      this.currentHash = hash;
      hashExists = true;
      releaseLock = false;
      this.currentStage = 'SUBMITTED';
      journalEntry.hash = hash;

      if (!this.saveJournal(journal)) {
        throw new Error(`Transaction ${hash} was submitted, but its journal could not be persisted. Retry is blocked; reconcile this hash.`);
      }
      this.notify();

      // 5. Polling for Finalization via Receipt Classifier
      this.currentStage = 'WAITING_FOR_FINALITY';
      this.notify();

      this.monitoringController = new AbortController();
      const pollResult = await this.pollFinalization(hash, this.monitoringController.signal);

      if (pollResult.type === 'TERMINAL_AMBIGUOUS') {
        throw new Error(`Transaction ${hash} finalized without a verifiable execution result. Reconciliation is required.`);
      }

      // 6. Authoritative Readback & Expected State Validation
      this.currentStage = 'VERIFYING_READBACK';
      this.notify();

      // Invalidate read cache so fresh state is read
      rpcClient.invalidateCache();

      let readbackData: T | undefined;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          readbackData = await readbackFn();
          if (readbackData !== undefined && readbackData !== null && verifyReadback(readbackData)) {
            break;
          }
        } catch {
          if (attempt === 4) {
            throw new Error('Authoritative readback failed after transaction finalization.');
          }
          await new Promise((res) => setTimeout(res, 1200));
        }
      }

      if (readbackData === undefined || readbackData === null || !verifyReadback(readbackData)) {
        throw new Error(`Transaction ${hash} finalized, but authoritative readback does not prove the expected state.`);
      }

      this.currentStage = 'SUCCESS';
      journalEntry.status = 'FINALIZED';
      journalEntry.result = readbackData;
      const cleanupSaved = this.saveJournal(journal);
      releaseLock = cleanupSaved;
      this.notify();

      return {
        success: true,
        hash,
        data: readbackData,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorCode = typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: unknown }).code
        : undefined;
      const userRejected = !hashExists &&
        (Number(errorCode) === 4001 || /user rejected|user denied|user cancelled/i.test(errMsg));
      const definitePreBroadcastFailure = !hashExists && isDefinitePreBroadcastError(errMsg, errorCode);
      const publicError = publicWriteError(errMsg, wallet.brand, userRejected);
      const ambiguousSubmission = submissionAttempted && !hashExists && !userRejected && !definitePreBroadcastFailure;
      confirmedFailure = errMsg.includes('Transaction FINALIZED with error:');
      this.currentStage = userRejected
        ? 'REJECTED'
        : (hashExists && !confirmedFailure) || ambiguousSubmission
          ? 'RECONCILIATION_REQUIRED'
          : 'FAILED';
      this.currentError = publicError;
      journalEntry.status = (hashExists && !confirmedFailure) || ambiguousSubmission ? 'PENDING' : 'FAILED';
      journalEntry.error = publicError;
      const errorSaved = this.saveJournal(journal);
      releaseLock = (!hashExists && !ambiguousSubmission) || confirmedFailure ? errorSaved : false;
      this.notify();

      return {
        success: false,
        hash: this.currentHash || undefined,
        error: publicError,
      };
    } finally {
      this.monitoringController = null;
      if (releaseLock) this.volatilePendingLocks.delete(lockKey);
      this.isProcessing = false;
    }
  }

  private async pollFinalization(hash: string, signal: AbortSignal): Promise<ReceiptClassification> {
    const rawClient = rpcClient.getRawClient();
    let delay = 2500;

    for (let poll = 0; poll < 36; poll++) {
      if (signal.aborted) throw new DOMException('Transaction monitoring was cancelled; reconcile the retained hash.', 'AbortError');
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        await this.abortableDelay(1000, signal);
        poll--;
        continue;
      }

      try {
        const receipt = await rawClient.getTransaction({
          hash: hash as Parameters<typeof rawClient.getTransaction>[0]['hash'],
        });

        if (typeof receipt === 'object' && receipt !== null &&
            String((receipt as { status?: unknown }).status || '').toUpperCase() === 'FINALIZED') {
          this.currentStage = 'VERIFYING_EXECUTION';
          this.notify();
        }

        const classified = this.classifyReceipt(receipt);
        if (classified.type === 'FINALIZED_SUCCESS') {
          return classified;
        }
        if (classified.type === 'FINALIZED_FAILURE') {
          throw new Error(`Transaction FINALIZED with error: ${classified.error}`);
        }
        if (classified.type === 'TERMINAL_AMBIGUOUS') {
          return classified;
        }
      } catch (pollErr: unknown) {
        const pMsg = pollErr instanceof Error ? pollErr.message : String(pollErr);
        if (pMsg.includes('FINALIZED with error')) {
          throw pollErr;
        }
      }

      await this.abortableDelay(delay, signal);
      delay = Math.min(delay * 1.35, 10_000);
    }

    throw new Error('Transaction consensus was not final after 36 bounded polls; reconcile the retained hash.');
  }

  // -------------------------------------------------------------------------
  // 9 Concrete Write Workflows with Authoritative Readbacks
  // -------------------------------------------------------------------------

  public async createChannel(
    wallet: ConnectedWallet,
    clientNonce: string,
    name: string,
    zones: string[]
  ): Promise<WriteResult<ChannelRecord>> {
    // UGC zone regex matching contract: ^[A-Z]{2}[CZEM][0-9]{3}$
    const zoneRegex = /^[A-Z]{2}[CZEM][0-9]{3}$/;
    const normalizedZones = Array.from(new Set(zones.map((z) => z.trim().toUpperCase())));

    if (normalizedZones.length < 1 || normalizedZones.length > 5) {
      throw new Error(`Channel requires between 1 and 5 zones, got ${normalizedZones.length}.`);
    }

    for (const z of normalizedZones) {
      if (!zoneRegex.test(z)) {
        throw new Error(`Invalid zone code "${z}". Must match UGC format (e.g., CAC001, NVZ005).`);
      }
    }

    const zonesCsv = normalizedZones.join(',');

    return this.executeWrite(
      wallet,
      'create_channel',
      [clientNonce, name, zonesCsv],
      async () => {
        const nonceRecord = await rpcClient.getAdminNonce(wallet.address, clientNonce, true);
        if (!nonceRecord.is_used || nonceRecord.channel_id <= 0) {
          throw new Error('Channel creation nonce is not marked as used.');
        }
        return rpcClient.getChannel(nonceRecord.channel_id, true);
      },
      (ch) => ch.name === name && ch.admin.toLowerCase() === wallet.address.toLowerCase() && ch.status === 'DRAFT'
    );
  }

  public async activateChannel(
    wallet: ConnectedWallet,
    channelId: number
  ): Promise<WriteResult<ChannelRecord>> {
    return this.executeWrite(
      wallet,
      'activate_channel',
      [channelId],
      async () => rpcClient.getChannel(channelId, true),
      (ch) => ch.status === 'ACTIVE'
    );
  }

  public async closeChannel(
    wallet: ConnectedWallet,
    channelId: number
  ): Promise<WriteResult<ChannelRecord>> {
    return this.executeWrite(
      wallet,
      'close_channel',
      [channelId],
      async () => rpcClient.getChannel(channelId, true),
      (ch) => ch.status === 'CLOSED'
    );
  }

  public async subscribeChannel(
    wallet: ConnectedWallet,
    channelId: number
  ): Promise<WriteResult<SubscriptionRecord>> {
    return this.executeWrite(
      wallet,
      'subscribe',
      [channelId],
      async () => rpcClient.getSubscription(channelId, wallet.address, true),
      (sub) => sub.is_subscribed === true
    );
  }

  public async unsubscribeChannel(
    wallet: ConnectedWallet,
    channelId: number
  ): Promise<WriteResult<SubscriptionRecord>> {
    return this.executeWrite(
      wallet,
      'unsubscribe',
      [channelId],
      async () => rpcClient.getSubscription(channelId, wallet.address, true),
      (sub) => sub.is_subscribed === false
    );
  }

  public async ingestAlert(
    wallet: ConnectedWallet,
    channelId: number,
    rootUrn: string
  ): Promise<WriteResult<ChainRecord>> {
    return this.executeWrite(
      wallet,
      'ingest_alert',
      [channelId, rootUrn],
      async () => rpcClient.getChain(channelId, rootUrn, true),
      (chain) => chain.root_urn === rootUrn && chain.revision_count >= 1
    );
  }

  public async refreshChain(
    wallet: ConnectedWallet,
    channelId: number,
    rootUrn: string,
    candidateUrn: string
  ): Promise<WriteResult<RevisionRecord>> {
    // Authoritative pre-state capture prior to signing
    let preState: ChainRecord | null = null;
    try {
      preState = await rpcClient.getChain(channelId, rootUrn, true);
    } catch {
      // Pre-state will be null if read fails
    }

    const result = await this.executeWrite(
      wallet,
      'refresh_chain',
      [channelId, rootUrn, candidateUrn],
      async () => {
        const chain = await rpcClient.getChain(channelId, rootUrn, true);
        const op = await rpcClient.getOperativeAlert(channelId, rootUrn, true);
        return { chain, op };
      },
      ({ chain, op }) => {
        if (preState) {
          if (chain.epoch > preState.epoch) {
            return op.urn === candidateUrn || chain.active_urn === candidateUrn;
          }
          if (chain.epoch === preState.epoch) {
            return chain.active_urn === preState.active_urn || op.operative_status === 'HOLD_UNRESOLVED';
          }
        }
        return op.urn === candidateUrn || op.operative_status === 'HOLD_UNRESOLVED' || chain.active_urn === candidateUrn;
      }
    );

    return {
      success: result.success,
      hash: result.hash,
      error: result.error,
      data: result.data?.op,
    };
  }

  public async deriveExpiry(
    wallet: ConnectedWallet,
    channelId: number,
    rootUrn: string
  ): Promise<WriteResult<ChainRecord>> {
    return this.executeWrite(
      wallet,
      'derive_expiry',
      [channelId, rootUrn],
      async () => rpcClient.getChain(channelId, rootUrn, true),
      (chain) => chain.operative_status === 'EXPIRED'
    );
  }

  public async acknowledge(
    wallet: ConnectedWallet,
    channelId: number,
    rootUrn: string,
    epoch: number
  ): Promise<WriteResult<AcknowledgementRecord>> {
    return this.executeWrite(
      wallet,
      'acknowledge',
      [channelId, rootUrn, epoch],
      async () => rpcClient.getAcknowledgement(channelId, rootUrn, wallet.address, true),
      (ack) => ack.has_acknowledged === true && ack.acknowledged_epoch === epoch
    );
  }
}

export const writeManager = new WriteManager();
