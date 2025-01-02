import { Web3, HttpProvider } from 'web3'
import { rpc } from 'viem/utils'
import { Contract, ethers } from 'ethers'
import type { Network, Token } from '@/types/teleport'
import { formatUnits } from 'ethers/lib/utils'
import { erc20ABI } from '@wagmi/core'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

/**
 * generate random string
 * @returns STRING
 */
export const generateRandomString = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

const _getWeb3 = async (rpcList: string[]) => {
  for (let i = 0; i < rpcList.length; i++) {
    const rpcUrl = rpcList[i]
    console.log(rpcUrl)
    const web3 = new Web3(new HttpProvider(String(rpcUrl)))
    try {
      await web3.eth.net.isListening()
      return Promise.resolve(web3)
    } catch (err) {
      console.log('next rpc...')
    }
  }
  return Promise.reject('cannot connect')
}

/**
 *
 * @param number
 * @returns
 */
export const localeNumber = (number: number | string, decials: number = 18) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decials,
    useGrouping: false, // Disable commas
  }).format(Number(number))
}

/**
 * format provided number
 * @param value
 * @returns
 */
export const formatNumber = (value: number | string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  }).format(Number(value))
}
/**
 *
 * @param num
 * @returns
 */
export const formatLongNumber = (num: number | string): string => {
  const value = isNaN(Number(num)) ? 0 : Number(num)
  if (value >= 1e15) {
    return (value / 1e15).toFixed(1) + 'P'
  } else if (value >= 1e12) {
    return (value / 1e12).toFixed(1) + 'T'
  } else if (value >= 1e9) {
    return (value / 1e9).toFixed(1) + 'G'
  } else if (value >= 1e6) {
    return (value / 1e6).toFixed(1) + 'M'
  } else if (value >= 1e3) {
    return (value / 1e3).toFixed(1) + 'K'
  } else {
    return formatNumber(value)
  }
}

/**
 * get token balance
 * @param address
 * @param network
 * @param asset
 * @returns
 */
export const fetchTokenBalance = async (address: string, network: CryptoNetwork, asset: NetworkCurrency) => {
  try {
    if (asset.asset === network.native_currency) {
      const provider = new ethers.providers.JsonRpcProvider(network.nodes[0])
      const _balance = await provider.getBalance(address)
      return Number(formatUnits(_balance, asset.decimals))
    } else {
      const provider = new ethers.providers.JsonRpcProvider(network.nodes[0])
      const contract = new Contract(String(asset.contract_address), erc20ABI, provider)
      const _balance = await contract.balanceOf(address)
      return Number(formatUnits(_balance, asset.decimals))
    }
  } catch (err) {
    return 0
  }
}
