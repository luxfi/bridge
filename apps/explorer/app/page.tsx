import React from 'react'
import Search from '@/components/Search'
import DataTable from '@/components/DataTable'

const Home: React.FC = () => (
  <main className='w-full py-5 px-6 h-full flex flex-col flex-1'>
    <Search className="w-full"/>
    <DataTable />
  </main>
)

export default Home
