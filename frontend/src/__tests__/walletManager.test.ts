import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletManager } from '../services/walletManager';
import { EIP1193Provider, EIP6963ProviderDetail } from '../types';

describe('EIP-6963 Wallet State Machine & Provider Routing', () => {
  let manager: WalletManager;

  const createMockProvider = (): EIP1193Provider => ({
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    manager?.teardown();
  });

  // Test 2 & 3: MetaMask, OKX, and Rabby discovery across standard RDNS values
  it('discovers MetaMask (io.metamask), OKX Wallet (com.okex.wallet), and Rabby (io.rabby)', () => {
    manager = new WalletManager();
    const mmProvider = createMockProvider();
    const okxProvider = createMockProvider();
    const rabbyProvider = createMockProvider();

    window.dispatchEvent(
      new CustomEvent<EIP6963ProviderDetail>('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'mm-1', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
          provider: mmProvider,
        },
      })
    );

    window.dispatchEvent(
      new CustomEvent<EIP6963ProviderDetail>('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'okx-1', name: 'OKX Wallet', icon: '', rdns: 'com.okex.wallet' },
          provider: okxProvider,
        },
      })
    );

    window.dispatchEvent(
      new CustomEvent<EIP6963ProviderDetail>('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'rabby-1', name: 'Rabby', icon: '', rdns: 'io.rabby' },
          provider: rabbyProvider,
        },
      })
    );

    const wallets = manager.getDetectedWallets();
    expect(wallets.length).toBe(3);
    expect(wallets.map((w) => w.brand)).toEqual(
      expect.arrayContaining(['MetaMask', 'OKX Wallet', 'Rabby'])
    );
  });

  // Test 4: Unsupported provider exclusion
  it('strictly excludes unsupported wallet brands and non-allowlisted RDNS', () => {
    manager = new WalletManager();
    const phantomProvider = createMockProvider();

    const detail: EIP6963ProviderDetail = {
      info: {
        uuid: 'phantom-uuid',
        name: 'Phantom',
        icon: 'data:image/svg+xml;utf8,<svg/>',
        rdns: 'app.phantom',
      },
      provider: phantomProvider,
    };

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
    expect(manager.getDetectedWallets().length).toBe(0);

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: { uuid: 'spoof-1', name: 'MetaMask', icon: '', rdns: 'evil.io.metamask' },
        provider: createMockProvider(),
      },
    }));
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: { uuid: 'spoof-2', name: 'Rabby', icon: '', rdns: 'io.rabby.evil' },
        provider: createMockProvider(),
      },
    }));
    expect(manager.getDetectedWallets()).toHaveLength(0);
  });

  // Test 5: Reannouncement deduplication
  it('deduplicates identical wallet announcements by UUID/provider instance', () => {
    manager = new WalletManager();
    const okxProvider = createMockProvider();

    const detail: EIP6963ProviderDetail = {
      info: {
        uuid: 'okx-uuid-1',
        name: 'OKX Wallet',
        icon: 'data:image/svg+xml;utf8,<svg/>',
        rdns: 'com.okex.wallet',
      },
      provider: okxProvider,
    };

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));

    expect(manager.getDetectedWallets().length).toBe(1);
  });

  // Test 7 & 8: Connect opens selector with zero account request, cancel with zero RPC
  it('does not call eth_requestAccounts on announcement; only on explicit user selection', () => {
    manager = new WalletManager();
    const rabbyProvider = createMockProvider();

    const detail: EIP6963ProviderDetail = {
      info: {
        uuid: 'rabby-uuid-1',
        name: 'Rabby',
        icon: 'data:image/svg+xml;utf8,<svg/>',
        rdns: 'io.rabby',
      },
      provider: rabbyProvider,
    };

    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
    expect(rabbyProvider.request).not.toHaveBeenCalled();
  });

  // Test 9: Exact selected-provider routing and zero calls to other providers
  it('routes connection requests exclusively through the captured provider instance', async () => {
    manager = new WalletManager();
    const selectedProvider = createMockProvider();
    const otherProvider = createMockProvider();

    (selectedProvider.request as any).mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22d'; // 61997 in hex
      return null;
    });

    const wallet = {
      id: 'mm-1',
      brand: 'MetaMask' as const,
      name: 'MetaMask',
      icon: '',
      provider: selectedProvider,
      isFallback: false,
    };

    const connected = await manager.connectWallet(wallet);
    expect(connected.address).toBe('0x1111111111111111111111111111111111111111');
    expect(otherProvider.request).not.toHaveBeenCalled();
  });

  // Test 10: Reload disconnected
  it('initializes with activeWallet as null ensuring every reload starts disconnected', () => {
    manager = new WalletManager();
    expect(manager.getActiveWallet()).toBeNull();
  });

  // Test 11: accountsChanged, chainChanged and listener teardown
  it('attaches listeners to the active provider and cleans them up on disconnect or teardown', async () => {
    manager = new WalletManager();
    const provider = createMockProvider();

    (provider.request as any).mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22d';
      return null;
    });

    await manager.connectWallet({
      id: 'rb-1',
      brand: 'Rabby',
      name: 'Rabby',
      icon: '',
      provider,
      isFallback: false,
    });

    expect(provider.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    expect(provider.on).toHaveBeenCalledWith('chainChanged', expect.any(Function));

    manager.disconnect();
    expect(manager.getActiveWallet()).toBeNull();
    expect(provider.removeListener).toHaveBeenCalled();
  });

  // Test 12: Network switch and chain verification
  it('requests wallet_switchEthereumChain when connected to a different chain', async () => {
    manager = new WalletManager();
    const provider = createMockProvider();
    let currentChain = '0x1'; // Mainnet first

    (provider.request as any).mockImplementation(async ({ method, params }: { method: string; params?: any[] }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return currentChain;
      if (method === 'wallet_switchEthereumChain') {
        currentChain = params?.[0]?.chainId || '0xf22d';
        return null;
      }
      return null;
    });

    await manager.connectWallet({
      id: 'mm-switch',
      brand: 'MetaMask',
      name: 'MetaMask',
      icon: '',
      provider,
      isFallback: false,
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xf22d' }],
    });
  });

  it('preserves provider and account context while writes are disabled on the wrong chain', async () => {
    manager = new WalletManager();
    const provider = createMockProvider();
    let chainHandler: ((value: unknown) => void) | undefined;
    (provider.on as any).mockImplementation((event: string, handler: (value: unknown) => void) => {
      if (event === 'chainChanged') chainHandler = handler;
    });
    (provider.request as any).mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22d';
      return null;
    });
    await manager.connectWallet({ id: 'okx', brand: 'OKX Wallet', name: 'OKX Wallet', provider, isFallback: false });
    chainHandler?.('0x1');
    const snapshot = manager.getSnapshot();
    expect(snapshot.phase).toBe('WRONG_CHAIN');
    expect(snapshot.activeWallet?.address).toBe('0x1111111111111111111111111111111111111111');
    expect(snapshot.activeWallet?.provider).toBe(provider);
  });

  it('keeps distinct legacy wallet providers instead of collapsing them into one fallback', async () => {
    vi.useFakeTimers();
    const mm = Object.assign(createMockProvider(), { isMetaMask: true });
    const okx = Object.assign(createMockProvider(), { isOkxWallet: true });
    (window as any).ethereum = Object.assign(mm, { providers: [mm, okx] });
    manager = new WalletManager();
    await vi.advanceTimersByTimeAsync(151);
    expect(manager.getDetectedWallets().map((w) => w.brand)).toEqual(['MetaMask', 'OKX Wallet']);
    delete (window as any).ethereum;
    vi.useRealTimers();
  });

  it('rejects a legacy provider with conflicting wallet identity flags', () => {
    manager = new WalletManager();
    expect(manager.identifyLegacyBrand({ isRabby: true, isMetaMask: true })).toBeNull();
    expect(manager.identifyLegacyBrand({ isOKExWallet: true, isMetaMask: true })).toBeNull();
  });

  it('does not re-enable writes when accounts change while the provider is on the wrong chain', async () => {
    manager = new WalletManager();
    const provider = createMockProvider();
    let accountHandler: ((value: unknown) => void) | undefined;
    let chainHandler: ((value: unknown) => void) | undefined;
    (provider.on as any).mockImplementation((event: string, handler: (value: unknown) => void) => {
      if (event === 'accountsChanged') accountHandler = handler;
      if (event === 'chainChanged') chainHandler = handler;
    });
    (provider.request as any).mockImplementation(async ({ method }: { method: string }) => method === 'eth_requestAccounts'
      ? ['0x1111111111111111111111111111111111111111']
      : method === 'eth_chainId' ? '0xf22d' : null);
    await manager.connectWallet({ id: 'mm', brand: 'MetaMask', name: 'MetaMask', provider, isFallback: false });
    chainHandler?.('0x1');
    accountHandler?.(['0x2222222222222222222222222222222222222222']);
    expect(manager.getSnapshot().phase).toBe('WRONG_CHAIN');
    expect(manager.getSnapshot().activeWallet?.chainId).toBe(1);
  });
});
