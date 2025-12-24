# Polymarket Copy-Trading Bot (TypeScript)

Bot léger de copy-trading pour Polymarket utilisant le CLOB officiel pour les ordres et Gamma/Data pour les prix/positions. Il surveille des wallets, attend un drawdown de 5-10%, entre proportionnellement, prend des TP par paliers et applique un trailing stop.

## Structure
- `src/index.ts` : point d'entrée, démarre le bot.
- `src/config.ts` : toutes les configs (wallets copiés, drawdown, TP, trailing, sizing, debug).
- `src/polymarket.ts` : wrapper Polymarket/Gamma + création d'ordres via `@polymarket/clob-client`.
- `src/copyTrader.ts` : logique principale (monitoring, entrée différée, TP, trailing).
- `src/types.ts` : types partagés.
- `.env` : variables privées (à créer).

## Pré-requis
- Node.js 18+
- Un wallet Polygon avec du MATIC pour le gas et de l'USDC pour trader.
- Clé privée et endpoint RPC Polygon (ex: Infura).
- **Clés API Polymarket** (obligatoire pour trader)

## Obtenir les clés API Polymarket

1. Va sur [Polymarket Builder Profile](https://polymarket.com/settings?tab=builder)
2. Crée une clé API dans la section "Builder Keys"
3. Tu obtiendras : `apiKey`, `secret`, et `passphrase`

## Vérification des fonds requis

### USDC sur Polygon
Pour trader sur Polymarket, vous devez avoir des USDC sur le réseau Polygon (pas Ethereum mainnet !).

**Adresse USDC Polygon :** `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`

**Comment vérifier :**
1. Allez sur [Polygonscan](https://polygonscan.com/)
2. Collez votre adresse wallet dans la barre de recherche
3. Vérifiez l'onglet "Token Holdings" pour voir vos USDC

**Comment obtenir des USDC sur Polygon :**
1. Via un bridge comme [Polygon Bridge](https://bridge.polygon.technology/)
2. Ou directement depuis un exchange qui supporte Polygon (Binance, etc.)

### MATIC pour les gas fees
Vous devez aussi avoir du MATIC pour payer les frais de transaction.

**Minimum recommandé :** 0.1 MATIC (~$0.05)

## Installation
```bash
npm install
```

## Configuration

### Mode Dry Run (Test sans risque)
Pour tester la logique sans placer de vrais ordres :

```bash
# Sans private key = mode dry run automatique
npm run build && npm start

# Ou explicitement
DRY_RUN=true npm run build && npm start
```

**En dry run :**
- ✅ Récupération des vraies positions via Data API
- ✅ Vérification des vrais orderbooks via CLOB
- ✅ Simulation complète des ordres (logs détaillés)
- ❌ Aucun ordre réel placé
- ❌ Aucun fonds risqué

### Mode Production
Créez un fichier `.env` à la racine (non commité) :
```
# Clés Polymarket (OBLIGATOIRE)
POLYMARKET_API_KEY=019b4cdc-ca26-7435-bd97-bdfd669422d9
POLYMARKET_API_SECRET=votre_secret_ici
POLYMARKET_API_PASSPHRASE=votre_passphrase_ici

# Wallet (OBLIGATOIRE)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_KEY

# Optionnel
CLOB_URL=https://clob.polymarket.com
GAMMA_URL=https://gamma-api.polymarket.com/positions
POSITIONS_URL=https://gamma-api.polymarket.com/positions?owner={wallet}&open=true
```

Modifiez `src/config.ts` :
- `walletsToCopy`: wallets à suivre.
- `drawdown`: bornes min/max (5%-10% par défaut).
- `takeProfits`: paliers {target, percent}.
- `trailing`: pourcentage du trailing sur le prix max atteint.
- `sizing`: `balancePercent` (ex: 10% du solde, cap par trade) ou `fixedMax`.
- `slippageBps`: tolérance de slippage sur les ordres.
- `pollIntervalMs`: fréquence de monitoring (1-2s).
- `debug`: active les logs détaillés.
- `prettyLogs`: affiche les logs en clair via pino-pretty (par défaut true).
- `pendingWindowMs`: délai max pour attendre un drawdown après détection d'un trade (5 min par défaut).

## Lancement
```bash
npm run build
npm start
```
ou en mode dev (ts-node) :
```bash
npm run dev
```

## Notes et sécurité
- Le bot n'entre qu'après drawdown entre 5% et 10% (configurable).
- TP: +5% (33%), +10% (33%), +15% (34%) puis trailing 3% armé après chaque TP.
- Anti double-entry: une seule copie par market/outcome à la fois.
- Retentes réseau automatiques (p-retry) et slippage paramétrable.
- Vérifiez manuellement l'URL des APIs si Polymarket les fait évoluer.
- Ne partagez jamais votre `.env`. Utilisez un wallet dédié au bot.

