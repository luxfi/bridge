"use client";
import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import SwapButton from "../../buttons/swapButton";
import BridgeApiClient, { AddressBookItem } from "../../../lib/BridgeApiClient";
import Modal from "../../modal/modal";
import shortenAddress from "../../utils/ShortenAddress";
import useSWR from "swr";
import { Form, FormikErrors, useFormikContext } from "formik";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { SwapFormValues } from "../../DTOs/SwapFormValues";
import { Partner } from "../../../Models/Partner";
import { useSwapDataState, useSwapDataUpdate } from "../../../context/swap";
import { isValidAddress } from "../../../lib/addressValidator";
import { ApiResponse } from "../../../Models/ApiResponse";
import { motion, useCycle } from "framer-motion";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { useAuthState } from "../../../context/authContext";
import { GetDefaultAsset } from "../../../helpers/settingsHelper";
import { Widget } from "../../Widget/Index";

import FromNetworkForm from './From';
import ToNetworkForm from './To';
import { Token, Network } from "@/types/teleport";
import { sourceNetworks, destinationNetworks } from "../settings";
import { useAtom } from "jotai";

import {
  sourceNetworkAtom,
  sourceAssetAtom,
  destinationNetworkAtom,
  destinationAssetAtom
} from '@/store/teleport'

type Props = {
  isPartnerWallet?: boolean;
  partner?: Partner;
};

const Address = dynamic(() => import("../../Input/Address"), {
  loading: () => <></>,
});

const SwapForm: FC = () => {

  const isSubmitting = false
  const hideAddress = 'asdfasdf'
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false);

  const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom);
  const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom);

  const [destinationNetwork, setDestinationNetwork] = useAtom(destinationNetworkAtom);
  const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom);

  const handleSourceAssetChange = (asset: Token) => {
    setSourceAsset(asset);
  }

  const handleSourceNetworkChange = (network: Network) => {
    setSourceNetwork(network);
  }

  const handleDestinationAssetChange = (asset: Token) => {
    setDestinationAsset(asset);
  }

  const handleDestinationNetworkChange = (network: Network) => {
    setDestinationNetwork(network);
  }

  React.useEffect(() => {
    if (sourceNetwork) {
      setSourceAsset(sourceNetwork.currencies[0]);
      setDestinationNetwork(destinationNetworks[0]);
    }
  }, [sourceNetwork]);

  React.useEffect(() => {
    if (destinationNetwork) {
      setSourceNetwork(sourceNetworks[0])
    }

    if (destinationNetwork && sourceAsset) {
      if (sourceAsset.asset === "ETH") {
        setDestinationAsset(destinationNetwork.currencies[0])
      } else {
        setDestinationAsset(destinationNetwork.currencies[1])
      }
    }
  }, [destinationNetwork, sourceAsset]);

  return (
    <>
      <Widget className="sm:min-h-[504px]">

        <Widget.Content>
          <div className="flex-col relative flex justify-between w-full space-y-0.5 mb-3.5 leading-4 border border-[#404040] rounded-t-xl overflow-hidden">
            <div className="flex flex-col w-full">
              <FromNetworkForm
                network={sourceNetwork}
                asset={sourceAsset}
                setNetwork={handleSourceNetworkChange}
                setAsset={handleSourceAssetChange}
                networks={sourceNetworks}
              />
            </div>
            <div className="flex flex-col w-full">
              <ToNetworkForm
                network={destinationNetwork}
                asset={destinationAsset}
                sourceAsset={sourceAsset}
                setNetwork={handleDestinationNetworkChange}
                setAsset={handleDestinationAssetChange}
                networks={destinationNetworks}
              />
            </div>
            {/* <div className="flex flex-col w-full">
              <FromNetworkForm />
            </div> */}

            {/* <div className="gap-4 flex relative items-center outline-none w-full px-4 py-3  text-xs md:text-base">
                <DetailedEstimates
                  networks={layers}
                  selected_currency={toCurrency}
                  source={source}
                  destination={destination}
                />
              </div>
              {!(query?.hideTo && values?.to) && (
                <div className="flex flex-col w-full">
                  <NetworkFormField direction="to" label="To" />
                </div>
              )} */}
          </div>
          {!hideAddress ? (
            <div className="w-full mb-3.5 leading-4">
              <label
                htmlFor="destination_address"
                className="block font-semibold text-xs"
              >
                {`To eth address`}
              </label>
              {/* <AddressButton
                  disabled={false}
                  isPartnerWallet={false}
                  openAddressModal={() => setShowAddressModal(true)}
                  partnerImage={'partnerImage'}
                  values={values}
                /> */}
              <Modal
                header={`To ETH address`}
                height="fit"
                show={showAddressModal}
                setShow={setShowAddressModal}
                className="min-h-[70%]"
              >
                <Address
                  close={() => setShowAddressModal(false)}
                  disabled={false}
                  name={"destination_address"}
                  partnerImage={'partnerImage'}
                  isPartnerWallet={false}
                  // partner={partner}
                  address_book={[]}
                />
              </Modal>
            </div>
          ) : (
            <></>
          )}
          <>
            {
              //TODO refactor
              // destination && toAsset && (
              //   <WarningMessage messageType="warning" className="mt-4">
              //     <span className="font-normal">
              //       <span>
              //         We&apos;re experiencing delays for transfers of
              //       </span>{" "}
              //       <span>{values?.toCurrency?.asset}</span> <span>to</span>{" "}
              //       <span>{values?.to?.display_name}</span>
              //       <span>
              //         . Estimated arrival time can take up to 2 hours.
              //       </span>
              //     </span>
              //   </WarningMessage>
              // )
            }

            {
              // //TODO refactor
              // destination &&
              // toAsset &&
              // destination?.internal_name ===
              // KnownInternalNames.Networks.StarkNetMainnet &&
              // averageTimeInMinutes > 30 && (
              //   <WarningMessage messageType="warning" className="mt-4">
              //     <span className="font-normal">
              //       <span>{destination?.display_name}</span>{" "}
              //       <span>
              //         network congestion. Transactions can take up to 1
              //         hour.
              //       </span>
              //     </span>
              //   </WarningMessage>
              // )
            }
            {/* <ReserveGasNote
                onSubmit={(walletBalance, networkGas) =>
                  handleReserveGas(walletBalance, networkGas)
                }
              /> */}
          </>
        </Widget.Content>

      </Widget>

    </>
  );
};

