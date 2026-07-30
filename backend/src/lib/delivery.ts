// On-chain payout delivery (Option A) — orchestration layer.
//
// Given a settled drop, this swaps the payout value of USDG into the dropped token via a
// public Uniswap v4 pool and forwards it to the player. It is deliberately best-effort:
// it NEVER throws, so a swap failure can never break a pack open. The pack is already a
// valid provably-fair result with a recorded USD value; delivery just adds the real token
// on top, and a failure is recorded as `failed` for a later retry.
//
// Everything is off until OPERATOR_PRIVATE_KEY + USDG_ADDRESS are set and the dropped
// symbol has an address in DELIVERY_TOKENS. Otherwise deliverDrop() returns status "none"
// (delivery disabled) or "skipped" (this asset isn't set up for on-chain delivery yet).

import { parseUnits } from 'viem';
import { env } from '../env.js';
import {
  operatorAddress,
  usdgDecimals,
  quoteUsdgIn,
  swapUsdgForToken,
  transferToken,
} from './uniswap.js';

export type DeliveryStatus = 'none' | 'skipped' | 'sent' | 'failed';
export type DeliveryResult = {
  status: DeliveryStatus;
  reason?: string;
  token?: string;      // ERC-20 address delivered
  amount?: string;     // token base units received/sent (string for JSON safety)
  swapTx?: string;
  transferTx?: string;
};

// Delivery is live only when an operator wallet, USDG, and at least one token are configured.
export function deliveryEnabled(): boolean {
  return Boolean(operatorAddress && env.USDG_ADDRESS && Object.keys(env.deliveryTokens).length > 0);
}

function tokenForSymbol(sym: string): string | null {
  return env.deliveryTokens[sym.toUpperCase()] ?? null;
}

// Swap `payoutValue` USDG into the dropped token and send it to `recipient`.
export async function deliverDrop(args: {
  sym: string;
  payoutValue: number;
  recipient: string;
}): Promise<DeliveryResult> {
  const { sym, payoutValue, recipient } = args;

  if (!deliveryEnabled()) return { status: 'none' };

  const token = tokenForSymbol(sym);
  if (!token) return { status: 'skipped', reason: 'no_token_configured' };
  if (!(payoutValue > 0)) return { status: 'skipped', reason: 'zero_payout' };

  try {
    const decimals = await usdgDecimals();
    const amountIn = parseUnits(payoutValue.toFixed(decimals), decimals);

    // Liquidity gate: no live USDG pool for this token -> don't attempt a swap.
    const quote = await quoteUsdgIn(token, amountIn);
    if (!quote) return { status: 'skipped', reason: 'no_liquidity' };

    // Slippage-protected minimum output.
    const bps = BigInt(10_000 - env.DELIVERY_SLIPPAGE_BPS);
    const minOut = (quote.amountOut * bps) / 10_000n;

    // 1) Swap USDG -> token (lands in the operator wallet).
    const swap = await swapUsdgForToken(token, amountIn, minOut);
    // 2) Forward the exact received amount to the player.
    const transferTx = await transferToken(token, recipient, swap.received);

    return {
      status: 'sent',
      token,
      amount: swap.received.toString(),
      swapTx: swap.swapTx,
      transferTx,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { status: 'failed', reason };
  }
}
