"use client";
import { useAtom } from "jotai";

import AmountField from "../AmountField";
import NetworkSelectWrapper from "./NetworkSelectWrapper";
import TokenSelectWrapper from "./TokenSelectWrapper";

import type { Network, Token } from "@/types/teleport";
import { sourceAmountAtom } from "@/store/teleport";

const NetworkFormField: React.FC<{
  networks: Network[],
  network?: Network,
  asset?: Token,
  sourceAsset?: Token,
  setNetwork: (network: Network) => void,
  setAsset: (asset: Token) => void,
  disabled: boolean
}> = ({ 
  networks, 
  network, 
  asset, 
  sourceAsset, 
  setNetwork, 
  setAsset, 
  disabled 
}) => {

  const [amount] = useAtom(sourceAmountAtom)

  return (
    <div className={`p-3`}>
        <label htmlFor={'name'} className="block font-semibold text-xs">
            To
        </label>
        <div className="border border-[#404040] bg-level-1 rounded-lg mt-1.5 pb-2">
            <div>
                <div className="w-full">
                    <NetworkSelectWrapper
                        disabled={disabled}
                        placeholder={'Destination'}
                        setNetwork={setNetwork}
                        network={network}
                        networks={networks}
                        searchHint={'searchHint'}
                        className="rounded-b-none border-t-0 border-x-0"
                    />
                </div>
            </div>
            <div className="flex justify-between items-center mt-2 pl-3 pr-4">
                <AmountField
                    value={amount}
                    disabled={true}
                />
                <TokenSelectWrapper
                    placeholder="Asset"
                    values={network ? network.currencies : []}
                    value={asset}
                    sourceAsset={sourceAsset}
                    setValue={setAsset}
                    disabled={true}
                />
            </div>
        </div>
    </div>
  )
}

export default NetworkFormField;