function ActionText(
  errors: FormikErrors<SwapFormValues>,
  actionDisplayName: string
): string {
  return (
    errors.from?.toString() ||
    errors.fromCurrency?.toString() ||
    errors.to?.toString() ||
    errors.toCurrency?.toString() ||
    errors.amount ||
    errors.destination_address ||
    actionDisplayName
  );
}

const TruncatedAdrress = ({ address }: { address: string }) => {
  const shortAddress = shortenAddress(address);
  return <div className="tracking-wider ">{shortAddress}</div>;
};

const AddressButton: FC<{
  openAddressModal: () => void;
  isPartnerWallet: boolean;
  values: SwapFormValues;
  partnerImage?: string;
  disabled: boolean;
}> = ({
  openAddressModal,
  isPartnerWallet,
  values,
  partnerImage,
  disabled,
}) => (
    <button
      type="button"
      disabled={disabled}
      onClick={openAddressModal}
      className="flex rounded-lg space-x-3 items-center cursor-pointer shadow-sm mt-1.5 bg-level-1 border-[#404040] border disabled:cursor-not-allowed h-12 leading-4 focus:ring-muted focus:border-muted font-semibold w-full px-3.5 py-3"
    >
      {isPartnerWallet && (
        <div className="shrink-0 flex items-center pointer-events-none">
          {partnerImage && (
            <Image
              alt="Partner logo"
              className="rounded-md object-contain"
              src={partnerImage}
              width="24"
              height="24"
            />
          )}
        </div>
      )}
      <div className="truncate text-muted">
        {values.destination_address ? (
          <TruncatedAdrress address={values.destination_address} />
        ) : (
          <span>Enter your address here</span>
        )}
      </div>
    </button>
  );

export default SwapForm;
