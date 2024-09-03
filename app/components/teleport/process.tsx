'use client'
import React from "react";
import Modal from "../modal/modal";
import ResizablePanel from "../ResizablePanel";
import axios from "axios";
import SwapDetails from "./swap/SwapDetails";
import ConnectNetwork from '@/components/ConnectNetwork';
import { Widget } from "@/components/Widget/Index";
import { sourceNetworks, destinationNetworks } from "@/components/teleport/constants/settings";

import {
    sourceNetworkAtom,
    sourceAssetAtom,
    destinationNetworkAtom,
    destinationAssetAtom,
    destinationAddressAtom,
    sourceAmountAtom,
    ethPriceAtom,
    swapStatusAtom,
    swapIdAtom,
    bridgeTransferTransactionAtom,
    mpcSignatureAtom
} from '@/store/teleport';
import { useAtom } from "jotai";
import { Network, Token } from "@/types/teleport";

type NetworkToConnect = {
    DisplayName: string;
    AppURL: string;
}

interface IProps {
    swapId?: string
}

const Form: React.FC<IProps> = ({ swapId }) => {

    const [, setSourceNetwork] = useAtom(sourceNetworkAtom);
    const [, setSourceAsset] = useAtom(sourceAssetAtom);
    const [, setDestinationNetwork] = useAtom(destinationNetworkAtom);
    const [, setDestinationAsset] = useAtom(destinationAssetAtom);
    const [, setDestinationAddress] = useAtom(destinationAddressAtom);
    const [, setSourceAmount] = useAtom(sourceAmountAtom);
    const [, setSwapStatus] = useAtom(swapStatusAtom);
    const [, setEthPrice] = useAtom(ethPriceAtom);
    const [, setSwapId] = useAtom(swapIdAtom);
    const [, setBridgeTransferTransactionHash] = useAtom(bridgeTransferTransactionAtom);
    const [, setMpcSignature] = useAtom(mpcSignatureAtom);

    React.useEffect(() => {
        axios.get('/api/tokens/price/ETH').then(data => {
            setEthPrice(Number(data?.data?.data?.price))
        });
    }, []);

    const getSwapById = async (swapId: string) => {
        try {
            const { data: { data } } = await axios.get(`/api/swaps/${swapId}?version=mainnet`);
            const _sourceNetwork = sourceNetworks.find((_n: Network) => _n.internal_name === data.source_network) as Network;
            const _sourceAsset = _sourceNetwork?.currencies?.find((c: Token) => c.asset === data.source_asset)
            const _destinationNetwork = destinationNetworks.find((_n: Network) => _n.internal_name === data.destination_network) as Network;
            const _destinationAsset = _destinationNetwork?.currencies?.find((c: Token) => c.asset === data.destination_asset)
            setSourceNetwork(_sourceNetwork);
            setSourceAsset(_sourceAsset);
            setDestinationNetwork(_destinationNetwork);
            setDestinationAsset(_destinationAsset);
            setSourceAmount(data.requested_amount);
            setSwapStatus(data.status);
            setSwapId(data.id);
            setDestinationAddress(data.destination_address);

            const userTransferTransaction = data?.transactions?.find((t: any) => t.status === "user_transfer")?.transaction_hash;
            setBridgeTransferTransactionHash(userTransferTransaction ?? "");
            const mpcSignTransaction = data?.transactions?.find((t: any) => t.status === "mpc_sign")?.transaction_hash;
            setMpcSignature(mpcSignTransaction ?? "");
        } catch (err) {
            console.log(err);
        }
    }

    React.useEffect(() => {
        swapId && getSwapById(swapId);
    }, [swapId])

    const [showConnectNetworkModal, setShowConnectNetworkModal] = React.useState<boolean>(false);
    const [showSwapModal, setShowSwapModal] = React.useState<boolean>(false);
    const [networkToConnect, setNetworkToConnect] = React.useState<NetworkToConnect>();

    return <>
        <Modal
            height="fit"
            show={showConnectNetworkModal}
            setShow={setShowConnectNetworkModal}
            header={`Network connect`}
        >
            <ConnectNetwork NetworkDisplayName={networkToConnect?.DisplayName as string} AppURL={networkToConnect?.AppURL as string} />
        </Modal>

        <Widget className="sm:min-h-[504px]">
            <Widget.Content>
                <ResizablePanel>
                    <SwapDetails className="min-h-[450px] justify-center" />
                </ResizablePanel>
            </Widget.Content>
        </Widget>
    </>
}

export default Form;