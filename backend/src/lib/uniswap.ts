// Uniswap v4 swap primitive for on-chain payout delivery (Option A).
//
// This module owns everything that talks to Uniswap v4 on Robinhood Chain:
//   • an operator wallet (from OPERATOR_PRIVATE_KEY) that spends USDG,
//   • pool discovery + liquidity gating via the v4 Quoter,
//   • Permit2 approvals,
//   • an exact-input single-hop swap USDG -> tokenOut through the Universal Router.
//
// The swapped token lands in the OPERATOR wallet (Universal Router's TAKE_ALL sends the
// output to the caller). delivery.ts then forwards it to the player with a plain ERC-20
// transfer — two simple, battle-tested steps instead of one fragile encoded recipient.
//
// Nothing here runs unless OPERATOR_PRIVATE_KEY (and USDG_ADDRESS) are set.

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseUnits,
  encodeAbiParameters,
  decodeEventLog,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from '../env.js';

const RPC = env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

export const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

export const publicClient = createPublicClient({ chain: robinhood, transport: http(RPC) });

// ---- operator wallet (only when a key is configured) ----
function loadAccount() {
  const key = env.OPERATOR_PRIVATE_KEY?.trim();
  if (!key) return null;
  const hex = (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  return privateKeyToAccount(hex);
}
export const operatorAccount = loadAccount();
export const operatorAddress: Address | null = operatorAccount ? operatorAccount.address : null;

export const walletClient = operatorAccount
  ? createWalletClient({ account: operatorAccount, chain: robinhood, transport: http(RPC) })
  : null;

// ---- infra addresses ----
const UNIVERSAL_ROUTER = getAddress(env.UNIVERSAL_ROUTER);
const QUOTER = getAddress(env.V4_QUOTER);
const PERMIT2 = getAddress(env.PERMIT2_ADDRESS);

// ---- ABIs (minimal) ----
const ERC20_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

const PERMIT2_ABI = [
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }],
    outputs: [],
  },
] as const;

// v4 Quoter — declared `view` locally so viem will eth_call it (on-chain it is a
// revert-and-catch simulation, but eth_call returns the decoded outputs just fine).
const QUOTER_ABI = [
  {
    type: 'function', name: 'quoteExactInputSingle', stateMutability: 'view',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        {
          name: 'poolKey', type: 'tuple', components: [
            { name: 'currency0', type: 'address' },
            { name: 'currency1', type: 'address' },
            { name: 'fee', type: 'uint24' },
            { name: 'tickSpacing', type: 'int24' },
            { name: 'hooks', type: 'address' },
          ],
        },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'exactAmount', type: 'uint128' },
        { name: 'hookData', type: 'bytes' },
      ],
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
  },
] as const;

const UNIVERSAL_ROUTER_ABI = [
  {
    type: 'function', name: 'execute', stateMutability: 'payable',
    inputs: [{ name: 'commands', type: 'bytes' }, { name: 'inputs', type: 'bytes[]' }, { name: 'deadline', type: 'uint256' }],
    outputs: [],
  },
] as const;

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// ---- Uniswap v4 command / action bytes (verified against the on-chain source) ----
const CMD_V4_SWAP = '10';
const ACT_SWAP_EXACT_IN_SINGLE = '06';
const ACT_SETTLE_ALL = '0c';
const ACT_TAKE_ALL = '0f';

// Standard hookless fee tiers, tried in order when discovering a token's USDG pool.
const FEE_TIERS: Array<{ fee: number; tickSpacing: number }> = [
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
  { fee: 500, tickSpacing: 10 },
  { fee: 100, tickSpacing: 1 },
];
const NO_HOOK = '0x0000000000000000000000000000000000000000' as Address;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT48_MAX = (1n << 48n) - 1n;

type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

function usdgAddress(): Address {
  return getAddress(env.USDG_ADDRESS!);
}

