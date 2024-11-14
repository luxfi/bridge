import React from "react";
import Image from "next/image";
import shortenAddress from "@/components/utils/ShortenAddress";
import { useAtom } from "jotai";
import { ethPriceAtom } from "@/store/fireblocks";
import { truncateDecimals } from "@/components/utils/RoundDecimals";
import type { Network, Token } from "@/types/fireblocks";

interface IProps {
  sourceNetwork: Network;
  sourceAsset: Token;
  destinationNetwork: Network;
  destinationAsset: Token;
  destinationAddress: string;
  sourceAmount: string;
}

const SwapItems: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAddress,
  destinationAsset,
  sourceAmount,
}) => {
  const [ethPrice] = useAtom(ethPriceAtom);
  //token price
  const tokenPrice = ethPrice;

  return (
    <div className="bg-level-1 font-normal px-3 py-4 rounded-lg flex flex-col border border-[#404040] w-full relative z-10">
      <div className="font-normal flex flex-col w-full relative z-10 space-y-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {sourceAsset && (
              <Image
                src={sourceAsset.logo}
                alt={sourceAsset.logo}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <div>
              <p className=" text-sm leading-5">{sourceNetwork.display_name}</p>
              <p className="text-sm ">{"Network"}</p>
            </div>
          </div>
          <div className="flex flex-col">
            <p className=" text-sm">
              {truncateDecimals(Number(sourceAmount), 6)} {sourceAsset.asset}
            </p>
            <p className=" text-sm flex justify-end">
              ${truncateDecimals(Number(sourceAmount) * tokenPrice, 6)}
            </p>
          </div>
        </div>
      </div>
      <div className="font-normal flex flex-col w-full relative z-10 space-y-4 mt-5">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {
              <Image
                src={destinationAsset.logo}
                alt={destinationAsset.logo}
                width={32}
                height={32}
                className="rounded-full"
              />
            }
            <div>
              <p className=" text-sm leading-5">
                {destinationNetwork.display_name}
              </p>
              <p className="text-sm ">{shortenAddress(destinationAddress)}</p>
            </div>
          </div>
          <div className="flex flex-col">
            <p className=" text-sm">
              {truncateDecimals(Number(sourceAmount), 4)}{" "}
              {destinationAsset.asset}
            </p>
            <p className=" text-sm flex justify-end">
              ${truncateDecimals(Number(sourceAmount) * tokenPrice, 4)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapItems;
