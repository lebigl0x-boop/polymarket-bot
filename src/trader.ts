import { config } from './config';
import { PolymarketClient, Position } from './polymarket';

type SessionState = 'waiting_drawdown' | 'entered' | 'finished';

interface CopySession {
  marketId: string;
  targetOutcome?: string;
  targetEntryPrice: number;
  detectedSize: number;
  state: SessionState;
  peakPrice: number;
  copyEntryPrice?: number;
  remainingSize?: number;
  tp1: boolean;
  tp2: boolean;
  tp3: boolean;
}

export class Trader {
  private client: PolymarketClient;
  private knownTargetPositions = new Map<string, number>();
  private sessions = new Map<string, CopySession>();

  constructor(client: PolymarketClient) {
    this.client = client;
  }

  private diffNewPositions(latest: Position[]): Position[] {
    const newcomers: Position[] = [];
    for (const pos of latest) {
      const prevSize = this.knownTargetPositions.get(pos.marketId) || 0;
      const size = pos.size;
      const increased = size > prevSize * (1 + config.minSizeIncreaseRatio);
      const brandNew = prevSize === 0 && size > 0;
      if ((brandNew || increased) && pos.averagePrice) {
        newcomers.push(pos);
      }
      // Mise à jour du snapshot pour la prochaine itération
      this.knownTargetPositions.set(pos.marketId, size);
    }
    return newcomers;
  }

  private isMarketOpen(midpoint: number | undefined): boolean {
    if (!midpoint) return false;
    return midpoint > 0.01 && midpoint < 0.99;
  }

  private startSession(pos: Position, midpoint: number) {
    const session: CopySession = {
      marketId: pos.marketId,
      targetOutcome: pos.outcome,
      targetEntryPrice: pos.averagePrice || midpoint,
      detectedSize: pos.size,
      state: 'waiting_drawdown',
      peakPrice: midpoint,
      tp1: false,
      tp2: false,
      tp3: false
    };
    this.sessions.set(pos.marketId, session);
    console.log('Nouveau trade détecté sur marché ouvert → attente drawdown');
  }

  private async tryEnter(session: CopySession, midpoint: number) {
    const drawdown = (session.peakPrice - midpoint) / session.peakPrice;
    if (drawdown < config.drawdownMinPct || drawdown > config.drawdownMaxPct) {
      if (midpoint > session.peakPrice) session.peakPrice = midpoint;
      return;
    }

    const sizeToBuy = config.copyAmountUsd / midpoint;
    const order = await this.client.placeOrder({
      marketId: session.marketId,
      side: 'buy',
      price: midpoint,
      size: sizeToBuy
    });
    if (order !== null) {
      session.state = 'entered';
      session.copyEntryPrice = midpoint;
      session.remainingSize = sizeToBuy;
      session.peakPrice = midpoint;
      console.log(`Drawdown ${(drawdown * 100).toFixed(2)}% atteint → entry ${config.copyAmountUsd} USD`);
    }
  }

  private async handleTakeProfits(session: CopySession, midpoint: number) {
    if (!session.copyEntryPrice || !session.remainingSize) return;
    const profit = (midpoint - session.copyEntryPrice) / session.copyEntryPrice;
    if (midpoint > session.peakPrice) {
      session.peakPrice = midpoint;
    }

    const sellPortion = async (ratio: number, label: string) => {
      const size = session.remainingSize! * ratio;
      if (size <= 0) return;
      const order = await this.client.placeOrder({
        marketId: session.marketId,
        side: 'sell',
        price: midpoint,
        size
      });
      if (order !== null) {
        session.remainingSize = session.remainingSize! - size;
        console.log(`${label} atteint → vente ${(ratio * 100).toFixed(0)}%`);
      }
    };

    if (!session.tp1 && profit >= config.takeProfits[0]) {
      session.tp1 = true;
      await sellPortion(0.33, 'TP1');
    }
    if (!session.tp2 && profit >= config.takeProfits[1]) {
      session.tp2 = true;
      await sellPortion(0.33, 'TP2');
    }
    if (!session.tp3 && profit >= config.takeProfits[2]) {
      session.tp3 = true;
      await sellPortion(1, 'TP3');
      session.state = 'finished';
      return;
    }

    // Trailing stop 3% sous le peak après au moins un TP
    const trailingActive = session.tp1 || session.tp2 || session.tp3;
    const trailingStopPrice = session.peakPrice * (1 - config.trailingStopPct);
    if (trailingActive && midpoint <= trailingStopPrice && session.state === 'entered') {
      const sizeLeft = session.remainingSize || 0;
      if (sizeLeft > 0) {
        const order = await this.client.placeOrder({
          marketId: session.marketId,
          side: 'sell',
          price: midpoint,
          size: sizeLeft
        });
        if (order !== null) {
          session.remainingSize = 0;
          session.state = 'finished';
          console.log('Trailing stop déclenché → sortie totale');
        }
      } else {
        session.state = 'finished';
      }
    }
  }

  private cleanupFinishedSessions() {
    for (const [marketId, session] of this.sessions.entries()) {
      if (session.state === 'finished') {
        this.sessions.delete(marketId);
      }
    }
  }

  async tick() {
    const positions = await this.client.getOpenPositions(config.walletToCopy);
    const newcomers = this.diffNewPositions(positions);

    for (const pos of newcomers) {
      const ob = await this.client.getOrderBook(pos.marketId);
      if (!ob || !this.isMarketOpen(ob.midpoint)) {
        console.log('Marché fermé → ignoré');
        continue;
      }
      this.startSession(pos, ob.midpoint!);
    }

    for (const session of this.sessions.values()) {
      const ob = await this.client.getOrderBook(session.marketId);
      const midpoint = ob?.midpoint;
      if (!midpoint || !this.isMarketOpen(midpoint)) {
        console.log('Marché fermé → ignoré');
        continue;
      }
      if (session.state === 'waiting_drawdown') {
        await this.tryEnter(session, midpoint);
      } else if (session.state === 'entered') {
        await this.handleTakeProfits(session, midpoint);
      }
    }

    this.cleanupFinishedSessions();
  }
}