// Sort two currencies the way v4 requires (currency0 < currency1, byte order).
function poolKeyFor(tokenOut: Address, fee: number, tickSpacing: number): { key: PoolKey; zeroForOne: boolean } {
  const usdg = usdgAddress();
  const out = getAddress(tokenOut);
  const usdgIsZero = usdg.toLowerCase() < out.toLowerCase();
  const key: PoolKey = usdgIsZero
    ? { currency0: usdg, currency1: out, fee, tickSpacing, hooks: NO_HOOK }
    : { currency0: out, currency1: usdg, fee, tickSpacing, hooks: NO_HOOK };
  // zeroForOne = we are spending currency0. We spend USDG, so it's true iff USDG is currency0.
  return { key, zeroForOne: usdgIsZero };
}

let _usdgDecimals: number | null = null;
export async function usdgDecimals(): Promise<number> {
  if (_usdgDecimals != null) return _usdgDecimals;
  const d = await publicClient.readContract({ address: usdgAddress(), abi: ERC20_ABI, functionName: 'decimals' });
  _usdgDecimals = Number(d);
  return _usdgDecimals;
}

// Remember which fee tier works for a token so we don't re-probe every open.
const _tierCache = new Map<string, { fee: number; tickSpacing: number }>();

export type Quote = { key: PoolKey; zeroForOne: boolean; amountOut: bigint; fee: number; tickSpacing: number };

// Find a live USDG->tokenOut pool AND quote it. Returns null if no tier has liquidity
// (this is our liquidity gate — no pool means the asset simply isn't delivered on chain).
export async function quoteUsdgIn(tokenOut: string, amountIn: bigint): Promise<Quote | null> {
  const cacheKey = getAddress(tokenOut).toLowerCase();
  const cached = _tierCache.get(cacheKey);
  const tiers = cached ? [cached, ...FEE_TIERS.filter((t) => t.fee !== cached.fee)] : FEE_TIERS;

  for (const tier of tiers) {
    const { key, zeroForOne } = poolKeyFor(getAddress(tokenOut), tier.fee, tier.tickSpacing);
    try {
      const res = await publicClient.readContract({
        address: QUOTER,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: '0x' }],
      });
      const amountOut = (res as readonly [bigint, bigint])[0];
      if (amountOut > 0n) {
        _tierCache.set(cacheKey, tier);
        return { key, zeroForOne, amountOut, fee: tier.fee, tickSpacing: tier.tickSpacing };
      }
    } catch {
      // no pool at this tier (or no liquidity) — try the next
    }
  }
  return null;
}

// ABI types (positional — values are passed as arrays, so there is no name-matching to get
// wrong). PoolKey then ExactInputSingleParams.
const POOL_KEY_TYPE = {
  type: 'tuple',
  components: [
    { type: 'address' }, // currency0
    { type: 'address' }, // currency1
    { type: 'uint24' },  // fee
    { type: 'int24' },   // tickSpacing
    { type: 'address' }, // hooks
  ],
} as const;

const EXACT_IN_SINGLE_TYPE = {
  type: 'tuple',
  components: [
    POOL_KEY_TYPE,          // poolKey
    { type: 'bool' },       // zeroForOne
    { type: 'uint128' },    // amountIn
    { type: 'uint128' },    // amountOutMinimum
    { type: 'bytes' },      // hookData
  ],
} as const;

// Build the Universal Router calldata for one exact-input single-hop swap.
function encodeV4Swap(key: PoolKey, zeroForOne: boolean, amountIn: bigint, minOut: bigint): { commands: Hex; inputs: Hex[] } {
  const currencyIn = zeroForOne ? key.currency0 : key.currency1;
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;
  const poolKeyTuple = [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks] as const;

  // params[0] — ExactInputSingleParams { poolKey, zeroForOne, amountIn, amountOutMinimum, hookData }
  const swapParam = encodeAbiParameters(
    [EXACT_IN_SINGLE_TYPE],
    [[poolKeyTuple, zeroForOne, amountIn, minOut, '0x']] as never,
  );

  // params[1] — SETTLE_ALL(currencyIn, amountIn)
  const settleParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [currencyIn, amountIn],
  );

  // params[2] — TAKE_ALL(currencyOut, minOut)
  const takeParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [currencyOut, minOut],
  );

  const actions = `0x${ACT_SWAP_EXACT_IN_SINGLE}${ACT_SETTLE_ALL}${ACT_TAKE_ALL}` as Hex;
  const v4Input = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [swapParam, settleParam, takeParam]],
  );

  return { commands: `0x${CMD_V4_SWAP}` as Hex, inputs: [v4Input] };
}

