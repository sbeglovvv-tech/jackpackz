// Real USDG payment verification.
//
// When USDG_ADDRESS + TREASURY_ADDRESS are set, every pack open must carry a txHash of a
// USDG transfer the player already made to the treasury. We verify it ON-CHAIN here before
// rolling the pack, so nobody can open a pack without really paying. If those env vars are
// unset the whole thing is a no-op and the opening stays free (demo mode).

import {
  createPublicClient,
  http,
  getAddress,
  parseAbiItem,
  parseUnits,
  decodeEventLog,
} from 'viem';
import { env } from '../env.js';

const RPC = env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const client = createPublicClient({ chain: robinhood, transport: http(RPC) });

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);
const DECIMALS_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

let _decimals: number | null = null;
async function usdgDecimals(): Promise<number> {
  if (_decimals != null) return _decimals;
  const d = await client.readContract({
    address: getAddress(env.USDG_ADDRESS!),
    abi: DECIMALS_ABI,
    functionName: 'decimals',
  });
  _decimals = Number(d);
  return _decimals;
}

export function paymentEnabled(): boolean {
  return Boolean(env.USDG_ADDRESS && env.TREASURY_ADDRESS);
}

export type PaymentCheck = { ok: boolean; reason?: string };

// Confirm txHash is a mined USDG transfer of >= priceUsd from `buyer` to the treasury.
export async function verifyPayment(txHash: string, buyer: string, priceUsd: number): Promise<PaymentCheck> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, reason: 'bad_tx_format' };

  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 25_000,
      confirmations: 1,
    });
  } catch {
    return { ok: false, reason: 'not_mined' };
  }
  if (receipt.status !== 'success') return { ok: false, reason: 'tx_failed' };

  const usdg = getAddress(env.USDG_ADDRESS!);
  const treasury = getAddress(env.TREASURY_ADDRESS!);
  const buyerA = getAddress(buyer);
  const decimals = await usdgDecimals();
  const required = parseUnits(String(priceUsd), decimals); // exact, no float rounding

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== usdg) continue;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
      if (ev.eventName !== 'Transfer') continue;
      const args = ev.args as { from: string; to: string; value: bigint };
      if (
        getAddress(args.from) === buyerA &&
        getAddress(args.to) === treasury &&
        args.value >= required
      ) {
        return { ok: true };
      }
    } catch {
      /* not a Transfer log we can decode — skip */
    }
  }
  return { ok: false, reason: 'no_matching_transfer' };
}

// Reliable server-side USDG balance read (used by the "Not enough USDG" panel).
// Reading via our own RPC avoids wallet-provider eth_call quirks on the client.
const BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export async function usdgBalanceOf(addr: string): Promise<{ raw: string; decimals: number } | null> {
  if (!paymentEnabled()) return null;
  try {
    const decimals = await usdgDecimals();
    const raw = await client.readContract({
      address: getAddress(env.USDG_ADDRESS!),
      abi: BALANCE_ABI,
      functionName: 'balanceOf',
      args: [getAddress(addr)],
    });
    return { raw: (raw as bigint).toString(), decimals };
  } catch {
    return null;
  }
}

// Public config the front-end needs to build the payment transaction.
export async function paymentConfig() {
  const live = paymentEnabled();
  let decimals: number | null = null;
  if (live) decimals = await usdgDecimals().catch(() => null);
  return {
    live,
    chainId: 4663,
    usdg: env.USDG_ADDRESS || null,
    treasury: env.TREASURY_ADDRESS || null,
    decimals,
  };
}
