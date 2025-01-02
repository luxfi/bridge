export type Wallet = {
  address: string | `0x${string}`;
  providerName: string
  icon: (props: any) => React.JSX.Element;
  connector?: string;
  metadata?: {
      //starknetAccount?: StarknetWindowObject,
  }
  chainId?: string | number
}