// One-time (idempotent) approvals so the Universal Router can pull USDG via Permit2.
export async function ensureAllowances(amount: bigint): Promise<void> {
  if (!walletClient || !operatorAddress) throw new Error('operator wallet not configured');
  const usdg = usdgAddress();

  // 1) ERC-20 allowance: operator -> Permit2 (approve max once).
  const erc20Allow = await publicClient.readContract({
    address: usdg, abi: ERC20_ABI, functionName: 'allowance', args: [operatorAddress, PERMIT2],
  });
  if ((erc20Allow as bigint) < amount) {
    const hash = await walletClient.writeContract({
      address: usdg, abi: ERC20_ABI, functionName: 'approve', args: [PERMIT2, UINT160_MAX],
    });
    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  }

  // 2) Permit2 allowance: Permit2 -> Universal Router.
  const [permitAmount] = (await publicClient.readContract({
    address: PERMIT2, abi: PERMIT2_ABI, functionName: 'allowance', args: [operatorAddress, usdg, UNIVERSAL_ROUTER],
  })) as readonly [bigint, number, number];
  if (permitAmount < amount) {
    const hash = await walletClient.writeContract({
      address: PERMIT2, abi: PERMIT2_ABI, functionName: 'approve',
      args: [usdg, UNIVERSAL_ROUTER, UINT160_MAX, Number(UINT48_MAX)],
    });
    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  }
}

export type SwapResult = { swapTx: Hex; received: bigint; currencyOut: Address };

// Swap `amountInUsdg` USDG -> tokenOut. Output lands in the operator wallet.
// Returns the swap tx hash and the exact amount received (parsed from the receipt).
export async function swapUsdgForToken(tokenOut: string, amountInUsdg: bigint, minOut: bigint): Promise<SwapResult> {
  if (!walletClient || !operatorAddress) throw new Error('operator wallet not configured');

  await ensureAllowances(amountInUsdg);

  const out = getAddress(tokenOut);
  const tier = _tierCache.get(out.toLowerCase());
  if (!tier) throw new Error('no known pool tier — call quoteUsdgIn first');
  const { key, zeroForOne } = poolKeyFor(out, tier.fee, tier.tickSpacing);

  const { commands, inputs } = encodeV4Swap(key, zeroForOne, amountInUsdg, minOut);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const hash = await walletClient.writeContract({
    address: UNIVERSAL_ROUTER,
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, inputs, deadline],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('swap reverted');

  // Exact amount received = the tokenOut Transfer into the operator wallet in this tx.
  let received = 0n;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== out) continue;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
      const args = ev.args as { from: string; to: string; value: bigint };
      if (getAddress(args.to) === operatorAddress) received += args.value;
    } catch {
      /* not a decodable Transfer — skip */
    }
  }
  if (received <= 0n) throw new Error('swap produced no output');

  return { swapTx: hash, received, currencyOut: out };
}

// Plain ERC-20 transfer of the swapped token from the operator to the player.
export async function transferToken(token: string, to: string, amount: bigint): Promise<Hex> {
  if (!walletClient) throw new Error('operator wallet not configured');
  const hash = await walletClient.writeContract({
    address: getAddress(token), abi: ERC20_ABI, functionName: 'transfer', args: [getAddress(to), amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error('token transfer reverted');
  return hash;
}
