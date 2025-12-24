import pino from "pino";
import axios from "axios";
import { config } from "./config.js";
export const createLogger = () => pino({
    level: config.debug ? "debug" : "info",
    base: { service: "polymarket-copy-bot" },
    transport: config.prettyLogs
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "HH:MM:ss",
                singleLine: false,
                ignore: "pid,hostname",
            },
        }
        : undefined,
});
const log = createLogger();
export class CopyTrader {
    isTradablePrice(price) {
        return price > 0.01 && price < 0.99;
    }
    displayStatusSummary() {
        const now = Date.now();
        if (now - this.lastStatusUpdate < 60000)
            return; // Une fois par minute
        this.lastStatusUpdate = now;
        const positionsCount = Array.from(this.copied.values()).length;
        const pendingCount = this.pending.size;
        const cacheSize = this.activeMarketsCache.size;
        console.log(`\n📊 Statut ${new Date().toLocaleTimeString()}`);
        console.log(`   📈 Positions copiées: ${positionsCount}`);
        console.log(`   ⏳ Trades en attente: ${pendingCount}`);
        console.log(`   🗄️  Cache marchés: ${cacheSize}`);
        console.log(`   ✅ Bot actif: ${this.running ? "Oui" : "Non"}`);
    }
    async isMarketActive(marketId) {
        const now = Date.now();
        const cached = this.activeMarketsCache.get(marketId);
        // Utiliser le cache si valide
        if (cached && (now - cached.timestamp) < this.CACHE_DURATION_MS) {
            return cached.isActive;
        }
        try {
            // Vérifier si le marché existe et est actif
            const response = await axios.get(`https://gamma-api.polymarket.com/markets/${marketId}`, {
                timeout: 5000,
            });
            if (response.status !== 200) {
                this.activeMarketsCache.set(marketId, { isActive: false, timestamp: now });
                return false;
            }
            const marketData = response.data;
            // Un marché est considéré actif s'il n'est pas fermé et a un orderbook
            const isActive = marketData.closed === false &&
                marketData.active === true &&
                marketData.question !== undefined;
            this.activeMarketsCache.set(marketId, { isActive, timestamp: now });
            return isActive;
        }
        catch (err) {
            // Ne log que si debug activé pour éviter le spam
            if (config.debug) {
                console.log(`❌ Erreur vérification marché ${marketId.slice(0, 8)}...`);
            }
            // En cas d'erreur, on considère le marché comme inactif pour éviter les 404
            this.activeMarketsCache.set(marketId, { isActive: false, timestamp: now });
            return false;
        }
    }
    constructor(polymarket) {
        this.polymarket = polymarket;
        this.peaks = new Map();
        this.copied = new Map();
        this.lastFetchErrorAt = new Map();
        this.lastPositionsFingerprint = new Map();
        this.lastRemoteSize = new Map();
        this.pending = new Map();
        this.primed = false;
        this.lastSummaryAt = 0;
        this.activeMarketsCache = new Map();
        this.lastStatusUpdate = 0;
        this.CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
        this.lastSummarySnapshot = { positions: 0, pending: 0, copied: 0, error: undefined };
        this.running = false;
    }
    posKey(p) {
        return `${p.wallet ?? "me"}-${p.marketId}-${p.outcome}`;
    }
    async start() {
        this.running = true;
        console.clear(); // Nettoie le terminal
        console.log("🚀 Polymarket Copy Trading Bot démarré");
        console.log("═══════════════════════════════════════");
        // Afficher la balance au démarrage
        console.log("🔍 Récupération de la balance USDC...");
        const walletAddress = this.polymarket.getWalletAddress();
        console.log(`📍 Adresse wallet utilisée: ${walletAddress}`);
        try {
            const balance = await this.polymarket.getUsdcBalance();
            if (balance > 0) {
                console.log(`💰 Balance USDC: ${balance.toFixed(2)} $`);
            }
            else {
                console.log("⚠️  Balance USDC: 0.00 $");
                console.log("💡 Vérifiez que cette adresse a des USDC sur Polygon:");
                console.log(`   https://polygonscan.com/address/${walletAddress}`);
            }
        }
        catch (err) {
            console.log("❌ Erreur récupération balance USDC - vérifiez RPC_URL et PRIVATE_KEY");
        }
        console.log(`👤 Wallets surveillés: ${config.walletsToCopy.map(w => w.nickname || w.address.slice(0, 6) + "...").join(", ")}`);
        console.log(`⏱️  Intervalle: ${config.pollIntervalMs}ms`);
        console.log(`🎯 Drawdown: ${config.drawdown.min * 100}% - ${config.drawdown.max * 100}%`);
        console.log(`💎 Sizing: ${config.sizing.mode === "balancePercent" ? `${config.sizing.percent * 100}% du solde` : "Montant fixe"}`);
        console.log("");
        log.info("🤖 Bot opérationnel - surveillance active");
        this.loop();
    }
    stop() {
        this.running = false;
    }
    async loop() {
        if (!this.running)
            return;
        try {
            if (config.debug)
                log.debug("---- tick ----");
            await this.tick();
        }
        catch (err) {
            log.error({ err }, "Tick failed");
        }
        finally {
            setTimeout(() => this.loop(), config.pollIntervalMs);
        }
    }
    async tick() {
        this.displayStatusSummary();
        const activeKeys = new Set();
        let positionsCount = 0;
        for (const wallet of config.walletsToCopy) {
            try {
                const positions = await this.polymarket.fetchOpenPositions(wallet.address);
                if (positions.length === 0) {
                    if (config.debug) {
                        log.debug({ wallet: wallet.address }, "Aucune position détectée");
                    }
                    continue;
                }
                this.logPositionsOnceOnChange(wallet.address, positions);
                for (const pos of positions) {
                    activeKeys.add(this.posKey(pos));
                }
                positionsCount += positions.length;
                await this.handleWalletPositions(wallet.address, positions, wallet.marketsWhitelist);
            }
            catch (err) {
                const status = err?.response?.status ?? err?.status;
                const key = `${wallet.address}-${status ?? "err"}`;
                const now = Date.now();
                const last = this.lastFetchErrorAt.get(key) ?? 0;
                // Silence les 404/400 répétitifs si debug=false
                if (!config.debug && (status === 404 || status === 400)) {
                    if (now - last > 60000) {
                        log.info({ wallet: wallet.address, status }, "Aucune position ou endpoint indispo (404/400)");
                        this.lastFetchErrorAt.set(key, now);
                    }
                    continue;
                }
                log.warn({ err, wallet: wallet.address, status }, "Erreur de récupération des positions");
                this.lastErrorMessage = err?.message ?? `${err}`;
                this.lastFetchErrorAt.set(key, now);
            }
        }
        // Expire pending si position disparue ou délai dépassé
        const now = Date.now();
        for (const [key, pending] of Array.from(this.pending.entries())) {
            if (!activeKeys.has(key)) {
                this.pending.delete(key);
                this.lastRemoteSize.delete(key);
                if (config.debug)
                    log.debug({ key }, "Pending annulé (position absente)");
                continue;
            }
            if (now >= pending.expiresAt) {
                this.pending.delete(key);
                if (config.debug)
                    log.debug({ key }, "Pending expiré sans drawdown");
            }
        }
        await this.manageCopiedPositions();
        // Une fois la première passe faite, on considère les tailles comme base et on ne déclenche que sur les augmentations suivantes
        this.primed = true;
        this.logSummary(positionsCount);
    }
    logPositionsOnceOnChange(wallet, positions) {
        // Silence: on ne log plus les snapshots
        const fingerprint = positions
            .map((p) => `${p.marketId}:${p.outcome}:${p.size.toFixed(3)}:${p.currentPrice.toFixed(4)}`)
            .sort()
            .join("|");
        this.lastPositionsFingerprint.set(wallet, fingerprint);
    }
    logSummary(positionsCount) {
        // Silence: pas de résumé périodique
    }
    async handleWalletPositions(wallet, positions, whitelist) {
        for (const pos of positions) {
            if (whitelist && !whitelist.includes(pos.marketId))
                continue;
            // Filtrer les marchés inactifs pour éviter les erreurs 404
            if (!(await this.isMarketActive(pos.marketId))) {
                if (config.debug) {
                    console.log(`⏭️  Marché ${pos.marketId.slice(0, 8)}... inactif → ignoré`);
                }
                continue;
            }
            const key = this.posKey(pos);
            const peak = Math.max(pos.currentPrice, this.peaks.get(key) ?? pos.entryPrice);
            this.peaks.set(key, peak);
            const drawdown = peak > 0 ? (peak - pos.currentPrice) / peak : 0;
            // logs silencieux: on ne logue plus chaque position surveillée
            const copyKey = this.posKey({ marketId: pos.marketId, outcome: pos.outcome });
            if (this.copied.has(copyKey))
                continue;
            // Détection de trade entrant (size qui augmente)
            const prevSize = this.lastRemoteSize.get(key) ?? pos.size;
            this.lastRemoteSize.set(key, pos.size);
            const sizeIncrease = pos.size - prevSize;
            const isNewOrIncrease = this.primed && sizeIncrease > 1e-6;
            if (config.debug) {
                console.log(`📊 ${pos.marketId.slice(0, 8)}... ${pos.outcome.toUpperCase()}: Size=${pos.size.toFixed(4)} (prev=${prevSize.toFixed(4)}) Increase=${sizeIncrease.toFixed(6)}`);
                console.log(`   💰 Prix: Current=${pos.currentPrice.toFixed(4)}, Entry=${pos.entryPrice.toFixed(4)}, Peak=${this.peaks.get(key)?.toFixed(4) || 'N/A'}`);
            }
            if (isNewOrIncrease && !this.pending.has(copyKey)) {
                const mid = await this.polymarket.getMidPrice(pos.marketId, pos.tokenId, pos.outcome);
                if (!this.isTradablePrice(mid.midpoint)) {
                    if (config.debug) {
                        log.debug({
                            wallet,
                            market: pos.marketId,
                            tokenId: pos.tokenId,
                            midpoint: mid.midpoint,
                        }, "Marché fermé ou sans OB → ignoré");
                    }
                }
                else {
                    this.pending.set(copyKey, {
                        detectedAt: Date.now(),
                        expiresAt: Date.now() + config.pendingWindowMs,
                        wallet,
                    });
                    console.log(`🎣 NOUVEAU TRADE DÉTECTÉ: ${pos.outcome.toUpperCase()} ${sizeIncrease.toFixed(4)} (+${((sizeIncrease / prevSize) * 100).toFixed(1)}%)`);
                    console.log(`   📊 Prix actuel: ${pos.currentPrice.toFixed(4)}, Midpoint: ${mid.midpoint.toFixed(4)}`);
                    console.log(`   ⏳ Attente drawdown ${config.drawdown.min * 100}%-${config.drawdown.max * 100}% (${Math.round(config.pendingWindowMs / 1000 / 60)}min max)`);
                }
            }
            // Si un pending existe, on attend la fenêtre de drawdown ; sinon on n'entre pas (pas de snapshot)
            if (this.pending.has(copyKey)) {
                const pending = this.pending.get(copyKey);
                const dd = peak > 0 ? (peak - pos.currentPrice) / peak : 0;
                const timeElapsed = Date.now() - pending.detectedAt;
                const timeRemaining = Math.max(0, pending.expiresAt - Date.now());
                console.log(`⏳ ${pos.marketId.slice(0, 8)}... ${pos.outcome.toUpperCase()}: Drawdown=${(dd * 100).toFixed(2)}% (target: ${config.drawdown.min * 100}%-${config.drawdown.max * 100}%)`);
                console.log(`   ⏱️  Temps écoulé: ${Math.round(timeElapsed / 1000)}s, restant: ${Math.round(timeRemaining / 1000)}s`);
                if (dd >= config.drawdown.min && dd <= config.drawdown.max) {
                    console.log(`🎯 DRAWDOWN ATTEINT: ${(dd * 100).toFixed(2)}% - Exécution du trade!`);
                    await this.tryEnterCopy(pos);
                    this.pending.delete(copyKey);
                }
                else if (Date.now() >= pending.expiresAt) {
                    console.log(`⏰ TIMEOUT: Drawdown ${(dd * 100).toFixed(2)}% non atteint dans le délai`);
                    this.pending.delete(copyKey);
                    if (config.debug)
                        log.debug({ copyKey }, "Pending expiré (pas de drawdown)");
                }
                continue;
            }
        }
    }
    async computeBudget(entryPrice) {
        const balance = await this.polymarket.getUsdcBalance();
        if (balance <= 0)
            throw new Error("Balance USDC insuffisante");
        if (config.sizing.mode === "balancePercent") {
            const usd = Math.min(balance * config.sizing.percent, config.sizing.maxPerTrade ?? Infinity);
            log.debug({ balance, usd }, "Sizing par pourcentage de balance");
            return { usd, size: usd / entryPrice };
        }
        const usd = Math.min(config.sizing.amount, balance);
        log.debug({ balance, usd }, "Sizing par montant fixe");
        return { usd, size: usd / entryPrice };
    }
    async tryEnterCopy(pos) {
        const price = await this.getReferencePrice(pos);
        if (!this.isTradablePrice(price)) {
            if (config.debug) {
                log.debug({ market: pos.marketId, tokenId: pos.tokenId, reason: "midpoint hors plage tradable" }, "Marché expiré ou sans OB → ignoré");
            }
            return;
        }
        const { usd, size } = await this.computeBudget(price);
        if (size <= 0) {
            log.warn("Taille calculée nulle, skip");
            return;
        }
        await this.polymarket.ensureUsdcAllowance(usd);
        if (config.debug) {
            log.debug({
                market: pos.marketId,
                outcome: pos.outcome,
                drawdown: ((this.peaks.get(this.posKey(pos)) ?? price) - pos.currentPrice) / (this.peaks.get(this.posKey(pos)) ?? price),
                price,
                usd: Number(usd.toFixed(2)),
                size: Number(size.toFixed(4)),
            }, "Fenêtre de drawdown atteinte, tentative d'entrée");
        }
        let orderId;
        try {
            orderId = await this.polymarket.placeOrder({
                marketId: pos.marketId,
                tokenId: pos.tokenId,
                outcome: pos.outcome,
                price,
                size,
                side: "buy",
            });
        }
        catch (err) {
            const reason = err?.message ?? `${err}`;
            if (reason.startsWith("ABORT_OB")) {
                log.info({ market: pos.marketId, tokenId: pos.tokenId, reason }, "Orderbook absent (marché expiré/15m fermé ou pas encore listé) → ignoré");
            }
            else if (reason.startsWith("ABORT_PRICE")) {
                log.info({ market: pos.marketId, tokenId: pos.tokenId, reason }, "Paramètre prix invalide → ignoré");
            }
            else {
                log.warn({
                    market: pos.marketId,
                    tokenId: pos.tokenId,
                    reason,
                }, "Échec de création d'ordre");
            }
            this.lastErrorMessage = reason;
            return;
        }
        const copyKey = this.posKey({ marketId: pos.marketId, outcome: pos.outcome });
        this.copied.set(copyKey, {
            marketId: pos.marketId,
            tokenId: pos.tokenId,
            outcome: pos.outcome,
            entryPrice: price,
            peakPrice: price,
            size,
            remainingSize: size,
            tpIndexReached: -1,
            maxSeenPrice: price,
            trailingArmed: false,
        });
        console.log(`✅ ENTRÉE: ${pos.outcome.toUpperCase()} ${size.toFixed(2)} @ ${price.toFixed(4)} ($${usd.toFixed(2)})`);
        if (config.debug) {
            console.log(`   🎯 Drawdown: ${(this.peaks.get(this.posKey(pos)) - pos.currentPrice) / this.peaks.get(this.posKey(pos)) * 100}%`);
        }
    }
    async getReferencePrice(pos) {
        try {
            const mid = await this.polymarket.getMidPrice(pos.marketId, pos.tokenId, pos.outcome);
            if (this.isTradablePrice(mid.midpoint))
                return mid.midpoint;
            return 0;
        }
        catch (err) {
            log.warn({ err }, "Fallback sur currentPrice");
            return 0;
        }
    }
    async manageCopiedPositions() {
        for (const state of this.copied.values()) {
            try {
                const price = (await this.polymarket.getMidPrice(state.marketId, state.tokenId, state.outcome)).midpoint;
                if (!this.isTradablePrice(price))
                    continue;
                state.maxSeenPrice = Math.max(state.maxSeenPrice, price);
                const ret = (price - state.entryPrice) / state.entryPrice;
                const nextTpIndex = state.tpIndexReached + 1;
                const nextTp = config.takeProfits[nextTpIndex];
                if (nextTp && ret >= nextTp.target) {
                    await this.sellPortion(state, nextTp.percent);
                    state.tpIndexReached = nextTpIndex;
                    state.trailingArmed = true;
                    state.maxSeenPrice = price;
                    continue;
                }
                if (state.trailingArmed && config.trailing.enabled) {
                    const dd = state.maxSeenPrice > 0
                        ? (state.maxSeenPrice - price) / state.maxSeenPrice
                        : 0;
                    if (dd >= config.trailing.percent) {
                        log.info({
                            market: state.marketId,
                            outcome: state.outcome,
                            dd,
                            trail: config.trailing.percent,
                            maxSeen: state.maxSeenPrice,
                            price,
                        }, "Trailing déclenché");
                        await this.closePosition(state, "Trailing stop");
                        continue;
                    }
                }
            }
            catch (err) {
                log.warn({ err, market: state.marketId }, "Gestion TP/trailing échouée");
            }
        }
    }
    async sellPortion(state, percent) {
        const size = Number((state.remainingSize * percent).toFixed(4));
        if (size <= 0)
            return;
        await this.polymarket.placeOrder({
            marketId: state.marketId,
            tokenId: state.tokenId ?? "",
            outcome: state.outcome,
            price: state.maxSeenPrice,
            size,
            side: "sell",
        });
        state.remainingSize -= size;
        console.log(`💰 TP ${percent * 100}%: ${size.toFixed(2)} ${state.outcome.toUpperCase()} @ ${state.maxSeenPrice.toFixed(4)}`);
        if (config.debug) {
            console.log(`   📈 Gain réalisé: ${((state.maxSeenPrice - state.entryPrice) * percent * 100).toFixed(2)}%`);
        }
        if (state.remainingSize <= 0.0001) {
            this.copied.delete(this.posKey(state));
            log.info({ market: state.marketId }, "Position totalement fermée");
        }
    }
    async closePosition(state, reason) {
        if (state.remainingSize <= 0) {
            this.copied.delete(this.posKey(state));
            return;
        }
        await this.polymarket.placeOrder({
            marketId: state.marketId,
            tokenId: state.tokenId ?? "",
            outcome: state.outcome,
            price: state.maxSeenPrice,
            size: state.remainingSize,
            side: "sell",
        });
        this.copied.delete(this.posKey(state));
        console.log(`🚪 ${reason.toUpperCase()}: Position ${state.outcome.toUpperCase()} clôturée @ ${state.maxSeenPrice.toFixed(4)}`);
        if (config.debug) {
            const pnl = ((state.maxSeenPrice - state.entryPrice) / state.entryPrice * 100);
            console.log(`   💵 PnL final: ${pnl.toFixed(2)}%`);
        }
    }
}
