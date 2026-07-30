// Uniswap v3 swap path for payout delivery.
//
// This is the PRIMARY delivery route: on Robinhood Chain the deep USDG pools (e.g. CASHCAT)
// live on Uniswap v3, not v4. SwapRouter02 is much simpler and safer than the v4 Universal
// Router: a plain ERC-20 approve (no Permit2), and it sends the swapped token STRAIGHT to the
// player (recipient param) — no second transfer. delivery.ts tries this first, then falls
// back to the v4 path in uniswap.ts.

import { getAddress, parseAbiItem, decodeEventLog, type Address, type Hex } from 'viem';
import { env } from '../env.js';
import { publicClient, walletClient, operatorAddress } from './uniswap.js';

const SWAP_ROUTER_02 = getAddress(env.V3_SWAP_ROUTER);
const QUOTER_V2 = getAddress(env.V3_QUOTER);

function usdgAddress(): Address {
  return getAddress(env.USDG_ADDRESS!);
}

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

// QuoterV2 — declared `view` locally so viem eth_calls it (on-chain it's revert-and-catch).
const QUOTER_V2_ABI = [
  {
    type: 'function', name: 'quoteExactInputSingle', stateMutability: 'view',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

// SwapRouter02 exactInputSingle — NOTE: no `deadline` field (removed in SwapRouter02).
const SWAP_ROUTER_02_ABI = [
  {
    type: 'function', name: 'exactInputSingle', stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'recipient', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const;

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const FEE_TIERS = [3000, 500, 10000, 100]; // probe order
const UINT256_MAX = (1n << 256n) - 1n;
const _tier = new Map<string, number>();

export type V3Quote = { fee: number; amountOut: bigint };

// Find a live USDG->tokenOut v3 pool and quote it. null = no v3 liquidity at any fee tier.
export async function quoteV3(tokenOut: string, amountIn: bigint): Promise<V3Quote | null> {
  const usdg = usdgAddress();
  const out = getAddress(tokenOut);
  const cacheKey = out.toLowerCase();
  const cached = _tier.get(cacheKey);
  const tiers = cached ? [cached, ...FEE_TIERS.filter((f) => f !== cached)] : FEE_TIERS;

  for (const fee of tiers) {
    try {
      const res = await publicClient.readContract({
        address: QUOTER_V2,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: usdg, tokenOut: out, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const amountOut = (res as readonly [bigint, bigint, number, bigint])[0];
      if (amountOut > 0n) {
        _tier.set(cacheKey, fee);
        return { fee, amountOut };
      }
    } catch {
      // no pool at this fee tier — try the next
    }
  }
  return null;
}

// One-time (idempotent) ERC-20 approval so SwapRouter02 can pull USDG.
async function ensureApproval(amount: bigint): Promise<void> {
  if (!walletClient || !operatorAddress) throw new Error('operator wallet not configured');
  const usdg = usdgAddress();
  const allow = await publicClient.readContract({
    address: usdg, abi: ERC20_ABI, functionName: 'allowance', args: [operatorAddress, SWAP_ROUTER_02],
  });
  if ((allow as bigint) < amount) {
    const hash = await walletClient.writeContract({
      address: usdg, abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER_02, UINT256_MAX],
    });
    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  }
}

export type V3SwapResult = { tx: Hex; delivered: bigint };

// Swap USDG -> tokenOut on v3, sending the output STRAIGHT to `recipient` (one transaction).
export async function swapV3ToRecipient(
  tokenOut: string,
  amountIn: bigint,
  minOut: bigint,
  fee: number,
  recipient: string,
): Promise<V3SwapResult> {
  if (!walletClient || !operatorAddress) throw new Error('operator wallet not configured');
  await ensureApproval(amountIn);

  const usdg = usdgAddress();
  const out = getAddress(tokenOut);
  const to = getAddress(recipient);

  const hash = await walletClient.writeContract({
    address: SWAP_ROUTER_02,
    abi: SWAP_ROUTER_02_ABI,
    functionName: 'exactInputSingle',
    args: [{ tokenIn: usdg, tokenOut: out, fee, recipient: to, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('v3 swap reverted');

  // Exact amount the player received = tokenOut Transfer(...) into `recipient` in this tx.
  let delivered = 0n;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== out) continue;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
      const a = ev.args as { from: string; to: string; value: bigint };
      if (getAddress(a.to) === to) delivered += a.value;
    } catch {
      /* not a decodable Transfer — skip */
    }
  }
  return { tx: hash, delivered };
}
