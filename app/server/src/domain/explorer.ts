import { handlerGetExplorer, handlerGetHasBySwaps } from "@/domain/swaps"

export const getExplorer = async (statuses: string[]) => (
  await handlerGetExplorer(statuses) 
)

export const getHasBySwaps = async (transaction_has: string | undefined) => (
  transaction_has ? 
    await handlerGetHasBySwaps(transaction_has)
    :
    []
)