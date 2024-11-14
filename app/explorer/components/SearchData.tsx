"use client";
import { shortenAddress, shortenHash } from "@/lib/utils";
import { ApiResponse } from "@/models/ApiResponse";
import CopyButton from "@/components/buttons/CopyButton";
import { ArrowRight, ChevronRight } from "lucide-react";
import useSWR from "swr";
import { StatusIcon } from "@/components/SwapHistory/StatusIcons";
import Link from "next/link";
import Image from "next/image";
import { useSettings } from "@/context/settings";
import LoadingBlocks from "@/components/LoadingBlocks";
import { SwapStatus } from "@/models/SwapStatus";
import AppSettings from "@/lib/AppSettings";
import NotFound from "@/components/NotFound";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { useRouter } from "next/navigation";
import BackButton from "@/components/buttons/BackButton";
import { usePathname } from "next/navigation";
import Error500 from "@/components/Error500";
import { getTimeDifferenceFromNow } from "@/components/utils/CalcTime";
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
  timestamp: string;
  transaction_hash: string;
  explorer_url: string;
  confirmations: number;
  max_confirmations: number;
  amount: number;
  usd_price: number;
  usd_value: number;
  type: string;
};

const options = {
  month: "short" as const,
  day: "numeric" as const,
  hour: "numeric" as const,
  minute: "numeric" as const,
};

const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH;
// const version = process.env.NEXT_PUBLIC_API_VERSION
const version = "sandbox";

