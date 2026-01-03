import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { SolanaMonitor } from '../solana/monitor';
import { setupHandlers } from './handlers';

export function createBot(token: string, monitor: SolanaMonitor): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  // Error handling
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('An error occurred. Please try again later.');
  });

  // Setup all handlers
  setupHandlers(bot, monitor);

  return bot;
}

export async function startBot(bot: Telegraf<BotContext>, monitor: SolanaMonitor) {
  // Enable graceful stop
  process.once('SIGINT', () => {
    console.log('Received SIGINT, stopping bot...');
    bot.stop('SIGINT');
  });
  
  process.once('SIGTERM', () => {
    console.log('Received SIGTERM, stopping bot...');
    bot.stop('SIGTERM');
  });

  // Restart monitoring for existing users
  await monitor.restartAllMonitoring();

  // Start bot
  await bot.launch();
  console.log('✅ Bot is running!');
}