'use client'
import { useCallback, useRef, useState } from 'react'

import Link from 'next/link'
import Image from 'next/image'
import axios from 'axios'
import useAsyncEffect from 'use-async-effect'
import { useNotify } from '@/context/toast-provider'
import { classNames } from '../utils/classNames'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ArrowRight, ChevronRight, Eye, RefreshCcw, Scroll } from 'lucide-react'

import BridgeRPCClient, { type SwapItem, SwapStatusInNumbers, TransactionType } from '@/lib/BridgeRPCClient'
import Modal from '@/components/modal/modal'
import SpinIcon from '@/components/icons/spinIcon'
import StatusIcon from '@/components/SwapHistory/StatusIcons'
import AppSettings from '@/lib/AppSettings'
import SwapDetails from '@/components/SwapHistory/SwapDetailsComponent'
import SubmitButton from '@/components/buttons/submitButton'
import ToggleButton from '@/components/buttons/toggleButton'
import HeaderWithMenu from '@/components/HeaderWithMenu'
import resolvePersistentQueryParams from '@/util/resolvePersistentQueryParams'
import { SwapHistoryComponentSkeleton } from '@/components/Skeletons'
// types
import type { CryptoNetwork, NetworkCurrency } from '@/Models/CryptoNetwork'
//networks
import { formatLongNumber } from '@/lib/utils'
import { useSettings } from '@/context/settings'
import { useAtom } from 'jotai'
import { useTelepoterAtom } from '@/store/teleport'

