import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode } from 'lucide-react'
import { motion } from 'framer-motion'

import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger,
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@hanzo/ui/primitives'

import { classNames } from './utils/classNames'

type QRCodeModalProps = {
    qrUrl: string
    className?: string
    iconSize?: number
    iconClassName?: string
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ qrUrl, className, iconSize, iconClassName }) => {
  const qrCode =
    <QRCodeSVG
        className='rounded-lg'
        value={qrUrl}
        includeMargin={true}
        size={160}
        level={'H'}
    />

  return (
    <Popover>
        <PopoverTrigger>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={classNames(className)}>
                        <div className='flex items-center gap-1 cursor-pointer'>
                            <QrCode className={iconClassName} width={iconSize ? iconSize : 16} height={iconSize ? iconSize : 16} />
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Show QR code</p>
                </TooltipContent>
            </Tooltip>
        </PopoverTrigger>
        <PopoverContent className='w-full border-[#404040] bg-[#000000] p-4' side='left'>
            <motion.div whileHover={{
                scale: 1.2,
                transition: { duration: 0.5 },
            }}>
                {qrCode}
            </motion.div>
        </PopoverContent>
    </Popover>
  )
}


export default QRCodeModal