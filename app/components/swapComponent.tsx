import { FC } from 'react';
import { SwapDataProvider } from '../context/swap';
import { TimerProvider } from '../context/timerContext';
import SwapForm from "./Swap/Form"
import { BalancesDataProvider } from '../context/balances';

const Swap: FC = () => {
  return (
    <div className="text-primary-text">
      <SwapDataProvider >
        <TimerProvider>
          <BalancesDataProvider>
            <SwapForm />
          </BalancesDataProvider>
        </TimerProvider>
      </SwapDataProvider >
    </div >
  )
};

export default Swap;