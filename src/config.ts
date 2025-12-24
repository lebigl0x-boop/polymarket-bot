import 'dotenv/config';

export interface CopyConfig {
  walletToCopy: string;
  pollingMs: number;
  copyAmountUsd: number;
  drawdownMinPct: number;
  drawdownMaxPct: number;
  takeProfits: number[];
  trailingStopPct: number;
  minSizeIncreaseRatio: number;
  clobApiUrl: string;
  dataApiUrl: string;
  chainId: number;
}

const requiredWallet = process.env.WALLET_TO_COPY || '0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d';

export const config: CopyConfig = {
  walletToCopy: requiredWallet,
  pollingMs: Number(process.env.POLLING_MS || 2000),
  copyAmountUsd: Number(process.env.COPY_AMOUNT_USD || 100),
  drawdownMinPct: Number(process.env.DRAWDOWN_MIN_PCT || 0.05),
  drawdownMaxPct: Number(process.env.DRAWDOWN_MAX_PCT || 0.1),
  takeProfits: [0.05, 0.1, 0.15],
  trailingStopPct: Number(process.env.TRAILING_STOP_PCT || 0.03),
  minSizeIncreaseRatio: Number(process.env.MIN_SIZE_INCREASE_RATIO || 0.05),
  clobApiUrl: process.env.CLOB_API_URL || 'https://clob.polymarket.com',
  dataApiUrl: process.env.DATA_API_URL || 'https://data-api.polymarket.com',
  chainId: Number(process.env.CHAIN_ID || 137)
};

export const privateKey = process.env.PRIVATE_KEY || '';
export const rpcUrl = process.env.RPC_URL || '';

if (!privateKey) {
  console.warn('⚠️  PRIVATE_KEY absent (.env) → les ordres ne pourront pas être signés');
}