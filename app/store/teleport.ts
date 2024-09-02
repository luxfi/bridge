import { atom } from 'jotai';
import { Network, Token } from '@/types/teleport';

export const sourceNetworkAtom = atom<Network | undefined>(undefined);
export const sourceAssetAtom = atom<Token | undefined>(undefined);
export const destinationNetworkAtom = atom<Network | undefined>(undefined);
export const destinationAssetAtom = atom<Token | undefined>(undefined);
export const destinationAddressAtom = atom<string>("");
export const sourceAmountAtom = atom<string>("");
export const ethPriceAtom = atom<number>(0);
export const swapStatusAtom = atom<string>("");
export const swapIdAtom = atom<string>("");
export const bridgeTransferTransactionAtom = atom<string>("");
export const bridgeMintTransactionAtom = atom<string>("");
export const mpcSignatureAtom = atom<string>("");
