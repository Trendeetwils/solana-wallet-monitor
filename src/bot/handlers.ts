import { Telegraf } from 'telegraf';
import Database from '../db';
import { SolanaMonitor } from '../solana/monitor';
import { validateAndNormalizeAddress } from '../solana/validator';
import { BotContext, CommitmentLevel } from '../types';
import {
  getMainMenuKeyboard,
  getSettingsKeyboard,
  getCommitmentKeyboard,
  getPollIntervalKeyboard,
  getBackToMenuKeyboard,
} from './keyboards';

// Store user session state (waiting for address input)
const userSessions = new Map<string, { awaitingAddress: boolean }>();

export function setupHandlers(bot: Telegraf<BotContext>, monitor: SolanaMonitor) {
  /**
   * /start command - Welcome message
   */
  bot.command('start', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await Database.getOrCreateUser(telegramId);

    const welcomeMessage = `👋 Welcome to Solana Wallet Monitor!

I'll help you track transactions on any Solana wallet in real-time.

${user.walletAddress ? `📍 Current wallet: \`${user.walletAddress}\`` : '📍 No wallet configured yet.'}

Please send me a Solana wallet address to start monitoring.`;

    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    userSessions.set(telegramId, { awaitingAddress: true });
  });

  /**
   * /menu command - Show main menu
   */
  bot.command('menu', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await Database.getUser(telegramId);

    if (!user || !user.walletAddress) {
      await ctx.reply('Please set a wallet address first using /start');
      return;
    }

    const menuMessage = `📊 *Wallet Monitor Menu*

Wallet: \`${user.walletAddress}\`
Status: ${user.isMonitoring ? '✅ Monitoring' : '⏸ Paused'}`;

    await ctx.reply(menuMessage, {
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard(user.isMonitoring),
    });
  });

  /**
   * Handle text messages (wallet addresses)
   */
  bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const session = userSessions.get(telegramId);

    // Check if we're waiting for an address
    if (!session?.awaitingAddress) {
      await ctx.reply('Use /menu to see available commands.');
      return;
    }

    const address = validateAndNormalizeAddress(ctx.message.text);

    if (!address) {
      await ctx.reply(
        '❌ Invalid Solana address. Please send a valid base58 Solana public key.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Save address
    await Database.updateWalletAddress(telegramId, address);
    userSessions.delete(telegramId);

    await ctx.reply(
      `✅ Wallet address saved!\n\n\`${address}\`\n\nUse /menu to start monitoring.`,
      { parse_mode: 'Markdown' }
    );

    // Show menu automatically
    setTimeout(async () => {
      const user = await Database.getUser(telegramId);
      if (user) {
        const menuMessage = `📊 *Wallet Monitor Menu*

Wallet: \`${user.walletAddress}\`
Status: ${user.isMonitoring ? '✅ Monitoring' : '⏸ Paused'}`;

        await ctx.reply(menuMessage, {
          parse_mode: 'Markdown',
          ...getMainMenuKeyboard(user.isMonitoring),
        });
      }
    }, 500);
  });

  /**
   * Start monitoring callback
   */
  bot.action('start_monitoring', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery('Starting monitoring...');

    const success = await monitor.startMonitoring(telegramId);

    if (success) {
      const user = await Database.getUser(telegramId);
      await ctx.editMessageText(
        `✅ *Monitoring Started*

Wallet: \`${user?.walletAddress}\`

I'll notify you of all transactions on this wallet.`,
        {
          parse_mode: 'Markdown',
          ...getMainMenuKeyboard(true),
        }
      );
    } else {
      await ctx.reply('❌ Failed to start monitoring. Please try again.');
    }
  });

  /**
   * Stop monitoring callback
   */
  bot.action('stop_monitoring', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery('Stopping monitoring...');

    const success = await monitor.stopMonitoring(telegramId);

    if (success) {
      const user = await Database.getUser(telegramId);
      await ctx.editMessageText(
        `⏸ *Monitoring Stopped*

Wallet: \`${user?.walletAddress}\`

Use the button below to resume monitoring.`,
        {
          parse_mode: 'Markdown',
          ...getMainMenuKeyboard(false),
        }
      );
    } else {
      await ctx.reply('❌ Failed to stop monitoring. Please try again.');
    }
  });

  /**
   * Change address callback
   */
  bot.action('change_address', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    // Stop monitoring if active
    await monitor.stopMonitoring(telegramId);

    userSessions.set(telegramId, { awaitingAddress: true });
    await ctx.editMessageText(
      '🔄 Please send the new Solana wallet address you want to monitor.',
      { parse_mode: 'Markdown' }
    );
  });

  /**
   * Status callback
   */
  bot.action('status', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await Database.getUser(telegramId);
    const isMonitoring = monitor.isMonitoring(telegramId);

    if (!user) {
      await ctx.reply('Error: User not found.');
      return;
    }

    const statusMessage = `📊 *Current Status*

📍 Wallet: \`${user.walletAddress || 'Not set'}\`
🔄 Monitoring: ${isMonitoring ? '✅ Active' : '⏸ Paused'}
⚙️ Commitment: ${user.commitmentLevel}
⏱ Poll Interval: ${user.pollInterval / 1000}s
${user.lastSeenSignature ? `🔗 Last Tx: \`${user.lastSeenSignature.slice(0, 16)}...\`` : ''}`;

    await ctx.editMessageText(statusMessage, {
      parse_mode: 'Markdown',
      ...getBackToMenuKeyboard(),
    });
  });

  /**
   * Settings callback
   */
  bot.action('settings', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await Database.getUser(telegramId);

    const settingsMessage = `⚙️ *Settings*

