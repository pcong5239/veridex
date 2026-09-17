import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RpcCoordinator } from '../services/rpcClient';
import { appConfig } from '../config';

describe('RpcCoordinator Service', () => {
  let coordinator: RpcCoordinator;

  beforeEach(() => {
    coordinator = new RpcCoordinator();
    appConfig.isConfigured = true;
    appConfig.contractAddress = '0x1234567890123456789012345678901234567890';
  });

  afterEach(() => {
    coordinator.teardown();
  });

  // Test 1: Public disconnected read with exact contract signatures and pagination
  it('executes public read operations with exact contract signatures and pagination parameters', async () => {
    const mockRawClient = {
      readContract: vi.fn().mockResolvedValue('[]'),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    await coordinator.getChannels(0, 50);
    expect(mockRawClient.readContract).toHaveBeenCalledWith({
      address: appConfig.contractAddress,
      functionName: 'get_channels_json',
      args: [0, 50],
    });

    await coordinator.getChains(1, 10, 20);
    expect(mockRawClient.readContract).toHaveBeenCalledWith({
      address: appConfig.contractAddress,
      functionName: 'get_chains_json',
      args: [1, 10, 20],
    });

    await coordinator.getRevisions(1, 'urn:root', 5, 25);
    expect(mockRawClient.readContract).toHaveBeenCalledWith({
      address: appConfig.contractAddress,
      functionName: 'get_revisions_json',
      args: [1, 'urn:root', 5, 25],
    });

    await coordinator.getAuditEvents(1, 0, 50);
    expect(mockRawClient.readContract).toHaveBeenCalledWith({
      address: appConfig.contractAddress,
      functionName: 'get_audit_events_json',
      args: [1, 0, 50],
    });

    mockRawClient.readContract.mockResolvedValue('https://api.weather.gov/alerts/urn:alert');
    await coordinator.getSourceUrl('urn:alert');
    expect(mockRawClient.readContract).toHaveBeenCalledWith({
      address: appConfig.contractAddress,
      functionName: 'get_source_url',
      args: ['urn:alert'],
    });
  });

  // Test 16: No duplicate reads on render / cache utilization
  it('serves subsequent reads within TTL from cache without repeating RPC call', async () => {
    const mockRawClient = {
      readContract: vi.fn().mockResolvedValue('10'),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const res1 = await coordinator.getChannelCount();
    const res2 = await coordinator.getChannelCount();

    expect(res1).toBe(10);
    expect(res2).toBe(10);
    expect(mockRawClient.readContract).toHaveBeenCalledTimes(1);

    const stats = coordinator.getStats();
    expect(stats.cacheHits).toBe(1);
    expect(stats.totalCalls).toBe(2);
  });

  // Test 17: In-flight read deduplication and key-specific cache invalidation
  it('deduplicates concurrent in-flight requests and supports method-specific cache invalidation', async () => {
    let callCount = 0;
    const mockRawClient = {
      readContract: vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((res) => setTimeout(res, 50));
        return '42';
      }),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const [val1, val2] = await Promise.all([
      coordinator.getChannelCount(),
      coordinator.getChannelCount(),
    ]);

    expect(val1).toBe(42);
    expect(val2).toBe(42);
    expect(callCount).toBe(1);

    // Method-specific cache invalidation
    coordinator.invalidateCache('get_channel_count');
    const val3 = await coordinator.getChannelCount();
    expect(val3).toBe(42);
    expect(callCount).toBe(2);
  });

  // Test Concurrency Limit & FIFO queue (max 4 concurrent)
  it('respects concurrency limit of 4 concurrent requests', async () => {
    let active = 0;
    let maxObservedActive = 0;

    const mockChannelJson = {
      channel_id: 1,
      admin: '0x1111111111111111111111111111111111111111',
      name: 'Test Channel',
      client_nonce: 'nonce-1',
      zones: ['FLZ041'],
      status: 'ACTIVE',
      chain_count: 0,
      subscriber_count: 0,
      created_at: '2026-08-25T12:00:00Z',
    };

    const mockRawClient = {
      readContract: vi.fn().mockImplementation(async () => {
        active++;
        maxObservedActive = Math.max(maxObservedActive, active);
        await new Promise((res) => setTimeout(res, 30));
        active--;
        return mockChannelJson;
      }),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const promises = Array.from({ length: 10 }, (_, i) =>
      coordinator.getChannel(i + 1, true)
    );
    await Promise.all(promises);

    expect(maxObservedActive).toBe(4);
    expect(coordinator.getStats().successfulCalls).toBe(10);
  });

  // Test AbortSignal support
  it('cancels queued and active requests when AbortSignal is aborted', async () => {
    const mockRawClient = {
      readContract: vi.fn().mockImplementation(async () => {
        await new Promise((res) => setTimeout(res, 100));
        return '10';
      }),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const controller = new AbortController();
    const pending = coordinator.getChannelCount(true, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not retry or cache an active read after it is aborted', async () => {
    let release!: (value: string) => void;
    const rawResult = new Promise<string>((resolve) => { release = resolve; });
    const mockRawClient = { readContract: vi.fn().mockReturnValue(rawResult) };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const controller = new AbortController();
    const pending = coordinator.getChannelCount(true, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release('10');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockRawClient.readContract).toHaveBeenCalledTimes(1);
    expect(coordinator.getCacheStats().size).toBe(0);
  });

  it('lets a later deduplicated caller abort independently without cancelling another consumer', async () => {
    let release!: (value: string) => void;
    const rawResult = new Promise<string>((resolve) => { release = resolve; });
    const mockRawClient = { readContract: vi.fn().mockReturnValue(rawResult) };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);
    const first = coordinator.getChannelCount(true);
    const controller = new AbortController();
    const second = coordinator.getChannelCount(true, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    release('17');
    await expect(first).resolves.toBe(17);
    expect(mockRawClient.readContract).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight read on invalidation so stale data cannot repopulate cache', async () => {
    let release!: (value: string) => void;
    const rawResult = new Promise<string>((resolve) => { release = resolve; });
    const mockRawClient = { readContract: vi.fn().mockReturnValue(rawResult) };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);
    const pending = coordinator.getChannelCount(true);
    coordinator.invalidateCache();
    release('9');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(coordinator.getCacheStats().size).toBe(0);
  });

  it('loads audit history in valid 50-item pages beyond the first page', async () => {
    const event = { channel_id: 1, root_urn: 'urn:x', event_type: 'UPDATE', candidate_urn: 'urn:y', epoch: 1, timestamp: '2026-01-01T00:00:00Z' };
    const mockRawClient = { readContract: vi.fn().mockImplementation(async ({ args }: { args: number[] }) => JSON.stringify(Array(args[1] === 0 ? 50 : 7).fill(event))) };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);
    const events = await coordinator.getAllAuditEvents(1);
    expect(events).toHaveLength(57);
    expect(mockRawClient.readContract).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: [1, 50, 50] }));
  });

  it('does not start queued reads while the document is hidden', async () => {
    (document as any).visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    const mockRawClient = { readContract: vi.fn().mockResolvedValue('10') };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const pending = coordinator.getChannelCount(true);
    await Promise.resolve();
    expect(mockRawClient.readContract).not.toHaveBeenCalled();

    (document as any).visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await expect(pending).resolves.toBe(10);
    expect(mockRawClient.readContract).toHaveBeenCalledTimes(1);
  });

  // Test Retry-After Header (delta-seconds and HTTP-date)
  it('handles Retry-After in delta-seconds and HTTP-date formats', async () => {
    let attempts = 0;
    const futureDate = new Date(Date.now() + 50).toUTCString();

    const mockRawClient = {
      readContract: vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          const err = new Error('Rate limit exceeded (429)');
          (err as any).status = 429;
          (err as any).headers = new Headers({ 'Retry-After': '0' });
          throw err;
        }
        if (attempts === 2) {
          const err = new Error('Rate limit exceeded (429)');
          (err as any).status = 429;
          (err as any).headers = new Headers({ 'Retry-After': futureDate });
          throw err;
        }
        return '100';
      }),
    };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);

    const result = await coordinator.getChannelCount(true);
    expect(result).toBe(100);
    expect(attempts).toBe(3);
  });

  it('does not retry an active rate-limited read while the document is hidden', async () => {
    let attempts = 0;
    const mockRawClient = { readContract: vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) { const error = Object.assign(new Error('429'), { status: 429, headers: new Headers({ 'Retry-After': '0' }) }); throw error; }
      return '5';
    }) };
    vi.spyOn(coordinator, 'getRawClient').mockReturnValue(mockRawClient as any);
    (document as any).visibilityState = 'visible';
    const pending = coordinator.getChannelCount(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (document as any).visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(attempts).toBe(1);
    (document as any).visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await expect(pending).resolves.toBe(5);
  });
});
