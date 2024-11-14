'use client'
import { type ReactNode, useCallback, useMemo } from "react";
import { useSwitchChain } from "wagmi";

import WalletIcon from "../../../../icons/WalletIcon";
import WalletMessage from "./message";
import { type ActionData } from "./sharedTypes";
import SubmitButton from "../../../../buttons/submitButton";
import useWallet from "../../../../../hooks/useWallet";
import { useSwapDataState } from "../../../../../context/swap";
import { useSettings } from "../../../../../context/settings";

export const ConnectWalletButton: React.FC = () => {
    const { swap } = useSwapDataState()
    const { layers } = useSettings()
    const { getWithdrawalProvider: getProvider } = useWallet()
    const source_layer = layers.find(l => l.internal_name === swap?.source_network)
    const provider = useMemo(() => {
        return source_layer && getProvider(source_layer)
    }, [source_layer, getProvider])

    const clickHandler = useCallback(() => {
        if (!provider)
            throw new Error(`No provider from ${source_layer?.internal_name}`)

        return provider.connectWallet(provider?.name)
    }, [provider])

    return <ButtonWrapper
        clcikHandler={clickHandler}
        icon={<WalletIcon className="stroke-2 w-6 h-6" />}
    >
        Connect wallet
    </ButtonWrapper>
}

export const ChangeNetworkMessage: React.FC<{ data: ActionData, network: string }> = ({ data, network }) => {
    if (data.isLoading) {
        return <WalletMessage
            status="pending"
            header='Network switch required'
            details="Confirm switching the network with your wallet"
        />
    }
    else if (data.isError) {
        return <WalletMessage
            status="error"
            header='Network switch failed'
            details={`Please try again or switch your wallet network manually to ${network}`}
        />
    }
}

export const ChangeNetworkButton: React.FC<{ chainId: number; network: string }> = ({
  chainId,
  network,
}) => {
  const { switchChain } = useSwitchChain();

  return (
    <>
      {/* {<ChangeNetworkMessage data={networkChange} network={network} />}
      {!networkChange.isLoading && (
        <ButtonWrapper
          clcikHandler={clickHandler}
          icon={<WalletIcon className="stroke-2 w-6 h-6" />}
        >
          {networkChange.isError ? (
            <span>Try again</span>
          ) : (
            <span>Send from wallet</span>
          )}
        </ButtonWrapper>
      )} */}
    </>
  );
};

type ButtonWrapperProps = {
    icon?: ReactNode,
    clcikHandler: () => void,
    disabled?: boolean,
    children: ReactNode
}
export const ButtonWrapper: React.FC<ButtonWrapperProps> = ({
    icon,
    clcikHandler,
    disabled,
    children
}) => {
    return <div>
        <div className="flex flex-row  text-base space-x-2">
            <SubmitButton icon={icon}
                text_align='center'
                isDisabled={!!disabled}
                isSubmitting={false}
                onClick={clcikHandler}
                buttonStyle='filled'
                size="medium">
                {children}
            </SubmitButton>
        </div>
    </div>
}