import { atom } from 'jotai';
import { Network, Token } from '@/types/teleport';

export const sourceNetworkAtom = atom<Network | undefined>(undefined);
export const sourceAssetAtom = atom<Token | undefined>(undefined);
export const destinationNetworkAtom = atom<Network | undefined>(undefined);
export const destinationAssetAtom = atom<Token | undefined>(undefined);