export default function SearchData({ searchParam }: { searchParam: string }) {
  console.log("🚀 ~ SearchData ~ searchParam:", searchParam);

  const settings = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const fetcher = async (url: string) => {
    const res = await fetch(url);
    return res.json();
  };
  const { data, error, isLoading } = useSWR<ApiResponse<Swap[]>>(
    `${AppSettings.BridgeApiUri}/api/explorer/${searchParam}?version=${version}`,
    fetcher,
    { dedupingInterval: 60000 }
  );
  const swap = data?.data?.[0];

  const input_transaction = swap?.transactions?.find(
    (t) => t?.type == TransactionType.Input
  );
  const output_transaction = swap?.transactions?.find(
    (t) => t?.type == TransactionType.Output
  );
  const refuel_transaction = swap?.transactions?.find(
    (t) => t?.type == TransactionType.Refuel
  );

  const sourceLayer = settings?.layers?.find(
    (l) =>
      l.internal_name?.toLowerCase() === swap?.source_network?.toLowerCase()
  );
  const sourceToken = sourceLayer?.assets?.find(
    (a) => a?.asset == swap?.source_asset
  );

  const sourceExchange =
    swap?.source_exchange &&
    settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() === swap.source_exchange?.toLowerCase()
    );
  const destinationExchange =
    swap?.destination_exchange &&
    settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() ===
        swap.destination_exchange?.toLowerCase()
    );

  const destinationLayer = settings?.layers?.find(
    (l) =>
      l.internal_name?.toLowerCase() ===
      swap?.destination_network?.toLowerCase()
  );
  const destinationToken = destinationLayer?.assets?.find(
    (a) => a?.asset == swap?.destination_asset
  );

  console.log("🚀 ~ SearchData ~ destinationExchange:", destinationExchange);

  console.log("🚀 ~ SearchData ~ sourceLayer:", sourceLayer);
  console.log("🚀 ~ SearchData ~ sourceToken:", sourceToken);

  console.log("🚀 ~ SearchData ~ destinationToken:", destinationToken);
  console.log("🚀 ~ SearchData ~ destinationLayer:", destinationLayer);
  const cost =
    Number(input_transaction?.amount) - Number(output_transaction?.amount);

  const DestinationNativeToken = destinationLayer?.assets?.find(
    (a) => a.is_native
  );
  // const elapsedTimeInMiliseconds = new Date(swap?.output_transaction?.created_date || '')?.getTime() - new Date(swap?.input_transaction?.created_date || '')?.getTime();
  // const timeElapsed = millisToMinutesAndSeconds(elapsedTimeInMiliseconds);
  const filteredData = data?.data?.filter((s) =>
    s.transactions?.some((t) => t?.type == TransactionType.Input)
  );
  const emptyData = data?.data?.every((s) => !s.transactions.length);
  if (error) return <Error500 />;
  if (isLoading) return <LoadingBlocks />;
  if (data?.error || emptyData) return <NotFound />;

  const resultsCouldScroll = Number(filteredData?.length) > 5;

  const Row: React.FC<{
    swap: Swap;
    index: number;
  }> = ({ swap, index }) => {
    const sourceLayer = settings?.layers?.find(
      (l) =>
        l.internal_name?.toLowerCase() === swap.source_network?.toLowerCase()
    );
    const sourceToken = sourceLayer?.assets?.find(
      (a) => a?.asset == swap?.source_asset
    );

    const sourceExchange = settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() === swap.source_exchange?.toLowerCase()
    );
    const destinationExchange = settings?.exchanges?.find(
      (l) =>
        l.internal_name?.toLowerCase() ===
        swap.destination_exchange?.toLowerCase()
    );

    const destinationLayer = settings?.layers?.find(
      (l) =>
        l.internal_name?.toLowerCase() ===
        swap.destination_network?.toLowerCase()
    );
    const destinationToken = destinationLayer?.assets?.find(
      (a) => a?.asset == swap?.destination_asset
    );

    const inputTransaction = swap?.transactions?.find(
      (t) => t?.type == TransactionType.Input
    );
    const outputTransaction = swap?.transactions?.find(
      (t) => t?.type == TransactionType.Output
    );

    if (!inputTransaction) return null;

    return (
      <tr
        key={index}
        onClick={(e) => router.push(`/${inputTransaction?.transaction_hash}`)}
        className="hover:bg-level-2 hover:cursor-pointer"
      >
        <td className="whitespace-nowrap border-l border-r border-b border-[#404040] py-2 px-3 text-sm font-medium">
          <Link
            href={`/${inputTransaction?.transaction_hash}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-gray-300 inline-flex items-center w-fit"
          >
            {shortenAddress(inputTransaction?.transaction_hash)}
          </Link>
          <div className="">
            <StatusIcon swap={swap.status} className="mr-1" />
            {new Date(swap.created_date).toLocaleString()}
          </div>
        </td>
        <td className="whitespace-nowrap border-r border-b border-[#404040] px-3 py-2 text-sm ">
          <div className="flex flex-row">
            <div className="flex flex-col items-start ">
              <span className="text-sm md:text-base font-normal text-socket-ternary place-items-end mb-1">
                Token:
              </span>
              <span className="text-sm md:text-base font-normal text-socket-ternary place-items-end min-w-[70px]">
                Source:
              </span>
            </div>
            <div className="flex flex-col">
              <div className="text-sm md:text-base flex flex-row mb-1">
                <div className="flex flex-row items-center ml-4">
                  <div className="relative h-4 w-4 md:h-5 md:w-5">
                    <span>
                      <span></span>
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
                    <span className="">{inputTransaction?.amount}</span>
                    <span className="mx-1 ">{swap?.source_asset}</span>
                  </div>
                </div>
              </div>
              <div className="text-sm md:text-base flex flex-row items-center ml-4">
                <div className="relative h-4 w-4 md:h-5 md:w-5">
                  <span>
                    <span></span>
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
                    href={`${inputTransaction?.explorer_url}`}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    className="hover:text-gray-300 inline-flex items-center w-fit"
                  >
                    <span className="mx-0.5 hover:text-gray-300 underline">
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
        <td className="whitespace-nowrap border-b border-[#404040] px-3 py-2 text-sm ">
          <div className="flex flex-row">
            <div className="flex flex-col items-start ">
              <span className="text-sm md:text-base font-normal text-socket-ternary place-items-end mb-1">
                Token:
              </span>
              <span className="text-sm md:text-base font-normal text-socket-ternary place-items-end min-w-[70px]">
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
                  {outputTransaction?.amount ? (
                    <div className="mx-2.5">
                      <span className=" mx-0.5">
                        {outputTransaction?.amount}
                      </span>
                      <span className="">{swap?.destination_asset}</span>
                    </div>
                  ) : (
                    <span className="ml-2.5">-</span>
                  )}
                </div>
              </div>
              <div className="text-sm md:text-base flex flex-row items-center ml-4">
                <div className="relative h-4 w-4 md:h-5 md:w-5">
                  <span>
                    <span></span>
                    <Image
                      alt={`Destination chain icon ${index}`}
                      src={
                        settings?.resolveImgSrc(
                          destinationExchange
                            ? destinationExchange
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
                  <Link
                    href={`${outputTransaction?.explorer_url}`}
                    onClick={(e) => e.stopPropagation()}
                    target="_blank"
                    className={`${
                      !outputTransaction ? "disabled" : ""
                    } hover:text-gray-300 inline-flex items-center w-fit`}
                  >
                    <span
                      className={`${
                        outputTransaction?.explorer_url ? "underline" : ""
                      } mx-0.5 hover:text-gray-300`}
                    >
                      {destinationExchange
                        ? destinationExchange?.display_name
                        : destinationLayer?.display_name}
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </td>
        <td
          className={
            "whitespace-nowrap border-b border-[#404040] text-sm mr-4 " +
            (resultsCouldScroll ? "" : "border-r ")
          }
        >
          <ChevronRight />
        </td>
      </tr>
    );
  };

  return Number(data?.data?.length) > 1 ? (
    <div className="w-full px-6">
      {!(
        pathname === "/" ||
        pathname === basePath ||
        pathname === `${basePath}/`
      ) && (
        <div className="hidden xl:block w-fit mb-3 hover:bg-level-2 hover:text-accent-foreground rounded-lg ring-offset-background transition-colors -ml-5">
          <BackButton className="text-lg font-semibold" />
        </div>
      )}
      <div className="flow-root w-full">
        <div
          className="p-4 mb-4 flex gap-1 rounded-lg border border-[#404040] border-1"
          style={{ width: "fit-content" }}
        >
          <span className="font-bold mr-1 ">Address:</span>
          <span className="break-all">
            {swap?.destination_address}
            <CopyButton
              toCopy={swap?.destination_address || ""}
              iconHeight={16}
              iconClassName="order-2"
              iconWidth={16}
              className="inline-flex items-center ml-3 align-middle"
            />
          </span>
        </div>
        <div
          className={
            resultsCouldScroll
              ? "overflow-y-auto h-full max-h-[55vh] 2xl:max-h-[65vh] dataTable"
              : "overflow-hidden"
          }
        >
          <div className="min-w-full pb-2 align-middle sm:rounded-lg">
            <table className="border-spacing-0 w-full relative border-separate">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th
                    scope="col"
                    className="cursor-default rounded-tl-lg border-[#404040] border-l border-b border-t px-3 py-3.5 text-left text-sm font-semibold text-muted"
                  >
                    Source Tx Hash
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
                    className={
                      "border-[#404040] border-b border-t px-4 py-3.5 text-left text-sm font-semibold text-muted " +
                      (Number(filteredData?.length) > 5
                        ? ""
                        : "border-r rounded-tr-lg ")
                    }
                  />
                </tr>
              </thead>
              <tbody>
                {filteredData?.map((swap, index) => (
                  <Row swap={swap} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full">
      <div className="sm:rounded-lg w-full">
        {swap && input_transaction && (
          <div className="py-2 lg:py-10 pt-4 sm:px-6 lg:px-8">
            {pathname !== "/" && (
              <div className="hidden xl:block w-fit mb-1 hover:bg-level-2 hover:text-accent-foreground rounded ring-offset-background transition-colors -ml-5">
                <BackButton />
              </div>
            )}
            <div className="md:ml-0 md:mb-6 flex-col sm:flex-row sm:justify-between sm:items-start">
              <div className="mb-4 sm:mb-0">
                <div className="text-sm md:text-base  sm:flex justify-between w-full">
                  <div className="items-center text-base mb-0.5 ">
                    <div className="mr-2 sm:text-xl text-base">
                      {swap.status == SwapStatus.Completed &&
                      output_transaction ? (
                        <div className="flex flex-col sm:flex-row">
                          <div>
                            <StatusIcon swap={swap.status} />
                            <span className="whitespace-nowrap align-bottom">
                              &nbsp;at
                            </span>
                            <span className="whitespace-nowrap  align-bottom">
                              &nbsp;
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger className="cursor-default">
                                    {new Date(
                                      input_transaction?.created_date
                                    )?.toLocaleString("en-US", options)}
                                    .
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {new Date(swap.created_date).toUTCString()}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </span>
                          </div>
                          <p className="sm:self-end">
                            <span className="sm:whitespace-nowrap sm:ml-0.5 ">
                              Took
                            </span>
                            <span className="">
                              &nbsp;
                              {getTimeDifferenceFromNow(
                                input_transaction?.timestamp,
                                output_transaction?.timestamp
                              )}
                            </span>
                          </p>
                          <p className="sm:self-end">
                            <span className=" sm:ml-1">and cost</span>
                            <span className="">
                              &nbsp;
                              {truncateDecimals(
                                cost,
                                sourceToken?.precision
                              )}{" "}
                              {swap?.source_asset}
                            </span>
                          </p>
                        </div>
                      ) : swap.status !== SwapStatus.Completed ? (
                        <div className="flex flex-col sm:flex-row">
                          <div>
                            <StatusIcon swap={swap.status} />
                            <span className="whitespace-nowrap  align-bottom">
                              &nbsp;Published at
                            </span>
                            <span className="whitespace-nowrap  align-bottom">
                              &nbsp;
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger className="cursor-default">
                                    {new Date(
                                      input_transaction?.created_date
                                    )?.toLocaleString("en-US", options)}
                                    .
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {new Date(swap.created_date).toUTCString()}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </span>
                          </div>
                          <p className="sm:self-end">
                            <span className="">
                              &nbsp;(
                              {getTimeDifferenceFromNow(
                                input_transaction?.timestamp,
                                new Date().toString()
                              )}{" "}
                              ago)
                            </span>
                          </p>
                        </div>
                      ) : (
                        <div className="flex sm:flex-row">
                          <StatusIcon swap={swap.status} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col lg:flex-row items-start gap-4">
              <div className="w-full p-6 grid gap-y-3 items-baseline lg:max-w-[50%] border border-muted-3 border-1 rounded-lg shadow-lg">
                <div className="w-full flex items-center border-b border-muted-3 border-1">
                  <div className="text-2xl font-medium">From</div>
                </div>
                <div className="rounded-md w-full grid  shadow-lg relative ">
                  <div className="flex justify-around">
                    <div className="flex-1 ">
                      <div className="text-base font-normal ">Asset</div>
                      <div className="flex items-center">
                        <span className="text-sm lg:text-base font-medium text-socket-table  flex items-center">
                          <Image
                            alt="Source token icon"
                            src={settings?.resolveImgSrc(sourceToken) || ""}
                            width={20}
                            height={20}
                            decoding="async"
                            data-nimg="responsive"
                            className="rounded-md mr-0.5"
                          />
                          {input_transaction?.amount} {swap?.source_asset}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 ">
                      <div className="text-base font-normal ">Source</div>
                      <div className="flex items-center">
                        <Image
                          alt="Source chain icon"
                          src={
                            settings?.resolveImgSrc(
                              sourceExchange ? sourceExchange : sourceLayer
                            ) || ""
                          }
                          width={20}
                          height={20}
                          decoding="async"
                          data-nimg="responsive"
                          className="rounded-md mr-0.5"
                        />
                        <span className="text-sm lg:text-base font-medium text-socket-table ">
                          {sourceExchange
                            ? sourceExchange?.display_name
                            : sourceLayer?.display_name}
                        </span>
                      </div>
                      {swap?.source_exchange && sourceExchange && (
                        <div>
                          <div className="text-base font-normal ">Via</div>
                          <div className="flex items-center">
                            <Image
                              alt="Source chain icon"
                              src={settings?.resolveImgSrc(sourceLayer) || ""}
                              width={20}
                              height={20}
                              decoding="async"
                              data-nimg="responsive"
                              className="rounded-md mr-0.5"
                            />
                            <span className="text-sm lg:text-base font-medium text-socket-table ">
                              {sourceLayer?.display_name}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col mt-6">
                    <div className="text-base font-normal ">From Address</div>
                    <div className="text-sm lg:text-base font-medium text-tx-base w-full">
                      <div className="flex justify-between items-center  hover:">
                        <Link
                          href={`${sourceLayer?.account_explorer_template?.replace(
                            "{0}",
                            input_transaction?.from
                          )}`}
                          target="_blank"
                          className="hover:text-gray-300 w-fit contents items-center"
                        >
                          <span className="break-all link link-underline link-underline-black">
                            {input_transaction?.from}
                          </span>
                        </Link>
                        <CopyButton
                          toCopy={input_transaction?.from}
                          iconHeight={16}
                          iconClassName="order-2"
                          iconWidth={16}
                          className="ml-2"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col mt-6">
                    <div className="text-base font-normal ">Transaction</div>
                    <div className="text-sm lg:text-base font-medium text-tx-base w-full">
                      <div className="flex items-center justify-between  hover:">
                        <Link
                          href={`${sourceLayer?.transaction_explorer_template.replace(
                            "{0}",
                            input_transaction?.transaction_hash
                          )}`}
                          target="_blank"
                          className="hover:text-gray-300 w-fit contents items-center second-link"
                        >
                          <span className="break-all link link-underline link-underline-black">
                            {shortenAddress(
                              input_transaction?.transaction_hash
                            )}
                          </span>
                        </Link>
                        <CopyButton
                          toCopy={input_transaction?.transaction_hash}
                          iconHeight={16}
                          iconClassName="order-2"
                          iconWidth={16}
                          className="ml-2"
                        />
                      </div>
                    </div>
                  </div>
                  {input_transaction?.confirmations >=
                  input_transaction?.max_confirmations ? null : (
                    <div className="flex-1">
                      <div className="text-base font-normal ">
                        Confirmations
                        <span className="text-sm lg:text-base font-medium text-socket-table  ml-1">
                          {input_transaction?.confirmations >=
                          input_transaction?.max_confirmations
                            ? input_transaction?.max_confirmations
                            : input_transaction?.confirmations}
                          /{input_transaction?.max_confirmations}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="rotate-90 lg:rotate-0 self-center">
                <ArrowRight className=" w-8 h-auto" />
              </div>
              <div className="w-full p-6 grid gap-y-3 border border-muted-3 border-1 rounded-lg shadow-lg relative">
                {swap.status == SwapStatus.BridgeTransferPending ||
                swap.status == SwapStatus.UserTransferPending ? (
                  <span className="pendingAnim"></span>
                ) : null}
                <div className="flex items-center border-b border-muted-3 border-1">
                  <div className="mr-2  text-2xl font-medium">To</div>
                </div>
                <div className="rounded-md w-full grid shadow-lg relative ">
                  <div className="flex justify-around">
                    <div className="flex-1">
                      <div className="text-base font-normal ">Asset</div>
                      <div className="flex items-center">
                        {output_transaction?.amount ? (
                          <div className="flex items-center">
                            <Image
                              alt="Destination token icon"
                              src={
                                settings?.resolveImgSrc(destinationToken) || ""
                              }
                              width={20}
                              height={20}
                              decoding="async"
                              data-nimg="responsive"
                              className="rounded-md"
                            />
                            <span className="text-sm lg:text-base font-medium text-socket-table  ml-0.5">
                              {output_transaction?.amount}{" "}
                              {swap?.destination_asset}
                            </span>
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-normal ">Destination</div>
                      <div className="flex items-center">
                        <Image
                          alt="Destination chain icon"
                          src={
                            settings?.resolveImgSrc(
                              destinationExchange
                                ? destinationExchange
                                : destinationLayer
                            ) || ""
                          }
                          width={20}
                          height={20}
                          decoding="async"
                          data-nimg="responsive"
                          className="rounded-md mr-0.5"
                        />
                        <span className="text-sm lg:text-base font-medium text-socket-table ">
                          {destinationExchange
                            ? destinationExchange?.display_name
                            : destinationLayer?.display_name}
                        </span>
                      </div>
                      {swap?.destination_exchange && destinationExchange && (
                        <div>
                          <div className="text-base font-normal ">Via</div>
                          <div className="flex items-center">
                            <Image
                              alt="Source chain icon"
                              src={
                                settings?.resolveImgSrc(destinationLayer) || ""
                              }
                              width={20}
                              height={20}
                              decoding="async"
                              data-nimg="responsive"
                              className="rounded-md mr-0.5"
                            />
                            <span className="text-sm lg:text-base font-medium text-socket-table ">
                              {destinationLayer?.display_name}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col mt-6">
                    <div className="text-base font-normal ">To Address</div>
                    <div className="text-sm lg:text-base font-medium text-tx-base w-full">
                      {output_transaction?.to ? (
                        <div className="flex items-center justify-between  hover:">
                          <Link
                            href={`${destinationLayer?.account_explorer_template?.replace(
                              "{0}",
                              output_transaction?.to
                            )}`}
                            target="_blank"
                            className="hover:text-gray-300 w-fit contents items-center"
                          >
                            <span className="break-all link link-underline link-underline-black">
                              {output_transaction?.to}
                            </span>
                          </Link>
                          <CopyButton
                            toCopy={swap?.destination_address}
                            iconHeight={16}
                            iconClassName="order-2"
                            iconWidth={16}
                            className="ml-2"
                          />
                        </div>
                      ) : (
                        <span className="ml-1">-</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col mt-6">
                    <div className="text-base font-normal ">Transaction</div>
                    <div className="text-sm lg:text-base font-medium text-tx-base w-full">
                      {output_transaction?.transaction_hash ? (
                        <div className="flex items-center justify-between  hover:">
                          <Link
                            href={`${destinationLayer?.transaction_explorer_template.replace(
                              "{0}",
                              output_transaction?.transaction_hash
                            )}`}
                            target="_blank"
                            className="hover:text-gray-300 w-fit contents items-center"
                          >
                            <span className="break-all link link-underline link-underline-black">
                              {shortenAddress(
                                output_transaction?.transaction_hash
                              )}
                            </span>
                          </Link>
                          <CopyButton
                            toCopy={output_transaction?.transaction_hash}
                            iconHeight={16}
                            iconClassName="order-2"
                            iconWidth={16}
                            className="ml-2"
                          />
                        </div>
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                  </div>
                </div>
                {swap?.refuel && (
                  <>
                    <div className="flex items-center ">
                      <div className="mr-2  text-2xl font-medium">
                        ... and for gas
                      </div>
                    </div>
                    <div className="rounded-md w-full grid gap-y-3  bg-level-1 shadow-lg relative border-level-2 border">
                      <div className="flex justify-around">
                        <div className="flex-1 p-4">
                          <div className="text-base font-normal ">
                            Native Asset
                          </div>
                          <div className="flex items-center">
                            <div className="flex items-center">
                              <Image
                                alt="Destination token icon"
                                src={
                                  settings?.resolveImgSrc(destinationToken) ||
                                  ""
                                }
                                width={20}
                                height={20}
                                decoding="async"
                                data-nimg="responsive"
                                className="rounded-md"
                              />
                              <span className="text-sm lg:text-base font-medium text-socket-table  ml-0.5">
                                {truncateDecimals(
                                  refuel_transaction?.amount,
                                  DestinationNativeToken?.precision
                                )}{" "}
                                {DestinationNativeToken?.asset}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 p-4 border-level-2 border-l">
                          <div className="text-base font-normal ">
                            Transaction
                          </div>
                          {refuel_transaction?.transaction_hash ? (
                            <div className="flex items-center justify-between  hover:">
                              <Link
                                href={`${refuel_transaction?.explorer_url}`}
                                target="_blank"
                                className="hover:text-gray-300 w-fit contents items-center"
                              >
                                <span className="break-all link link-underline link-underline-black">
                                  {shortenHash(
                                    refuel_transaction?.transaction_hash
                                  )}
                                </span>
                              </Link>
                              <CopyButton
                                toCopy={refuel_transaction?.transaction_hash}
                                iconHeight={16}
                                iconClassName="order-2"
                                iconWidth={16}
                                className="ml-2"
                              />
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function truncateDecimals(
  value: number | undefined,
  decimals: number | undefined
) {
  return Number(value?.toFixed(decimals));
}
