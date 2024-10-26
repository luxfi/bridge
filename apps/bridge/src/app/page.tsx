import React  from 'react'

import Swapper from "@/components/Swapper"


type Props = {
  searchParams?: { [key: string]: string | string[] | undefined }
}

const Page = ({ searchParams }: Props ) => {

  return (
    <Swapper />
  )
}

export default Page
