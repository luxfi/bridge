import type { Client, Interceptor } from '@connectrpc/connect';
import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-node';
import { Balances as BalancesV1Alpha2 } from './lib/gen/utila/api/v1alpha2/balances_pb';
import { Vaults as VaultsV1Alpha2 } from './lib/gen/utila/api/v1alpha2/vaults_pb';
import { Blockchains as BlockchainsV1Alpha2 } from './lib/gen/utila/api/v1alpha2/blockchains_pb';
import { Transactions as TransactionsV1Alpha2 } from './lib/gen/utila/api/v1alpha2/transactions_pb';
import { Wallets as WalletsV1Alpha2 } from './lib/gen/utila/api/v1alpha2/wallets_pb';
import { Assets as AssetsV1Alpha2 } from './lib/gen/utila/api/v1alpha2/assets_pb';
import { Balances as BalancesV1Alpha1 } from './lib/gen/utila/api/v1alpha1/balances_pb';
import { Transactions as TransactionsV1Alpha1 } from './lib/gen/utila/api/v1alpha1/api_pb';
import { Vaults as VaultsV1Alpha1 } from './lib/gen/utila/api/v1alpha1/vaults_pb';
import { Blockchains as BlockchainsV1Alpha1 } from './lib/gen/utila/api/v1alpha1/blockchains_pb';
import { Wallets as WalletsV1Alpha1 } from './lib/gen/utila/api/v1alpha1/wallets_pb';
import { Assets as AssetsV1Alpha1 } from './lib/gen/utila/api/v1alpha1/assets_pb';

type V1Alpha2Client = Client<typeof BalancesV1Alpha2> & Client<typeof VaultsV1Alpha2> & Client<typeof BlockchainsV1Alpha2> & Client<typeof TransactionsV1Alpha2> & Client<typeof WalletsV1Alpha2> & Client<typeof AssetsV1Alpha2>;
type V1Alpha1Client = Client<typeof BalancesV1Alpha1> & Client<typeof TransactionsV1Alpha1> & Client<typeof VaultsV1Alpha1> & Client<typeof BlockchainsV1Alpha1> & Client<typeof WalletsV1Alpha1> & Client<typeof AssetsV1Alpha1>;


type Version = 'v1alpha2' | 'v1alpha1';

interface ApiOptions {
  authStrategy: Interceptor;
  baseUrl?: string;
}

type ClientFactory = {
  version(version: 'v1alpha2'): V1Alpha2Client
  version(version: 'v1alpha1'): V1Alpha1Client
  version(version: Version): V1Alpha2Client | V1Alpha1Client;
};

export function createGrpcClient(options: ApiOptions): ClientFactory {
  const transport = createGrpcWebTransport({
    httpVersion: '1.1',
    interceptors: [options.authStrategy],
    baseUrl: options?.baseUrl || 'https://api.utila.io',
  });

  return {
    version(version: Version): any {
      switch (version) {

        case 'v1alpha2': {
const balances = createClient(BalancesV1Alpha2, transport);
const vaults = createClient(VaultsV1Alpha2, transport);
const blockchains = createClient(BlockchainsV1Alpha2, transport);
const transactions = createClient(TransactionsV1Alpha2, transport);
const wallets = createClient(WalletsV1Alpha2, transport);
const assets = createClient(AssetsV1Alpha2, transport);
          return {
            ...balances,
            ...vaults,
            ...blockchains,
            ...transactions,
            ...wallets,
            ...assets
          };
        }

        case 'v1alpha1': {
const balances = createClient(BalancesV1Alpha1, transport);
const transactions = createClient(TransactionsV1Alpha1, transport);
const vaults = createClient(VaultsV1Alpha1, transport);
const blockchains = createClient(BlockchainsV1Alpha1, transport);
const wallets = createClient(WalletsV1Alpha1, transport);
const assets = createClient(AssetsV1Alpha1, transport);
          return {
            ...balances,
            ...transactions,
            ...vaults,
            ...blockchains,
            ...wallets,
            ...assets
          };
        }
        default:
          throw new Error(`Unsupported version: ${version}`);
      }
    },
  };
}

