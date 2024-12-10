import { atom } from 'jotai'
import type { DepositAction } from '@/types/utila'
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'

export const sourceNetworkAtom = atom<CryptoNetwork | undefined>(undefined)
export const timeToExpireAtom = atom<number>(0)
export const sourceAssetAtom = atom<NetworkCurrency | undefined>(undefined)
export const destinationNetworkAtom = atom<CryptoNetwork | undefined>(undefined)
export const destinationAssetAtom = atom<NetworkCurrency | undefined>(undefined)
export const destinationAddressAtom = atom<string>('')
export const sourceAmountAtom = atom<string>('')
export const ethPriceAtom = atom<number>(0)
export const swapStatusAtom = atom<string>('')
export const swapIdAtom = atom<string>('')
export const userTransferTransactionAtom = atom<string>('')
export const bridgeMintTransactionAtom = atom<string>('')
export const mpcSignatureAtom = atom<string>('')
export const useTelepoterAtom = atom<boolean>(true)
export const depositActionsAtom = atom<DepositAction[]>([])

export const depositAddressAtom = atom<undefined|string>(undefined)
