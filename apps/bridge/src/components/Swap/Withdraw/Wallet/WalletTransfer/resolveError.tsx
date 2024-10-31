import { BaseError, InsufficientFundsError, EstimateGasExecutionError, UserRejectedRequestError } from 'viem'

type ResolvedError = "insufficient_funds" | "transaction_rejected"

const resolveError = (error: BaseError): ResolvedError | undefined => {

  const isInsufficientFundsError = (typeof error?.walk === "function") && error?.walk(
    (e: unknown) => (
      (e instanceof InsufficientFundsError)
      || 
      (e instanceof EstimateGasExecutionError) 
      || 
      !!(e && ('data' in (e as any)) && (e as any).data.args?.some((a: string) => (a?.includes("amount exceeds"))))
    ))

  if (isInsufficientFundsError) {
      return "insufficient_funds"
  }

  const isUserRejectedRequestError = (typeof error?.walk === "function") && error?.walk(
    (e: unknown) => (e instanceof UserRejectedRequestError)
  ) instanceof UserRejectedRequestError

  if (isUserRejectedRequestError) {
    return "transaction_rejected"
  }

  const code_name = (error as any)?.code ?? error?.name;

  const inner_code = (error as any)?.data?.code
    || (error as any)?.cause?.code
    || (error as any)?.cause?.cause?.cause?.code

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
  return undefined  
}

export default resolveError
