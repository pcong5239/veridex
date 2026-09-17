export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  explorerBaseUrl: string;
  contractAddress: string;
  isConfigured: boolean;
  configError: string | null;
}

export const appConfig: AppConfig = (() => {
  const rpcUrl = import.meta.env.VITE_GENLAYER_RPC_URL || 'https://studio-dev.genlayer.com/api';
  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 61997);
  const explorerBaseUrl = import.meta.env.VITE_EXPLORER_BASE_URL || 'https://explorer-studio-dev.genlayer.com';
  const rawAddr = (import.meta.env.VITE_CONTRACT_ADDRESS || '').trim();

  let contractAddress = '';
  let isConfigured = false;
  let configError: string | null = null;

  if (!rawAddr) {
    configError = 'Contract address is not configured. Deploy Veridex on the Studio development preview and set VITE_CONTRACT_ADDRESS.';
  } else if (!/^0x[0-9a-fA-F]{40}$/.test(rawAddr)) {
    configError = `Invalid contract address format: "${rawAddr}". Expected a 42-character 0x-prefixed hex address.`;
  } else {
    contractAddress = rawAddr;
    isConfigured = true;
  }

  return {
    rpcUrl,
    chainId,
    explorerBaseUrl,
    contractAddress,
    isConfigured,
    configError,
  };
})();
