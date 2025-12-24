"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const polymarket_1 = require("./polymarket");
const trader_1 = require("./trader");
async function main() {
    const client = new polymarket_1.PolymarketClient();
    const trader = new trader_1.Trader(client);
    console.log('Bot Polymarket prêt. Wallet suivi :', config_1.config.walletToCopy);
    setInterval(() => {
        trader.tick().catch((err) => console.error('Tick error', err));
    }, config_1.config.pollingMs);
}
main().catch((err) => {
    console.error('Erreur critique', err);
    process.exit(1);
});
