'use client'
import { NetworkCurrency } from "../Models/CryptoNetwork"
import { Layer } from "../Models/Layer"
import { useBalancesState } from "../context/balances"

const GasDetails = ({ network, currency }: { network: Layer, currency: NetworkCurrency }) => {

    const { gases } = useBalancesState()
    const networkGas = gases?.[network?.internal_name]?.find(g => g?.token === currency?.asset)

    if (!networkGas?.gasDetails) return

    return (
        <div className='grid grid-cols-1 gap-2 px-3 py-2 rounded-lg border-2 border-[#404040] bg-level-1 mt-2 w-[350px] fixed top-0 left-2'>
            <div className="flex flex-row items-baseline justify-between">
                <label className="block text-left text-muted-4">
                    Gas limit
                </label>
                <span className="text-right">
                    {
                        networkGas.gasDetails?.gasLimit
                    }
                </span>
            </div>
            <div className="flex flex-row items-baseline justify-between">
                <label className="block text-left text-muted-4">
                    Gas price
                </label>
                <span className="text-right">
                    {
                        networkGas.gasDetails?.gasPrice
                    }
                </span>
            </div>
            <div className="flex flex-row items-baseline justify-between">
                <label className="block text-left text-muted-4">
                    Max fee per gas
                </label>
                <span className="text-right">
                    {
                        networkGas.gasDetails?.maxFeePerGas
                    }
                </span>
            </div>
            <div className="flex flex-row items-baseline justify-between">
                <label className="block text-left text-muted-4">
                    Max priority fee per gas
                </label>
                <span className="text-right">
                    {
                        networkGas.gasDetails?.maxPriorityFeePerGas
                    }
                </span>
            </div>
        </div>
    )
}

export default GasDetails