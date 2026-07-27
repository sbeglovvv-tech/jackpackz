// $JACKZ token membership model — the single source of truth for tiers, XP and levels.
// These numbers mirror the /token page. The token is an OPTIONAL membership layer:
// holding $JACKZ never changes pack odds, it only unlocks deterministic benefits.
//
// LAUNCH-DAY TODO: once the contract is live, the only thing that changes is WHERE the
// balance comes from (see src/lib/tokenBalance.ts). All the math below stays the same.

export type TierId = 'basic' | 'bronze' | 'silver' | 'gold' | 'diamond';

export type Tier = {
  id: TierId;
  name: string;
  min: number; // minimum $JACKZ (whole tokens) to reach this tier
  discount: number; // pack discount as a fraction, e.g. 0.02 = 2%
  assetBonus: number; // extra USD value added to the asset that drops
  xpRate: number; // XP multiplier
  printerHours: number | null; // free "Pack Printer" cadence in hours (null = locked)
  founderPacks: boolean;
  blackPacks: boolean;
};

// Ordered low → high. Same values shown on the token page.
export const TIERS: Tier[] = [
  { id: 'basic',   name: 'Basic',   min: 0,      discount: 0.00, assetBonus: 0.00, xpRate: 1.0,  printerHours: null, founderPacks: false, blackPacks: false },
  { id: 'bronze',  name: 'Bronze',  min: 1000,   discount: 0.02, assetBonus: 0.05, xpRate: 1.1,  printerHours: 24,   founderPacks: false, blackPacks: false },
  { id: 'silver',  name: 'Silver',  min: 10000,  discount: 0.03, assetBonus: 0.10, xpRate: 1.25, printerHours: 12,   founderPacks: false, blackPacks: false },
  { id: 'gold',    name: 'Gold',    min: 50000,  discount: 0.05, assetBonus: 0.20, xpRate: 1.5,  printerHours: 6,    founderPacks: true,  blackPacks: false },
  { id: 'diamond', name: 'Diamond', min: 250000, discount: 0.07, assetBonus: 0.30, xpRate: 2.0,  printerHours: 2,    founderPacks: true,  blackPacks: true  },
];

// The highest tier whose minimum the balance meets.
export function tierForBalance(balance: number): Tier {
  let current = TIERS[0];
  for (const t of TIERS) if (balance >= t.min) current = t;
  return current;
}

// The next tier up (or null at the top).
export function nextTier(tier: Tier): Tier | null {
  const i = TIERS.findIndex((t) => t.id === tier.id);
  return TIERS[i + 1] ?? null;
}

// ---- XP & levels ----
// XP is awarded only after an opening settles. Different pack kinds award different XP;
// for the demo every opening counts as a Standard pack. Tier multiplies the award.
export const XP_PER_PACK: Record<string, number> = {
  standard: 100,
  premium: 250,
  founder: 500,
  black: 1000,
};
export const BASE_XP = XP_PER_PACK.standard; // demo default per settled opening

// Simple, readable level curve: L2 at 500 XP, then +500 XP per level.
// LAUNCH-DAY TODO: swap for the on-chain XP registry curve if it differs.
export const XP_PER_LEVEL = 500;
export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}
export function xpForLevel(level: number): number {
  return Math.max(0, level - 1) * XP_PER_LEVEL;
}
