import { ClobClient, Side, Chain } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import { JsonRpcProvider } from '@ethersproject/providers';
import { config, privateKey, rpcUrl } from './config';

export interface Position {
  marketId: string;
  size: number;
  averagePrice?: number;
  outcome?: string;
}

export interface OrderBook {
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
}

export class PolymarketClient {
  private clob: ClobClient;

  constructor() {
    const chainId = (process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : config.chainId) as Chain;
    const signer = privateKey ? new Wallet(privateKey, rpcUrl ? new JsonRpcProvider(rpcUrl) : undefined) : undefined;
    this.clob = new ClobClient(config.clobApiUrl, chainId, signer);
  }

  async getOpenPositions(wallet: string): Promise<Position[]> {
    const url = `${config.dataApiUrl}/positions?user=${wallet}&open=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((p: any) => ({
        marketId: String(p.marketId ?? p.market_id ?? ''),
        size: Number(p.size ?? p.shares ?? 0),
        averagePrice: p.averagePrice ?? p.price ?? p.avgPrice,
        outcome: p.outcome ?? p.token?.outcome
      })).filter(p => p.marketId && p.size > 0);
    } catch (err) {
      console.error('Erreur récupération positions :', err);
      return [];
    }
  }

  async getOrderBook(marketId: string): Promise<OrderBook | null> {
    try {
      const ob = await this.clob.getOrderBook(marketId);
      const bestBid = ob?.bids?.[0]?.price ? Number(ob.bids[0].price) : undefined;
      const bestAsk = ob?.asks?.[0]?.price ? Number(ob.asks[0].price) : undefined;
      const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
      if (!midpoint) return null;
      return { bestBid, bestAsk, midpoint };
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('No orderbook exists') || msg.includes('404')) {
        console.log('Marché fermé → ignoré');
        return null;
      }
      console.error('Erreur orderbook :', err);
      return null;
    }
  }

  async placeOrder(params: { marketId: string; side: 'buy' | 'sell'; price: number; size: number }) {
    try {
      const { marketId, side, price, size } = params;
      if (!privateKey) {
        console.warn('⚠️  Pas de PRIVATE_KEY → ordre non envoyé');
        return null;
      }
      const tickSize = await this.clob.getTickSize(marketId);
      const userOrder = {
        tokenID: marketId,
        side: side === 'buy' ? Side.BUY : Side.SELL,
        price,
        size
      };
      const result = await this.clob.createAndPostOrder(userOrder, { tickSize });
      return result || null;
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('No orderbook exists') || msg.includes('404')) {
        console.log('Marché fermé → ignoré');
        return null;
      }
      console.error('Erreur envoi ordre :', err);
      return null;
    }
  }
}