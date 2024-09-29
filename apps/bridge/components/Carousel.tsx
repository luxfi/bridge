'use client'
import React, { 
  PropsWithChildren,
  forwardRef, 
  useCallback, 
  useImperativeHandle, 
  useState 
} from 'react'
import { useSwipeable } from 'react-swipeable'


const CarouselItem: React.FC<{
  width: number
} & PropsWithChildren> = ({ 
  children, 
  width 
}) => (
  <div 
    className={'rounded-xl inline-flex items-center justify-center flex-col pb-0 ' + 
      'bg-gradient-to-b from-background to-level-1 h-full'
    } 
    style={{ width: width }}
  >
     {children}
  </div>
)


export type CarouselRef = {
    next: () => void
    prev: () => void
    goToLast: () => void
    goToFirst: () => void
}

const Carousel = forwardRef<CarouselRef, {
  starAtLast: boolean
  onLast: (value: boolean) => void
  onFirst: (value: boolean) => void
} & PropsWithChildren>(({ 
  onFirst, 
  onLast, 
  children, 
  starAtLast 
}, ref) => {

  const [activeIndex, setActiveIndex] = useState(starAtLast ? React.Children.count(children) - 1 : 0)

  const updateIndex = useCallback((newIndex) => {
      onFirst(false)
      onLast(false)
      if (newIndex >= 0 && newIndex <= React.Children.count(children) - 1) {
          setActiveIndex(newIndex)
      }
      if (newIndex >= React.Children.count(children) - 1)
          onLast(true)
      if (newIndex == 0)
          onFirst(true)
  }, [children, onFirst, onLast])

  useImperativeHandle(ref, () => ({
      next: () => {
          updateIndex(activeIndex + 1)
      },
      prev: () => {
          updateIndex(activeIndex - 1)
      },
      goToLast: () => {
          updateIndex(React.Children.count(children) - 1)
      },
      goToFirst: () => {
          updateIndex(0)
      }
  }), [activeIndex, children, updateIndex])

  const handlers = useSwipeable({
      onSwipedLeft: () => updateIndex(activeIndex + 1),
      onSwipedRight: () => updateIndex(activeIndex - 1),
  })

  return (
    <div {...handlers} className='overflow-hidden h-full' >
      <div
        className='whitespace-nowrap transition-transform duration-500 inner h-full'
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {children && React.Children.map(children, (child, index) => (
            React.cloneElement(child as any, { width: '100%' })
        ))}
      </div>
    </div>
  )
})

export {
  Carousel as default,
  CarouselItem
}
