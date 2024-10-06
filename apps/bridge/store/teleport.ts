import { atom } from 'jotai';
import { networks } from "@/components/teleport/constants/settings.sandbox";
import { Network, Token } from '@/types/teleport';

<<<<<<< HEAD
export const sourceNetworkAtom = atom<Network | undefined>(networks.find(n => n.status === 'active'));
=======
export const sourceNetworkAtom = atom<Network | undefined>(networks[0]);
>>>>>>> 0c54d0f34ca749f49db7636c39fb5f4a1ae58e95
export const sourceAssetAtom = atom<Token | undefined>(undefined);
export const destinationNetworkAtom = atom<Network | undefined>(undefined);
export const destinationAssetAtom = atom<Token | undefined>(undefined);
export const destinationAddressAtom = atom<string>("");
export const sourceAmountAtom = atom<string>("");
export const ethPriceAtom = atom<number>(0);
export const swapStatusAtom = atom<string>("");
export const swapIdAtom = atom<string>("");
export const userTransferTransactionAtom = atom<string>("");
export const bridgeMintTransactionAtom = atom<string>("");
export const mpcSignatureAtom = atom<string>("");
export const useTelepoterAtom = atom<boolean>(true);