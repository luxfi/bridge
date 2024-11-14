'use client'
import { useCallback, useRef, useState } from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams, useRouter } from 'next/navigation'
import useAsyncEffect from 'use-async-effect'
import axios from 'axios'

import { ArrowRight, ChevronRight, Eye, RefreshCcw, Scroll } from 'lucide-react'

import BridgeApiClient, {
  type SwapItem,
  SwapStatusInNumbers,
  TransactionType,
} from '@/lib/BridgeApiClient'
import SpinIcon from '../icons/spinIcon'
import SwapDetails from './SwapDetailsComponent'
import SubmitButton from '../buttons/submitButton'
import StatusIcon from './StatusIcons'
import toast from 'react-hot-toast'
import ToggleButton from '../buttons/toggleButton'
import Modal from '../modal/modal'
import AppSettings from '@/lib/AppSettings'
import HeaderWithMenu from '../HeaderWithMenu'
import { classNames } from '../utils/classNames'
import { SwapHistoryComponentSkeleton } from '../Skeletons'
import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import { truncateDecimals } from '../utils/RoundDecimals'
//networks
import fireblockNetworksMainnet from '@/components/lux/fireblocks/constants/networks.mainnets'
import fireblockNetworksTestnet from '@/components/lux/fireblocks/constants/networks.sandbox'
import { networks as teleportNetworksMainnet } from '@/components/lux/teleport/constants/networks.mainnets'
import { networks as teleportNetworksTestnet } from '@/components/lux/teleport/constants/networks.sandbox'

