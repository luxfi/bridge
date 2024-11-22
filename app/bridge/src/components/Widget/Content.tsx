import type { PropsWithChildren } from 'react'

const Content: React.FC<{
    center?: boolean,
} & PropsWithChildren> = ({ 
  children, 
  center 
}) => (
  center ? (
    <div className='flex flex-col justify-center items-center grow w-full'>
        {children}
    </div>
  ) : (
    <div className='space-y-9 py-3'>{children}</div>
  )
)

export default Content