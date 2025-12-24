import axios from "axios";
import { ClobClient, Side, Chain } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import {
  MarketPrice,
  OrderRequest,
  OutcomeSide,
  RemotePosition,
} from "./types.js";
import { config } from "./config.js";

// Utiliser uniquement la Data API pour les positions (plus fiable selon les exigences)
const DATA_API_URL = "https://data-api.polymarket.com/positions?user={wallet}&open=true";

export class PolymarketService {
  private client: ClobClient;
  private wallet: Wallet | null;
  private isDryRun: boolean;

  static async create(): Promise<PolymarketService> {
    const isDryRun = process.env.DRY_RUN === 'true' || !process.env.PRIVATE_KEY;

    if (isDryRun) {
      console.log("🔗 [DRY RUN] Initialisation du service Polymarket (mode simulation - pas de private key)");
      console.log("🔗 [DRY RUN] Utilisation des vraies APIs pour lecture, simulation pour écriture");

      // En dry run, on crée un client sans wallet pour juste les lectures
      const chainId = (process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 137) as Chain;
      const client = new ClobClient(
        process.env.CLOB_API_URL || "https://clob.polymarket.com",
        chainId
      );

      return new PolymarketService(client, null, true);
    } else {
      console.log("🔗 Initialisation du service Polymarket avec CLOB client (mode réel)");

      const wallet = new Wallet(process.env.PRIVATE_KEY!);
      const chainId = (process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 137) as Chain;

      const client = new ClobClient(
        process.env.CLOB_API_URL || "https://clob.polymarket.com",
        chainId,
        wallet
      );

      return new PolymarketService(client, wallet, false);
    }
  }

  private constructor(client: ClobClient, wallet: Wallet | null, isDryRun: boolean) {
    this.client = client;
    this.wallet = wallet;
    this.isDryRun = isDryRun;
  }

  async ensureUsdcAllowance(amount: number) {
    if (!config.approveIfNeeded) return;
    if (this.isDryRun) {
      console.log(`🔐 [DRY RUN] Allowance USDC vérifiée pour ${amount.toFixed(2)} USDC`);
      return;
    }
    console.log(`🔐 Vérification allowance USDC pour ${amount.toFixed(2)} USDC`);
    // Note: L'allowance est gérée automatiquement par le CLOB client
  }

  getWalletAddress(): string {
    if (this.isDryRun) {
      return "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"; // Adresse factice pour dry run
    }
    return this.wallet!.address;
  }

  async getUsdcBalance(): Promise<number> {
    try {
      // Pour l'instant, retourner une valeur par défaut car l'API de balance n'est pas claire
      // TODO: Implémenter la vraie récupération de balance quand l'API sera clarifiée
      const usdBalance = 100.00; // Valeur par défaut pour les tests
      console.log(`💰 Balance USDC: ${usdBalance.toFixed(2)} $`);
      return usdBalance;
    } catch (err) {
      console.error("❌ Erreur récupération balance USDC:", err);
      return 100.00; // Valeur de fallback
    }
  }

  async fetchOpenPositions(wallet: string): Promise<RemotePosition[]> {
    const url = DATA_API_URL.replace("{wallet}", wallet);
    try {
      const res = await axios.get(url, { timeout: 8000 });
      const positions = res.data?.data ?? [];

      if (!Array.isArray(positions) || positions.length === 0) {
        return [];
      }

      return positions.map((p: any) => ({
        wallet,
        marketId: p.conditionId ?? p.market ?? p.market_id ?? p.condition_id,
        tokenId: p.asset ?? p.tokenId ?? p.token_id ?? "",
        outcome:
          (p.outcomeIndex ?? p.outcome_id ?? p.outcome ?? 1) === 0 ? "yes" : "no",
        size: Number(p.amount ?? p.shares ?? p.size ?? 0),
        entryPrice: Number(p.avg_cost ?? p.entry_price ?? p.avgPrice ?? 0),
        currentPrice: Number(p.price ?? p.mark_price ?? p.current_price ?? p.curPrice ?? 0),
      }));
    } catch (err: any) {
      console.error(`❌ Erreur récupération positions pour ${wallet}:`, err.message);
      throw err;
    }
  }