function TransactionsHistory() {
  const isMainnet = process.env.NEXT_PUBLIC_API_VERSION === 'mainnet'
  const networksFireblock = isMainnet
    ? [
        ...fireblockNetworksMainnet.sourceNetworks,
        ...fireblockNetworksMainnet.destinationNetworks,
      ]
    : [
        ...fireblockNetworksTestnet.sourceNetworks,
        ...fireblockNetworksTestnet.destinationNetworks,
      ]
  const networksTeleport = isMainnet
    ? teleportNetworksMainnet
    : teleportNetworksTestnet

  const [page, setPage] = useState(0)
  const [isLastPage, setIsLastPage] = useState(false)
  const [swaps, setSwaps] = useState<SwapItem[]>()
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [selectedSwap, setSelectedSwap] = useState<SwapItem | undefined>()
  const [openSwapDetailsModal, setOpenSwapDetailsModal] = useState(false)
  const [showAllSwaps, setShowAllSwaps] = useState(false)
  const [showToggleButton, setShowToggleButton] = useState(false)

  const PAGE_SIZE = 20

  const searchParams = useSearchParams()
  const canGoBackRef = useRef<boolean>(false)
  const paramString = resolvePersistentQueryParams(searchParams).toString()

  const goBack = useCallback(() => {
    canGoBackRef.current = !!(
      window.history?.length && window.history.length > 1
    )
    if (canGoBackRef.current) {
      router.back()
    } else {
      router.push('/' + (paramString ? '?' + paramString : ''))
    }
  }, [paramString])

  const getSwaps = async (page: number, status?: string | number) => {
    try {
      const {
        data: { data },
      } = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?page=${page}${
          status ? `&status=${status}` : ''
        }&version=${BridgeApiClient.apiVersion}`
      )
      return {
        data: data,
        error: null,
      }
    } catch (err: any) {
      return {
        data: null,
        error: `Could not get swaps: ${err.message ?? 'unknown'}`,
      }
    }
  }

  useAsyncEffect(async () => {
    const { data, error } = await getSwaps(1, SwapStatusInNumbers.Cancelled)
    if (Number(data?.length) > 0) setShowToggleButton(true)
  }, [])

  useAsyncEffect(async () => {
    setIsLastPage(false)
    setLoading(true)

    if (showAllSwaps) {
      const { data, error } = await getSwaps(1)

      if (error) {
        toast.error(error)
        setLoading(false)
        return
      }

      setSwaps(data)
      setPage(1)
      if (Number(data?.length) < PAGE_SIZE) {
        setIsLastPage(true)
      }

      setLoading(false)
    } else {
      const { data, error } = await getSwaps(
        1,
        SwapStatusInNumbers.SwapsWithoutCancelledAndExpired
      )

      if (error) {
        toast.error(error)
        setLoading(false)
        return
      }

      setSwaps(data)
      setPage(1)
      if (Number(data?.length) < PAGE_SIZE) {
        setIsLastPage(true)
      }
      setLoading(false)
    }
  }, [paramString, showAllSwaps])

  const handleLoadMore = useCallback(async () => {
    //TODO refactor page change
    const nextPage = page + 1
    setLoading(true)

    if (showAllSwaps) {
      const { data, error } = await getSwaps(nextPage)

      if (error) {
        setLoading(false)
        toast.error(error)
        return
      }

      setSwaps((old) => [...(old ? old : []), ...(data ? data : [])])
      setPage(nextPage)
      if (Number(data?.length) < PAGE_SIZE) {
        setIsLastPage(true)
      }

      setLoading(false)
    } else {
      const { data, error } = await getSwaps(
        nextPage,
        SwapStatusInNumbers.SwapsWithoutCancelledAndExpired
      )

      if (error) {
        toast.error(error)
        setLoading(false)
        return
      }

      setSwaps((old) => [...(old ? old : []), ...(data ? data : [])])
      setPage(nextPage)
      if (Number(data?.length) < PAGE_SIZE) {
        setIsLastPage(true)
      }

      setLoading(false)
    }
  }, [page, setSwaps])

  const handleopenSwapDetails = (swap: SwapItem) => {
    setSelectedSwap(swap)
    setOpenSwapDetailsModal(true)
  }

  const handleToggleChange = (value: boolean) => {
    setShowAllSwaps(value)
  }

  return (
    <div className="bg-background border border-[#404040] rounded-lg mb-6 w-full text-muted overflow-hidden relative min-h-[620px] max-w-lg">
      <HeaderWithMenu goBack={goBack} />
      {page == 0 && loading ? (
        <SwapHistoryComponentSkeleton />
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
                        const networks = swap.use_teleporter
                          ? networksTeleport
                          : networksFireblock
                        const sourceNetwork = networks.find(
                          (n) => n.internal_name === swap.source_network
                        )
                        const destinationNetwork = networks.find(
                          (n) => n.internal_name === swap.destination_network
                        )

                        const sourceAsset = sourceNetwork?.currencies.find(
                          (c) => c.asset === swap.source_asset
                        )
                        const destinationAsset =
                          destinationNetwork?.currencies.find(
                            (c) => c.asset === swap.destination_asset
                          )
                        const output_transaction = swap.transactions.find(
                          (t) => t.type === TransactionType.Output
                        )

                        return (
                          <tr
                            onClick={() => handleopenSwapDetails(swap)}
                            key={swap.id}
                          >
                            <td
                              className={classNames(
                                index === 0 ? '' : 'border-t border-[#404040]',
                                'relative text-sm  table-cell'
                              )}
                            >
                              <div className=" flex items-center">
                                <div className="flex-shrink-0 h-6 w-6 relative block">
                                  {sourceAsset?.logo && (
                                    <Image
                                      // src={resolveNetworkImage(swap.source_asset)}
                                      src={sourceAsset.logo}
                                      alt="From Logo"
                                      height="60"
                                      width="60"
                                      className="rounded-full object-contain"
                                    />
                                  )}
                                </div>
                                <ArrowRight className="h-4 w-4 mx-2" />
                                <div className="flex-shrink-0 h-6 w-6 relative block">
                                  {destinationAsset?.logo && (
                                    <Image
                                      // src={resolveNetworkImage(swap.destination_asset)}
                                      src={destinationAsset.logo}
                                      alt="To Logo"
                                      height="70"
                                      width="70"
                                      className="rounded-full border border-[#f3f3f32d] object-contain"
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
                                index === 0 ? '' : 'border-t border-[#404040]',
                                'relative text-sm table-cell'
                              )}
                            >
                              <span className="flex items-center">
                                {swap && <StatusIcon swap={swap} />}
                              </span>
                            </td>
                            <td
                              className={classNames(
                                index === 0 ? '' : 'border-t border-[#404040]',
                                'px-3 py-3.5 text-sm table-cell'
                              )}
                            >
                              <div
                                className="flex justify-between items-center cursor-pointer"
                                onClick={(e) => {
                                  handleopenSwapDetails(swap)
                                  e.preventDefault()
                                }}
                              >
                                <div className="">
                                  {swap?.status == 'completed' ? (
                                    <span className="ml-1 md:ml-0">
                                      {output_transaction
                                        ? truncateDecimals(
                                            output_transaction?.amount,
                                            5
                                          )
                                        : '-'}
                                    </span>
                                  ) : (
                                    <span>
                                      {truncateDecimals(
                                        swap.requested_amount,
                                        5
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
                        )
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
                          onClick={() => {
                            router.push(
                              (selectedSwap?.use_teleporter
                                ? `/swap/teleporter/${selectedSwap.id}`
                                : `/swap/${selectedSwap.id}`) + paramString
                            )
                          }}
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
      <div id="modal_portal_root" />
    </div>
  )
}

export default TransactionsHistory
