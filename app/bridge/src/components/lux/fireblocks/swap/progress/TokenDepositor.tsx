import React from "react";
import toast from "react-hot-toast";
import {
  swapStatusAtom,
  timeToExpireAtom,
  userTransferTransactionAtom,
} from "@/store/fireblocks";
import { ArrowRight, Router } from "lucide-react";
import { Contract } from "ethers";
import { CONTRACTS } from "@/components/lux/fireblocks/constants/settings";
import Gauge from "@/components/gauge";

import teleporterABI from "@/components/lux/fireblocks/constants/abi/bridge.json";
import erc20ABI from "@/components/lux/fireblocks/constants/abi/erc20.json";
//hooks
import { useAtom } from "jotai";
import { useEthersSigner } from "@/lib/ethersToViem/ethers";
import { parseUnits } from "ethers/lib/utils";
import axios from "axios";
import useWallet from "@/hooks/useWallet";
import SwapItems from "./SwapItems";
import type { Network, Token } from "@/types/fireblocks";
import ManualTransfer from "./ManualTransfer";

interface IProps {
  className?: string;
  sourceNetwork: Network;
  sourceAsset: Token;
  destinationNetwork: Network;
  destinationAsset: Token;
  destinationAddress: string;
  sourceAmount: string;
  swapId: string;
}

const UserTokenDepositor: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
}) => {
  //state
  const [isTokenTransferring, setIsTokenTransferring] =
    React.useState<boolean>(false);
  const [userDepositNotice, setUserDepositNotice] = React.useState<string>("");
  //atoms
  const signer = useEthersSigner();
  // time to expire
  const [timeToExpire, setTimeToExpire] = useAtom(timeToExpireAtom);

  console.log("::time to expire ", timeToExpire);

  return (
    <div className={`w-full flex flex-col ${className}`}>
      <div className="space-y-5">
        <div className="w-full flex flex-col space-y-5">
          <SwapItems
            sourceNetwork={sourceNetwork}
            sourceAsset={sourceAsset}
            destinationNetwork={destinationNetwork}
            destinationAsset={destinationAsset}
            destinationAddress={destinationAddress}
            sourceAmount={sourceAmount}
          />
        </div>
        <div className="font-normal pb-4 flex flex-col w-full relative z-10 space-y-4 items-center border-dashed border-b-2 border-[#404040]">
          <span className="animate-spin">
            <Gauge value={60} size="medium" />
          </span>
          <div className="mt-2">Waiting for your deposit</div>
          <div className="text-sm !mt-2">
            Processing time for expiration: ~15s
          </div>
        </div>
        <ManualTransfer
          sourceNetwork={sourceNetwork}
          sourceAsset={sourceAsset}
          destinationNetwork={destinationNetwork}
          destinationAsset={destinationAsset}
          destinationAddress={destinationAddress}
          sourceAmount={sourceAmount}
          swapId={swapId}
        />
      </div>
    </div>
  );
};

export default UserTokenDepositor;
