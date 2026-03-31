import {
  Connection,
  PublicKey,
  Commitment,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { Telegraf } from 'telegraf';
import Database from '../db';
import { parseTransaction, formatTransactionMessage } from './parser';
import { BotContext, CommitmentLevel } from '../types';

interface MonitoringState {
  subscriptionId?: number;
  pollingInterval?: NodeJS.Timeout;
  lastSignature?: string;
}

export class SolanaMonitor {
  private connection: Connection;
  private wsConnection?: Connection;
  private bot: Telegraf<BotContext>;
  private monitoringStates: Map<string, MonitoringState> = new Map();
  private useWebSocket: boolean = true;

  constructor(bot: Telegraf<BotContext>, rpcUrl: string, wsUrl?: string) {
    this.bot = bot;
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Try to create WebSocket connection if URL provided
    if (wsUrl) {
      try {
        this.wsConnection = new Connection(wsUrl, {
          commitment: 'confirmed',
          wsEndpoint: wsUrl,
        });
        console.log('✅ WebSocket connection created');
      } catch (error) {
        console.warn('⚠️  Failed to create WebSocket connection, will use polling:', error);
        this.useWebSocket = false;
      }
    } else {
      console.log('ℹ️  No WebSocket URL provided, using polling mode');
      this.useWebSocket = false;
    }
  }

  /**
   * Start monitoring a wallet for a user
   */
  async startMonitoring(telegramId: string): Promise<boolean> {
    try {
      const user = await Database.getUser(telegramId);
      
      if (!user || !user.walletAddress) {
        return false;
      }

      // Stop existing monitoring if any
      await this.stopMonitoring(telegramId);

      const walletPubkey = new PublicKey(user.walletAddress);
      const commitment = user.commitmentLevel as Commitment;

      // Try WebSocket first, fallback to polling
      if (this.useWebSocket && this.wsConnection) {
        try {
          await this.startWebSocketMonitoring(
            telegramId,
            walletPubkey,
            commitment
          );
          
          // Also start light polling as backup (every 30 seconds)
          await this.startBackupPolling(telegramId, walletPubkey, commitment, 30000);
          
        } catch (error) {
          console.warn('⚠️  WebSocket monitoring failed, falling back to polling:', error);
          await this.startPollingMonitoring(
            telegramId,
            walletPubkey,
            commitment,
            user.pollInterval
          );
        }
      } else {
        await this.startPollingMonitoring(
          telegramId,
          walletPubkey,
          commitment,
          user.pollInterval
        );
      }

      await Database.setMonitoringStatus(telegramId, true);
      return true;
    } catch (error) {
      console.error('Error starting monitoring:', error);
      return false;
    }
  }

  /**
   * Start WebSocket-based monitoring
   */
  private async startWebSocketMonitoring(
    telegramId: string,
    walletPubkey: PublicKey,
    commitment: Commitment
  ) {
    if (!this.wsConnection) {
      throw new Error('WebSocket connection not available');
    }

    console.log(`🔌 Attempting WebSocket subscription for ${walletPubkey.toString()}`);

    try {
      const subscriptionId = this.wsConnection.onAccountChange(
        walletPubkey,
        async (accountInfo, context) => {
          console.log('🔔 Account change detected via WebSocket!');
          // Fetch recent signatures when account changes
          await this.checkForNewTransactions(telegramId, walletPubkey);
        },
        commitment
      );

      this.monitoringStates.set(telegramId, {
        subscriptionId,
      });

      console.log(`✅ WebSocket monitoring active for user ${telegramId}, subscription ID: ${subscriptionId}`);
      
      // Also do an initial poll to catch any recent transactions
      await this.checkForNewTransactions(telegramId, walletPubkey);
    } catch (error) {
      console.error('❌ WebSocket subscription failed:', error);
      throw error;
    }
  }

  /**
   * Start backup polling (runs alongside WebSocket)
   */
  private async startBackupPolling(
    telegramId: string,
    walletPubkey: PublicKey,
    commitment: Commitment,
    interval: number
  ) {
    const poll = async () => {
      await this.checkForNewTransactions(telegramId, walletPubkey);
    };

    const pollingInterval = setInterval(poll, interval);
    
    // Store both subscription ID and polling interval
    const existingState = this.monitoringStates.get(telegramId);
    this.monitoringStates.set(telegramId, {
      ...existingState,
      pollingInterval,
    });

    console.log(`🔄 Backup polling enabled (every ${interval}ms)`);
  }

  /**
   * Check for new transactions (used by both WebSocket and polling)
   */
  private async checkForNewTransactions(telegramId: string, walletPubkey: PublicKey) {
    try {
      const user = await Database.getUser(telegramId);
      if (!user) return;

      const signatures = await this.connection.getSignaturesForAddress(
        walletPubkey,
        { limit: 5 },
        'confirmed'
      );

      if (signatures.length === 0) return;

      // Process from oldest to newest
      for (let i = signatures.length - 1; i >= 0; i--) {
        const sig = signatures[i];
        
        // Skip if we've already seen this signature
        if (user.lastSeenSignature === sig.signature) {
          break;
        }

        await this.handleNewTransaction(telegramId, sig.signature);
      }
    } catch (error) {
      console.error('Error checking transactions:', error);
    }
  }

  /**
   * Start polling-based monitoring
   */
  private async startPollingMonitoring(
    telegramId: string,
    walletPubkey: PublicKey,
    commitment: Commitment,
    interval: number
  ) {
    console.log(`📊 Starting polling mode for ${walletPubkey.toString()} (every ${interval}ms)`);

    const poll = async () => {
      await this.checkForNewTransactions(telegramId, walletPubkey);
    };

    // Initial poll
    await poll();

    // Set up interval
    const pollingInterval = setInterval(poll, interval);

    this.monitoringStates.set(telegramId, {
      pollingInterval,
    });

    console.log(`✅ Polling monitoring active for user ${telegramId}`);
  }

  /**
   * Handle a new transaction
   */
  private async handleNewTransaction(telegramId: string, signature: string) {
    try {
      const user = await Database.getUser(telegramId);
      
      if (!user || !user.walletAddress) {
        return;
      }

      // Check for duplicates
      if (user.lastSeenSignature === signature) {
        return;
      }

      // Parse transaction
      const txInfo = await parseTransaction(
        this.connection,
        signature,
        user.walletAddress
      );

      if (!txInfo) {
        return;
      }

      // Update last seen signature
      await Database.updateLastSeenSignature(telegramId, signature);

      // Send notification
      const message = formatTransactionMessage(txInfo);
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error('Error handling transaction:', error);
    }
  }

  /**
   * Stop monitoring for a user
   */
  async stopMonitoring(telegramId: string): Promise<boolean> {
    try {
      const state = this.monitoringStates.get(telegramId);

      if (state) {
        // Remove WebSocket subscription
        if (state.subscriptionId !== undefined && this.wsConnection) {
          await this.wsConnection.removeOnLogsListener(state.subscriptionId);
        }

        // Clear polling interval
        if (state.pollingInterval) {
          clearInterval(state.pollingInterval);
        }

        this.monitoringStates.delete(telegramId);
      }

      await Database.setMonitoringStatus(telegramId, false);
      console.log(`Stopped monitoring for user ${telegramId}`);
      return true;
    } catch (error) {
      console.error('Error stopping monitoring:', error);
      return false;
    }
  }

  /**
   * Restart monitoring for all active users (useful after bot restart)
   */
  async restartAllMonitoring() {
    const users = await Database.getMonitoringUsers();
    
    for (const user of users) {
      try {
        await this.startMonitoring(user.telegramId);
      } catch (error) {
        console.error(`Failed to restart monitoring for user ${user.telegramId}:`, error);
      }
    }
    
    console.log(`Restarted monitoring for ${users.length} users`);
  }

  /**
   * Get monitoring status for a user
   */
  isMonitoring(telegramId: string): boolean {
    return this.monitoringStates.has(telegramId);
  }
}