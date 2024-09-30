"use client"

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from '@luxdefi/ui/primitives'


const searchClasses = 'block w-full rounded-md py-1 pl-3 pr-4 ' + 
  'duration-200 transition-all outline-none ' +
  'placeholder:text-muted placeholder:text-base placeholder:leading-3' + 
  'text-foreground bg-background' 

const Search: React.FC<{
  className?: string
}> = ({
  className
}) => {
  
  const [searchParam, setSearchParam] = useState('');
  const router = useRouter();

  const handleKeyDown = (event: any) => {
    if (event.key === 'Enter') {
      handleSearch()
    }
  }

  function getLastPart(url: string) {
    const parts = url.split('/');
    return parts.at(-1);
  }

  const handleSearch = () => {
    const url = getLastPart(searchParam)
    router.push(`/${url}`)
  }

  return (
    <div className={className ?? ''} >
      <div className="relative flex flex-row items-center pl-2 border border-muted-3 rounded-md">
        <input
          type="text"
          name="searchParam"
          id="searchParam"
          value={searchParam}
          onChange={(v) => setSearchParam(v.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by Address / Source Tx / Destination Tx"
          className={searchClasses}
        />
        <Button
          variant='primary'
          onClick={handleSearch}
          className="inline-flex flex-row items-center align-center aspect-square lg:min-w-0 p-0 m-2"
        >
          <SearchIcon size={18} />
        </Button>
      </div>
    </div>
  )
}

export default Search;