'use client'
import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { clearTempData, getTempData } from '@/lib/openLink'

const Salon: React.FC = () => {
  
  const router = useRouter()

  useEffect(() => {
    const temp_data = getTempData()
    if (!temp_data) return
    if (temp_data.swap_id) {
      clearTempData()
      const params = new URLSearchParams((temp_data?.query ?? {}))
      params.set('coinbase_redirect', 'true')
      router.push(`/swap/${temp_data.swap_id}${params.size ? `?${params.toString()}` : ''}`)
    } 
    else {
      const params = new URLSearchParams((temp_data?.query ?? {}))
      params.set('coinbase_redirect', 'true')
      router.push(`/${params.size ? `?${params.toString()}` : ''}`)
    }
  }, [])

  return (
    <div className='h-full min-h-screen flex flex-col justify-center  text-md font-lighter leading-6'>
      <div className='flex place-content-center mb-4'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='140'
          height='140'
          viewBox='0 0 116 116'
          fill='none'
        >
          <circle cx='58' cy='58' r='58' fill='#55B585' fillOpacity='0.1' />
          <circle cx='58' cy='58' r='45' fill='#55B585' fillOpacity='0.3' />
          <circle cx='58' cy='58' r='30' fill='#55B585' />
          <path
            d='M44.5781 57.245L53.7516 66.6843L70.6308 49.3159'
            stroke='white'
            strokeWidth='3.15789'
            strokeLinecap='round'
          />
        </svg>
      </div>
      <div className='flex flex-col text-center place-content-center space-y-2'>
        <p className='font-bold text-lg'>
          {' '}
          Exchange account successfully connected{' '}
        </p>
        <p> You can close this window now</p>
      </div>
    </div>
  )
}

export default Salon
