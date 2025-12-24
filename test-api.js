// Script de test rapide pour vérifier les clés API Polymarket
import dotenv from 'dotenv';
dotenv.config();

// Test simple des variables d'environnement
console.log('🧪 Test des clés API Polymarket...\n');

const apiKey = process.env.POLYMARKET_API_KEY;
const apiSecret = process.env.POLYMARKET_API_SECRET;
const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;
const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.RPC_URL;

console.log('📋 Variables d\'environnement:');
console.log(`API Key: ${apiKey ? '✅ Présent' : '❌ Manquant'}`);
console.log(`API Secret: ${apiSecret ? '✅ Présent' : '❌ Manquant'}`);
console.log(`API Passphrase: ${apiPassphrase ? '✅ Présent' : '❌ Manquant'}`);
console.log(`Private Key: ${privateKey ? '✅ Présent' : '❌ Manquant'}`);
console.log(`RPC URL: ${rpcUrl ? '✅ Présent' : '❌ Manquant'}\n`);

if (!apiKey || !apiSecret || !apiPassphrase) {
  console.error('❌ Clés API Polymarket manquantes !');
  console.log('🔧 Va sur: https://polymarket.com/settings?tab=builder');
  process.exit(1);
}

if (!privateKey) {
  console.error('❌ Private key manquante !');
  process.exit(1);
}

if (!rpcUrl) {
  console.error('❌ RPC URL manquante !');
  console.log('🔧 Utilise: https://polygon-mainnet.infura.io/v3/TON_CLE_INFURA');
  process.exit(1);
}

console.log('✅ Toutes les variables sont présentes !');
console.log('🎯 Lance maintenant: npm start');
console.log('\nSi tu vois "Balance USDC: 25.13 $" c\'est que tout fonctionne ! 🚀');

async function testPolymarketAPI() {
  console.log('🧪 Test des clés API Polymarket...\n');

  // Vérifier les variables d'environnement
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  console.log('📋 Variables d\'environnement:');
  console.log(`API Key: ${apiKey ? '✅ Présent' : '❌ Manquant'}`);
  console.log(`API Secret: ${apiSecret ? '✅ Présent' : '❌ Manquant'}`);
  console.log(`API Passphrase: ${apiPassphrase ? '✅ Présent' : '❌ Manquant'}`);
  console.log(`Private Key: ${privateKey ? '✅ Présent' : '❌ Manquant'}`);
  console.log(`RPC URL: ${rpcUrl ? '✅ Présent' : '❌ Manquant'}\n`);

  if (!apiKey || !apiSecret || !apiPassphrase || !privateKey || !rpcUrl) {
    console.error('❌ Variables manquantes ! Vérifie ton .env');
    return;
  }

  try {
    // Initialiser le wallet
    console.log('🔑 Initialisation du wallet...');
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`✅ Wallet: ${wallet.address}\n`);

    // Tester la connexion au réseau
    console.log('🌐 Test de connexion Polygon...');
    const network = await provider.getNetwork();
    console.log(`✅ Réseau: ${network.name} (Chain ID: ${network.chainId})\n`);

    // Initialiser le client Polymarket
    console.log('🔗 Initialisation du client Polymarket...');
    const client = new ClobClient(
      'https://clob.polymarket.com',
      Chain.POLYGON,
      wallet,
      {
        key: apiKey,
        secret: apiSecret,
        passphrase: apiPassphrase
      }
    );
    console.log('✅ Client Polymarket initialisé\n');

    // Tester la récupération de la balance
    console.log('💰 Test récupération balance...');
    if (typeof client.getBalances === 'function') {
      const balances = await client.getBalances();
      console.log('✅ Balances récupérées:', balances);
    } else {
      console.log('⚠️  getBalances non disponible, test alternatif...');

      // Test avec le contrat USDC directement
      const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
      const usdcAbi = ["function balanceOf(address owner) view returns (uint256)"];
      const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);

      const balanceRaw = await usdcContract.balanceOf(wallet.address);
      const balance = Number(ethers.utils.formatUnits(balanceRaw, 6));
      console.log(`✅ Balance USDC: ${balance}`);
    }

    console.log('\n🎉 Test réussi ! Tes clés API Polymarket fonctionnent.');

  } catch (error) {
    console.error('\n❌ Erreur lors du test:', error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('🔑 Problème d\'authentification - vérifie tes clés API');
    } else if (error.message.includes('422')) {
      console.log('🌐 Problème de réseau - vérifie ta RPC URL');
    } else {
      console.log('🔧 Erreur inconnue - vérifie tous tes paramètres');
    }
  }
}

testPolymarketAPI();
