import { PublicKey } from '@solana/web3.js';

/**
 * Validates if a string is a valid Solana public key address
 * @param address - The address string to validate
 * @returns true if valid, false otherwise
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    // Check if it's a valid base58 string and can be converted to PublicKey
    const publicKey = new PublicKey(address);
    
    // Additional check: ensure the address is on curve
    // This prevents invalid addresses that might pass the PublicKey constructor
    return PublicKey.isOnCurve(publicKey.toBytes());
  } catch (error) {
    return false;
  }
}

/**
 * Normalizes a Solana address (trims whitespace, etc.)
 * @param address - The address to normalize
 * @returns normalized address string
 */
export function normalizeAddress(address: string): string {
  return address.trim();
}

/**
 * Validates and normalizes a Solana address
 * @param address - The address to validate and normalize
 * @returns normalized address if valid, null otherwise
 */
export function validateAndNormalizeAddress(address: string): string | null {
  const normalized = normalizeAddress(address);
  return isValidSolanaAddress(normalized) ? normalized : null;
}