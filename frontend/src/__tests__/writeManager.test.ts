import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWriteProvider, WriteManager } from '../services/writeManager';
import { ConnectedWallet } from '../types';
import { appConfig } from '../config';
import { rpcClient } from '../services/rpcClient';

const sdkMocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('genlayer-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('genlayer-js')>()),
  createClient: sdkMocks.createClient,
}));

describe('Write Safety, Intent Journaling & Reconciliation', () => {
  let writeManager: WriteManager;

  const mockWallet: ConnectedWallet = {
    address: '0x1111111111111111111111111111111111111111',
    chainId: 61997,
    brand: 'MetaMask',
    provider: {
      request: vi.fn(),
    },
  };

  beforeEach(() => {
    localStorage.clear();
    appConfig.isConfigured = true;
    appConfig.contractAddress = '0x2222222222222222222222222222222222222222';
    writeManager = new WriteManager();
    sdkMocks.createClient.mockReset();
    (mockWallet.provider.request as any).mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0xf22d';
      if (method === 'eth_accounts') return [mockWallet.address];
      return null;
    });
  });

  it('keeps the selected OKX provider but removes redundant wallet-owned send fields', async () => {
    const request = vi.fn().mockResolvedValue('0xhash');
    const provider = getWriteProvider({ ...mockWallet, brand: 'OKX Wallet', provider: { request } });
    await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: mockWallet.address,
        to: appConfig.contractAddress,
        data: '0x1234',
        value: '0x1',
        gas: '0x30d40',
        nonce: '0x0',
        type: '0x0',
        chainId: '0xf22d',
        gasPrice: '0x0',
      }],
    });

    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [{
        from: mockWallet.address,
        to: appConfig.contractAddress,
        data: '0x1234',
        value: '0x1',
        gas: '0x30d40',
      }],
    });
  });

  it('simulates, derives and displays the exact fee object before submitting it unchanged', async () => {
    const initial = { distribution: { leader: 1n }, messageAllocations: [], feeValue: 2n };
    const exact = { distribution: { leader: 3n }, messageAllocations: [], feeValue: 4n };
    const client = {
      estimateTransactionFeesForWrite: vi.fn().mockResolvedValue(initial),
      simulateWriteContract: vi.fn().mockResolvedValue({ receipt: {}, feeAccounting: {} }),
      estimateTransactionFeesFromSimulation: vi.fn().mockResolvedValue(exact),
      writeContract: vi.fn().mockResolvedValue('0xabc123'),
    };
    sdkMocks.createClient.mockReturnValue(client);
    vi.spyOn(rpcClient, 'getRawClient').mockReturnValue({
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'FINALIZED', execution_result: { status: 'SUCCESS' } }),
    } as any);

    const result = await writeManager.executeWrite(mockWallet, 'activate_channel', [1], async () => ({ status: 'ACTIVE' }));
    expect(result.success).toBe(true);
    expect(client.estimateTransactionFeesForWrite).toHaveBeenCalledBefore(client.simulateWriteContract);
    expect(client.estimateTransactionFeesFromSimulation).toHaveBeenCalledBefore(client.writeContract);
    expect(client.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      fees: { distribution: exact.distribution, messageAllocations: [], feeValue: 4n },
    }));
  });

  it('routes directly to the wallet and classifies a denied signature without a hash', async () => {
    const rejected = Object.assign(new Error('User denied request signature.'), { code: 4001 });
    const client = {
      estimateTransactionFeesForWrite: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 2n }),
      simulateWriteContract: vi.fn().mockResolvedValue({}),
      estimateTransactionFeesFromSimulation: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 4n }),
      writeContract: vi.fn().mockRejectedValue(rejected),
    };
    sdkMocks.createClient.mockReturnValue(client);

    const result = await writeManager.executeWrite(mockWallet, 'subscribe', [1], async () => ({}));

    expect(client.writeContract).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    expect(result.hash).toBeUndefined();
    expect(result.error).toBe('The wallet request was rejected. No transaction was submitted.');
    expect(writeManager.getStage()).toBe('REJECTED');
  });

  it('does not expose localized provider details or library versions in public errors', async () => {
    const client = {
      estimateTransactionFeesForWrite: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 2n }),
      simulateWriteContract: vi.fn().mockResolvedValue({}),
      estimateTransactionFeesFromSimulation: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 4n }),
      writeContract: vi.fn().mockRejectedValue(new Error('An internal error was received. Details: Thông số giao dịch không hợp lệ. Version: viem@2.55.19')),
    };
    sdkMocks.createClient.mockReturnValue(client);
    const okxWallet = { ...mockWallet, brand: 'OKX Wallet' as const };

    const result = await writeManager.executeWrite(okxWallet, 'subscribe', [1], async () => ({}));

    expect(result.error).toBe('OKX Wallet could not prepare this transaction. No transaction was submitted. Reconnect the wallet and try again.');
    expect(result.error).not.toMatch(/Thông số|viem/i);
  });

  // Test 31: Production runtime visibly blocks writes when contract address is absent
  it('blocks write execution fail-closed if contract address is not configured', async () => {
    appConfig.isConfigured = false;
    appConfig.configError = 'Contract address is not configured.';

    await expect(
      writeManager.executeWrite(
        mockWallet,
        'create_channel',
        ['nonce-1', 'Test', 'FLZ041'],
        async () => ({})
      )
    ).rejects.toThrow('Contract address is not configured.');
  });

  // Test 21: Storage probe failures for set/get/remove
  it('fails closed when local storage probe fails', async () => {
    vi.spyOn(writeManager, 'probeStorage').mockReturnValue(false);

    await expect(
      writeManager.executeWrite(
        mockWallet,
        'activate_channel',
        [1],
        async () => ({})
      )
    ).rejects.toThrow(/Local storage is unavailable/);
  });

  // Test 4: create_channel calldata formatting & UGC zone validation
  describe('createChannel calldata formatting and zone validation', () => {
    it('normalizes, deduplicates and validates UGC zones against contract regex', async () => {
      vi.spyOn(rpcClient, 'getAdminNonce').mockResolvedValue({
        admin: mockWallet.address,
        client_nonce: 'nonce-1',
        is_used: true,
        channel_id: 1,
      });

      vi.spyOn(rpcClient, 'getChannel').mockResolvedValue({
        channel_id: 1,
        admin: mockWallet.address,
        name: 'Florida Watch',
        client_nonce: 'nonce-1',
        zones: ['FLZ041', 'FLZ141'],
        status: 'DRAFT',
        chain_count: 0,
        subscriber_count: 0,
        created_at: '2026-08-25T12:00:00Z',
        activated_at: '',
        closed_at: '',
      });

      const writeSpy = vi.spyOn(writeManager as any, 'executeWrite').mockResolvedValue({
        success: true,
        data: { channel_id: 1, name: 'Florida Watch' },
      });

      await writeManager.createChannel(mockWallet, 'nonce-1', 'Florida Watch', [
        'flz041 ',
        'FLZ041',
        'FLZ141',
      ]);

      expect(writeSpy).toHaveBeenCalledWith(
        mockWallet,
        'create_channel',
        ['nonce-1', 'Florida Watch', 'FLZ041,FLZ141'],
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('rejects invalid UGC zone codes not matching ^[A-Z]{2}[CZEM][0-9]{3}$', async () => {
      await expect(
        writeManager.createChannel(mockWallet, 'nonce-1', 'Watch', ['INVALID_ZONE'])
      ).rejects.toThrow(/Invalid zone code/);

      await expect(
        writeManager.createChannel(mockWallet, 'nonce-1', 'Watch', ['FLX001'])
      ).rejects.toThrow(/Invalid zone code/);

      await expect(
        writeManager.createChannel(mockWallet, 'nonce-1', 'Watch', [])
      ).rejects.toThrow(/requires between 1 and 5 zones/);
    });
  });

  // Test 6: Pre-state capture in refreshChain
  describe('refreshChain pre-state capture and verification', () => {
    it('captures pre-state chain prior to signing and verifies epoch progression', async () => {
      const preChain = {
        channel_id: 1,
        root_urn: 'urn:oid:2.49.0.1.840.0.root',
        active_urn: 'urn:oid:2.49.0.1.840.0.root',
        epoch: 1,
        operative_status: 'ACTIVE' as const,
        revision_count: 1,
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
        headline_excerpt: 'Warning',
        source_url: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.root',
        created_at: '2026-08-25T12:00:00Z',
      };

      vi.spyOn(rpcClient, 'getChain').mockResolvedValue(preChain);

      const writeSpy = vi.spyOn(writeManager as any, 'executeWrite').mockResolvedValue({
        success: true,
        data: {
          chain: { ...preChain, epoch: 2, active_urn: 'urn:oid:2.49.0.1.840.0.cand' },
          op: { urn: 'urn:oid:2.49.0.1.840.0.cand', epoch: 2 },
        },
      });

      const res = await writeManager.refreshChain(
        mockWallet,
        1,
        'urn:oid:2.49.0.1.840.0.root',
        'urn:oid:2.49.0.1.840.0.cand'
      );

      expect(res.success).toBe(true);
      expect(writeSpy).toHaveBeenCalledWith(
        mockWallet,
        'refresh_chain',
        [1, 'urn:oid:2.49.0.1.840.0.root', 'urn:oid:2.49.0.1.840.0.cand'],
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  // Test 25: Receipt classification states for full & simplified envelopes
  describe('classifyReceipt', () => {
    it('classifies the installed SDK statusName and txExecutionResultName fields', () => {
      expect(writeManager.classifyReceipt({ statusName: 'PENDING', txExecutionResultName: 'UNDETERMINED' }).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN' }).type).toBe('FINALIZED_SUCCESS');
      expect(writeManager.classifyReceipt({ statusName: 'FINALIZED', txExecutionResultName: 'TIMEOUT' }).type).toBe('FINALIZED_FAILURE');
      expect(writeManager.classifyReceipt({ status: 6 }).type).toBe('TERMINAL_AMBIGUOUS');
    });

    it('keeps NOT_VOTED non-terminal and unknown execution values fail-closed', () => {
      expect(writeManager.classifyReceipt({ statusName: 'ACCEPTED', txExecutionResultName: 'NOT_VOTED' }).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ statusName: 'FINALIZED', txExecutionResultName: 'NOT_VOTED' }).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ statusName: 'FINALIZED', txExecutionResultName: 'FUTURE_VALUE' }).type).toBe('TERMINAL_AMBIGUOUS');
      expect(writeManager.classifyReceipt({ statusName: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_ERROR' }).type).toBe('FINALIZED_FAILURE');
    });
    it('classifies NON_TERMINAL states', () => {
      expect(writeManager.classifyReceipt(null).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ status: 'PENDING' }).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ status: 'PROPOSED' }).type).toBe('NON_TERMINAL');
      expect(writeManager.classifyReceipt({ status: 'UNDETERMINED' }).type).toBe('NON_TERMINAL');
    });

    it('classifies success only with FINALIZED plus execution SUCCESS', () => {
      const fullRes = writeManager.classifyReceipt({
        status: 'FINALIZED',
        execution_result: { status: 'SUCCESS', result: '0x123' },
      });
      expect(fullRes.type).toBe('FINALIZED_SUCCESS');

      const simplifiedRes = writeManager.classifyReceipt({
        status: 'FINALIZED',
      });
      expect(simplifiedRes.type).toBe('TERMINAL_AMBIGUOUS');

      const successRes = writeManager.classifyReceipt({
        status: 'SUCCESS',
      });
      expect(successRes.type).toBe('TERMINAL_AMBIGUOUS');
    });

    it('classifies FINALIZED_FAILURE and REJECTED states', () => {
      const res1 = writeManager.classifyReceipt({
        status: 'FINALIZED',
        execution_result: { status: 'ERROR', error: 'Out of gas' },
      });
      expect(res1.type).toBe('FINALIZED_FAILURE');

      const res2 = writeManager.classifyReceipt({
        status: 'REJECTED',
        error: 'Execution rejected',
      });
      expect(res2.type).toBe('FINALIZED_FAILURE');
    });

    it('classifies TERMINAL_AMBIGUOUS states', () => {
      const res = writeManager.classifyReceipt({
        status: 'FINALIZED',
        execution_result: { status: 'UNKNOWN' },
      });
      expect(res.type).toBe('TERMINAL_AMBIGUOUS');
    });
  });

  it('keeps an ambiguous broadcast timeout pending and blocks duplicate retry', async () => {
    const client = {
      estimateTransactionFeesForWrite: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 1n }),
      simulateWriteContract: vi.fn().mockResolvedValue({}),
      estimateTransactionFeesFromSimulation: vi.fn().mockResolvedValue({ distribution: {}, messageAllocations: [], feeValue: 1n }),
      writeContract: vi.fn().mockRejectedValue(new Error('transport timeout after broadcast')),
    };
    sdkMocks.createClient.mockReturnValue(client);
    const first = await writeManager.executeWrite(mockWallet, 'activate_channel', [1], async () => null);
    expect(first.success).toBe(false);
    expect(writeManager.getStage()).toBe('RECONCILIATION_REQUIRED');
    expect(writeManager.loadJournal()[0].status).toBe('PENDING');
    expect(writeManager.loadJournal()[0].hash).toBe('');
    await expect(writeManager.executeWrite(mockWallet, 'activate_channel', [1], async () => null)).rejects.toThrow(/pending|unresolved/i);
  });

  // Test Manual Check Now reconciliation
  describe('checkPendingTx reconciliation', () => {
    it('allows checking and updating pending transaction status', async () => {
      const entry = {
        intentId: 'intent-check',
        account: mockWallet.address,
        chainId: 61997,
        contractAddress: appConfig.contractAddress,
        method: 'activate_channel',
        args: [1],
        createdAt: Date.now(),
        hash: '0xcheck123',
        status: 'PENDING' as const,
      };
      writeManager.saveJournal([entry]);

      const mockRawClient = {
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: 'FINALIZED',
          execution_result: { status: 'SUCCESS' },
        }),
      };
      vi.spyOn(rpcClient, 'getRawClient').mockReturnValue(mockRawClient as any);

      const status = await writeManager.checkPendingTx('0xcheck123');
      expect(status).toBe('FINALIZED');
      expect(writeManager.loadJournal()[0].status).toBe('FINALIZED');
    });
  });
});
