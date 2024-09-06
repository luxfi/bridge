'use client'
import { FC } from 'react';
import { SwapDataProvider } from '../context/swap';
import { TimerProvider } from '../context/timerContext';
import SwapForm from "./Swap/Form"
import { BalancesDataProvider } from '../context/balances';

const Swap: FC = () => {
  return (
    <SwapDataProvider >
      <TimerProvider>
        <BalancesDataProvider>
          <SwapForm />
        </BalancesDataProvider>
      </TimerProvider>
    </SwapDataProvider >
  )
};

export default Swap;