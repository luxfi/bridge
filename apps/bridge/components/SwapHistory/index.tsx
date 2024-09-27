"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ChevronRight,
  Eye,
  RefreshCcw,
  Scroll,
  X,
} from "lucide-react";

import BridgeApiClient, {
  SwapItem,
  SwapStatusInNumbers,
  TransactionType,
} from "../../lib/BridgeApiClient";
import SpinIcon from "../icons/spinIcon";
import SwapDetails from "./SwapDetailsComponent";
import { useSettingsState } from "../../context/settings";
import { classNames } from "../utils/classNames";
import SubmitButton, { DoubleLineText } from "../buttons/submitButton";
import { SwapHistoryComponentSceleton } from "../Sceletons";
import StatusIcon from "./StatusIcons";
import toast from "react-hot-toast";
import ToggleButton from "../buttons/toggleButton";
import Modal from "../modal/modal";
import HeaderWithMenu from "../HeaderWithMenu";
import { resolvePersistantQueryParams } from "../../helpers/querryHelper";
import AppSettings from "../../lib/AppSettings";
import { truncateDecimals } from "../utils/RoundDecimals";
import { Layer } from "../../Models/Layer";
import { Exchange } from "../../Models/Exchange";
import { NetworkCurrency } from "../../Models/CryptoNetwork";

