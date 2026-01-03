import { PrismaClient } from '@prisma/client';
import { CommitmentLevel } from '../types';

const prisma = new PrismaClient();

export class Database {
  /**
   * Get or create a user by Telegram ID
   */
  static async getOrCreateUser(telegramId: string) {
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          isMonitoring: false,
        },
      });
    }

    return user;
  }

  /**
   * Update user's wallet address
   */
  static async updateWalletAddress(telegramId: string, walletAddress: string) {
    return prisma.user.update({
      where: { telegramId },
      data: {
        walletAddress,
        lastSeenSignature: null, // Reset when changing address
      },
    });
  }

  /**
   * Set monitoring status for a user
   */
  static async setMonitoringStatus(telegramId: string, isMonitoring: boolean) {
    return prisma.user.update({
      where: { telegramId },
      data: { isMonitoring },
    });
  }

  /**
   * Update last seen signature for a user
   */
  static async updateLastSeenSignature(telegramId: string, signature: string) {
    return prisma.user.update({
      where: { telegramId },
      data: { lastSeenSignature: signature },
    });
  }

  /**
   * Update user settings
   */
  static async updateSettings(
    telegramId: string,
    settings: {
      commitmentLevel?: CommitmentLevel;
      pollInterval?: number;
    }
  ) {
    return prisma.user.update({
      where: { telegramId },
      data: settings,
    });
  }

  /**
   * Get all users who are currently monitoring
   */
  static async getMonitoringUsers() {
    return prisma.user.findMany({
      where: {
        isMonitoring: true,
        walletAddress: { not: null },
      },
    });
  }

  /**
   * Get user by Telegram ID
   */
  static async getUser(telegramId: string) {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  }
}

export { prisma };
export default Database;