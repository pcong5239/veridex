import { createClient } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { appConfig } from '../config';
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
} from '../parsers/contractParsers';
import {
  ConfigRecord,
  UpgradeStatusRecord,
  ChannelRecord,
  ChainRecord,
  RevisionRecord,
  SubscriptionRecord,
  AcknowledgementRecord,
  AdminNonceRecord,
  AuditEventRecord,
} from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface QueuedTask<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
}

interface InFlightEntry<T> {
  promise: Promise<T>;
  controller: AbortController;
  consumers: number;
}

export interface RpcStats {
  totalCalls: number;
  cacheHits: number;
  successfulCalls: number;
  failedCalls: number;
  activeRequests: number;
  queueLength: number;
  cacheSize: number;
}

export class RpcCoordinator {
  private cache = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, InFlightEntry<unknown>>();
  private readonly ttlMs = 8000; // 8-second safe read cache
  private rateLimitCooldownUntil = 0;
  private rawClientInstance: ReturnType<typeof createClient> | null = null;

  // Queue & Concurrency Management
  private readonly maxConcurrency = 4;
  private activeCount = 0;
  private queue: QueuedTask<unknown>[] = [];
  private isPaused = false;
  private visibilityGeneration = 0;
  private invalidationGeneration = 0;

  // Journey & Debug Metrics
  private totalCalls = 0;
  private cacheHits = 0;
  private successfulCalls = 0;
  private failedCalls = 0;

  constructor() {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.isPaused = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public teardown(): void {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    this.isPaused = document.visibilityState === 'hidden';
    if (this.isPaused) this.visibilityGeneration++;
    if (!this.isPaused) {
      this.processQueue();
    }
  };

  public getRawClient(): ReturnType<typeof createClient> {
    if (!this.rawClientInstance) {
      this.rawClientInstance = createClient({
        chain: studioDevnet,
        endpoint: appConfig.rpcUrl,
      });
    }
    return this.rawClientInstance;
  }

  public invalidateCache(keyPrefix?: string): void {
    this.invalidationGeneration++;
    if (!keyPrefix) {
      this.cache.clear();
      for (const entry of this.inFlight.values()) entry.controller.abort();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(`:${keyPrefix}:`) || key.startsWith(keyPrefix)) {
        this.cache.delete(key);
        this.inFlight.get(key)?.controller.abort();
      }
    }
  }

  public getStats(): RpcStats {
    return {
      totalCalls: this.totalCalls,
      cacheHits: this.cacheHits,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      activeRequests: this.activeCount,
      queueLength: this.queue.length,
      cacheSize: this.cache.size,
    };
  }

  public getCacheStats(): { size: number; inFlightCount: number } {
    return {
      size: this.cache.size,
      inFlightCount: this.inFlight.size,
    };
  }

