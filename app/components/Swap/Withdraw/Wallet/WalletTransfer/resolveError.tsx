import { BaseError, InsufficientFundsError, EstimateGasExecutionError, UserRejectedRequestError } from 'viem'


type ResolvedError = "insufficient_funds" | "transaction_rejected"

const walk = (obj: any): any => {
  if (obj.code) return obj.code
  if (obj.cause) {
    return walk(obj.cause)
  }
  return undefined
}

const resolveError = (error: BaseError): ResolvedError | undefined => {

    const isInsufficientFundsError = error.walk(
      (e: unknown): boolean => {
        if (e instanceof InsufficientFundsError || e instanceof EstimateGasExecutionError) {
          return true
        }
        const args = (e as any).data?.args
        if (args) {
          return args.some((a: string) => (a?.includes("amount exceeds")))
        }
        return false
      }
    )
    if (isInsufficientFundsError) return "insufficient_funds"

    const isUserRejectedRequestError = error.walk((e: unknown) => (e instanceof UserRejectedRequestError)) 
      instanceof UserRejectedRequestError

    if (isUserRejectedRequestError) return "transaction_rejected"

    const code_name = (error as any).code ? (error as any).code : (error as any).name ? (error as any).name : undefined
    const inner_code = (error as any).data?.code || walk(error)

    if (code_name === 'INSUFFICIENT_FUNDS'
        || code_name === 'UNPREDICTABLE_GAS_LIMIT'
        || (code_name === -32603 && inner_code === 3)
        || inner_code === -32000
        || code_name === 'EstimateGasExecutionError'
    ) {
      return "insufficient_funds"
    }
    else if (code_name === 4001) {
      return "transaction_rejected"
    }
}

export default resolveError
