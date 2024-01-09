"use client"
import { ApiResponse } from "@/models/ApiResponse";
import useSWR from "swr"
import { ChevronRight } from "lucide-react";
import { useSettingsState } from "@/context/settings";
import Image from "next/image";
import Link from "next/link";
import LoadingBlocks from "@/components/LoadingBlocks";
import { SwapStatus } from "@/models/SwapStatus";
import { useRouter } from "next/navigation";
import AppSettings from "@/lib/AppSettings";
import Error500 from "@/components/Error500";
import { TransactionType } from "@/models/TransactionTypes";

type Swap = {
    created_date: string,
    status: string;
    destination_address: string,
    source_network_asset: string,
    source_network: string,
    source_exchange: string,
    destination_network_asset: string,
    destination_network: string,
    destination_exchange: string,
    has_refuel: boolean,
    transactions: Transaction[]
}

type Transaction = {
    from: string,
    to: string,
    created_date: string,
    transaction_id: string,
    explorer_url: string,
    confirmations: number,
    max_confirmations: number,
    amount: number,
    usd_price: number,
    usd_value: number,
    type: string
}

const DataTable: React.FC = () => {

  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const version = process.env.NEXT_PUBLIC_API_VERSION
  const settings = useSettingsState()

  const { data, error, isLoading } = useSWR<ApiResponse<Swap[]>>(`${AppSettings.BridgeApiUri}/api/explorer/?statuses=1&statuses=4&version=${version}`, fetcher, { dedupingInterval: 60000 });
  const swapsData = data?.data;
  const router = useRouter();

  if (error) return <Error500 />
  if (isLoading) return <LoadingBlocks />

  const Row: React.FC<{
    swap: Swap,
    index: number
  }> = ({
    swap,
    index
  }) => {
    const sourceLayer = settings?.layers?.find(l => l.internal_name?.toLowerCase() === swap.source_network?.toLowerCase())
    const sourceToken = sourceLayer?.assets?.find(a => a?.asset == swap?.source_network_asset)

    const sourceExchange = settings?.exchanges?.find(l => l.internal_name?.toLowerCase() === swap.source_exchange?.toLowerCase())
    const destinationExchange = settings?.exchanges?.find(l => l.internal_name?.toLowerCase() === swap.destination_exchange?.toLowerCase())

    const destinationLayer = settings?.layers?.find(l => l.internal_name?.toLowerCase() === swap.destination_network?.toLowerCase())
    const destinationToken = destinationLayer?.assets?.find(a => a?.asset == swap?.destination_network_asset)

    const input_transaction = swap?.transactions?.find(t => t?.type == TransactionType.Input);
    const output_transaction = swap?.transactions?.find(t => t?.type == TransactionType.Output);

    return (
      <tr key={index} onClick={() => {router.push(`/${input_transaction?.transaction_id}`)}} className="cursor-pointer hover:bg-level-2">
        <td className="whitespace-nowrap py-2 px-3 text-sm font-medium flex flex-col">
          <div className="flex flex-row items-center py-1 rounded">
            <StatusPill swap={swap} />
          </div>
          <span className="text-muted">{new Date(swap.created_date).toLocaleString()}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-sm text-muted">
          <div className="flex flex-row">
            <div className="flex flex-col items-start mr-4">
              <span className="text-sm md:text-base font-normal place-items-end mb-1">Token:</span>
              <span className="text-sm md:text-base font-normal place-items-end min-w-[70px]">Source:</span>
            </div>
            <div className="flex flex-col">
                <div className="text-sm md:text-base flex flex-row mb-1">
                    <div className="flex flex-row items-center">
                        <div className="relative h-4 w-4 md:h-5 md:w-5">
                            <span>
                                <Image alt={`Source token icon ${index}`} src={settings?.resolveImgSrc(sourceToken) || ''} width={20} height={20} decoding="async" data-nimg="responsive" className="rounded-md" />
                            </span>
                        </div>
                        <div className="mx-2.5">
                            <span >{input_transaction?.amount}</span>
                            <span className="mx-1 ">{swap?.source_network_asset}</span>
                        </div>
                    </div>
                </div>
                <div className="text-sm md:text-base flex flex-row items-center">
                    <div className="relative h-4 w-4 md:h-5 md:w-5">
                        <span>
                            <Image alt={`Source chain icon ${index}`} src={settings?.resolveImgSrc(sourceExchange ? sourceExchange : sourceLayer) || ''} width={20} height={20} decoding="async" data-nimg="responsive" className="rounded-md" />
                        </span>
                    </div>
                    <div className="mx-2 text-white">
                        <Link href={`${input_transaction?.explorer_url}`} onClick={(e) => e.stopPropagation()} target="_blank" className="hover:text-gray-300 inline-flex items-center w-fit">
                            <span className="mx-0.5 hover:text-gray-300 underline hover:no-underline">{sourceExchange ? sourceExchange?.display_name : sourceLayer?.display_name}</span>
                        </Link>
                    </div>
                </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-sm text-muted">
          <div className="flex flex-row">
            <div className="flex flex-col items-start">
              <span className="text-sm md:text-base font-normal place-items-end mb-1">Token:</span>
              <span className="text-sm md:text-base font-normal place-items-end min-w-[70px]">Destination:</span>
            </div>
            <div className="flex flex-col">
                <div className="text-sm md:text-base flex flex-row">
                    <div className="flex flex-row items-center ml-4 mb-1">
                        <div className="relative h-4 w-4 md:h-5 md:w-5">
                            <span>
                                <Image alt={`Destination token icon ${index}`} src={settings?.resolveImgSrc(destinationToken) || ''} width={20} height={20} decoding="async" data-nimg="responsive" className="rounded-md" />
                            </span>
                        </div>
                        {output_transaction?.amount ?
                            <div className="mx-2.5">
                                <span className="text-white">{output_transaction?.amount}</span>
                                <span className="mx-1 text-white">{swap?.destination_network_asset}</span>
                            </div>
                            :
                            <span className="ml-2.5">-</span>
                        }
                    </div>
                </div>
                <div className="text-sm md:text-base flex flex-row items-center ml-4">
                    <div className="relative h-4 w-4 md:h-5 md:w-5">
                        <span>
                            <Image alt={`Destination chain icon ${index}`} src={settings?.resolveImgSrc(destinationExchange ? destinationExchange : destinationLayer) || ''} width={20} height={20} decoding="async" data-nimg="responsive" className="rounded-md" />
                        </span>
                    </div>
                    <div className="mx-2 text-white">
                        {output_transaction?.explorer_url ?
                            <Link href={`${output_transaction?.explorer_url}`} onClick={(e) => e.stopPropagation()} target="_blank" className={`${!output_transaction ? "disabled" : ""} hover:text-gray-300 inline-flex items-center w-fit`}>
                                <span className={`underline mx-0.5 hover:text-gray-300 hover:no-underline`}>{destinationExchange ? destinationExchange?.display_name : destinationLayer?.display_name}</span>
                            </Link>
                            :
                            <span className={`mx-0.5`}>{destinationExchange ? destinationExchange?.display_name : destinationLayer?.display_name}</span>
                        }
                    </div>
                </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap text-sm mr-4 text-foreground">
            <ChevronRight />
        </td>
      </tr>
    )
  }

  return (
    <div className="w-full my-4 h-full">
      <div className="max-h-[65vh] w-full pb-2 align-middle overflow-y-auto dataTable">
        <table className="border-spacing-0 w-full relative border-separate gap-0">
          <thead className="sticky top-0 z-10 bg-background ">
            <tr className='' >
              <th scope="col" className="cursor-default rounded-tl-lg bg-level-2 border-b px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                  Status
              </th>
              <th scope="col" className="cursor-default border-b px-3 bg-level-2 py-3.5 text-left text-sm font-semibold text-foreground">
                  Source
              </th>
              <th scope="col" className="cursor-default border-b px-3 bg-level-2 py-3.5 text-left text-sm font-semibold text-foreground ">
                  Destination
              </th>
              <th scope="col" className="border-b px-4 bg-level-2 py-3.5 text-left text-sm font-semibold text-foreground ">

              </th>
            </tr>
          </thead>
          <tbody className="bg-level-1">
          {swapsData?.filter(s => s.transactions?.some(t => t?.type == TransactionType.Input))?.map((swap, index) => (
            <Row swap={swap} index={index} />
          ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


const StatusPill: React.FC<{
  swap: Swap | undefined
}> = ({
  swap
}) => {
    const swapStatus = swap?.status;
    const input_transaction = swap?.transactions?.find(t => t?.type == TransactionType.Input);
    if (swapStatus == SwapStatus.LsTransferPending) {
        return <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-yellow-200 !border-yellow-200/50">Pending</span>
    } 
    else if (swapStatus == SwapStatus.Failed && input_transaction) {
        return <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-red-200 !border-red-200/50">Failed</span>
    } 
    else if (swapStatus == SwapStatus.Completed) {
        return <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-green-200 !border-green-200/50">Completed</span>
    }
    return <></>
}

export default DataTable
