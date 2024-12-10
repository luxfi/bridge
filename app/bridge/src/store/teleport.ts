import type { CryptoNetwork, NetworkCurrency } from "@/Models/CryptoNetwork"
import { atom } from "jotai"

export const swapStatusAtom = atom<string>("")
export const userTransferTransactionAtom = atom<string>("")
export const bridgeMintTransactionAtom = atom<string>("")
export const mpcSignatureAtom = atom<string>("")
export const useTelepoterAtom = atom<boolean>(true)