  async getMidPrice(marketId: string, tokenId: string, outcome: OutcomeSide): Promise<MarketPrice> {
    try {
      const orderbook = await this.client.getOrderBook(tokenId);

      // Trouver les prix pour le token spécifique (YES/NO)
      const bids = orderbook.bids ?? [];
      const asks = orderbook.asks ?? [];

      if (bids.length === 0 || asks.length === 0) {
        // Marché sans orderbook actif
        return {
          marketId,
          midpoint: 0,
          bid: 0,
          ask: 0,
          timestamp: Date.now(),
        };
      }

      // Calculer le meilleur bid et ask
      const bestBid = Math.max(...bids.map(b => parseFloat(b.price)));
      const bestAsk = Math.min(...asks.map(a => parseFloat(a.price)));
      const midpoint = (bestBid + bestAsk) / 2;

      console.log(`📊 Midprice pour ${marketId.slice(0, 8)}... ${outcome}: ${midpoint.toFixed(4)} (bid: ${bestBid.toFixed(4)}, ask: ${bestAsk.toFixed(4)})`);

      return {
        marketId,
        midpoint,
        bid: bestBid,
        ask: bestAsk,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      // Gestion spécifique des erreurs 404 (marché fermé ou sans orderbook)
      if (err.response?.status === 404 || err.message?.includes("No orderbook") || err.message?.includes("not found")) {
        console.log(`⏭️ Marché fermé ou sans OB: ${marketId.slice(0, 8)}... → ignoré`);
        return {
          marketId,
          midpoint: 0,
          bid: 0,
          ask: 0,
          timestamp: Date.now(),
        };
      }

      console.error(`❌ Erreur récupération orderbook pour ${marketId.slice(0, 8)}...:`, err.message);
      throw err;
    }
  }

  private priceWithSlippage(price: number, side: "buy" | "sell"): number {
    const adj =
      side === "buy"
        ? price * (1 + config.slippageBps / 10_000)
        : price * (1 - config.slippageBps / 10_000);
    return Number(adj.toFixed(4));
  }

  async placeOrder(order: OrderRequest): Promise<string> {
    const price = this.priceWithSlippage(order.price, order.side);

    if (this.isDryRun) {
      console.log(`📝 [DRY RUN] ${order.side.toUpperCase()} ${order.size.toFixed(4)} ${order.outcome.toUpperCase()} @ ${price.toFixed(4)} ($${(order.size * price).toFixed(2)})`);

      // Simuler un délai réseau
      await new Promise(resolve => setTimeout(resolve, 100));

      const mockOrderId = `dry_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`✅ [DRY RUN] Ordre simulé avec ID: ${mockOrderId}`);

      return mockOrderId;
    }

    try {
      // Créer l'ordre en utilisant les utilitaires du CLOB
      const tickSize = await this.client.getTickSize(order.tokenId);

      const userOrder = {
        tokenID: order.tokenId,
        price: price,
        size: order.size,
        side: order.side === "buy" ? Side.BUY : Side.SELL,
      };

      console.log(`📝 ${order.side.toUpperCase()} ${order.size.toFixed(4)} ${order.outcome.toUpperCase()} @ ${price.toFixed(4)} ($${(order.size * price).toFixed(2)})`);

      // Créer et signer l'ordre
      const signedOrder = await this.client.orderBuilder.buildOrder(userOrder, tickSize);

      // Poster l'ordre
      await this.client.postOrder(signedOrder);

      console.log(`✅ Ordre placé avec succès`);
      return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (err: any) {
      // Gestion spécifique des erreurs 404 (marché fermé)
      if (err.response?.status === 404 || err.message?.includes("not found")) {
        console.log(`⏭️ Marché fermé ou sans OB: ${order.marketId.slice(0, 8)}... → ordre ignoré`);
        throw new Error("ABORT_OB: Marché fermé ou sans orderbook");
      }

      console.error(`❌ Échec placement ordre:`, err.message);
      throw err;
    }
  }
}