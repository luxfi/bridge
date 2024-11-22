import { encodeFunctionData, parseAbi } from 'viem';

interface ApproveParams {
  spender: string;
  amount: string;
}

function approve({ spender, amount }: ApproveParams): string {
  return encodeFunctionData({
    abi: [
      'function approve(address spender, uint256 amount) public returns (bool)',
    ],
    functionName: 'approve',
    args: [spender, amount],
  });
}

interface TransferParams {
  to: string;
  amount: string;
}

function transfer({ to, amount }: TransferParams): string {
  return encodeFunctionData({
    abi: [
      'function transfer(address to, uint256 amount) public returns (bool)',
    ],
    functionName: 'transfer',
    args: [to, amount],
  });
}

interface TransferFromParams {
  from: string;
  to: string;
  amount: string;
}

type Address = `0x${string}`;

function transferFrom({ from, to, amount }: TransferFromParams): string {
  return encodeFunctionData({
    abi: parseAbi([
      'function transferFrom(address from, address to, uint256 amount) public returns (bool)',
    ]),
    functionName: 'transferFrom',
    args: [from as Address, to as Address, amount as any],
  });
}

export const erc20 = { calldata: { approve, transfer, transferFrom } };
