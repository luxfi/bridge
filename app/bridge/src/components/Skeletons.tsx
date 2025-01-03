import { ChevronRight, Clock } from "lucide-react"
import BackgroundField from "./backgroundField"
import { classNames } from "./utils/classNames"

export const SwapHistoryComponentSkeleton = () => {

  return <div className="animate-pulse">
    <div className=" mb-10 ">
      <div className="-mx-4 mt-10 sm:-mx-6 md:mx-0 md:rounded-lg ">
        <table className="min-w-full divide-y divide-muted-3">
          <thead>
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-500 sm:pl-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="hidden lg:block">
                    <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                  </div>
                </div>
              </th>
              <th
                scope="col"
                className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-500 lg:table-cell"
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>
              <th
                scope="col"
                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-500 "
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>
              <th
                scope="col"
                className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-500 lg:table-cell"
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>
              <th
                scope="col"
                className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-500 lg:table-cell"
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>

              <th
                scope="col"
                className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-500 lg:table-cell"
              >
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>
              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                </div>
              </th>
              <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">

              </th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)]?.map((item, index) => (
              <tr key={index}>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'relative py-4 pl-4 sm:pl-6 pr-3 text-sm'
                  )}
                >
                  <div className=" hidden lg:block">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                    </div>
                  </div>
                  {index !== 0 ? <div className="absolute right-0 left-6 -top-px h-px bg-level-1" /> : null}
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'hidden px-3 py-3.5 text-sm  lg:table-cell'
                  )}
                >
                  <div className="flex space-x-2">
                    <div className="rounded-full bg-level-3 h-4 w-4"></div>
                    <div className="grid grid-cols-4 items-center">
                      <div className="h-2 w-16 bg-level-3 rounded col-span-3"></div>
                    </div>
                  </div>

                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'px-3 py-3.5 text-sm  table-cell'
                  )}
                >
                  <div className="flex space-x-2">
                    <div className="rounded-full bg-level-3 h-4 w-4"></div>
                    <div className="grid grid-cols-4 items-center">
                      <div className="h-2 w-16 bg-level-3 rounded col-span-3"></div>
                    </div>
                  </div>
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'hidden px-3 py-3.5 text-sm  lg:table-cell'
                  )}
                >
                  <div className="grid grid-cols-1 gap-4">
                    <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                  </div>
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'relative px-3 py-3.5 text-sm '
                  )}
                >
                  <div className="grid grid-cols-1 gap-4">
                    <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                  </div>
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'px-3 py-3.5 text-sm  hidden lg:table-cell'
                  )}
                >
                  <div className="flex space-x-2">
                    <div className="rounded bg-level-3 h-2 w-2"></div>
                    <div className="grid grid-cols-1 items-center">
                      <div className="h-2 w-16 bg-level-3 rounded col-span-1"></div>
                    </div>
                  </div>
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'px-3 py-3.5 text-sm   hidden lg:table-cell'
                  )}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-2 w-12 bg-level-3 rounded col-span-1"></div>
                    <div className="h-2 w-8 bg-level-3 rounded col-span-1"></div>
                  </div>
                </td>
                <td
                  className={classNames(
                    index === 0 ? '' : 'border-t border-muted-3',
                    'px-3 py-3.5 text-sm   hidden lg:table-cell'
                  )}
                >
                  <div className="grid grid-cols-1 gap-4">
                    <ChevronRight className="h-5 w-5 text-slate-700" />
                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>

}