function TransactionsHistory() {
  const { networks } = useSettings()
  const [page, setPage] = useState(1)
  const [isLastPage, setIsLastPage] = useState(false)
  const [swaps, setSwaps] = useState<SwapItem[]>()
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [selectedSwap, setSelectedSwap] = useState<SwapItem | undefined>()
  const [openSwapDetailsModal, setOpenSwapDetailsModal] = useState(false)
  const [showAllSwaps, setShowAllSwaps] = useState(false)
  const [showToggleButton, setShowToggleButton] = useState(false)

  const PAGE_SIZE = 20

  const { notify } = useNotify()
  const searchParams = useSearchParams()
  const canGoBackRef = useRef<boolean>(false)
  const paramString = resolvePersistentQueryParams(searchParams).toString()
  const [useTeleporter, setUseTeleporter] = useAtom(useTelepoterAtom)

  const goBack = useCallback(() => {
    canGoBackRef.current = !!(window.history?.length && window.history.length > 1)
    if (canGoBackRef.current) {
      router.back()
    } else {
      router.push('/' + (paramString ? '?' + paramString : ''))
    }
  }, [paramString])

  const getSwaps = async (page?: number, status?: string | number) => {
    try {
      const {
        data: { data },
      } = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_API}/api/swaps?${!showAllSwaps ? `page=${page}` : ''}${
          status ? `&status=${status}` : ''
        }&version=${BridgeRPCClient.apiVersion}&teleport=${useTeleporter}&pageSize=${PAGE_SIZE}`
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

  const fetchInitialSwaps = async () => {
    const { data, error } = await getSwaps(1, SwapStatusInNumbers.SwapsWithoutCancelledAndExpired)
    if (error) {
      notify(error, 'error')
      throw ''
    }
    setSwaps(data)
    setPage(1)
    if (Number(data?.length) < PAGE_SIZE) {
      setIsLastPage(true)
    } else {
      setIsLastPage(false)
    }
  }

  const fetchAllSwaps = async () => {
    const { data, error } = await getSwaps()
    if (error) {
      notify(error, 'error')
      throw ''
    }

    setSwaps(data)
    setPage(1)
    setIsLastPage(true)
  }

  useAsyncEffect(async () => {
    try {
      setLoading(true)
      if (!showAllSwaps) {
        await fetchInitialSwaps()
      } else {
        await fetchAllSwaps()
      }
    } catch (err) {
      //
    } finally {
      setLoading(false)
    }
  }, [showAllSwaps])

  useAsyncEffect(async () => {
    if (showAllSwaps) {
      setShowAllSwaps(false)
    } else {
      setLoading(true)
      await fetchInitialSwaps()
      setLoading(false)
    }
  }, [useTeleporter])

  const handleLoadMore = async () => {
    if (showAllSwaps) return
    try {
      setLoading(true)
      const nextPage = page + 1
      const { data, error } = await getSwaps(nextPage, SwapStatusInNumbers.SwapsWithoutCancelledAndExpired)

      if (error) {
        notify(error, 'error')
        throw ''
      }

      setSwaps((old) => [...(old ? old : []), ...(data ? data : [])])
      setPage(nextPage)
      if (Number(data?.length) < PAGE_SIZE) {
        setIsLastPage(true)
      }
    } catch (err) {
      //
    } finally {
      setLoading(false)
    }
  }

  const handleopenSwapDetails = (swap: SwapItem) => {
    setSelectedSwap(swap)
    setOpenSwapDetailsModal(true)
  }

  const handleToggleChange = (value: boolean) => {
    setShowAllSwaps(value)
  }

  const handleBridgeTypeChange = (value: boolean) => {
    setUseTeleporter(value)
  }

  return (
    <div className="min-w-[250px] sm:min-w-[480px] bg-background border border-[#404040] rounded-lg mb-6 w-full text-muted overflow-hidden relative min-h-[620px] max-w-lg">
      <HeaderWithMenu goBack={goBack} />
      <div className="flex justify-between px-6 pt-5">
        <div className="flex justify-end mb-2">
          <div className="flex space-x-2">
            <ToggleButton value={useTeleporter} onChange={handleBridgeTypeChange} name="Teleport" />
            <p className="flex items-center text-xs md:text-sm font-medium">Teleport</p>
          </div>
        </div>
        {showToggleButton && Number(swaps?.length) > 0 && (
          <div className="flex justify-end mb-2">
            <div className="flex space-x-2">
              <p className="flex items-center text-xs md:text-sm font-medium">Show all swaps</p>
              <ToggleButton onChange={handleToggleChange} value={showAllSwaps} />
            </div>
          </div>
        )}
      </div>
      {page == 0 && loading ? (
        <SwapHistoryComponentSkeleton />
      ) : Number(swaps?.length) > 0 ? (
        <div className="w-full flex flex-col justify-between h-full px-6 space-y-5">
          <div>
            <div className="max-h-[450px] styled-scroll overflow-y-auto ">
              <table className="w-full divide-y divide-[#404040]">
                <thead className="text-foreground">
                  <tr>
                    <th scope="col" className="text-left text-sm font-semibold">
                      <div className="block">Swap details</div>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold  ">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold  ">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {swaps?.map((swap, index) => {
                    const sourceNetwork = networks.find((n: CryptoNetwork) => n.internal_name === swap.source_network)
                    const destinationNetwork = networks.find((n: CryptoNetwork) => n.internal_name === swap.destination_network)

                    const output_transaction = swap.transactions.find((t) => t.type === TransactionType.Output)

                    return (
                      <tr onClick={() => handleopenSwapDetails(swap)} key={swap.id}>
                        <td className={classNames(index === 0 ? '' : 'border-t border-[#404040]', 'relative text-sm  table-cell')}>
                          <div className=" flex items-center">
                            <div className="flex-shrink-0 h-6 w-6 relative block">
                              {sourceNetwork?.logo && (
                                <Image src={sourceNetwork.logo} alt="From Logo" height="60" width="60" className="rounded-full object-contain" />
                              )}
                            </div>
                            <ArrowRight className="h-4 w-4 mx-2" />
                            <div className="flex-shrink-0 h-6 w-6 relative block">
                              {destinationNetwork?.logo && (
                                <Image
                                  // src={resolveNetworkImage(swap.destination_asset)}
                                  src={destinationNetwork.logo}
                                  alt="To Logo"
                                  height="70"
                                  width="70"
                                  className="rounded-full border border-[#f3f3f32d] object-contain"
                                />
                              )}
                            </div>
                          </div>
                          {index !== 0 ? <div className="absolute right-0 left-6 -top-px h-px bg-level-1" /> : null}
                        </td>
                        <td className={classNames(index === 0 ? '' : 'border-t border-[#404040]', 'relative text-sm table-cell')}>
                          <span className="flex items-center">{swap && <StatusIcon swap={swap} />}</span>
                        </td>
                        <td className={classNames(index === 0 ? '' : 'border-t border-[#404040]', 'px-3 py-3.5 text-sm table-cell')}>
                          <div
                            className="flex justify-between items-center cursor-pointer"
                            onClick={(e) => {
                              handleopenSwapDetails(swap)
                              e.preventDefault()
                            }}
                          >
                            <div className="">
                              {swap?.status == 'completed' ? (
                                <span className="ml-1 md:ml-0">{output_transaction ? formatLongNumber(output_transaction?.amount) : '-'}</span>
                              ) : (
                                <span>{formatLongNumber(swap.requested_amount)}</span>
                              )}
                              <span className="ml-1">{swap.source_asset}</span>
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
                  {!isLastPage && !loading && <RefreshCcw className="h-5 w-5" />}
                  {loading ? <SpinIcon className="animate-spin h-5 w-5" /> : null}
                </span>
                <span>Load more</span>
              </button>
            )}
          </div>
          <Modal height="fit" show={openSwapDetailsModal} setShow={setOpenSwapDetailsModal} header="Swap details">
            <div className="mt-2">
              {selectedSwap && <SwapDetails swap={selectedSwap} />}
              {selectedSwap && (
                <div className=" text-sm mt-6 space-y-3">
                  <div className="flex flex-row  text-base space-x-2">
                    <SubmitButton
                      text_align="center"
                      onClick={() => {
                        router.push(selectedSwap?.use_teleporter ? `/swap/teleporter/${selectedSwap.id}` : `/swap/v2/${selectedSwap.id}`)
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
        <div className="absolute top-1/4 right-0 text-center">
          <Scroll className="h-40 w-40 text-muted-3 mx-auto" />
          <p className="my-2 text-xl">It&apos;s empty here</p>
          <p className="px-14 ">You can find all your transactions by searching with address in</p>
          <Link target="_blank" href={AppSettings.ExplorerURl} className="underline hover:no-underline cursor-pointer font-light">
            <span>Bridge Explorer</span>
          </Link>
        </div>
      )}
      <div id="modal_portal_root" />
    </div>
  )
}

export default TransactionsHistory