Current Configuration:
• Commitment Level: ${user?.commitmentLevel || 'confirmed'}
• Poll Interval: ${(user?.pollInterval || 30000) / 1000} seconds

Choose a setting to modify:`;

    await ctx.editMessageText(settingsMessage, {
      parse_mode: 'Markdown',
      ...getSettingsKeyboard(),
    });
  });

  /**
   * Commitment level setting
   */
  bot.action('setting_commitment', async (ctx) => {
    await ctx.answerCbQuery();

    const message = `🎚 *Commitment Level*

Choose how confirmed transactions should be before alerting:

• *Processed*: Fastest, least secure (~400ms)
• *Confirmed*: Balanced (recommended) (~1s)
• *Finalized*: Slowest, most secure (~13s)`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...getCommitmentKeyboard(),
    });
  });

  /**
   * Poll interval setting
   */
  bot.action('setting_interval', async (ctx) => {
    await ctx.answerCbQuery();

    const message = `⏱ *Poll Interval*

How often should I check for new transactions?

Note: Only applies when using polling mode (not WebSocket).
Shorter intervals = faster notifications but more RPC requests.`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...getPollIntervalKeyboard(),
    });
  });

  /**
   * Commitment level selection
   */
  bot.action(/^commit_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const commitment = ctx.match[1] as CommitmentLevel;
    await ctx.answerCbQuery(`Commitment set to: ${commitment}`);

    await Database.updateSettings(telegramId, { commitmentLevel: commitment });

    // Restart monitoring if active
    const user = await Database.getUser(telegramId);
    if (user?.isMonitoring) {
      await monitor.stopMonitoring(telegramId);
      await monitor.startMonitoring(telegramId);
    }

    await ctx.editMessageText(
      `✅ Commitment level updated to: *${commitment}*`,
      {
        parse_mode: 'Markdown',
        ...getBackToMenuKeyboard(),
      }
    );
  });

  /**
   * Poll interval selection
   */
  bot.action(/^interval_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const interval = parseInt(ctx.match[1]);
    await ctx.answerCbQuery(`Interval set to: ${interval / 1000}s`);

    await Database.updateSettings(telegramId, { pollInterval: interval });

    // Restart monitoring if active
    const user = await Database.getUser(telegramId);
    if (user?.isMonitoring) {
      await monitor.stopMonitoring(telegramId);
      await monitor.startMonitoring(telegramId);
    }

    await ctx.editMessageText(
      `✅ Poll interval updated to: *${interval / 1000} seconds*`,
      {
        parse_mode: 'Markdown',
        ...getBackToMenuKeyboard(),
      }
    );
  });

  /**
   * Back to menu callback
   */
  bot.action('back_to_menu', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await ctx.answerCbQuery();

    const user = await Database.getUser(telegramId);

    if (!user) {
      await ctx.reply('Error: User not found. Use /start');
      return;
    }

    const menuMessage = `📊 *Wallet Monitor Menu*

Wallet: \`${user.walletAddress}\`
Status: ${user.isMonitoring ? '✅ Monitoring' : '⏸ Paused'}`;

    await ctx.editMessageText(menuMessage, {
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard(user.isMonitoring),
    });
  });
}