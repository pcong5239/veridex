import { DetectedWallet, ConnectedWallet, WalletBrand, EIP1193Provider, EIP6963ProviderDetail, WalletSnapshot } from '../types';
import { appConfig } from '../config';

const TARGET_CHAIN_HEX = `0x${appConfig.chainId.toString(16)}`;

export class WalletManager {
  private detectedWallets = new Map<string, DetectedWallet>();
  private snapshot: WalletSnapshot = { phase: 'DISCOVERING', detectedWallets: [], activeWallet: null, error: null };
  private listeners: Array<() => void> = [];
  private announcementListener: ((event: Event) => void) | null = null;
  private attachedProviderListeners: { provider: EIP1193Provider; accountsHandler: (v: unknown) => void; chainHandler: (v: unknown) => void } | null = null;

  constructor() { this.initDiscovery(); }
  public subscribe(callback: () => void): () => void { this.listeners.push(callback); return () => { this.listeners = this.listeners.filter((cb) => cb !== callback); }; }
  public getSnapshot(): WalletSnapshot { return { ...this.snapshot, detectedWallets: [...this.snapshot.detectedWallets] }; }
  public getDetectedWallets(): DetectedWallet[] { return [...this.snapshot.detectedWallets]; }
  public getActiveWallet(): ConnectedWallet | null { return this.snapshot.activeWallet; }
  public openChooser(): void { this.update({ phase: 'CHOOSER_OPEN', error: null }); }
  public closeChooser(): void { this.update({ phase: this.snapshot.activeWallet ? this.snapshot.phase : 'DISCONNECTED' }); }
  private update(patch: Partial<WalletSnapshot>): void { this.snapshot = { ...this.snapshot, ...patch, detectedWallets: Array.from(this.detectedWallets.values()) }; this.listeners.forEach((cb) => cb()); }

  public teardown(): void {
    if (typeof window !== 'undefined' && this.announcementListener) window.removeEventListener('eip6963:announceProvider', this.announcementListener);
    this.announcementListener = null; this.cleanupListeners(); this.detectedWallets.clear();
    this.snapshot = { phase: 'DISCONNECTED', detectedWallets: [], activeWallet: null, error: null }; this.listeners = [];
  }

  private register(wallet: DetectedWallet): void {
    for (const [key, existing] of this.detectedWallets) {
      if (existing.provider === wallet.provider || existing.id === wallet.id || (existing.isFallback && existing.brand === wallet.brand)) this.detectedWallets.delete(key);
    }
    this.detectedWallets.set(wallet.id, wallet);
    this.update({ phase: this.snapshot.phase === 'DISCOVERING' ? 'DISCONNECTED' : this.snapshot.phase });
  }

