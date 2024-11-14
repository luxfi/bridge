import React from 'react'
import GoHomeButton from './utils/GoHome';

const Navbar: React.FC = () => (
  <div className='mt-12 mb-8 mx-auto px-4 overflow-hidden hidden md:block'>
    <div className="flex justify-center">
      <GoHomeButton className='h-11 w-auto cursor-pointer' />
    </div>
  </div>
)

export default Navbar


