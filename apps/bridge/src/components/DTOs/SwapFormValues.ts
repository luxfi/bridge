import { type NetworkCurrency } from "@/Models/CryptoNetwork";
import { type Exchange } from "@/Models/Exchange";
import { type Layer } from "@/Models/Layer";
import { type AssetGroup } from "../Input/CEXCurrencyFormField";

export type SwapFormValues = {
  amount?: string;
  destination_address?: string;
  fromCurrency?: NetworkCurrency;
  toCurrency?: NetworkCurrency;
  refuel?: boolean;
  from?: Layer;
  to?: Layer;
  fromExchange?: Exchange,
  toExchange?: Exchange,
  currencyGroup?: AssetGroup
}
