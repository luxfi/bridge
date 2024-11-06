import { mainnetSettings } from "@/settings"
import { prisma } from "@/utils/db"

const main = async () => {
  try {
    const settings = mainnetSettings
    const { networks } = settings.data
    console.log("::staring update networks data.")
    let currenciesCount = 0

    for (let i = 0; i < networks.length; i++) {
      const _network = networks[i]
      const { id: networkId } = await prisma.network.upsert({
        where: { internal_name: _network.internal_name }, // Assuming internal_name is unique for each network
        update: {
          display_name: _network.display_name,
          internal_name: _network.internal_name,
          native_currency: _network.native_currency,
          is_testnet: _network.is_testnet,
          is_featured: _network.is_featured,
          type: _network.type,
          average_completion_time: _network.average_completion_time,
          transaction_explorer_template: _network.transaction_explorer_template,
          account_explorer_template: _network.account_explorer_template
        },
        create: {
          display_name: _network.display_name,
          internal_name: _network.internal_name,
          native_currency: _network.native_currency,
          is_testnet: _network.is_testnet,
          is_featured: _network.is_featured,
          chain_id: _network.chain_id,
          type: _network.type,
          average_completion_time: _network.average_completion_time,
          transaction_explorer_template: _network.transaction_explorer_template,
          account_explorer_template: _network.account_explorer_template
        }
      })
      console.log(`${i}. ` + _network.internal_name)
      for (const token of _network.currencies as any) {
        await prisma.currency.upsert({
          where: {
            network_id_asset: {
              network_id: networkId,
              asset: token.asset
            }
          },
          update: {
            network_id: networkId,
            name: token.name,
            asset: token.asset,
            contract_address: token.contract_address,
            decimals: token.decimals,
            price_in_usd: token.price_in_usd,
            precision: token.precision,
            is_native: token.is_native
          },
          create: {
            network_id: networkId,
            name: token.name,
            asset: token.asset,
            contract_address: token.contract_address,
            decimals: token.decimals,
            price_in_usd: token.price_in_usd,
            precision: token.precision,
            is_native: token.is_native
          }
        })
      }
      currenciesCount += _network.currencies.length
    }
    console.log("::end networks update", {
      networksCount: networks.length,
      currenciesCount: currenciesCount
    })
  } catch (error) {
    console.error("Error in updating networks", error)
  }
}

main()
