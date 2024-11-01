"use client";
import { useAtom } from "jotai";

import AmountField from "../AmountField";
import NetworkSelectWrapper from "./NetworkSelectWrapper";

import type { Network, Token } from "@/types/teleport";
import TokenSelectWrapper from "./TokenSelectWrapper";
import { sourceAmountAtom } from "@/store/teleport";

const NetworkFormField: React.FC<{
  networks: Network[],
  network?: Network,
  asset?: Token,
  setNetwork: (network: Network) => void,
  setAsset: (asset: Token) => void,
  disabled: boolean
}> = ({ 
  networks, 
  network, 
  asset, 
  setNetwork, 
  setAsset, 
  disabled 
}) => {

  const [amount, setAmount] = useAtom(sourceAmountAtom);

  return (
    <div className='p-3' id='NETWORK_FORM_FIELD'>
      <label htmlFor={'name'} className="block font-semibold text-xs">
        From
      </label>
      <div className="border border-[#404040] bg-level-1 rounded-lg mt-1.5 pb-2">
        <div className="w-full">
          <NetworkSelectWrapper
            disabled={disabled}
            placeholder={'Source'}
            setNetwork={setNetwork}
            network={network}
            networks={networks}
            searchHint={'searchHint'}
            className="rounded-b-none border-t-0 border-x-0"
          />
        </div>
        <div className="flex justify-between items-center mt-2 pl-3 pr-4">
          <AmountField
            disabled={!network}
            value={amount}
            setValue={(value: string) => setAmount(value)}
          />
          <TokenSelectWrapper
            placeholder="Asset"
            values={network ? network.currencies : []}
            value={asset}
            setValue={setAsset}
            disabled={true}
          />
        </div>
      </div>
    </div>
  )
}

export default NetworkFormField
