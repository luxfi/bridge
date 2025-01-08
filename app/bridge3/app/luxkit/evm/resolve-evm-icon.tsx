import MetaMaskIcon from '../icons/wallets/metamask'
import WalletConnectIcon from '../icons/wallets/walletconnect'
import BitKeep from '../icons/wallets/bitkeep'
import RainbowIcon from '../icons/wallets/rainbow'
import CoinbaseIcon from '../icons/wallets/coinbase'
import Phantom from '../icons/wallets/phantom'

import { Coins, type LucideProps } from 'lucide-react'
import { type Connector } from 'wagmi'

const resolveEVMWalletIcon = ({ connector }: { connector: Connector }) => {
  let icon: ((props: any) => JSX.Element) | null = null

  // Check first by id then by name
  const _wallet = connector?.id?.toLowerCase() ?? ''
  if (_wallet.includes(KnownKonnectorIds.MetaMask)) {
    icon = MetaMaskIcon
  } else if (_wallet.includes(KnownKonnectorIds.WalletConnect)) {
    icon = WalletConnectIcon
  } else if (_wallet.includes(KnownKonnectorIds.Rainbow)) {
    icon = RainbowIcon
  } else if (_wallet.includes(KnownKonnectorIds.BitKeep)) {
    icon = BitKeep
  } else if (_wallet.includes(KnownKonnectorIds.CoinbaseWallet)) {
    icon = CoinbaseIcon
  }

  if (icon == null) {
    switch (connector?.name?.toLowerCase()) {
      case KnownKonnectorNames.Phantom:
        icon = Phantom
    }
  }

  if (icon == null) {
    icon = CoinsIcon
  }

  return icon
}

const KnownKonnectorIds = {
  MetaMask: 'metamask',
  WalletConnect: 'walletconnect',
  Rainbow: 'rainbow',
  BitKeep: 'bitkeep',
  CoinbaseWallet: 'coinbasewallet',
}

const KnownKonnectorNames = {
  Phantom: 'phantom',
}

const CoinsIcon = (props: LucideProps) => {
  return <Coins {...props} strokeWidth={2} />
}

export default resolveEVMWalletIcon