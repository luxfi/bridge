'use client'
import { SwapDataProvider } from '../context/swap';
import { TimerProvider } from '../context/timerContext';
import SwapForm from "./Swap/Form"
import { BalancesDataProvider } from '../context/balances';

const Swap: React.FC = () =>  (
  <SwapDataProvider >
    <TimerProvider>
      <BalancesDataProvider>
        <SwapForm />
      </BalancesDataProvider>
    </TimerProvider>
  </SwapDataProvider >
)

export default Swap;