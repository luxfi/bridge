import { type PropsWithChildren } from 'react'

const CardContainer: React.FC<PropsWithChildren> = ({children, ...rest}) =>  (
  <div {...rest}>
    <div className='bg-background border border-[#404040] rounded-lg w-full mt-10 overflow-hidden'>
      <div className='relative overflow-hidden h-1 flex rounded-t-lg bg-level-3' />
      <div className='p-2'>
          {children}
      </div>
    </div>
  </div>
)

export default CardContainer
