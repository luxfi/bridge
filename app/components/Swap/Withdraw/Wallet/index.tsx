import { FC, PropsWithChildren } from "react"
import { ApiResponse } from "../../../../Models/ApiResponse"
import { useSettingsState } from "../../../../context/settings"
import { useSwapDataState } from "../../../../context/swap"
import KnownInternalNames from "../../../../lib/knownIds"
import BridgeApiClient, { DepositAddress, DepositType, Fee } from "../../../../lib/BridgeApiClient"
import ImtblxWalletWithdrawStep from "./ImtblxWalletWithdrawStep"
import StarknetWalletWithdrawStep from "./StarknetWalletWithdraw"
import useSWR from 'swr'
import TransferFromWallet from "./WalletTransfer"
import ZkSyncWalletWithdrawStep from "./ZKsyncWalletWithdraw"
import { Layer } from "../../../../Models/Layer"
import useWalletTransferOptions from "../../../../hooks/useWalletTransferOptions"

//TODO have separate components for evm and none_evm as others are sweepless anyway
const WalletTransfer: FC = () => {
    const { swap } = useSwapDataState()
    const { layers } = useSettingsState()

    const { source_network: source_network_internal_name, destination_network, destination_network_asset, source_network_asset } = swap || {}
    const source_layer = layers.find(n => n.internal_name === source_network_internal_name) as (Layer & { isExchange: false })
    const destination = layers.find(n => n.internal_name === destination_network)
    const sourceAsset = source_layer?.assets?.find(c => c.asset.toLowerCase() === swap?.source_network_asset.toLowerCase())

    const sourceIsImmutableX = swap?.source_network?.toUpperCase() === KnownInternalNames.Networks.ImmutableXMainnet?.toUpperCase() || swap?.source_network === KnownInternalNames.Networks.ImmutableXGoerli?.toUpperCase()
    const sourceIsZkSync = swap?.source_network?.toUpperCase() === KnownInternalNames.Networks.ZksyncMainnet?.toUpperCase()
    const sourceIsStarknet = swap?.source_network?.toUpperCase() === KnownInternalNames.Networks.StarkNetMainnet?.toUpperCase() || swap?.source_network === KnownInternalNames.Networks.StarkNetGoerli?.toUpperCase()

    const { canDoSweepless, isContractWallet } = useWalletTransferOptions()
    const shouldGetGeneratedAddress = isContractWallet?.ready && !canDoSweepless
    const generateDepositParams = shouldGetGeneratedAddress ? [source_network_internal_name] : null    

    const bridgeApiClient = new BridgeApiClient()
    const {
        data: generatedDeposit
    } = useSWR<ApiResponse<DepositAddress>>(generateDepositParams, ([network]) => bridgeApiClient.GenerateDepositAddress(network), { dedupingInterval: 60000 })

    const managedDepositAddress = sourceAsset?.network?.managed_accounts?.[0]?.address;
    const generatedDepositAddress = generatedDeposit?.data?.address

    const depositAddress = isContractWallet?.ready ?
        (canDoSweepless ? managedDepositAddress : generatedDepositAddress)
        : undefined

    const sourceChainId = (source_layer && source_layer.isExchange === false) ? Number(source_layer?.chain_id) : null
    const feeParams = {
        source: source_network_internal_name,
        destination: destination?.internal_name,
        source_asset: source_network_asset,
        destination_asset: destination_network_asset,
        refuel: swap?.has_refuel
    }

    const { data: feeData } = useSWR<ApiResponse<Fee[]>>([feeParams], ([params]) => bridgeApiClient.GetFee(params), { dedupingInterval: 60000 })
    const walletTransferFee = isContractWallet?.ready ?
        feeData?.data?.find(f => f?.deposit_type === (canDoSweepless ? DepositType.Wallet : DepositType.Manual))
        : undefined

    const requested_amount = Number(walletTransferFee?.min_amount) > Number(swap?.requested_amount) ? walletTransferFee?.min_amount : swap?.requested_amount

    if (sourceIsImmutableX)
        return <Wrapper>
            <ImtblxWalletWithdrawStep depositAddress={depositAddress} />
        </Wrapper>
    else if (sourceIsStarknet)
        return <Wrapper>
            <StarknetWalletWithdrawStep amount={requested_amount} depositAddress={depositAddress} />
        </Wrapper>
    else if (sourceIsZkSync)
        return <Wrapper>
            {requested_amount && depositAddress && <ZkSyncWalletWithdrawStep depositAddress={depositAddress} amount={requested_amount} />}
        </Wrapper>
    else
        return <Wrapper>
            {swap && source_layer && sourceAsset && requested_amount && sourceChainId && <TransferFromWallet
                sequenceNumber={swap?.sequence_number}
                swapId={swap.id}
                networkDisplayName={source_layer?.display_name}
                tokenDecimals={sourceAsset?.decimals}
                tokenContractAddress={sourceAsset.contract_address}
                chainId={sourceChainId}
                depositAddress={depositAddress}
                userDestinationAddress={swap.destination_address}
                amount={requested_amount}
            />}
        </Wrapper>

}

const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    return <div className='border-secondary-500 rounded-md border bg-level-3 darker-2-class p-3'>
        {children}
    </div>
}

export default WalletTransfer
