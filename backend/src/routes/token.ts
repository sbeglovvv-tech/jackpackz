// $JACKZ membership routes.
//
//   GET /api/token/stats  → public: tier table, XP table, burn & vault totals (for /token page)
//   GET /api/token/me     → login required: this wallet's tier, XP, level and printer state
//
// Everything works TODAY with the token stubbed to a 0 balance (everyone is Basic).
// On launch day, getTokenBalance() starts returning real numbers and these routes light up.

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import {
  TIERS,
  XP_PER_PACK,
  BASE_XP,
  tierForBalance,
  nextTier,
  levelForXp,
  xpForLevel,
} from '../data/token.js';
import { getTokenBalance } from '../lib/tokenBalance.js';
import { EDGE_RATE, EDGE_SPLIT, RTP_TARGET } from '../data/rtp.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export default async function tokenRoutes(app: FastifyInstance) {
  // ---- Public marketing/stats endpoint (no login) ----
  app.get('/api/token/stats', async () => {
    // Aggregate the running economy from stored openings.
    const agg = await prisma.opening.aggregate({
      _count: true,
      _sum: { jackpotContribution: true, packPrice: true, payoutValue: true },
    });
    const totalOpenings = agg._count;
    const turnover = agg._sum.packPrice ?? 0;
    const globalJackpot = round2(agg._sum.jackpotContribution ?? 0);
    const paidOut = round2(agg._sum.payoutValue ?? 0);
    // Ecosystem sinks accrued from turnover (USD value; becomes on-chain once the token is live).
    const burnedUsd = round2(turnover * EDGE_RATE * EDGE_SPLIT.burn);
    const packRewardsVault = round2(turnover * EDGE_RATE * EDGE_SPLIT.liquidity);
    return {
      tokenLive: false,
      rtpTarget: RTP_TARGET,
      turnover: round2(turnover),
      paidOut,
      burnedUsd, // $ value routed to $JACKZ buyback & burn (real token burns once live)
      packRewardsVault, // USDG liquidity that funds asset payouts
      globalJackpot, // USDG
      tiers: TIERS,
      xpPerPack: XP_PER_PACK,
      totalOpenings,
    };
  });

  // ---- Signed-in player's membership state ----
  app.get('/api/token/me', { preHandler: requireAuth }, async (request) => {
    const userId = request.user.sub;
    const address = request.user.address;

    const [balance, openings] = await Promise.all([
      getTokenBalance(address), // 0 until the token is live
      prisma.opening.count({ where: { userId } }),
    ]);

    const tier = tierForBalance(balance);
    const nxt = nextTier(tier);

    // XP: every settled opening awards BASE_XP, scaled by the tier's XP rate. (demo model)
    const xp = Math.round(openings * BASE_XP * tier.xpRate);
    const level = levelForXp(xp);
    const xpIntoLevel = xp - xpForLevel(level);
    const xpToNextLevel = xpForLevel(level + 1) - xp;

    return {
      address,
      balance,
      tokenLive: balance > 0,
      tier: {
        id: tier.id,
        name: tier.name,
        discount: tier.discount,
        assetBonus: tier.assetBonus,
        xpRate: tier.xpRate,
        printerHours: tier.printerHours,
        founderPacks: tier.founderPacks,
        blackPacks: tier.blackPacks,
      },
      nextTier: nxt
        ? { id: nxt.id, name: nxt.name, min: nxt.min, toGo: Math.max(0, nxt.min - balance) }
        : null,
      xp,
      level,
      xpIntoLevel,
      xpToNextLevel,
      // LAUNCH-DAY TODO: real Pack Printer key accrual + founder/black eligibility.
      printerKeys: 0,
    };
  });
}
