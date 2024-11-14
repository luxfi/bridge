import { SwapStatus } from "../../models/SwapStatus";

export function StatusIcon({ swap, className}: { swap: string | undefined , className?: string}) {
  switch (swap) {
    case SwapStatus.Failed:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <RedIcon />
          <p>Failed</p>
        </div>
      )
    case SwapStatus.Completed:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <GreenIcon />
          <p>Completed</p>
        </div>
      )
    case SwapStatus.Cancelled:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <GreyIcon />
          <p>Cancelled</p>
        </div>
      )
    case SwapStatus.UserTransferPending:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <YellowIcon />
          <p>Deposite pending</p>
        </div>
      )
    case SwapStatus.UserTransferDelayed:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <YellowIcon />
          <p>Delayed</p>
        </div>
      )
    case SwapStatus.BridgeTransferPending:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <YellowIcon />
          <p>Pending</p>
        </div>
      )
    case SwapStatus.Expired:
      return (
        <div className={"inline-flex items-center " + className ?? ''} >
          <GreyIcon />
          <p>Expired</p>
        </div>
      )
  }
}

export const RedIcon = () => {
  return (
    <svg className="w-2 h-2 rounded-sm mr-1">
      <rect fill="#E43636" width="100%" height="100%"></rect>
    </svg>
  )
}

export const GreenIcon = () => {
  return (
    <svg className="w-2 h-2 mr-1 rounded-sm">
      <rect fill="#55B585" className="rounded-full" width="100%" height="100%"></rect>
    </svg>
  )
}

export const YellowIcon = () => {
  return (
    <svg className="w-2 h-2 rounded-sm mr-1">
      <rect fill="#facc15" width="100%" height="100%"></rect>
    </svg>
  )
}

export const GreyIcon = () => {
  return (
    <svg className="w-2 h-2 rounded-sm mr-1">
      <rect fill="#808080" width="100%" height="100%"></rect>
    </svg>
  )
}

export const PurpleIcon = () => {
  return (
    <svg className="w-2 h-2 rounded-sm mr-1">
      <rect fill="#A020F0" width="100%" height="100%"></rect>
    </svg>
  )
}