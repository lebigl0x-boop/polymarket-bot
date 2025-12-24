// Script de test pour la logique de détection des trades en mode simulation
// Lancez avec: node test-simulation.js

import dotenv from "dotenv";
import { PolymarketService } from "./dist/polymarket.js";
import { CopyTrader } from "./dist/copyTrader.js";

dotenv.config();

// Forcer le mode simulation
process.env.SIMULATION_MODE = 'true';

console.log("🧪 TEST SIMULATION - Détection des trades");
console.log("═══════════════════════════════════════════════");

async function testSimulation() {
  try {
    console.log("🔧 Initialisation du service Polymarket (simulation)...");
    const polymarket = await PolymarketService.create();

    console.log("🔧 Initialisation du CopyTrader...");
    const bot = new CopyTrader(polymarket);

    console.log("📊 Configuration actuelle:");
    console.log(`   👤 Wallets surveillés: gabagool22`);
    console.log(`   ⏱️  Intervalle: 1200ms`);
    console.log(`   🎯 Drawdown: 5% - 10%`);
    console.log(`   💎 Sizing: 10% de balance (simulée: 100 USDC)`);
    console.log("");

    console.log("🚀 Démarrage du bot en mode simulation...");
    console.log("💡 Le bot va surveiller les positions et simuler les trades");
    console.log("💡 Utilisez Ctrl+C pour arrêter");
    console.log("");

    bot.start();

    // Gestion propre de l'arrêt
    process.on('SIGINT', () => {
      console.log("\n🛑 Arrêt du bot...");
      bot.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("❌ Erreur lors du test:", error);
    process.exit(1);
  }
}

testSimulation();
