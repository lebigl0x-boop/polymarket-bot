import { config } from './config';
import { PolymarketClient } from './polymarket';
import { Trader } from './trader';

async function main() {
  const client = new PolymarketClient();
  const trader = new Trader(client);

  console.log('Bot Polymarket prêt. Wallet suivi :', config.walletToCopy);
  setInterval(() => {
    trader.tick().catch((err) => console.error('Tick error', err));
  }, config.pollingMs);
}

main().catch((err) => {
  console.error('Erreur critique', err);
  process.exit(1);
});

