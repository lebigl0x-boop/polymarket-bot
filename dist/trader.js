"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trader = void 0;
const config_1 = require("./config");
class Trader {
    constructor(client) {
        this.knownTargetPositions = new Map();
        this.sessions = new Map();
        this.client = client;
    }
    diffNewPositions(latest) {
        const newcomers = [];
        for (const pos of latest) {
            const prevSize = this.knownTargetPositions.get(pos.marketId) || 0;
            const size = pos.size;
            const increased = size > prevSize * (1 + config_1.config.minSizeIncreaseRatio);
            const brandNew = prevSize === 0 && size > 0;
            if ((brandNew || increased) && pos.averagePrice) {
                newcomers.push(pos);
            }
            // Mise à jour du snapshot pour la prochaine itération
            this.knownTargetPositions.set(pos.marketId, size);
        }
        return newcomers;
    }
    isMarketOpen(midpoint) {
        if (!midpoint)
            return false;
        return midpoint > 0.01 && midpoint < 0.99;
    }
    startSession(pos, midpoint) {
        const marketLabel = pos.title || pos.slug || pos.marketId;
        const avgDisplay = pos.averagePrice !== undefined ? pos.averagePrice.toFixed(4) : 'n/a';
        const sizeDisplay = pos.size.toFixed(2);
        const session = {
            marketId: pos.marketId,
            tokenId: pos.tokenId,
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
        console.log(`Nouveau trade détecté ${marketLabel} (${pos.outcome ?? '?'}) size ${sizeDisplay} @${avgDisplay} → attente drawdown`);
    }
    async tryEnter(session, midpoint) {
        const drawdown = (session.peakPrice - midpoint) / session.peakPrice;
        if (drawdown < config_1.config.drawdownMinPct || drawdown > config_1.config.drawdownMaxPct) {
            if (midpoint > session.peakPrice)
                session.peakPrice = midpoint;
            return;
        }
        const sizeToBuy = config_1.config.copyAmountUsd / midpoint;
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
            console.log(`Drawdown ${(drawdown * 100).toFixed(2)}% atteint → entry ${config_1.config.copyAmountUsd} USD`);
        }
    }
    async handleTakeProfits(session, midpoint) {
        if (!session.copyEntryPrice || !session.remainingSize)
            return;
        const profit = (midpoint - session.copyEntryPrice) / session.copyEntryPrice;
        if (midpoint > session.peakPrice) {
            session.peakPrice = midpoint;
        }
        const sellPortion = async (ratio, label) => {
            const size = session.remainingSize * ratio;
            if (size <= 0)
                return;
            const order = await this.client.placeOrder({
                marketId: session.marketId,
                side: 'sell',
                price: midpoint,
                size
            });
            if (order !== null) {
                session.remainingSize = session.remainingSize - size;
                console.log(`${label} atteint → vente ${(ratio * 100).toFixed(0)}%`);
            }
        };
        if (!session.tp1 && profit >= config_1.config.takeProfits[0]) {
            session.tp1 = true;
            await sellPortion(0.33, 'TP1');
        }
        if (!session.tp2 && profit >= config_1.config.takeProfits[1]) {
            session.tp2 = true;
            await sellPortion(0.33, 'TP2');
        }
        if (!session.tp3 && profit >= config_1.config.takeProfits[2]) {
            session.tp3 = true;
            await sellPortion(1, 'TP3');
            session.state = 'finished';
            return;
        }
        // Trailing stop 3% sous le peak après au moins un TP
        const trailingActive = session.tp1 || session.tp2 || session.tp3;
        const trailingStopPrice = session.peakPrice * (1 - config_1.config.trailingStopPct);
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
            }
            else {
                session.state = 'finished';
            }
        }
    }
    cleanupFinishedSessions() {
        for (const [marketId, session] of this.sessions.entries()) {
            if (session.state === 'finished') {
                this.sessions.delete(marketId);
            }
        }
    }
    async tick() {
        const positions = await this.client.getOpenPositions(config_1.config.walletToCopy);
        const newcomers = this.diffNewPositions(positions);
        for (const pos of newcomers) {
            const ob = await this.client.getOrderBook(pos.tokenId);
            if (!ob || !this.isMarketOpen(ob.midpoint)) {
                console.log('Marché fermé → ignoré');
                continue;
            }
            this.startSession(pos, ob.midpoint);
        }
        for (const session of this.sessions.values()) {
            const ob = await this.client.getOrderBook(session.tokenId);
            const midpoint = ob?.midpoint;
            if (!midpoint || !this.isMarketOpen(midpoint)) {
                console.log('Marché fermé → ignoré');
                continue;
            }
            if (session.state === 'waiting_drawdown') {
                await this.tryEnter(session, midpoint);
            }
            else if (session.state === 'entered') {
                await this.handleTakeProfits(session, midpoint);
            }
        }
        this.cleanupFinishedSessions();
    }
}
exports.Trader = Trader;
