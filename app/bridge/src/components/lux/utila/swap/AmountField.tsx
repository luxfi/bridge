"use client";
import React, { useState } from "react";

interface IProps {
  disabled: boolean;
  setValue?: (value: string) => void;
  value: string;
}

const AmountField: React.FC<IProps> = ({ disabled, setValue, value }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (/^[0-9]*[.,]?[0-9]*$/.test(e.target.value) && setValue) {
      setValue(e.target.value);
    }
  };

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
              placeholder={"0.0"}
              autoCorrect="off"
              min={0}
              max={10000}
              // onFocus={onFocus}
              // onBlur={onBlur}
              type="text"
              value={value}
              step={0.01}
              name={"name"}
              id={"name"}
              className="rounded-r-none outline-none w-full pl-0.5 p-0 focus:ring-0 disabled:cursor-not-allowed h-hit leading-4 bg-level-1 shadow-sm placeholder:text-muted-3 focus:ring-foreground focus:border-foreground block min-w-0 rounded-lg font-semibold border-0"
              onChange={handleChange}
            />
          </div>
        </div>
      </div>
    </>
  );
};

type AmountLabelProps = {
  detailsAvailable: boolean;
  minAllowedAmount: number | undefined;
  maxAllowedAmount: number | undefined;
  isBalanceLoading: boolean;
};
const AmountLabel = ({
  detailsAvailable,
  minAllowedAmount,
  maxAllowedAmount,
  isBalanceLoading,
}: AmountLabelProps) => {
  return (
    <div className="flex items-center w-full justify-between">
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
  );
};

export default AmountField;