export const SwapDetailsComponentSkeleton = () => {
  return <div className="animate-pulse"><div className="w-full grid grid-flow-row">
    <div className="rounded-md w-full grid grid-flow-row">
      <div className="items-center block text-base font-lighter leading-6 ">
        <div className="flex justify-between items-baseline">
          <div className="h-2 m-2 w-1/4 bg-slate-400 rounded col-span-1"></div>
          <div className="h-2 m-2 w-1/4 bg-level-3 rounded col-span-1"></div>
        </div>
        {[...Array(8)]?.map((item, index) => (
          <div key={index}>
            <hr className='horizontal-gradient my-1' />
            <div className="flex justify-between items-baseline">
              <div className="h-2.5 m-2 w-1/4 bg-level-3 rounded-full col-span-1"></div>
              <div className="h-2 m-2 w-1/4 bg-level-3 rounded col-span-1"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
  </div>
}

export const DocInFrameSkeleton = () => {
  return <div className="shadow rounded-md w-full mx-auto px-2 md:px-4">
    <div className="animate-pulse flex space-x-4">
      <div className="flex-1 items-center space-y-6 py-1 content-start">
        <div className="h-4 mx-auto w-1/2 place-self-center justify-self-center self-center bg-level-3 rounded mb-4"></div>
        <div className="space-y-6">
          {[...Array(8)]?.map((item, index) =>
            <div className="space-y-4"
              key={index}
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="h-2 bg-level-3 rounded col-span-2"></div>
                <div className="h-2 bg-level-3 rounded col-span-1"></div>
              </div>
              <div className="h-2 bg-level-3 rounded"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
}

export const ExchangesComponentSkeleton = () => {

  return <>
    {[...Array(12)]?.map((item, index) =>
      <div
        key={index}
        className="animate-pulse bg-level-1 select-none rounded-lg py-5 px-3">
        <div className="flex justify-between space-x-4 md:space-x-16 px-3">
          <div className="flex space-x-2">
            <div className="rounded-md bg-level-3 h-8 w-8"></div>
            <div className="grid grid-cols-5">
              <div className="h-2 w-20 bg-level-3 rounded col-span-3"></div>
            </div>
          </div>

          <div className="rounded bg-level-3 h-8 w-20 place-self-end py-3 px-4"></div>
        </div>
      </div>
    )}
  </>

}

export const RewardsComponentSkeleton = () => {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex justify-start">
          <div className="rounded-md w-48 bg-gray-500 h-[28px] animate-pulse" />
        </div>
        <div className=" bg-level-1 divide-y divide-muted-3 rounded-lg shadow-lg border transition duration-200">
          <BackgroundField header={<span className="flex justify-between"><span>Pending Earnings</span><span>Next Airdrop</span></span>} withoutBorder>
            <div className="flex justify-between w-full text-2xl">
              <div className="flex items-center space-x-1">
                <div className="w-32 h-6 rounded-md animate-pulse bg-gray-500" />
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-5" />
                <div className="w-14 h-6 rounded-md animate-pulse bg-gray-500" />
              </div>
            </div>
          </BackgroundField>
          <BackgroundField header={<span className="flex justify-between"><span>Total Earnings</span><span>Current Value</span></span>} withoutBorder>
            <div className="flex justify-between w-full text-slate-300 text-2xl">
              <div className="flex items-center space-x-1">
                <div className="w-40 h-6 rounded-md animate-pulse bg-gray-500" />
              </div>
              <div className="w-20 h-6 rounded-md animate-pulse bg-gray-500" />
            </div>
          </BackgroundField>
        </div>
        <div className="bg-level-1 rounded-lg shadow-lg border transition duration-200">
          <BackgroundField header='Daily Reward Claimed' withoutBorder>
            <div className="flex flex-col w-full gap-2">
              <div className="rounded-full h-4 bg-gray-500 w-full animate-pulse" />
              <div className="flex justify-between w-full font-semibold text-sm ">
                <div className="rounded-md w-20 h-5 animate-pulse bg-gray-500" />
                <div className="rounded-md w-32 h-5 animate-pulse bg-gray-500" />
              </div>
            </div>
          </BackgroundField>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-start">
          <div className="rounded-md w-48 bg-gray-500 h-5 animate-pulse" />
        </div>
        <div className=" bg-level-1 rounded-lg shadow-lg border  transition duration-200">
          <div className="p-3">
            <div className="space-y-6">
              {[...Array(4)]?.map((user, index) => (
                <div key={index} className="items-center flex justify-between">
                  <div className="w-full h-4 rounded-md bg-gray-500 animate-pulse" />
                </div>
              ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const RewardsComponentLeaderboardSkeleton = () => (
  <div className="space-y-2">
    <div className="flex justify-start">
      <div className="rounded-md w-48 bg-gray-500 h-5 animate-pulse" />
    </div>
    <div className=" transition duration-200 rounded-lg">
      <div className="p-3">
        <div className="space-y-6">
          {[...Array(4)]?.map((user, index) => (
            <div key={index} className="items-center flex justify-between">
              <div className="w-full h-4 rounded-md bg-gray-500 animate-pulse" />
            </div>
          ))
          }
        </div>
      </div>
    </div>
  </div>
)
