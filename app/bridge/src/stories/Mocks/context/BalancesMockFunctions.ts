import { type BalancesStateUpdate } from "../../../context/balances"

const MockFunctions: BalancesStateUpdate = {
    setAllBalances: () => { throw new Error("Not implemented") },
    setAllGases: () => { throw new Error("Not implemented") },
    setIsBalanceLoading: () => { throw new Error("Not implemented") },
    setIsGasLoading: () => { throw new Error("Not implemented") },
}

export default MockFunctions