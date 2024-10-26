'use client'
import { ApiResponse } from "../../../../Models/ApiResponse"
import { useSettings } from "../../../../context/settings"
import { useSwapDataState } from "../../../../context/swap"
import KnownInternalNames from "../../../../lib/knownIds"
import BridgeApiClient, { type DepositAddress } from "../../../../lib/BridgeApiClient"
import ImtblxWalletWithdrawStep from "./ImtblxWalletWithdrawStep"
import StarknetWalletWithdrawStep from "./StarknetWalletWithdraw"
import useSWR from 'swr'
import TransferFromWallet from "./WalletTransfer"
import ZkSyncWalletWithdrawStep from "./ZKsyncWalletWithdraw"
import { type Layer } from "../../../../Models/Layer"
import useWalletTransferOptions from "../../../../hooks/useWalletTransferOptions"
import { useFee } from "../../../../context/feeContext"

//TODO have separate components for evm and none_evm as others are sweepless anyway
const WalletTransfer: React.FC = () => {
    const { swap } = useSwapDataState()
    const { layers } = useSettings()
    const { minAllowedAmount } = useFee()

    const { source_network: source_network_internal_name } = swap || {}
    const source_layer = layers.find(n => n.internal_name === source_network_internal_name)
    const sourceAsset = source_layer?.assets?.find(c => c?.asset?.toLowerCase() === swap?.source_asset?.toLowerCase())

    const sourceIsImmutableX = source_network_internal_name?.toUpperCase() === KnownInternalNames.Networks.ImmutableXMainnet?.toUpperCase() || source_network_internal_name === KnownInternalNames.Networks.ImmutableXGoerli?.toUpperCase()
    const sourceIsZkSync = source_network_internal_name?.toUpperCase() === KnownInternalNames.Networks.ZksyncMainnet?.toUpperCase()
    const sourceIsStarknet = source_network_internal_name?.toUpperCase() === KnownInternalNames.Networks.StarkNetMainnet?.toUpperCase() || source_network_internal_name === KnownInternalNames.Networks.StarkNetGoerli?.toUpperCase()

    const { canDoSweepless, isContractWallet } = useWalletTransferOptions()
    const shouldGetGeneratedAddress = isContractWallet?.ready && !canDoSweepless
    const generateDepositParams = shouldGetGeneratedAddress ? [source_network_internal_name] : null

    const client = new BridgeApiClient()
    const {
        data: generatedDeposit
    } = useSWR<ApiResponse<DepositAddress>>(generateDepositParams, ([network]) => client.GenerateDepositAddress(network), { dedupingInterval: 60000 })

    const managedDepositAddress = source_layer?.managed_accounts?.[0]?.address;
    const generatedDepositAddress = generatedDeposit?.data?.address

    const depositAddress = isContractWallet?.ready ?
        (canDoSweepless ? managedDepositAddress : generatedDepositAddress)
        : undefined

    const sourceChainId = source_layer ? Number(source_layer?.chain_id) : null
    const requested_amount = Number(minAllowedAmount) > Number(swap?.requested_amount) ? minAllowedAmount : swap?.requested_amount

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

const Wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    return <div className='border-[#404040] rounded-md border bg-level-1 p-3'>
        {children}
    </div>
}

export default WalletTransfer
