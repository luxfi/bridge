"use client";
import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import axios from "axios";
import Modal from "@/components/modal/modal";
import ResizablePanel from "@/components/ResizablePanel";
import shortenAddress from "../../utils/ShortenAddress";
import { FC } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Widget } from "../../Widget/Index";

import FromNetworkForm from '@/components/teleport/swap/from/NetworkFormField';
import ToNetworkForm from '@/components/teleport/swap/to/NetworkFormField';
import SwapDetails from "./SwapDetails";
import { Token, Network } from "@/types/teleport";
import { sourceNetworks, destinationNetworks } from "@/components/teleport/constants/settings";
import { useAtom } from "jotai";

import {
  sourceNetworkAtom,
  sourceAssetAtom,
  destinationNetworkAtom,
  destinationAssetAtom,
  destinationAddressAtom,
  sourceAmountAtom,
  ethPriceAtom,
  swapStatusAtom,
  swapIdAtom
} from '@/store/teleport'
import SpinIcon from "@/components/icons/spinIcon";

const Address = dynamic(() => import("@/components/teleport/share/Address"), {
  loading: () => <></>,
});

const Swap: FC = () => {
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [showAddressModal, setShowAddressModal] = React.useState<boolean>(false);
  const [sourceNetwork, setSourceNetwork] = useAtom(sourceNetworkAtom);
  const [sourceAsset, setSourceAsset] = useAtom(sourceAssetAtom);
  const [destinationNetwork, setDestinationNetwork] = useAtom(destinationNetworkAtom);
  const [destinationAsset, setDestinationAsset] = useAtom(destinationAssetAtom);
  const [destinationAddress, setDestinationAddress] = useAtom(destinationAddressAtom);
  const [sourceAmount, setSourceAmount] = useAtom(sourceAmountAtom);
  const [, setSwapStatus] = useAtom(swapStatusAtom);
  const [swapI, setSwapId] = useAtom(swapIdAtom);
  const [, setEthPrice] = useAtom(ethPriceAtom);

  const [showSwapModal, setShowSwapModal] = React.useState<boolean>(false);

  React.useEffect(() => {
    axios.get('/api/tokens/price/ETH').then(data => {
      setEthPrice(Number(data?.data?.data?.price))
    });
  }, []);

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
        setDestinationAsset(destinationNetwork.currencies[1])
      } else {
        setDestinationAsset(destinationNetwork.currencies[2])
      }
    }
  }, [destinationNetwork, sourceAsset]);

  const warnningMessage = React.useMemo(() => {
    if (!sourceNetwork) {
      return "Select Source Network";
    } else if (!sourceAsset) {
      return "Select Source Asset"
    } else if (!destinationNetwork) {
      return "Select Destination Network";
    } else if (!destinationAsset) {
      return "Select Destination Asset";
    } else if (!destinationAddress) {
      return "Input Address";
    } else if (sourceAmount === "") {
      return "Enter Token Amount";
    } else if (Number(sourceAmount) <= 0) {
      return "Invalid Token Amount";
    } else {
      return "Swap Now"
    }
  }, [sourceNetwork, sourceAsset, destinationNetwork, destinationAsset, destinationAddress, sourceAmount]);

  const createSwap = async () => {
    try {
      const data = {
        amount: Number(sourceAmount),
        source_network: sourceNetwork?.internal_name,
        source_asset: sourceAsset?.asset,
        source_address: "",
        destination_network: destinationNetwork?.internal_name,
        destination_asset: destinationAsset?.asset,
        destination_address: destinationAddress,
        refuel: false,
        use_deposit_address: false,
        use_teleporter: true,
        app_name: "Bridge"
      }
      const response = await axios.post(`/api/swaps?version=mainnet`, data);
      setSwapId(response.data?.data?.swap_id)
      window.history.pushState({}, '', `/swap/teleporter/${response.data?.data?.swap_id}`);
      setSwapStatus("user_transfer_pending");
      setShowSwapModal(true);
    } catch (err) {
      console.log(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSwap = () => {
    if (sourceNetwork && sourceAsset && destinationNetwork && destinationNetwork && destinationAddress && Number(sourceAmount) > 0) {
      createSwap();
      setIsSubmitting(true);
    }
  }

  return (
    <Widget className="sm:min-h-[504px]">
      <Widget.Content>
        <div className="flex-col relative flex justify-between w-full space-y-0.5 mb-3.5 leading-4 border border-[#404040] rounded-t-xl overflow-hidden">
          <div className="flex flex-col w-full">
            <FromNetworkForm
              network={sourceNetwork}
              asset={sourceAsset}
              setNetwork={(network: Network) => setSourceNetwork(network)}
              setAsset={(token: Token) => setSourceAsset(token)}
              networks={sourceNetworks}
            />
          </div>

          <div className="py-3 px-4">
            Fee: {0}
          </div>

          <div className="flex flex-col w-full">
            <ToNetworkForm
              network={destinationNetwork}
              asset={destinationAsset}
              sourceAsset={sourceAsset}
              setNetwork={(network: Network) => setDestinationNetwork(network)}
              setAsset={(token: Token) => setDestinationAsset(token)}
              networks={destinationNetworks}
            />
          </div>

        </div>

        <div className="w-full !-mb-3 leading-4">
          <label
            htmlFor="destination_address"
            className="block font-semibold text-xs"
          >
            {`To ${destinationNetwork?.display_name ?? ""} address`}
          </label>
          <AddressButton
            disabled={!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset}
            isPartnerWallet={false}
            openAddressModal={() => setShowAddressModal(true)}
            partnerImage={'partnerImage'}
            address={destinationAddress}
          />
          <Modal
            header={`To ${destinationNetwork?.display_name ?? ""} address`}
            height="fit"
            show={showAddressModal}
            setShow={setShowAddressModal}
            className="min-h-[70%]"
          >
            <Address
              close={() => setShowAddressModal(false)}
              disabled={!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset}
              address={destinationAddress}
              name={"destination_address"}
              partnerImage={'partnerImage'}
              isPartnerWallet={false}
              address_book={[]}
              setAddress={setDestinationAddress}
            />
          </Modal>
        </div>

        <button
          onClick={handleSwap} disabled={!sourceNetwork || !sourceAsset || !destinationNetwork || !destinationAsset || !destinationAddress || !sourceAmount || Number(sourceAmount) <= 0 || isSubmitting}
          className="border border-muted-3 disabled:border-[#404040] items-center space-x-1 disabled:opacity-80 disabled:cursor-not-allowed relative w-full flex justify-center font-semibold rounded-md transform transition duration-200 ease-in-out hover:bg-primary-hover bg-primary-lux text-primary-fg disabled:hover:bg-primary-lux py-3 px-2 md:px-3 plausible-event-name=Swap+initiated"
        >
          {
            isSubmitting ?
              <SpinIcon className="animate-spin h-5 w-5" /> :
              warnningMessage === 'Swap Now' && <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
          }
          <span className="grow">{warnningMessage}</span>
        </button>

        <Modal height='fit'
          show={showSwapModal}
          setShow={setShowSwapModal}
          header={`Complete the swap`}
          onClose={() => setShowSwapModal(false)}
        >
          <ResizablePanel>
            <SwapDetails />
          </ResizablePanel>
        </Modal>
      </Widget.Content>
    </Widget>
  );
};

const TruncatedAdrress = ({ address }: { address: string }) => {
  const shortAddress = shortenAddress(address);
  return <div className="tracking-wider ">{shortAddress}</div>;
};

const AddressButton: FC<{
  openAddressModal: () => void;
  isPartnerWallet: boolean;
  partnerImage?: string;
  disabled: boolean;
  address: string
}> = ({
  openAddressModal,
  isPartnerWallet,
  partnerImage,
  disabled,
  address
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
        {address ? (
          <TruncatedAdrress address={address} />
        ) : (
          <span>Enter your address here</span>
        )}
      </div>
    </button>
  );

export default Swap;
