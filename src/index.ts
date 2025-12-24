import dotenv from "dotenv";
import { config } from "./config.js";
import { CopyTrader, createLogger } from "./copyTrader.js";
import { PolymarketService } from "./polymarket.js";

dotenv.config();

async function main() {
  const log = createLogger();
  log.info({ wallets: config.walletsToCopy.map((w) => w.nickname ?? w.address) }, "Démarrage du bot");
  const polymarket = await PolymarketService.create();
  const bot = new CopyTrader(polymarket);
  bot.start();
  log.info("Bot lancé et en surveillance");
}

main().catch((err) => {
  console.error("Erreur fatale", err);
  process.exit(1);
});

