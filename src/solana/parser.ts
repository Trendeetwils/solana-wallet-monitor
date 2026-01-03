import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  ParsedInstruction,
} from '@solana/web3.js';
import { TransactionNotification, TokenTransfer } from '../types';

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

// NEW: In-memory cache for token metadata
const tokenMetadataCache = new Map<string, { name?: string; symbol?: string; decimals: number }>();

/**
 * NEW: Fetch token metadata from on-chain account
 */
async function fetchTokenMetadata(
  connection: Connection,
  mintAddress: string
): Promise<{ name?: string; symbol?: string; decimals: number }> {
  // Check cache first
  if (tokenMetadataCache.has(mintAddress)) {
    return tokenMetadataCache.get(mintAddress)!;
  }

  try {
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await connection.getParsedAccountInfo(mintPubkey);

    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const parsed = mintInfo.value.data.parsed;
      const decimals = parsed.info?.decimals || 0;

      // Try to fetch metadata from Metaplex (if available)
      let name: string | undefined;
      let symbol: string | undefined;

      try {
        // Metaplex metadata PDA
        const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
        const [metadataPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
          METADATA_PROGRAM_ID
        );

        const metadataAccount = await connection.getAccountInfo(metadataPDA);
        if (metadataAccount) {
          // Parse metadata (simplified - just extract name and symbol)
          const data = metadataAccount.data;
          
          // Name starts at byte 65, symbol varies
          // This is a simplified extraction - production should use @metaplex-foundation/mpl-token-metadata
          const nameLength = data[64];
          if (nameLength > 0 && nameLength < 32) {
            name = data.slice(65, 65 + nameLength).toString('utf8').replace(/\0/g, '');
          }
          
          const symbolStart = 65 + 32;
          const symbolLength = data[symbolStart - 1];
          if (symbolLength > 0 && symbolLength < 10) {
            symbol = data.slice(symbolStart, symbolStart + symbolLength).toString('utf8').replace(/\0/g, '');
          }
        }
      } catch (metadataError) {
        // Metadata not available - this is fine
      }

      const metadata = { name, symbol, decimals };
      tokenMetadataCache.set(mintAddress, metadata);
      return metadata;
    }
  } catch (error) {
    console.error(`Error fetching metadata for ${mintAddress}:`, error);
  }

  // Return default if fetch fails
  const defaultMetadata = { decimals: 0 };
  tokenMetadataCache.set(mintAddress, defaultMetadata);
  return defaultMetadata;
}

/**
 * Parse a transaction and extract relevant information
 */
