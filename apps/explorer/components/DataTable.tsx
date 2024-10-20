"use client";
import { ApiResponse } from "@/models/ApiResponse";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { useSettings } from "@/context/settings";
import Image from "next/image";
import Link from "next/link";
import LoadingBlocks from "@/components/LoadingBlocks";
import { SwapStatus } from "@/models/SwapStatus";
import { useRouter } from "next/navigation";
import AppSettings from "@/lib/AppSettings";
import Error500 from "@/components/Error500";
import { TransactionType } from "@/models/TransactionTypes";

type Swap = {
  created_date: string;
  status: string;
  destination_address: string;
  source_asset: string;
  source_network: string;
  source_exchange: string;
  destination_asset: string;
  destination_network: string;
  destination_exchange: string;
  refuel: boolean;
  transactions: Transaction[];
};

type Transaction = {
  from: string;
  to: string;
  created_date: string;
  transaction_id: string;
  explorer_url: string;
  confirmations: number;
  max_confirmations: number;
  amount: number;
  usd_price: number;
  usd_value: number;
  type: string;
  transaction_hash: string;
};

const DataTable: React.FC = () => {
  const fetcher = async (url: string) => {
    const res = await fetch(url);
    return res.json();
  };
  // const version = process.env.NEXT_PUBLIC_API_VERSION
  const version = "sandbox";
  const settings = useSettings();

  const { data, error, isLoading } = useSWR<ApiResponse<Swap[]>>(
    `${AppSettings.BridgeApiUri}/api/explorer?statuses=1&statuses=3&statuses=4&version=${version}`,
    fetcher,
    { dedupingInterval: 60000 }
  );

  const swapsData = data?.data;
  console.log("🚀 ~ swapsData:", swapsData);
  const router = useRouter();

  if (error) return <Error500 />;
  if (isLoading) return <LoadingBlocks />;
// console.log('settings?.layers======',settings?.layers);

  const Row: React.FC<{
    swap: Swap;
    index: number;
  }> = ({ swap, index }) => {
    console.log("🚀 ~ swap:", swap)
    // console.log(' swap.source_network?', swap.source_network);

    const sourceLayer = settings?.layers?.find(
      (l) =>
        l.internal_name?.toLowerCase() === swap.source_network?.toLowerCase()
    );
    // console.log("🚀 ~ settings?.layers:", sourceLayer, index);
    const sourceToken = sourceLayer?.assets?.find(
      (a) => a?.asset == swap?.source_asset
    );
    // console.log("sourceToken----->", sourceToken, index);

    const sourceExchange = settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() === swap.source_exchange?.toLowerCase()
    );
    // console.log("sourceExchange----->", sourceExchange, index);

    const destination_exchange = settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() ===
        swap.destination_exchange?.toLowerCase()
    );

    // console.log("destination_exchange----->", destination_exchange, index);

    const destinationLayer = settings?.layers?.find(
      (l) =>
        l.internal_name?.toLowerCase() ===
        swap.destination_network?.toLowerCase()
    );
    const destinationToken = destinationLayer?.assets?.find(
      (a) => a?.asset == swap?.destination_asset
    );

    const input_transaction = swap?.transactions?.find(
      (t) => t?.type == TransactionType.Input
    );
    const output_transaction = swap?.transactions?.find(
      (t) => t?.type == TransactionType.Output
    );
    // console.log("🚀 ~ input_transaction:", input_transaction);
    console.log("🚀 ~ output_transaction:", output_transaction);

    return (
      <tr
        key={index}
        onClick={() => {
          router.push(`/${input_transaction?.transaction_hash}`);
        }}
        className="cursor-pointer hover:bg-level-1"
      >
        <td className="whitespace-nowrap border-l border-r border-b border-[#404040] py-2 px-3 text-sm font-medium flex flex-col">
          <div className="flex flex-row items-center py-1 rounded">
            <StatusPill swap={swap} />
          </div>
          <span className="text-muted">
            {new Date(swap.created_date).toLocaleString()}
          </span>
        </td>
        <td className="whitespace-nowrap border-r border-b border-[#404040] px-3 py-2 text-sm text-muted ">
          <div className="flex flex-row">
            <div className="flex flex-col items-start mr-4">
              <span className="text-sm md:text-base font-normal place-items-end mb-1">
                Token:
              </span>
              <span className="text-sm md:text-base font-normal place-items-end min-w-[70px]">
                Source:
              </span>
            </div>
            <div className="flex flex-col">
              <div className="text-sm md:text-base flex flex-row mb-1">
                <div className="flex flex-row items-center">
                  <div className="relative h-4 w-4 md:h-5 md:w-5">
                    <span>
                      <Image
                        alt={`Source token icon ${index}`}
                        src={settings?.resolveImgSrc(sourceToken) || ""}
                        width={20}
                        height={20}
                        decoding="async"
                        data-nimg="responsive"
                        className="rounded-md"
                      />
                    </span>
                  </div>
                  <div className="mx-2.5">
                    <span>{input_transaction?.amount}</span>
                    <span className="mx-1 ">{swap?.source_asset}</span>
                  </div>
                </div>
              </div>
              <div className="text-sm md:text-base flex flex-row items-center">
                <div className="relative h-4 w-4 md:h-5 md:w-5">
                  <span>
                    <Image
                      alt={`Source chain icon ${index}`}
                      src={
                        settings?.resolveImgSrc(
                          sourceExchange ? sourceExchange : sourceLayer
                        ) || ""
                      }
                      width={20}
                      height={20}
                      decoding="async"
                      data-nimg="responsive"
                      className="rounded-md"
                    />
                  </span>
                </div>
                <div className="mx-2 ">
                  <Link
                    href={`/${input_transaction?.transaction_hash}`}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    className="hover:text-gray-300 inline-flex items-center w-fit"
                  >
                    <span className="mx-0.5 hover:text-gray-300 underline hover:no-underline">
                      {sourceExchange
                        ? sourceExchange?.display_name
                        : sourceLayer?.display_name}
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap border-b border-[#404040] px-3 py-2 text-sm text-muted">
          <div className="flex flex-row">
            <div className="flex flex-col items-start">
              <span className="text-sm md:text-base font-normal place-items-end mb-1">
                Token:
              </span>
              <span className="text-sm md:text-base font-normal place-items-end min-w-[70px]">
                Destination:
              </span>
            </div>
            <div className="flex flex-col">
              <div className="text-sm md:text-base flex flex-row">
                <div className="flex flex-row items-center ml-4 mb-1">
                  <div className="relative h-4 w-4 md:h-5 md:w-5">
                    <span>
                      <Image
                        alt={`Destination token icon ${index}`}
                        src={settings?.resolveImgSrc(destinationToken) || ""}
                        width={20}
                        height={20}
                        decoding="async"
                        data-nimg="responsive"
                        className="rounded-md"
                      />
                    </span>
                  </div>
                  {output_transaction?.amount ? (
                    <div className="mx-2.5">
                      <span className="">{output_transaction?.amount}</span>
                      <span className="mx-1 ">{swap?.destination_asset}</span>
                    </div>
                  ) : (
                    <span className="ml-2.5">-</span>
                  )}
                </div>
              </div>
              <div className="text-sm md:text-base flex flex-row items-center ml-4">
                <div className="relative h-4 w-4 md:h-5 md:w-5">
                  <span>
                    <Image
                      alt={`Destination chain icon ${index}`}
                      src={
                        settings?.resolveImgSrc(
                          destination_exchange
                            ? destination_exchange
                            : destinationLayer
                        ) || ""
                      }
                      width={20}
                      height={20}
                      decoding="async"
                      data-nimg="responsive"
                      className="rounded-md"
                    />
                  </span>
                </div>
                <div className="mx-2 ">
                  {output_transaction?.transaction_hash ? (
                    <Link
                      href={`/${output_transaction?.transaction_hash}`}
                      onClick={(e) => e.stopPropagation()}
                      target="_blank"
                      className={`${
                        !output_transaction ? "disabled" : ""
                      } hover:text-gray-300 inline-flex items-center w-fit`}
                    >
                      <span
                        className={`underline mx-0.5 hover:text-gray-300 hover:no-underline`}
                      >
                        {destination_exchange
                          ? destination_exchange?.displayName
                          : destinationLayer?.displayName}
                      </span>
                    </Link>
                  ) : (
                    <span className={`mx-0.5`}>
                      {destination_exchange
                        ? destination_exchange?.displayName
                        : destinationLayer?.displayName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap border-b border-[#404040] text-sm mr-4 text-foreground">
          <ChevronRight />
        </td>
      </tr>
    );
  };

  return (
    <div className="w-full my-4 h-full">
      <div className="max-h-[65vh] w-full align-middle border-b border-[#404040] overflow-y-auto dataTable">
        <table className="border-separate border-spacing-0 w-full relative gap-0">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <th
                scope="col"
                className="cursor-default rounded-tl-lg border-[#404040] border-l border-b border-t px-3 py-3.5 text-left text-sm font-semibold text-muted"
              >
                Status
              </th>
              <th
                scope="col"
                className="cursor-default border-[#404040] border-b border-t px-3 py-3.5 text-left text-sm font-semibold text-muted"
              >
                Source
              </th>
              <th
                scope="col"
                className="cursor-default border-[#404040] border-b border-t px-3 py-3.5 text-left text-sm font-semibold text-muted "
              >
                Destination
              </th>
              <th
                scope="col"
                className="border-[#404040] border-b border-t px-4 py-3.5 text-left text-sm font-semibold text-muted "
              />
            </tr>
          </thead>
          <tbody>
            {swapsData?.map((swap, index) => (
              <Row swap={swap} index={index} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusPill: React.FC<{
  swap: Swap | undefined;
}> = ({ swap }) => {
  const swapStatus = swap?.status;
  const input_transaction = swap?.transactions?.find(
    (t) => t?.type == TransactionType.Input
  );
  if (swapStatus == SwapStatus.UserTransferPending) {
    return (
      <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-yellow-200 !border-yellow-200/50">
        Pending
      </span>
    );
  } else if (swapStatus == SwapStatus.BridgeTransferPending) {
    return (
      <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-yellow-200 !border-yellow-200/50">
        Pending
      </span>
    );
  } else if (swapStatus == SwapStatus.Failed && input_transaction) {
    return (
      <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-red-200 !border-red-200/50">
        Failed
      </span>
    );
  } else if (swapStatus == SwapStatus.Completed) {
    return (
      <span className="font-medium md:text-sm text-xs border p-1 rounded-md text-green-200 !border-green-200/50">
        Completed
      </span>
    );
  }
  return <></>;
};

export default DataTable;
