// Provably-fair engine.
//
// The idea: the outcome of a pack opening is decided by a number in [0, 1) that
// neither side can secretly control. We build it from three inputs:
//   • serverSeed  — random, secret until AFTER the roll (we publish its hash before)
//   • clientSeed  — chosen by the player
//   • nonce       — the player's opening counter (so each roll is unique)
//
// roll = HMAC_SHA256(key = serverSeed, message = `${clientSeed}:${nonce}`)
// We turn the first 13 hex chars of that HMAC into a fraction in [0, 1).
//
// After the roll we reveal serverSeed. Anyone can then check:
//   1. sha256(serverSeed) === serverSeedHash   (we didn't swap the seed)
//   2. re-computing the HMAC gives the same roll (the outcome wasn't faked)

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ASSETS, TIER_WEIGHT, type Pack } from '../data/catalog.js';

export function newServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Deterministic number in [0, 1) from the three inputs.
export function computeRoll(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
  // 13 hex chars = 52 bits — plenty of precision and always < Number.MAX_SAFE_INTEGER.
  const slice = hmac.slice(0, 13);
  const int = parseInt(slice, 16);
  return int / Math.pow(16, 13);
}

export type Drop = {
  sym: string;
  name: string;
  rarity: string;
};

// Pick one asset from the pack, weighted by rarity, using the roll.
// The same (pack, roll) always yields the same asset — that is what makes it verifiable.
export function pickDrop(pack: Pack, roll: number): Drop {
  const pool = pack.assets
    .map((sym) => ASSETS[sym])
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  if (pool.length === 0) {
    throw new Error(`Pack "${pack.id}" has no valid assets`);
  }

  const weights = pool.map((a) => TIER_WEIGHT[a.rarity]);
  const total = weights.reduce((sum, w) => sum + w, 0);

  // Walk the weighted segments until we pass `target`.
  let target = roll * total;
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i];
    if (target < 0) {
      const a = pool[i];
      return { sym: a.sym, name: a.name, rarity: a.rarity };
    }
  }

  // Floating-point safety net: return the last asset.
  const a = pool[pool.length - 1];
  return { sym: a.sym, name: a.name, rarity: a.rarity };
}

// Verify a past roll from its published proof. Used by the /verify endpoint.
export function verifyRoll(proof: {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  roll: number;
}): boolean {
  const hashOk = sha256(proof.serverSeed) === proof.serverSeedHash;
  const recomputed = computeRoll(proof.serverSeed, proof.clientSeed, proof.nonce);
  // Compare with a tiny tolerance to avoid float round-trip issues.
  const rollOk = Math.abs(recomputed - proof.roll) < 1e-12;
  return hashOk && rollOk;
}
