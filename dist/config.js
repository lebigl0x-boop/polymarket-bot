export const config = {
    walletsToCopy: [
        {
            address: "0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d",
            nickname: "gabagool22",
        },
    ],
    pollIntervalMs: 1200,
    pendingWindowMs: 5 * 60 * 1000, // attendre jusqu'à 5 minutes après un trade détecté pour un drawdown
    drawdown: { min: 0.05, max: 0.1 },
    takeProfits: [
        { target: 0.05, percent: 0.33 },
        { target: 0.1, percent: 0.33 },
        { target: 0.15, percent: 0.34 },
    ],
    trailing: { enabled: true, percent: 0.03 },
    slippageBps: 100, // 1% slippage
    maxRetries: 3,
    approveIfNeeded: true,
    sizing: { mode: "balancePercent", percent: 0.1, maxPerTrade: 2 },
    debug: false,
    prettyLogs: true,
};
