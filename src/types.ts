export type OutcomeSide = "yes" | "no";

export interface WalletToCopy {
  address: string;
  nickname?: string;
  marketsWhitelist?: string[];
}

export type SizingMode =
  | { mode: "balancePercent"; percent: number; maxPerTrade?: number }
  | { mode: "fixedMax"; amount: number };

export interface CopyConfig {
  walletsToCopy: WalletToCopy[];
  pollIntervalMs: number;
  pendingWindowMs: number;
  drawdown: { min: number; max: number };
  takeProfits: { target: number; percent: number }[];
  trailing: { enabled: boolean; percent: number };
  slippageBps: number;
  maxRetries: number;
  approveIfNeeded: boolean;
  sizing: SizingMode;
  debug: boolean;
  prettyLogs?: boolean;
}

export interface RemotePosition {
  wallet: string;
  marketId: string;
  tokenId: string;
  outcome: OutcomeSide;
  size: number;
  entryPrice: number;
  currentPrice: number;
}

export interface MarketPrice {
  marketId: string;
  midpoint: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface OrderRequest {
  marketId: string;
  tokenId: string;
  outcome: OutcomeSide;
  size: number;
  price: number;
  side: "buy" | "sell";
}

export interface CopiedPositionState {
  marketId: string;
  tokenId?: string;
  outcome: OutcomeSide;
  entryPrice: number;
  peakPrice: number;
  size: number;
  remainingSize: number;
  tpIndexReached: number;
  maxSeenPrice: number;
  trailingArmed: boolean;
}

