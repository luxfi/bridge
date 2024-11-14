"use client";
import React from "react";
import Image from "next/image";

import { useSwapDataState } from "@/context/swap";
import BackgroundField from "@/components/backgroundField";
import SubmitButton from "@/components/buttons/submitButton";
import shortenAddress from "@/components/utils/ShortenAddress";
import { isValidAddress } from "@/lib/addressValidator";
import { useSwapDepositHintClicked } from "@/stores/swapTransactionStore";
import { useFee } from "@/context/feeContext";
import type { Network, Token } from "@/types/fireblocks";

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

const ManualTransfer: React.FC<IProps> = ({
  sourceNetwork,
  sourceAsset,
  destinationNetwork,
  destinationAsset,
  destinationAddress,
  sourceAmount,
  className,
  swapId,
}) => {
  const { swap } = useSwapDataState();
  const hintsStore = useSwapDepositHintClicked();
  const [hintClicked, setHintClicked] = React.useState<boolean>(false);

  const handleCloseNote = React.useCallback(async () => {
    setHintClicked(true);
  }, [swap, hintsStore]);

  const TransferInvoice = () => {
    const { valuesChanger, minAllowedAmount } = useFee();

    return (
      <div className="divide-y w-full divide-[#404040]  h-full">
        <div className="flex divide-x divide-[#404040]">
          <BackgroundField
            Copiable={true}
            QRable={true}
            header={"Deposit address"}
            toCopy={sourceNetwork?.deposit_address?.address}
            withoutBorder
          >
            <div>
              {sourceNetwork.deposit_address ? (
                <p className="break-all">
                  {sourceNetwork.deposit_address.address}
                </p>
              ) : (
                <div className="bg-gray-500 w-full h-5 animate-pulse rounded-md" />
              )}
            </div>
          </BackgroundField>
        </div>

        <div className="flex divide-x divide-[#404040]">
          <BackgroundField
            Copiable={true}
            toCopy={sourceAmount}
            header={"Amount"}
            withoutBorder
          >
            <p>{sourceAmount}</p>
          </BackgroundField>
          <BackgroundField
            header={"Asset"}
            withoutBorder
            Explorable={
              sourceAsset?.contract_address != null &&
              !sourceAsset.is_native &&
              isValidAddress(sourceAsset?.contract_address, sourceNetwork)
            }
            toExplore={
              sourceAsset?.contract_address != null
                ? sourceNetwork.account_explorer_template?.replace(
                    "{0}",
                    sourceAsset?.contract_address
                  )
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 h-7 w-7 relative">
                {sourceAsset && (
                  <Image
                    src={sourceNetwork.logo}
                    alt="From Logo"
                    height="60"
                    width="60"
                    className="rounded-md object-contain"
                  />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold leading-4">
                  {sourceAsset?.asset}
                </span>
                {sourceAsset?.contract_address &&
                  !sourceAsset.is_native &&
                  isValidAddress(
                    sourceAsset.contract_address,
                    sourceNetwork
                  ) && (
                    <span className="text-xs  flex items-center leading-3">
                      {shortenAddress(sourceAsset?.contract_address)}
                    </span>
                  )}
              </div>
            </div>
          </BackgroundField>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-md bg-level-1 border border-[#404040] w-full h-full items-center relative">
      <div
        className={
          !hintClicked
            ? "absolute w-full h-full flex flex-col items-center px-3 pb-3 text-center"
            : "hidden"
        }
      >
        <div className="flex flex-col items-center justify-center h-full pb-2">
          <div className="max-w-xs">
            <p className="text-base ">About manual transfers</p>
            <p className="text-xs ">
              Transfer assets to Lux Bridge’s deposit address to complete the
              swap.
            </p>
          </div>
        </div>
        <SubmitButton
          isDisabled={false}
          isSubmitting={false}
          size="medium"
          onClick={handleCloseNote}
        >
          OK
        </SubmitButton>
      </div>
      <div className={hintClicked ? "flex" : "invisible"}>
        <TransferInvoice />
      </div>
    </div>
  );
};

const Sceleton = () => {
  return (
    <div className="animate-pulse rounded-lg p-4 flex items-center text-center bg-level-2 border border-[#404040]">
      <div className="flex-1 space-y-6 py-1 p-8 pt-4 items-center">
        <div className="h-2 bg-level-4 rounded self-center w-16 m-auto"></div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div className="h-2 bg-level-4 rounded col-span-2"></div>
            <div className="h-2 bg-level-4 rounded col-span-1"></div>
          </div>
          <div className="h-2 bg-level-4 rounded"></div>
        </div>
        <div className="h-2 bg-level-4 rounded"></div>
      </div>
    </div>
  );
};

export default ManualTransfer;
