// RTP (return-to-player) model — the single source of truth for pack economics.
//
// RTP is the share of a pack's price a player gets back, on average, as real asset value.
// It NEVER touches the odds (those live in catalog.ts / provablyFair.ts). It only maps the
// rarity you rolled to a payout multiplier on the pack price. Two independent, published
// tables — odds and multipliers — so the whole thing stays provably-fair and auditable.
//
//   payoutValue = packPrice × PAYOUT_MULTIPLIER[rarity]
//
// Target RTP ≈ 75%. The remaining ≈25% ("house edge") is NOT taken per-open (a legendary
// pull pays 6× and is net-negative for the house on that open) — it is collected as a FIXED
// contribution off every pack price and recycled into the ecosystem. The liquidity slice is
// the buffer that absorbs the variance of the variable asset payouts.

import { ASSETS, TIER_WEIGHT, type Rarity } from './catalog.js';

// ---- Payout multipliers (× pack price), by rarity. Published & fixed in code. ----
export const PAYOUT_MULTIPLIER: Record<Rarity, number> = {
  com: 0.5, // most pulls come back under the pack price
  rare: 1.2,
  epic: 2.5,
  leg: 6.0, // the big win
};

// Design target. With the baseline odds (com 80 / rare 14 / epic 5 / leg 1) this yields:
//   .80×0.5 + .14×1.2 + .05×2.5 + .01×6.0 = 0.753  → ~75%.
export const RTP_TARGET = 0.75;

// House edge = 1 − RTP. Split across four sinks (must sum to 1).
export const EDGE_RATE = 1 - RTP_TARGET; // 0.25
export const EDGE_SPLIT = {
  jackpot: 0.4, // grows the shared jackpot vault
  liquidity: 0.3, // tops up the pool that funds asset payouts (absorbs win variance)
  burn: 0.2, // $JACKZ buyback & burn
  treasury: 0.1, // project operations
} as const;

const round = (n: number, dp = 4): number => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

export type Payout = { multiplier: number; payoutValue: number };

// What the player receives, in USD value, for a given pack price and rolled rarity.
export function computePayout(packPrice: number, rarity: Rarity): Payout {
  const multiplier = PAYOUT_MULTIPLIER[rarity];
  return { multiplier, payoutValue: round(packPrice * multiplier, 2) };
}

export type Contributions = {
  edge: number;
  jackpot: number;
  liquidity: number;
  burn: number;
  treasury: number;
};

// Fixed ecosystem contributions taken off EVERY pack price (independent of the drop).
export function computeContributions(packPrice: number): Contributions {
  const edge = round(packPrice * EDGE_RATE);
  return {
    edge,
    jackpot: round(edge * EDGE_SPLIT.jackpot),
    liquidity: round(edge * EDGE_SPLIT.liquidity),
    burn: round(edge * EDGE_SPLIT.burn),
    treasury: round(edge * EDGE_SPLIT.treasury),
  };
}

// Expected RTP for a specific pack's pool — weighted by the ACTUAL tier distribution
// inside that pool (a pack with two legendaries pays out more than the baseline).
export function expectedRtp(assets: string[]): number {
  const pool = assets.map((s) => ASSETS[s]).filter(Boolean);
  const total = pool.reduce((sum, a) => sum + TIER_WEIGHT[a.rarity], 0);
  if (!total) return 0;
  let rtp = 0;
  for (const a of pool) rtp += (TIER_WEIGHT[a.rarity] / total) * PAYOUT_MULTIPLIER[a.rarity];
  return round(rtp, 4);
}

// Compact, public description of the whole model (served at /api/rtp).
export function rtpConfig() {
  return {
    target: RTP_TARGET,
    edgeRate: EDGE_RATE,
    multipliers: PAYOUT_MULTIPLIER,
    edgeSplit: EDGE_SPLIT,
    note: 'payoutValue = packPrice × multiplier[rarity]. Odds and multipliers are independent, published tables.',
  };
}