function TransactionsHistory() {
  const [page, setPage] = useState(0);
  const settings = useSettingsState();
  const { layers, exchanges, resolveImgSrc, getExchangeAsset } = settings;
  const [isLastPage, setIsLastPage] = useState(false);
  const [swaps, setSwaps] = useState<SwapItem[]>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [selectedSwap, setSelectedSwap] = useState<SwapItem | undefined>();
  const [openSwapDetailsModal, setOpenSwapDetailsModal] = useState(false);
  const [showAllSwaps, setShowAllSwaps] = useState(false);
  const [showToggleButton, setShowToggleButton] = useState(false);

  const PAGE_SIZE = 20;

  const goBack = useCallback(() => {
    window?.["navigation"]?.["canGoBack"]
      ? router.back()
      : router.push({
        pathname: "/",
        query: resolvePersistantQueryParams(router.query),
      });
  }, [router]);

  useEffect(() => {
    (async () => {
      const client = new BridgeApiClient(router, "/transactions");
      const { data } = await client.GetSwapsAsync(
        1,
        SwapStatusInNumbers.Cancelled
      );
      if (Number(data?.length) > 0) setShowToggleButton(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setIsLastPage(false);
      setLoading(true);
      const client = new BridgeApiClient(router, "/transactions");

      if (showAllSwaps) {
        const { data, error } = await client.GetSwapsAsync(1);

        if (error) {
          toast.error(error.message);
          return;
        }

        setSwaps(data);
        setPage(1);
        if (Number(data?.length) < PAGE_SIZE) setIsLastPage(true);

        setLoading(false);
      } else {
        const { data, error } = await client.GetSwapsAsync(
          1,
          SwapStatusInNumbers.SwapsWithoutCancelledAndExpired
        );

        if (error) {
          toast.error(error.message);
          return;
        }
        console.log("data=====>", data);

        setSwaps(data);
        setPage(1);
        if (Number(data?.length) < PAGE_SIZE) setIsLastPage(true);
        setLoading(false);
      }
    })();
  }, [router.query, showAllSwaps]);

  const handleLoadMore = useCallback(async () => {
    //TODO refactor page change
    const nextPage = page + 1;
    setLoading(true);
    const client = new BridgeApiClient(router, "/transactions");
    if (showAllSwaps) {
      const { data, error } = await client.GetSwapsAsync(nextPage);

      if (error) {
        toast.error(error.message);
        return;
      }

      setSwaps((old) => [...(old ? old : []), ...(data ? data : [])]);
      setPage(nextPage);
      if (Number(data?.length) < PAGE_SIZE) setIsLastPage(true);

      setLoading(false);
    } else {
      const { data, error } = await client.GetSwapsAsync(
        nextPage,
        SwapStatusInNumbers.SwapsWithoutCancelledAndExpired
      );

      if (error) {
        toast.error(error.message);
        return;
      }

      setSwaps((old) => [...(old ? old : []), ...(data ? data : [])]);
      setPage(nextPage);
      if (Number(data?.length) < PAGE_SIZE) setIsLastPage(true);

      setLoading(false);
    }
  }, [page, setSwaps]);

  const handleopenSwapDetails = (swap: SwapItem) => {
    setSelectedSwap(swap);
    setOpenSwapDetailsModal(true);
  };

  const handleToggleChange = (value: boolean) => {
    setShowAllSwaps(value);
  };

  return (
    <div className="bg-background border border-[#404040]  rounded-lg mb-6 w-full text-muted overflow-hidden relative min-h-[620px]">
      <HeaderWithMenu goBack={goBack} />
      {page == 0 && loading ? (
        <SwapHistoryComponentSceleton />
      ) : (
        <>
          {Number(swaps?.length) > 0 ? (
            <div className="w-full flex flex-col justify-between h-full px-6 space-y-5">
              <div className="mt-4">
                {showToggleButton && (
                  <div className="flex justify-end mb-2">
                    <div className="flex space-x-2">
                      <p className="flex items-center text-xs md:text-sm font-medium">
                        Show all swaps
                      </p>
                      <ToggleButton
                        onChange={handleToggleChange}
                        value={showAllSwaps}
                      />
                    </div>
                  </div>
                )}
                <div className="max-h-[450px] styled-scroll overflow-y-auto ">
                  <table className="w-full divide-y divide-[#404040]">
                    <thead className="text-foreground">
                      <tr>
                        <th
                          scope="col"
                          className="text-left text-sm font-semibold"
                        >
                          <div className="block">Swap details</div>
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold  "
                        >
                          Status
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold  "
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {swaps?.map((swap, index) => {
                        const {
                          source_exchange: source_exchange_internal_name,
                          destination_network: destination_network_internal_name,
                          source_network: source_network_internal_name,
                          destination_exchange: destination_exchange_internal_name,
                          source_asset,
                          destination_asset
                        } = swap;

                        const sourceLayer = layers.find(n => n.internal_name === source_network_internal_name)
                        const sourceExchange = exchanges.find(e => e.internal_name === source_exchange_internal_name)
                        const sourceAsset = sourceLayer ? sourceLayer?.assets?.find(currency => currency?.asset === source_asset) : getExchangeAsset(layers, sourceExchange, source_asset)

                        const destinationLayer = layers?.find(l => l.internal_name === destination_network_internal_name)
                        const destinationExchange = exchanges?.find(l => l.internal_name === destination_exchange_internal_name)
                        const destinationAsset = destinationLayer ? destinationLayer?.assets?.find(currency => currency?.asset === destination_asset) : getExchangeAsset(layers, destinationExchange, destination_asset)
                        const output_transaction = swap.transactions.find((t) => t.type === TransactionType.Output);

                        // const sourceLayer = layers.find((e) => e.internal_name === source_network_internal_name);
                        // const source_currency = source?.assets?.find((c) => c.asset === source_asset);
                        // const destination = layers.find((n) => n.internal_name === destination_network_internal_name);

                        return (
                          <tr
                            onClick={() => handleopenSwapDetails(swap)}
                            key={swap.id}
                          >
                            <td
                              className={classNames(
                                index === 0 ? "" : "border-t border-[#404040]",
                                "relative text-sm  table-cell"
                              )}
                            >
                              <div className=" flex items-center">
                                <div className="flex-shrink-0 h-5 w-5 relative">
                                  {(sourceLayer || sourceExchange) && (
                                    <Image
                                      src={resolveImgSrc(sourceLayer ?? sourceExchange)}
                                      alt="From Logo"
                                      height="60"
                                      width="60"
                                      className="rounded-md object-contain"
                                    />
                                  )}
                                </div>
                                <ArrowRight className="h-4 w-4 mx-2" />
                                <div className="flex-shrink-0 h-5 w-5 relative block">
                                  {(destinationLayer || destinationExchange) && (
                                    <Image
                                      src={resolveImgSrc(destinationLayer ?? destinationExchange)}
                                      alt="To Logo"
                                      height="60"
                                      width="60"
                                      className="rounded-md object-contain"
                                    />
                                  )}
                                </div>
                              </div>
                              {index !== 0 ? (
                                <div className="absolute right-0 left-6 -top-px h-px bg-level-1" />
                              ) : null}
                            </td>
                            <td
                              className={classNames(
                                index === 0 ? "" : "border-t border-[#404040]",
                                "relative text-sm table-cell"
                              )}
                            >
                              <span className="flex items-center">
                                {swap && <StatusIcon swap={swap} />}
                              </span>
                            </td>
                            <td
                              className={classNames(
                                index === 0 ? "" : "border-t border-[#404040]",
                                "px-3 py-3.5 text-sm table-cell"
                              )}
                            >
                              <div
                                className="flex justify-between items-center cursor-pointer"
                                onClick={(e) => {
                                  handleopenSwapDetails(swap);
                                  e.preventDefault();
                                }}
                              >
                                <div className="">
                                  {swap?.status == "completed" ? (
                                    <span className="ml-1 md:ml-0">
                                      {output_transaction
                                        ? truncateDecimals(
                                          output_transaction?.amount,
                                          sourceAsset?.precision
                                        )
                                        : "-"}
                                    </span>
                                  ) : (
                                    <span>
                                      {truncateDecimals(
                                        swap.requested_amount,
                                        sourceAsset?.precision ?? 5
                                      )}
                                    </span>
                                  )}
                                  <span className="ml-1">
                                    {swap.source_asset}
                                  </span>
                                </div>
                                <ChevronRight className="h-5 w-5" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className=" text-sm flex justify-center">
                {!isLastPage && (
                  <button
                    disabled={isLastPage || loading}
                    type="button"
                    onClick={handleLoadMore}
                    className="group disabled:text-muted-4 mb-2 text-muted relative flex justify-center py-3 px-4 border-0 font-semibold rounded-md focus:outline-none transform hover:-translate-y-0.5 transition duration-200 ease-in-out"
                  >
                    <span className="flex items-center mr-2">
                      {!isLastPage && !loading && (
                        <RefreshCcw className="h-5 w-5" />
                      )}
                      {loading ? (
                        <SpinIcon className="animate-spin h-5 w-5" />
                      ) : null}
                    </span>
                    <span>Load more</span>
                  </button>
                )}
              </div>
              <Modal
                height="fit"
                show={openSwapDetailsModal}
                setShow={setOpenSwapDetailsModal}
                header="Swap details"
              >
                <div className="mt-2">
                  {selectedSwap && <SwapDetails swap={selectedSwap} />}
                  {selectedSwap && (
                    <div className=" text-sm mt-6 space-y-3">
                      <div className="flex flex-row  text-base space-x-2">
                        <SubmitButton
                          text_align="center"
                          onClick={() =>
                            router.push({
                              pathname: selectedSwap?.use_teleporter ? `/swap/teleporter/${selectedSwap.id}` : `/swap/${selectedSwap.id}`,
                              query: resolvePersistantQueryParams(router.query),
                            })
                          }
                          isDisabled={false}
                          isSubmitting={false}
                          icon={<Eye className="h-5 w-5" />}
                        >
                          View swap
                        </SubmitButton>
                      </div>
                    </div>
                  )}
                </div>
              </Modal>
            </div>
          ) : (
            <div className="absolute top-1/4 right-0 text-center w-full">
              <Scroll className="h-40 w-40 text-muted-3 mx-auto" />
              <p className="my-2 text-xl">It&apos;s empty here</p>
              <p className="px-14 ">
                You can find all your transactions by searching with address in
              </p>
              <Link
                target="_blank"
                href={AppSettings.ExplorerURl}
                className="underline hover:no-underline cursor-pointer font-light"
              >
                <span>Bridge Explorer</span>
              </Link>
            </div>
          )}
        </>
      )}
      <div id="widget_root" />
    </div>
  );
}

export default TransactionsHistory;
