import { type CryptoNetwork, type NetworkCurrency } from "@/Models/CryptoNetwork";
import { type Exchange } from "@/Models/Exchange";
import { type AssetGroup } from "../Input/CEXCurrencyFormField";

export type SwapFormValues = {
  amount?: string;
  destination_address?: string;
  fromCurrency?: NetworkCurrency;
  toCurrency?: NetworkCurrency;
  refuel?: boolean;
  from?: CryptoNetwork;
  to?: CryptoNetwork;
  fromExchange?: Exchange,
  toExchange?: Exchange,
  currencyGroup?: AssetGroup
}
