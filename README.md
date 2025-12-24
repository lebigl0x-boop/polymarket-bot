Tu es un expert en développement de bots trading sur Polymarket (Polygon, CLOB, APIs officielles 2025).

Objectif du bot (très précis) :
Copy-trading d’un wallet actif sur les marchés Bitcoin Up or Down 15 minutes.
- Détecter UNIQUEMENT un nouveau trade (nouveau buy ou augmentation significative de size).
- Vérifier que le marché est ouvert (midpoint price entre 0.01 et 0.99 via CLOB).
- Attendre que cette position nouvelle soit en drawdown de 5% à 10% (calculé depuis le prix peak après l'entry du trader).
- Entrer en copie avec un montant fixe en USD (configurable).
- Sortir avec :
  - TP1 : +5% → vendre 33%
  - TP2 : +10% → vendre 33%
  - TP3 : +15% → vendre le reste
  - Trailing stop de 3% après chaque TP atteint (sur le prix max).
- Ignorer complètement les positions existantes au démarrage (snapshot).
- Ignorer les marchés expirés ou sans orderbook (catch 404 proprement).

APIs OBLIGATOIRES à utiliser (doc officielle 2025) :
- Positions du wallet : https://data-api.polymarket.com/positions?user=WALLET&open=true
- Orders, orderbook, midpoint price : @polymarket/clob-client (package npm officiel)
- Doc complète : https://docs.polymarket.com/developers/gamma-markets-api/overview

Ressources de bots existants comme inspiration (structure, polling, CLOB usage) :
- https://github.com/Trust412/polymarket-copy-trading-bot-v1 (le plus populaire, polling positions, CLOB orders)
- https://github.com/tommyreid622/polymarket-copy-trading-bot (production-ready, JSON tracking)
- https://github.com/vladmeer/polymarket-copy-trading-bot (multi-wallets, slippage checks)

Best practices à respecter :
- Node.js + TypeScript
- Structure simple et claire : index.ts (lancement), config.ts (wallet, drawdown min/max, montant USD, TP/trailing), polymarket.ts (wrapper APIs), trader.ts (logique principale)
- Polling toutes les 2 secondes (setInterval)
- Try/catch sur toutes les API calls, surtout CLOB (404 "No orderbook exists" → log "Marché fermé → ignoré")
- Logs très clairs en français :
  "Nouveau trade détecté sur marché ouvert → attente drawdown"
  "Drawdown 7.2% atteint → entry 100 USD"
  "TP1 atteint → vente 33%"
  "Trailing stop déclenché → sortie totale"
  "Marché fermé → ignoré"
- .env pour private key et RPC (jamais hardcodé)
- Test en local uniquement (pas de VPS pour l'instant)

Génère le bot complet, fichier par fichier, avec commentaires.
Commence par config.ts, puis polymarket.ts, puis trader.ts, puis index.ts.
À la fin, donne seulement la commande pour lancer : npm run build && npm start