import type { ReadonlyURLSearchParams } from "next/navigation"

import { PersistantQueryParams } from "../Models/QueryParams";

const resolvePersistentQueryParams = (query: ReadonlyURLSearchParams | URLSearchParams): URLSearchParams => {

    const persiatantParams = new PersistantQueryParams()

    const result =  new URLSearchParams()
    Object.keys(persiatantParams).forEach((key: string) => {
      const value = query.get(key)
      if (value) {
        result.set(key, value)
      }
    })
    return result
}

export default resolvePersistentQueryParams