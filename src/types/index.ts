import { Context } from 'telegraf';

export interface BotContext extends Context {
  session?: {
    awaitingAddress?: boolean;
  };
}

export interface TransactionNotification {
  signature: string;
  timestamp: number;
  type?: string;

  transactionType?: 'sol' | 'spl';

  solChange?: number;

  tokenTransfers?: TokenTransfer[];

  // NEW
  explorerLink?: string;
}

export interface TokenTransfer {
  mint: string;
  amount: number;
  decimals: number;

  name?: string;
  symbol?: string;

  // NEW
  type?: 'incoming' | 'outgoing';
}

export interface MonitoringStatus {
  isActive: boolean;
  walletAddress?: string;
  lastChecked?: Date;
  totalTransactionsFound: number;
}

export interface UserSettings {
  commitmentLevel: 'processed' | 'confirmed' | 'finalized';
  pollInterval: number;
}

export type CommitmentLevel = 'processed' | 'confirmed' | 'finalized';