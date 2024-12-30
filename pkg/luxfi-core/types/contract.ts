interface Contract {
  name?: string
  chain_id: number,
  teleporter: `0x${string}` | ''
  vault: `0x${string}` | ''
}

type Contracts = Record<number,Contract >

export {
  type Contract, 
  type Contracts
}