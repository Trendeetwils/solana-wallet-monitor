import dotenv from 'dotenv';
import { createBot, startBot } from './bot';
import { SolanaMonitor } from './solana/monitor';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'SOLANA_RPC_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL!;
const SOLANA_WS_URL = process.env.SOLANA_WS_URL;

async function main() {
  try {
    console.log('🚀 Starting Solana Wallet Monitor Bot...');
    console.log(`📡 RPC URL: ${SOLANA_RPC_URL}`);
    console.log(`🔌 WebSocket: ${SOLANA_WS_URL || 'Using polling fallback'}`);

    // Create monitor
    const monitor = new SolanaMonitor(
      null as any, // Will be set after bot creation
      SOLANA_RPC_URL,
      SOLANA_WS_URL
    );

    // Create bot
    const bot = createBot(TELEGRAM_BOT_TOKEN, monitor);

    // Set bot reference in monitor (circular dependency)
    (monitor as any).bot = bot;

    // Start bot
    await startBot(bot, monitor);
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Start the application
main();