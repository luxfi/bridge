'use client'
import { useFormikContext } from "formik";
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import NumericInput from "./NumericInput";
import SecondaryButton from "../../buttons/secondaryButton";
// import { useBalancesState, useBalancesUpdate } from "../../context/balances";
// import { truncateDecimals } from "../utils/RoundDecimals";
// import { useFee } from "../../context/feeContext";
// import useWallet from "../../hooks/useWallet";
// import useBalance from "../../hooks/useBalance";

interface IProps {
    disabled: boolean,
    setValue?: (value: string) => void,
    value: string
}

const AmountField: React.FC<IProps> = ({ disabled, setValue, value }) => {

    const [requestedAmountInUsd, setRequestedAmountInUsd] = useState<string>();
    // const { fromCurrency, from, to, destination_address, toCurrency, currencyGroup } = values || {};
    const [isAmountVisible, setIsAmountVisible] = useState(false);


    const handleSetMinAmount = () => {
    }

    const handleSetMaxAmount = () => {
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (/^[0-9]*[.,]?[0-9]*$/.test(e.target.value) && setValue) {
            setValue(e.target.value);
        }
    }

    return (
        <>
            <div className="flex w-full justify-between items-center">
                <div className="relative w-full">
                    <div className="flex relative w-full">
                        <input
                            pattern={"^[0-9]*[.,]?[0-9]*$"}
                            inputMode="decimal"
                            autoComplete="off"
                            disabled={disabled}
                            placeholder={'0.0'}
                            autoCorrect="off"
                            min={0}
                            max={10000}
                            // onFocus={onFocus}
                            // onBlur={onBlur}
                            type="text"
                            value={value}
                            step={0.01}
                            name={'name'}
                            id={'name'}
                            className='rounded-r-none w-full pl-0.5 p-0 focus:ring-0 disabled:cursor-not-allowed h-hit leading-4 bg-level-1 shadow-sm placeholder:text-muted-3 focus:ring-foreground focus:border-foreground block min-w-0 rounded-lg font-semibold border-0'
                            onChange={handleChange}
                        />
                    </div>
                </div>
                {/* {
                    !disabled &&
                    <div className="flex flex-col justify-center">
                        <div className="text-xs flex flex-col items-center space-x-1 md:space-x-2 ml-2 md:ml-5 px-2">
                            <div className="flex">
                                <SecondaryButton disabled={!false} onClick={handleSetMinAmount} size="xs">
                                    MIN
                                </SecondaryButton>
                                <SecondaryButton disabled={!false} onClick={handleSetMaxAmount} size="xs" className="ml-1.5">
                                    MAX
                                </SecondaryButton>
                            </div>
                        </div>
                    </div>
                } */}
            </div >
        </>
    )
};

type AmountLabelProps = {
    detailsAvailable: boolean;
    minAllowedAmount: number | undefined;
    maxAllowedAmount: number | undefined;
    isBalanceLoading: boolean;
}
const AmountLabel = ({
    detailsAvailable,
    minAllowedAmount,
    maxAllowedAmount,
    isBalanceLoading,
}: AmountLabelProps) => {
    return <div className="flex items-center w-full justify-between">
        <div className="flex items-center space-x-2">
            <p className="block font-semibold text-muted text-xs mb-1">Amount</p>
            {/* {
                detailsAvailable &&
                <div className="text-xs hidden md:flex  items-center">
                    <span>(Min:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{minAllowedAmount}</span>}
                    <span>&nbsp;-&nbsp;Max:&nbsp;</span>{isBalanceLoading ? <span className="ml-1 h-3 w-6 rounded-sm bg-gray-500 animate-pulse" /> : <span>{maxAllowedAmount}</span>}<span>)</span>
                </div>
            } */}
        </div>
    </div>
}

export default AmountField