  private initDiscovery(): void {
    if (typeof window === 'undefined') { this.snapshot.phase = 'DISCONNECTED'; return; }
    this.announcementListener = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (!detail?.info || !detail.provider) return;
      const brand = this.identifyBrand(detail.info.rdns); if (!brand) return;
      this.register({ id: detail.info.uuid || `${brand}-${detail.info.rdns}`, brand, name: brand, icon: detail.info.icon || '', provider: detail.provider, isFallback: false });
    };
    window.addEventListener('eip6963:announceProvider', this.announcementListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      const host = window as unknown as { ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] } };
      const providers = host.ethereum?.providers?.length ? host.ethereum.providers : host.ethereum ? [host.ethereum] : [];
      providers.forEach((provider, index) => {
        const brand = this.identifyLegacyBrand(provider);
        if (brand) this.register({ id: `legacy-${brand.toLowerCase().replace(/\s/g, '-')}-${index}`, brand, name: brand, icon: '', provider, isFallback: true });
      });
      if (this.snapshot.phase === 'DISCOVERING') this.update({ phase: 'DISCONNECTED' });
    }, 150);
  }

  public identifyBrand(rdns: string): WalletBrand | null {
    const value = (rdns || '').trim().toLowerCase();
    return value === 'io.metamask' ? 'MetaMask' : value === 'com.okex.wallet' ? 'OKX Wallet' : value === 'io.rabby' ? 'Rabby' : null;
  }
  public identifyLegacyBrand(provider: unknown): WalletBrand | null {
    const p = provider as Record<string, unknown>;
    const brands: WalletBrand[] = [];
    if (p.isRabby) brands.push('Rabby');
    if (p.isOKExWallet || p.isOkxWallet) brands.push('OKX Wallet');
    if (p.isMetaMask) brands.push('MetaMask');
    return brands.length === 1 ? brands[0] : null;
  }
  private cleanupListeners(): void {
    const a = this.attachedProviderListeners;
    if (a?.provider.removeListener) { a.provider.removeListener('accountsChanged', a.accountsHandler); a.provider.removeListener('chainChanged', a.chainHandler); }
    this.attachedProviderListeners = null;
  }
  private async ensureTargetChain(provider: EIP1193Provider): Promise<void> {
    const current = await provider.request({ method: 'eth_chainId' });
    if (typeof current === 'string' && parseInt(current, 16) === appConfig.chainId) return;
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: TARGET_CHAIN_HEX }] }); }
    catch (cause: unknown) {
      const error = cause as { code?: number; message?: string };
      if (error.code !== 4902 && !error.message?.includes('4902')) throw cause;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: TARGET_CHAIN_HEX, chainName: 'GenLayer Studio development preview', rpcUrls: [appConfig.rpcUrl], nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, blockExplorerUrls: [appConfig.explorerBaseUrl] }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: TARGET_CHAIN_HEX }] });
    }
    const verified = await provider.request({ method: 'eth_chainId' });
    if (typeof verified !== 'string' || parseInt(verified, 16) !== appConfig.chainId) throw new Error('The wallet did not confirm the supported GenLayer network.');
  }

  public async connectWallet(wallet: DetectedWallet): Promise<ConnectedWallet> {
    this.update({ phase: 'CONNECTING', error: null });
    try {
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts?.[0]; if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('No valid account was authorized.');
      await this.ensureTargetChain(wallet.provider); this.cleanupListeners();
      const active: ConnectedWallet = { address, chainId: appConfig.chainId, brand: wallet.brand, provider: wallet.provider };
      const accountsHandler = (value: unknown) => {
        const next = (value as string[])?.[0]; if (!next || !/^0x[0-9a-fA-F]{40}$/.test(next)) return this.disconnect();
        const current = this.snapshot.activeWallet || active;
        const correctChain = current.chainId === appConfig.chainId;
        this.update({ activeWallet: { ...current, address: next }, phase: correctChain ? 'CONNECTED' : 'WRONG_CHAIN', error: correctChain ? null : 'Switch to the supported GenLayer network to continue.' });
      };
      const chainHandler = (value: unknown) => {
        const chainId = parseInt(String(value), 16);
        this.update({ activeWallet: { ...(this.snapshot.activeWallet || active), chainId }, phase: chainId === appConfig.chainId ? 'CONNECTED' : 'WRONG_CHAIN', error: chainId === appConfig.chainId ? null : 'Switch to the supported GenLayer network to continue.' });
      };
      wallet.provider.on?.('accountsChanged', accountsHandler); wallet.provider.on?.('chainChanged', chainHandler);
      this.attachedProviderListeners = { provider: wallet.provider, accountsHandler, chainHandler };
      this.update({ activeWallet: active, phase: 'CONNECTED', error: null }); return active;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Wallet connection failed.'; this.update({ phase: 'ERROR', error: message }); throw cause;
    }
  }
  public async recoverNetwork(): Promise<void> {
    if (!this.snapshot.activeWallet) throw new Error('No wallet is connected.');
    await this.ensureTargetChain(this.snapshot.activeWallet.provider);
    this.update({ activeWallet: { ...this.snapshot.activeWallet, chainId: appConfig.chainId }, phase: 'CONNECTED', error: null });
  }
  public disconnect(): void { this.cleanupListeners(); this.update({ activeWallet: null, phase: 'DISCONNECTED', error: null }); }
}

export const walletManager = new WalletManager();
