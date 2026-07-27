// Player profile routes (login required).
//
//   GET /api/me            → summary: totals, rarity breakdown, collection progress
//   GET /api/me/openings   → the player's own opening history

import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { COLLECTIONS } from '../data/catalog.js';

export default async function meRoutes(app: FastifyInstance) {
  app.get('/api/me', { preHandler: requireAuth }, async (request) => {
    const userId = request.user.sub;

    const [user, openings] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.opening.findMany({ where: { userId }, select: { cardSym: true, rarity: true } }),
    ]);

    // Count drops per rarity tier.
    const byRarity: Record<string, number> = {};
    for (const o of openings) byRarity[o.rarity] = (byRarity[o.rarity] ?? 0) + 1;

    // Which distinct cards the player owns.
    const owned = new Set(openings.map((o) => o.cardSym));

    // Progress toward each collection.
    const collections = COLLECTIONS.map((c) => {
      const have = c.set.filter((s) => owned.has(s));
      return {
        id: c.id,
        name: c.name,
        bonus: c.bonus,
        set: c.set,
        have,
        complete: have.length === c.set.length,
        progress: `${have.length}/${c.set.length}`,
      };
    });

    return {
      user: { address: user?.address, clientSeed: user?.clientSeed ?? null },
      totalOpenings: openings.length,
      byRarity,
      uniqueCards: owned.size,
      collections,
    };
  });

  app.get('/api/me/openings', { preHandler: requireAuth }, async (request) => {
    const userId = request.user.sub;
    const rows = await prisma.opening.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      openings: rows.map((o) => ({
        id: o.id,
        packName: o.packName,
        cardSym: o.cardSym,
        cardName: o.cardName,
        rarity: o.rarity,
        createdAt: o.createdAt,
      })),
    };
  });
}
