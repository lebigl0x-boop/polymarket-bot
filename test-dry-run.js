// Script de test rapide du mode dry run
console.log('🧪 Test du mode Dry Run pour Polymarket Bot');
console.log('================================================');

// Simuler les variables d'environnement
process.env.DRY_RUN = 'true';

// Importer et tester les modules
async function testDryRun() {
  try {
    console.log('\n1. Test de l\'initialisation PolymarketService...');
    const { PolymarketService } = await import('./dist/polymarket.js');
    const service = await PolymarketService.create();

    console.log('✅ Service créé en mode dry run');

    console.log('\n2. Test de récupération positions...');
    const positions = await service.fetchOpenPositions('0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d');
    console.log(`📊 Positions trouvées: ${positions.length}`);

    console.log('\n3. Test de récupération orderbook...');
    const midPrice = await service.getMidPrice('0x4c8b1e24ba5c049e5c6f23f6d5f8b8c8d5f8b8c8d5f8b8c8d5f8b8c8', '0x1', 'yes');
    console.log(`📈 Mid price: ${midPrice.midpoint > 0 ? midPrice.midpoint.toFixed(4) : 'Marché fermé'}`);

    console.log('\n4. Test de placement ordre simulé...');
    const orderId = await service.placeOrder({
      marketId: 'test',
      tokenId: 'test',
      outcome: 'yes',
      price: 0.5,
      size: 1.0,
      side: 'buy'
    });
    console.log(`🎯 Ordre simulé: ${orderId}`);

    console.log('\n🎉 Tous les tests dry run réussis !');
    console.log('💡 Le bot peut maintenant surveiller sans risque.');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
  }
}

testDryRun();
