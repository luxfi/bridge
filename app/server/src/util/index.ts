import KnownInternalNames from "@/domain/constants"
import WAValidator from "multicoin-address-validator"
import { isAddress } from "ethers"
import { isAddress as isSolanoAddress } from "@solana/addresses"

export function isValidAddress(address?: string, network?: { internal_name: string } | null): boolean {
  if (!address) {
    return false
  }

  if (network?.internal_name === KnownInternalNames.Networks.RoninMainnet) {
    if (address.startsWith("ronin:")) {
      return isAddress(address.replace("ronin:", "0x"))
    }
    return false
  } else if (network?.internal_name.toLowerCase().startsWith("ZKSYNC".toLowerCase())) {
    if (address?.startsWith("zksync:")) {
      return isAddress(address.replace("zksync:", ""))
    }
    return isAddress(address)
  }
  // else if (network?.internal_name.toLowerCase().startsWith("STARKNET".toLowerCase())) {
  //     return validateAndParseAddress(address);
  // }
  else if (network?.internal_name.toLowerCase().startsWith("TON".toLowerCase())) {
    if (address.length === 48) return true
    else return false
  } else if (network?.internal_name === KnownInternalNames.Networks.OsmosisMainnet) {
    if (/^(osmo1)?[a-z0-9]{38}$/.test(address)) {
      return true
    }
    return false
  } else if (network?.internal_name === KnownInternalNames.Networks.SolanaMainnet || network?.internal_name === KnownInternalNames.Networks.SolanaTestnet || network?.internal_name === KnownInternalNames.Networks.SolanaDevnet) {
    try {
      return isSolanoAddress(address)
    } catch (error: any) {
      return false
    }
  } else if (network?.internal_name === KnownInternalNames.Networks.SorareStage) {
    if (/^(0x)?[0-9a-f]{64}$/.test(address) || /^(0x)?[0-9A-F]{64}$/.test(address) || /^(0x)?[0-9a-f]{66}$/.test(address) || /^(0x)?[0-9A-F]{66}$/.test(address)) {
      return true
    }
    return false
  }
  if (network?.internal_name?.toLowerCase().startsWith("bitcoin")) {
    console.log("bitcoin")
    const isValid = WAValidator.validate(address, "BTC")
    return isValid
  } else {
    return isAddress(address)
  }
}
/**
 * 
 * @param data 
 * @returns 
 */
export const serializedData = (data: any) => {
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}