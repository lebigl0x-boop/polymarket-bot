"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolymarketClient = void 0;
const clob_client_1 = require("@polymarket/clob-client");
const wallet_1 = require("@ethersproject/wallet");
const providers_1 = require("@ethersproject/providers");
const config_1 = require("./config");
class PolymarketClient {
    constructor() {
        const chainId = (process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : config_1.config.chainId);
        const signer = config_1.privateKey ? new wallet_1.Wallet(config_1.privateKey, config_1.rpcUrl ? new providers_1.JsonRpcProvider(config_1.rpcUrl) : undefined) : undefined;
        this.clob = new clob_client_1.ClobClient(config_1.config.clobApiUrl, chainId, signer);
    }
    async getOpenPositions(wallet) {
        const url = `${config_1.config.dataApiUrl}/positions?user=${wallet}&open=true`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!Array.isArray(data))
                return [];
            return data.map((p) => ({
                marketId: String(p.marketId ?? p.market_id ?? ''),
                size: Number(p.size ?? p.shares ?? 0),
                averagePrice: p.averagePrice ?? p.price ?? p.avgPrice,
                outcome: p.outcome ?? p.token?.outcome
            })).filter(p => p.marketId && p.size > 0);
        }
        catch (err) {
            console.error('Erreur récupération positions :', err);
            return [];
        }
    }
    async getOrderBook(marketId) {
        try {
            const ob = await this.clob.getOrderBook(marketId);
            const bestBid = ob?.bids?.[0]?.price ? Number(ob.bids[0].price) : undefined;
            const bestAsk = ob?.asks?.[0]?.price ? Number(ob.asks[0].price) : undefined;
            const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
            if (!midpoint)
                return null;
            return { bestBid, bestAsk, midpoint };
        }
        catch (err) {
            const msg = err?.message || '';
            if (msg.includes('No orderbook exists') || msg.includes('404')) {
                console.log('Marché fermé → ignoré');
                return null;
            }
            console.error('Erreur orderbook :', err);
            return null;
        }
    }
    async placeOrder(params) {
        try {
            const { marketId, side, price, size } = params;
            if (!config_1.privateKey) {
                console.warn('⚠️  Pas de PRIVATE_KEY → ordre non envoyé');
                return null;
            }
            const tickSize = await this.clob.getTickSize(marketId);
            const userOrder = {
                tokenID: marketId,
                side: side === 'buy' ? clob_client_1.Side.BUY : clob_client_1.Side.SELL,
                price,
                size
            };
            const result = await this.clob.createAndPostOrder(userOrder, { tickSize });
            return result || null;
        }
        catch (err) {
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
exports.PolymarketClient = PolymarketClient;
