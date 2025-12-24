import axios from "axios";
import { config } from "./config.js";
const POSITION_SOURCES = [
    // Data API (préféré)
    process.env.POSITIONS_URL ??
        "https://data-api.polymarket.com/positions?user={wallet}",
    // Gamma fallback
    "https://gamma-api.polymarket.com/positions?owner={wallet}&open=true",
    "https://gamma-api.polymarket.com/positions?address={wallet}&open=true",
];
export class PolymarketService {
    static async create() {
        console.log("🧪 MODE SIMULATION: Initialisation du service Polymarket");
        return new PolymarketService();
    }
    constructor() {
        // Pas de wallet, pas de client - juste la simulation
    }
    async ensureUsdcAllowance(amount) {
        if (!config.approveIfNeeded)
            return;
        console.log(`🧪 SIMULATION: Allowance USDC vérifiée pour ${amount.toFixed(2)} USDC`);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    getWalletAddress() {
        return "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"; // Adresse factice
    }
    async getUsdcBalance() {
        console.log(`🧪 SIMULATION: Balance USDC: 100.00 $`);
        return 100.00; // Balance simulée pour les tests
    }
    async fetchOpenPositions(wallet) {
        let lastErr;
        for (const src of POSITION_SOURCES) {
            const url = src.replace("{wallet}", wallet);
            try {
                const res = await axios.get(url, { timeout: 8000 });
                const positions = Array.isArray(res.data?.data)
                    ? res.data.data
                    : res.data?.positions ?? res.data ?? [];
                if (!positions || positions.length === 0)
                    continue;
                return positions.map((p) => ({
                    wallet,
                    marketId: p.conditionId ?? p.market ?? p.market_id ?? p.condition_id,
                    tokenId: p.asset ?? p.tokenId ?? p.token_id ?? "",
                    outcome: (p.outcomeIndex ?? p.outcome_id ?? p.outcome ?? 1) === 0 ? "yes" : "no",
                    size: Number(p.amount ?? p.shares ?? p.size ?? 0),
                    entryPrice: Number(p.avg_cost ?? p.entry_price ?? p.avgPrice ?? 0),
                    currentPrice: Number(p.price ?? p.mark_price ?? p.current_price ?? p.curPrice ?? 0),
                }));
            }
            catch (err) {
                lastErr = err;
                continue;
            }
        }
        if (lastErr)
            throw lastErr;
        return [];
    }
    async getMidPrice(marketId, tokenId, outcome) {
        // Simuler un orderbook avec des prix réalistes
        const basePrice = 0.5; // Prix de base
        const spread = 0.02; // Spread de 2%
        const bid = basePrice - spread / 2;
        const ask = basePrice + spread / 2;
        const midpoint = (bid + ask) / 2;
        console.log(`🧪 SIMULATION: Midprice pour ${marketId.slice(0, 8)}... ${outcome}: ${midpoint.toFixed(4)} (bid: ${bid.toFixed(4)}, ask: ${ask.toFixed(4)})`);
        return {
            marketId,
            midpoint,
            bid,
            ask,
            timestamp: Date.now(),
        };
    }
    priceWithSlippage(price, side) {
        const adj = side === "buy"
            ? price * (1 + config.slippageBps / 10000)
            : price * (1 - config.slippageBps / 10000);
        return Number(adj.toFixed(4));
    }
    async placeOrder(order) {
        const price = this.priceWithSlippage(order.price, order.side);
        console.log(`🧪 SIMULATION: ${order.side.toUpperCase()} ${order.size.toFixed(4)} ${order.outcome.toUpperCase()} @ ${price.toFixed(4)} ($${(order.size * price).toFixed(2)})`);
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 100));
        // Générer un faux orderId
        const mockOrderId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`   ✅ SIMULATION: Ordre simulé avec ID: ${mockOrderId}`);
        return mockOrderId;
    }
}
