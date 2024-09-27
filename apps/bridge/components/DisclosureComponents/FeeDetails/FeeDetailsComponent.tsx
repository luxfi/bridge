import { PropsWithChildren, ReactNode } from "react"

const FeeDetails = ({ children }: PropsWithChildren) => (
  <div className="flex flex-col divide-y-2 divide-level-2 rounded-lg bg-level-1 overflow-hidden text-sm">
      {children}
  </div>
)

const Item: React.FC<{
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  icon?: JSX.Element;
} & PropsWithChildren> = ({ 
  children, 
  icon 
}) => (
  <div className='gap-4 flex relative items-center outline-none w-full  px-4 py-3'>
  {icon && (
    <div>{icon}</div>
  )}
    {children}
  </div>
)

FeeDetails.Item = Item

export default FeeDetails