  private enqueue<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: Math.random().toString(36).substring(2, 9),
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
      };

      if (signal) {
        const abortHandler = () => {
          signal.removeEventListener('abort', abortHandler);
          const index = this.queue.findIndex((t) => t.id === task.id);
          if (index !== -1) {
            this.queue.splice(index, 1);
          }
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.queue.push(task as QueuedTask<unknown>);
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (!this.isPaused && this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) return;
      if (task.signal?.aborted) {
        task.reject(new DOMException('The operation was aborted.', 'AbortError'));
        continue;
      }
      this.activeCount++;
      task.fn().then(task.resolve).catch(task.reject).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }
  }

  private parseRetryAfter(headerValue: string | null | undefined): number | null {
    if (!headerValue) return null;
    const trimmed = headerValue.trim();

    // 1. Try delta-seconds integer
    const deltaSeconds = parseInt(trimmed, 10);
    if (!isNaN(deltaSeconds) && /^\d+$/.test(trimmed)) {
      return Math.max(0, deltaSeconds * 1000);
    }

    // 2. Try HTTP-date format (e.g. Wed, 21 Oct 2026 07:28:00 GMT)
    const targetDate = Date.parse(trimmed);
    if (!isNaN(targetDate)) {
      return Math.max(0, targetDate - Date.now());
    }

    return null;
  }

  private abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
    });
  }

  private waitUntilVisible(signal?: AbortSignal): Promise<void> {
    if (!this.isPaused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onVisibility = () => {
        if (!this.isPaused) { cleanup(); resolve(); }
      };
      const onAbort = () => { cleanup(); reject(new DOMException('The operation was aborted.', 'AbortError')); };
      const cleanup = () => {
        document.removeEventListener('visibilitychange', onVisibility);
        signal?.removeEventListener('abort', onAbort);
      };
      document.addEventListener('visibilitychange', onVisibility);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private subscribeToInFlight<T>(entry: InFlightEntry<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    entry.consumers++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        entry.consumers--;
        return true;
      };
      const onAbort = () => {
        if (!finish()) return;
        if (entry.consumers === 0) entry.controller.abort();
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      entry.promise.then((value) => { if (finish()) resolve(value); }, (error) => { if (finish()) reject(error); });
    });
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, maxRetries = 3): Promise<T> {
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      await this.waitUntilVisible(signal);

      // Respect shared rate-limit cooldown
      const now = Date.now();
      if (this.rateLimitCooldownUntil > now) {
        const sleepMs = this.rateLimitCooldownUntil - now;
        await this.abortableDelay(sleepMs, signal);
      }

      try {
        const result = await fn();
        this.successfulCalls++;
        return result;
      } catch (err: unknown) {
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        attempt++;
        const errObj = err as {
          status?: number;
          code?: number;
          message?: string;
          response?: { headers?: Headers | Record<string, string> };
          headers?: Headers | Record<string, string>;
        };
        const isRateLimit =
          errObj.status === 429 || errObj.code === 429 || (errObj.message && errObj.message.includes('429'));
        const isServerErr = (errObj.status && errObj.status >= 500) || (errObj.code && errObj.code >= 500);

        if ((isRateLimit || isServerErr) && attempt < maxRetries) {
          let waitTime = delay;
          if (isRateLimit) {
            let retryHeader: string | null = null;
            const headers = errObj.headers || errObj.response?.headers;
            if (headers) {
              if (typeof (headers as Headers).get === 'function') {
                retryHeader = (headers as Headers).get('Retry-After');
              } else if (typeof headers === 'object') {
                retryHeader = (headers as Record<string, string>)['retry-after'] ||
                  (headers as Record<string, string>)['Retry-After'] ||
                  null;
              }
            }

            const parsedWait = this.parseRetryAfter(retryHeader);
            if (parsedWait !== null) {
              waitTime = parsedWait;
            }
            this.rateLimitCooldownUntil = Date.now() + waitTime;
          }
          await this.abortableDelay(waitTime, signal);
          await this.waitUntilVisible(signal);
          delay = Math.min(delay * 2, 8000);
          continue;
        }

        this.failedCalls++;
        throw err;
      }
    }

    this.failedCalls++;
    throw new Error('RPC call failed after maximum retries.');
  }

  public async readContract<T>(
    method: string,
    args: unknown[] = [],
    parser: (raw: unknown) => T,
    skipCache = false,
    signal?: AbortSignal
  ): Promise<T> {
    this.totalCalls++;

    if (!appConfig.isConfigured) {
      throw new Error(appConfig.configError || 'Contract address not configured.');
    }

    const cacheKey = `${appConfig.chainId}:${appConfig.contractAddress.toLowerCase()}:${method}:${JSON.stringify(args)}`;
    const now = Date.now();

    if (!skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && now - cached.timestamp < this.ttlMs) {
        this.cacheHits++;
        return cached.data as T;
      }
    }

    // In-flight deduplication
    const existingInFlight = this.inFlight.get(cacheKey);
    if (existingInFlight) {
      return this.subscribeToInFlight(existingInFlight as InFlightEntry<T>, signal);
    }

    const invalidationGeneration = this.invalidationGeneration;
    const controller = new AbortController();
    const fetchPromise = this.enqueue(() => {
      return this.executeWithRetry(async () => {
        const client = this.getRawClient();
        const rawResult = await client.readContract({
          address: appConfig.contractAddress as `0x${string}`,
          functionName: method,
          args: args as any,
        });
        await this.waitUntilVisible(controller.signal);
        if (controller.signal.aborted || invalidationGeneration !== this.invalidationGeneration) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        const parsed = parser(rawResult);
        this.cache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        return parsed;
      }, controller.signal);
    }, controller.signal).finally(() => {
      this.inFlight.delete(cacheKey);
    });

    const entry: InFlightEntry<T> = { promise: fetchPromise, controller, consumers: 0 };
    this.inFlight.set(cacheKey, entry as InFlightEntry<unknown>);
    return this.subscribeToInFlight(entry, signal);
  }

  // -------------------------------------------------------------------------
  // 16 Schema-Validated View Calls with Exact Contract Signatures
  // -------------------------------------------------------------------------

  public async getConfig(skipCache = false, signal?: AbortSignal): Promise<ConfigRecord> {
    return this.readContract('get_config_json', [], parseConfigJson, skipCache, signal);
  }

  public async getUpgradeStatus(skipCache = false, signal?: AbortSignal): Promise<UpgradeStatusRecord> {
    return this.readContract('get_upgrade_status_json', [], parseUpgradeStatusJson, skipCache, signal);
  }

  public async getChannelCount(skipCache = false, signal?: AbortSignal): Promise<number> {
    return this.readContract('get_channel_count', [], parseChannelCount, skipCache, signal);
  }

  public async getChannel(channelId: number, skipCache = false, signal?: AbortSignal): Promise<ChannelRecord> {
    return this.readContract('get_channel_json', [channelId], parseChannelJson, skipCache, signal);
  }

  public async getChannels(offset = 0, limit = 50, skipCache = false, signal?: AbortSignal): Promise<ChannelRecord[]> {
    return this.readContract('get_channels_json', [offset, limit], parseChannelsJson, skipCache, signal);
  }

  public async getChainCount(channelId: number, skipCache = false, signal?: AbortSignal): Promise<number> {
    return this.readContract('get_chain_count', [channelId], parseChainCount, skipCache, signal);
  }

  public async getChain(channelId: number, rootUrn: string, skipCache = false, signal?: AbortSignal): Promise<ChainRecord> {
    return this.readContract('get_chain_json', [channelId, rootUrn], parseChainJson, skipCache, signal);
  }

  public async getChains(channelId: number, offset = 0, limit = 50, skipCache = false, signal?: AbortSignal): Promise<ChainRecord[]> {
    return this.readContract('get_chains_json', [channelId, offset, limit], parseChainsJson, skipCache, signal);
  }

  public async getRevision(
    channelId: number,
    rootUrn: string,
    revisionIndex: number,
    skipCache = false,
    signal?: AbortSignal
  ): Promise<RevisionRecord> {
    return this.readContract('get_revision_json', [channelId, rootUrn, revisionIndex], parseRevisionJson, skipCache, signal);
  }

  public async getRevisions(
    channelId: number,
    rootUrn: string,
    offset = 0,
    limit = 50,
    skipCache = false,
    signal?: AbortSignal
  ): Promise<RevisionRecord[]> {
    return this.readContract('get_revisions_json', [channelId, rootUrn, offset, limit], parseRevisionsJson, skipCache, signal);
  }

  public async getOperativeAlert(channelId: number, rootUrn: string, skipCache = false, signal?: AbortSignal): Promise<RevisionRecord> {
    return this.readContract('get_operative_alert_json', [channelId, rootUrn], parseOperativeAlertJson, skipCache, signal);
  }

  public async getSubscription(channelId: number, account: string, skipCache = false, signal?: AbortSignal): Promise<SubscriptionRecord> {
    return this.readContract('get_subscription_json', [channelId, account], parseSubscriptionJson, skipCache, signal);
  }

  public async getAcknowledgement(
    channelId: number,
    rootUrn: string,
    account: string,
    skipCache = false,
    signal?: AbortSignal
  ): Promise<AcknowledgementRecord> {
    return this.readContract('get_acknowledgement_json', [channelId, rootUrn, account], parseAcknowledgementJson, skipCache, signal);
  }

  public async getAdminNonce(admin: string, clientNonce: string, skipCache = false, signal?: AbortSignal): Promise<AdminNonceRecord> {
    return this.readContract('get_admin_nonce_json', [admin, clientNonce], parseAdminNonceJson, skipCache, signal);
  }

  public async getAuditEvents(channelId: number, offset = 0, limit = 50, skipCache = false, signal?: AbortSignal): Promise<AuditEventRecord[]> {
    return this.readContract('get_audit_events_json', [channelId, offset, limit], parseAuditEventsJson, skipCache, signal);
  }

  public async getAllAuditEvents(channelId: number, signal?: AbortSignal): Promise<AuditEventRecord[]> {
    const all: AuditEventRecord[] = [];
    for (let offset = 0; offset < 256; offset += 50) {
      const page = await this.getAuditEvents(channelId, offset, 50, false, signal);
      all.push(...page);
      if (page.length < 50) break;
    }
    return all;
  }

  public async getSourceUrl(alertUrn: string, skipCache = false, signal?: AbortSignal): Promise<string> {
    return this.readContract('get_source_url', [alertUrn], parseSourceUrl, skipCache, signal);
  }
}

export const rpcClient = new RpcCoordinator();
