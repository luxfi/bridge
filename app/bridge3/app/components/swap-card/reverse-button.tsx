
import { ChevronsLeftRight } from 'lucide-react'

import { Button } from '@hanzo/ui/primitives-common'
import { cn } from '@hanzo/ui/util'

const ReverseButton: React.FC<{
  onClick: () => void
  className?: string
  style?: React.CSSProperties
}> = ({
  onClick,
  className='',
  style={}
}) => (
  <Button 
    variant='outline'
    size='sm'
    className={cn(className)}
    onClick={onClick}
    style={style}
  >
    <ChevronsLeftRight className='w-4 h-4'/>
  </Button>
)

export default ReverseButton
