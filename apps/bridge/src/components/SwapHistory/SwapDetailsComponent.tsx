"use client";
import Image from "next/image";
import shortenAddress from "../utils/ShortenAddress";
import CopyButton from "../buttons/copyButton";
import StatusIcon from "./StatusIcons";
import isGuid from "../utils/isGuid";
import KnownInternalNames from "../../lib/knownIds";
import { SwapDetailsComponentSkeleton } from "../Skeletons";
import { ExternalLink } from "lucide-react";
import { type FC } from "react";
import { type SwapItem, TransactionType } from "../../lib/BridgeApiClient";
//networks
import fireblockNetworksMainnet from "@/components/lux/fireblocks/constants/networks.mainnets";
import fireblockNetworksTestnet from "@/components/lux/fireblocks/constants/networks.sandbox";
import { networks as teleportNetworksMainnet } from "@/components/lux/teleport/constants/networks.mainnets";
import { networks as teleportNetworksTestnet } from "@/components/lux/teleport/constants/networks.sandbox";

type Props = {
  swap: SwapItem;
};

const SwapDetails: FC<Props> = ({ swap }) => {
  // make networks
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === "mainnet";
  const networksFireblock = isMainnet
    ? [
        ...fireblockNetworksMainnet.sourceNetworks,
        ...fireblockNetworksMainnet.destinationNetworks,
      ]
    : [
        ...fireblockNetworksTestnet.sourceNetworks,
        ...fireblockNetworksTestnet.destinationNetworks,
      ];
  const networksTeleport = isMainnet
    ? teleportNetworksMainnet
    : teleportNetworksTestnet;
  const networks = swap.use_teleporter ? networksTeleport : networksFireblock;

  const sourceNetwork = networks.find(
    (n) => n.internal_name === swap.source_network
  );
  const destinationNetwork = networks.find(
    (n) => n.internal_name === swap.destination_network
  );

  const sourceAsset = sourceNetwork?.currencies.find(
    (c) => c.asset === swap.source_asset
  );
  const destinationAsset = destinationNetwork?.currencies.find(
    (c) => c.asset === swap.destination_asset
  );

  const swapInputTransaction = swap?.transactions?.find(
    (t) => t.type === TransactionType.Input
  );
  const swapOutputTransaction = swap?.transactions?.find(
    (t) => t.type === TransactionType.Output
  );

  if (!swap) return <SwapDetailsComponentSkeleton />;

  return (
    <>
      <div className="w-full grid grid-flow-row animate-fade-in">
        <div className="rounded-md w-full grid grid-flow-row">
          <div className="items-center space-y-1.5 block text-base font-lighter leading-6 ">
            {swap.id && (
              <>
                <div className="flex justify-between p items-baseline">
                  <span className="text-left">Id </span>
                  <span className="">
                    <div className="inline-flex items-center">
                      {swap && (
                        <CopyButton
                          toCopy={swap?.id}
                          iconClassName="text-gray-500"
                        >
                          {shortenAddress(swap?.id)}
                        </CopyButton>
                      )}
                    </div>
                  </span>
                </div>
                <hr className="horizontal-gradient" />
              </>
            )}
            <div className="flex justify-between p items-baseline">
              <span className="text-left">Status </span>
              <span className="">{swap && <StatusIcon swap={swap} />}</span>
            </div>
            <hr className="horizontal-gradient" />
            <div className="flex justify-between items-baseline">
              <span className="text-left">Date </span>
              {swap && (
                <span className=" font-normal">
                  {new Date(swap.created_date).toLocaleString()}
                </span>
              )}
            </div>
            <hr className="horizontal-gradient" />
            <div className="flex justify-between items-baseline">
              <span className="text-left">From </span>

              <div className="flex items-center">
                <div className="flex-shrink-0 h-5 w-5 relative">
                  {
                    <Image
                      src={sourceNetwork?.logo!}
                      alt="Exchange Logo"
                      height="60"
                      width="60"
                      layout="responsive"
                      className="rounded-md object-contain"
                    />
                  }
                </div>
                <div className="mx-1 ">{sourceNetwork?.display_name}</div>
              </div>
            </div>
            <hr className="horizontal-gradient" />
            <div className="flex justify-between items-baseline">
              <span className="text-left">To </span>
              <div className="flex items-center">
                <div className="flex-shrink-0 h-5 w-5 relative">
                  <Image
                    // src={resolveNetworkImage(swap?.destination_network)}
                    src={destinationNetwork?.logo!}
                    alt="Exchange Logo"
                    height="60"
                    width="60"
                    layout="responsive"
                    className="rounded-md border border-[#f3f3f32d] object-contain"
                  />
                </div>
                <div className="mx-1 ">
                  <div className="mx-1 ">
                    {destinationNetwork?.display_name}
                  </div>
                </div>
              </div>
            </div>
            <hr className="horizontal-gradient" />
            <div className="flex justify-between items-baseline">
              <span className="text-left">Address </span>
              <span className="">
                <div className="inline-flex items-center">
                  {swap && (
                    <CopyButton
                      toCopy={swap.destination_address}
                      iconClassName="text-gray-500"
                    >
                      {swap?.destination_address.slice(0, 8) +
                        "..." +
                        swap?.destination_address.slice(
                          swap?.destination_address.length - 5,
                          swap?.destination_address.length
                        )}
                    </CopyButton>
                  )}
                </div>
              </span>
            </div>
            {swapInputTransaction?.transaction_id && (
              <>
                <hr className="horizontal-gradient" />
                <div className="flex justify-between items-baseline">
                  <span className="text-left">Source Tx </span>
                  <span className="">
                    <div className="inline-flex items-center">
                      <div className="underline hover:no-underline flex items-center space-x-1">
                        <a
                          target={"_blank"}
                          href={sourceNetwork?.transaction_explorer_template?.replace(
                            "{0}",
                            swapInputTransaction.transaction_id
                          )}
                        >
                          {shortenAddress(swapInputTransaction.transaction_id)}
                        </a>
                        <ExternalLink className="h-4" />
                      </div>
                    </div>
                  </span>
                </div>
              </>
            )}
            {swapOutputTransaction?.transaction_id && (
              <>
                <hr className="horizontal-gradient" />
                <div className="flex justify-between items-baseline">
                  <span className="text-left">Destination Tx </span>
                  <span className="">
                    <div className="inline-flex items-center">
                      <div className="">
                        {swapOutputTransaction?.transaction_id &&
                        swap?.destination_exchange ===
                          KnownInternalNames.Exchanges.Coinbase &&
                        isGuid(swapOutputTransaction?.transaction_id) ? (
                          <span>
                            <CopyButton
                              toCopy={swapOutputTransaction.transaction_id}
                              iconClassName="text-gray-500"
                            >
                              {shortenAddress(
                                swapOutputTransaction.transaction_id
                              )}
                            </CopyButton>
                          </span>
                        ) : (
                          <div className="underline hover:no-underline flex items-center space-x-1">
                            <a
                              target={"_blank"}
                              href={destinationNetwork?.transaction_explorer_template?.replace(
                                "{0}",
                                swapOutputTransaction.transaction_id
                              )}
                            >
                              {shortenAddress(
                                swapOutputTransaction.transaction_id
                              )}
                            </a>
                            <ExternalLink className="h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </span>
                </div>
              </>
            )}
            <hr className="horizontal-gradient" />
            <div className="flex justify-between items-baseline">
              <span className="text-left">Requested amount</span>
              <span className=" font-normal flex">
                {swap?.requested_amount} {swap?.source_asset}
              </span>
            </div>
            {swapInputTransaction && (
              <>
                <hr className="horizontal-gradient" />
                <div className="flex justify-between items-baseline">
                  <span className="text-left">Transfered amount</span>
                  <span className=" font-normal flex">
                    {swapInputTransaction?.amount} {swap?.source_asset}
                  </span>
                </div>
              </>
            )}
            {swapOutputTransaction && (
              <>
                <hr className="horizontal-gradient" />
                <div className="flex justify-between items-baseline">
                  <span className="text-left">Bridge Fee </span>
                  <span className=" font-normal">
                    {swap?.fee} {sourceAsset?.asset}
                  </span>
                </div>
              </>
            )}
            {swapOutputTransaction && (
              <>
                <hr className="horizontal-gradient" />
                <div className="flex justify-between items-baseline">
                  <span className="text-left">Amount You Received</span>
                  <span className=" font-normal flex">
                    {swapOutputTransaction?.amount} {destinationAsset?.asset}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SwapDetails;
