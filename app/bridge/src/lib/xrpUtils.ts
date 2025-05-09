/**
 * Utilities for working with XRP and the XRP Ledger
 */

/**
 * Convert XRP amount to drops (1 XRP = 1,000,000 drops)
 * @param xrpAmount The amount in XRP
 * @returns The amount in drops (string)
 */
export function xrpToDrops(xrpAmount: string | number): string {
  const xrp = typeof xrpAmount === 'string' ? parseFloat(xrpAmount) : xrpAmount;
  const drops = Math.floor(xrp * 1_000_000);
  return drops.toString();
}

/**
 * Convert drops to XRP amount
 * @param drops The amount in drops
 * @returns The amount in XRP (string)
 */
export function dropsToXrp(drops: string | number): string {
  const dropsNum = typeof drops === 'string' ? parseInt(drops, 10) : drops;
  const xrp = dropsNum / 1_000_000;
  return xrp.toString();
}

/**
 * Validates an XRP address
 * Very basic validation - checks general format
 * For comprehensive validation, a proper XRP library should be used
 * @param address XRP address to validate
 * @returns boolean indicating if address is valid
 */
export function isValidXrpAddress(address: string): boolean {
  // Basic validation - XRP addresses are typically around 25-35 characters
  // and start with 'r' followed by alphanumeric characters
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}