export async function parseTransaction(
  connection: Connection,
  signature: string,
  walletAddress: string
): Promise<TransactionNotification | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      return null;
    }

    const walletPubkey = new PublicKey(walletAddress);
    const accountIndex = tx.transaction.message.accountKeys.findIndex(
      (key) => key.pubkey.equals(walletPubkey)
    );

    if (accountIndex === -1) {
      return null;
    }

    // Calculate SOL change
    const preBalance = tx.meta.preBalances[accountIndex];
    const postBalance = tx.meta.postBalances[accountIndex];
    const solChange = (postBalance - preBalance) / LAMPORTS_PER_SOL;

    // Parse token transfers (MODIFIED: now includes metadata)
    const tokenTransfers = await parseTokenTransfers(connection, tx, walletAddress);

    // NEW: Determine transaction type (SOL or SPL)
    let transactionType: 'sol' | 'spl' = 'sol';
    if (tokenTransfers.length > 0) {
      transactionType = 'spl';
    }

    // Determine transaction direction
    const type = solChange >= 0 ? 'incoming' : 'outgoing';

    return {
      signature,
      timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
      type,
      transactionType, // NEW
      solChange: Math.abs(solChange) > 0.000001 ? solChange : undefined,
      tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined,
      explorerLink: `https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    console.error(`Error parsing transaction ${signature}:`, error);
    return null;
  }
}

/**
 * Parse SPL token transfers from a transaction (MODIFIED: adds metadata fetching)
 */
async function parseTokenTransfers(
  connection: Connection,
  tx: ParsedTransactionWithMeta,
  walletAddress: string
): Promise<TokenTransfer[]> {
  const transfers: TokenTransfer[] = [];

  if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
    return transfers;
  }

  const walletPubkey = new PublicKey(walletAddress);

  // Create a map of token account changes
  const tokenChanges = new Map<string, { pre: number; post: number; mint: string; decimals: number }>();

  // Process pre-balances
  for (const preBalance of tx.meta.preTokenBalances) {
    const owner = tx.transaction.message.accountKeys[preBalance.accountIndex];
    if (owner.pubkey.equals(walletPubkey) && preBalance.uiTokenAmount) {
      tokenChanges.set(preBalance.accountIndex.toString(), {
        pre: preBalance.uiTokenAmount.uiAmount || 0,
        post: 0,
        mint: preBalance.mint,
        decimals: preBalance.uiTokenAmount.decimals,
      });
    }
  }

  // Process post-balances
  for (const postBalance of tx.meta.postTokenBalances) {
    const owner = tx.transaction.message.accountKeys[postBalance.accountIndex];
    if (owner.pubkey.equals(walletPubkey) && postBalance.uiTokenAmount) {
      const key = postBalance.accountIndex.toString();
      const existing = tokenChanges.get(key);
      
      if (existing) {
        existing.post = postBalance.uiTokenAmount.uiAmount || 0;
      } else {
        tokenChanges.set(key, {
          pre: 0,
          post: postBalance.uiTokenAmount.uiAmount || 0,
          mint: postBalance.mint,
          decimals: postBalance.uiTokenAmount.decimals,
        });
      }
    }
  }

  // Calculate changes and create transfers (MODIFIED: fetch metadata)
  for (const change of tokenChanges.values()) {
    const amount = change.post - change.pre;
    if (Math.abs(amount) > 0.000001) {
      // NEW: Fetch token metadata
      const metadata = await fetchTokenMetadata(connection, change.mint);

      transfers.push({
        mint: change.mint,
        amount: Math.abs(amount),
        decimals: change.decimals,
        symbol: metadata.symbol,
        name: metadata.name, // NEW
        type: amount > 0 ? 'incoming' : 'outgoing',
      });
    }
  }

  return transfers;
}

/**
 * Format a transaction notification for display (MODIFIED: improved formatting)
 */
export function formatTransactionMessage(tx: TransactionNotification): string {
  const direction = tx.type === 'incoming' ? 'Incoming' : 'Outgoing';
  
  // NEW: Different formatting for SOL vs SPL transfers
  if (tx.transactionType === 'spl' && tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    // SPL Token Transfer
    let message = '';
    
    for (const transfer of tx.tokenTransfers) {
      const emoji = transfer.type === 'incoming' ? '📥' : '📤';
      const sign = transfer.type === 'incoming' ? '+' : '-';
      
      message += `🟢 *SPL Token ${transfer.type === 'incoming' ? 'Received' : 'Sent'}*\n\n`;
      
      // Token name and symbol
      if (transfer.name && transfer.symbol) {
        message += `💎 Token: ${transfer.name} (${transfer.symbol})\n`;
      } else if (transfer.symbol) {
        message += `💎 Token: ${transfer.symbol}\n`;
      } else {
        message += `💎 Token: Unknown Token\n`;
      }
      
      // Amount
      message += `${emoji} Amount: ${sign}${transfer.amount.toFixed(6)}\n`;
      
      // Mint address (inline code for easy copying)
      message += `📝 Mint: \`${transfer.mint}\`\n`;
      
      // Explorer links
      message += `\n🔗 [View Token on Solscan](https://solscan.io/token/${transfer.mint})\n`;
      
      // Transaction signature
      message += `📋 Signature: \`${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}\`\n`;
      
      // Timestamp
      const date = new Date(tx.timestamp);
      message += `⏰ ${date.toLocaleString()}\n`;
      
      message += `\n[View Transaction](${tx.explorerLink})`;
      
      if (tx.tokenTransfers.length > 1) {
        message += '\n\n---\n\n';
      }
    }
    
    return message;
  } else {
    // SOL Transfer (existing logic maintained)
    const emoji = tx.type === 'incoming' ? '📥' : '📤';
    let message = `🟣 *SOL ${direction}*\n\n`;
    message += `🔗 Signature: \`${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}\`\n`;
    
    if (tx.solChange !== undefined) {
      const sign = tx.type === 'incoming' ? '+' : '-';
      message += `${emoji} Amount: ${sign}${Math.abs(tx.solChange).toFixed(6)} SOL\n`;
    }

    const date = new Date(tx.timestamp);
    message += `\n⏰ ${date.toLocaleString()}\n`;
    message += `\n[View on Solscan](${tx.explorerLink})`;

    return message;
  }
}