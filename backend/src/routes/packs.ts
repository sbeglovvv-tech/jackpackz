// Pack routes — the heart of the product.
//
//   GET  /api/packs           → the catalog (public)
//   GET  /api/rtp             → published RTP model: multipliers, edge split, per-pack RTP (public)
//   POST /api/packs/open      → open a pack, provably-fair (login required)
//   GET  /api/feed            → recent openings across all players (public)
//   GET  /api/verify/:id      → re-check any past opening's fairness + economics (public)

import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import {
  ASSETS,
  PACKS,
  RARITY_LABEL,
  TIER_WEIGHT,
  getPack,
  type Rarity,
} from '../data/catalog.js';
import {
  PAYOUT_MULTIPLIER,
  computePayout,
  computeContributions,
  expectedRtp,
  rtpConfig,
} from '../data/rtp.js';
import { computeRoll, newServerSeed, pickDrop, sha256, verifyRoll } from '../lib/provablyFair.js';

const openBody = z.object({
  packId: z.string().min(1),
  clientSeed: z.string().trim().min(1).max(100).optional(),
});

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Turn a pack's asset pool into published per-rarity odds (%), for display.
function packOdds(assets: string[]): Record<string, number> {
  const pool = assets.map((s) => ASSETS[s]).filter(Boolean);
  const total = pool.reduce((sum, a) => sum + TIER_WEIGHT[a.rarity], 0) || 1;
  const acc: Record<string, number> = {};
  for (const a of pool) acc[a.rarity] = (acc[a.rarity] ?? 0) + TIER_WEIGHT[a.rarity];
  const pct: Record<string, number> = {};
  for (const r of Object.keys(acc)) pct[r] = Math.round((acc[r] / total) * 1000) / 10;
  return pct;
}

export default async function packRoutes(app: FastifyInstance) {
  // ---- public catalog ----
  app.get('/api/packs', async () => {
    return {
      packs: PACKS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        blurb: p.blurb,
        count: p.count,
        soon: Boolean(p.soon),
        assets: p.assets.map((s) => {
          const a = ASSETS[s];
          return { sym: a.sym, name: a.name, kind: a.kind, rarity: a.rarity };
        }),
        odds: packOdds(p.assets),
        rtp: expectedRtp(p.assets), // expected return-to-player for THIS pool
      })),
      rarityLabels: RARITY_LABEL,
    };
  });

  // ---- published RTP model (public, auditable) ----
  app.get('/api/rtp', async () => {
    return {
      ...rtpConfig(),
      packs: PACKS.map((p) => ({ id: p.id, name: p.name, price: p.price, rtp: expectedRtp(p.assets) })),
    };
  });

  // ---- open a pack (login required) ----
  app.post('/api/packs/open', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = openBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: 'packId is required.' });
    }

    const pack = getPack(parsed.data.packId);
    if (!pack) return reply.code(404).send({ error: 'not_found', message: 'Unknown pack.' });
    if (pack.soon) {
      return reply.code(400).send({ error: 'pack_soon', message: `${pack.name} is not live yet.` });
    }

    const userId = request.user.sub;

    // Decide the client seed: use the one sent, else the player's saved seed,
    // else generate one and remember it for next time.
    let clientSeed = parsed.data.clientSeed;
    if (!clientSeed) {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      clientSeed = u?.clientSeed ?? randomBytes(8).toString('hex');
      if (!u?.clientSeed) {
        await prisma.user.update({ where: { id: userId }, data: { clientSeed } });
      }
    } else {
      // Persist a freshly chosen seed so the player keeps it.
      await prisma.user.update({ where: { id: userId }, data: { clientSeed } });
    }

    // nonce = how many packs this player has already opened (unique per roll).
    const nonce = await prisma.opening.count({ where: { userId } });

    const serverSeed = newServerSeed();
    const serverSeedHash = sha256(serverSeed);
    const roll = computeRoll(serverSeed, clientSeed, nonce);
    const drop = pickDrop(pack, roll);

    // RTP economics — value returned to the player, and fixed ecosystem contributions.
    const rarity = drop.rarity as Rarity;
    const { multiplier, payoutValue } = computePayout(pack.price, rarity);
    const contributions = computeContributions(pack.price);

    const opening = await prisma.opening.create({
      data: {
        userId,
        packId: pack.id,
        packName: pack.name,
        cardSym: drop.sym,
        cardName: drop.name,
        rarity: drop.rarity,
        packPrice: pack.price,
        payoutMult: multiplier,
        payoutValue,
        jackpotContribution: contributions.jackpot,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        roll,
      },
    });

    return {
      opening: {
        id: opening.id,
        packId: pack.id,
        packName: pack.name,
        createdAt: opening.createdAt,
      },
      card: {
        sym: drop.sym,
        name: drop.name,
        rarity: drop.rarity,
        rarityLabel: RARITY_LABEL[rarity],
        payoutMult: multiplier,
        payoutValue,
      },
      // How this open settled economically (all USD).
      economics: {
        packPrice: pack.price,
        payoutMult: multiplier,
        payoutValue,
        contributions,
      },
      // Everything needed to independently verify the roll was fair.
      proof: { serverSeed, serverSeedHash, clientSeed, nonce, roll },
    };
  });

  // ---- public live feed of recent drops ----
  app.get('/api/feed', async () => {
    const rows = await prisma.opening.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { user: { select: { address: true } } },
    });
    return {
      feed: rows.map((o) => ({
        id: o.id,
        player: shortAddr(o.user.address),
        packName: o.packName,
        cardSym: o.cardSym,
        cardName: o.cardName,
        rarity: o.rarity,
        payoutValue: o.payoutValue,
        createdAt: o.createdAt,
      })),
    };
  });

  // ---- verify any past opening (fairness + economics) ----
  app.get('/api/verify/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const o = await prisma.opening.findUnique({ where: { id } });
    if (!o) return reply.code(404).send({ error: 'not_found', message: 'Unknown opening.' });

    const proof = {
      serverSeed: o.serverSeed,
      serverSeedHash: o.serverSeedHash,
      clientSeed: o.clientSeed,
      nonce: o.nonce,
      roll: o.roll,
    };
    return {
      valid: verifyRoll(proof),
      card: { sym: o.cardSym, name: o.cardName, rarity: o.rarity },
      economics: {
        packPrice: o.packPrice,
        payoutMult: o.payoutMult,
        payoutValue: o.payoutValue,
        // Re-derive what the pack funded so the split is auditable from the stored price.
        contributions: computeContributions(o.packPrice),
        publishedMultipliers: PAYOUT_MULTIPLIER,
      },
      proof,
      formula: 'roll = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`) → first 13 hex ÷ 16^13',
    };
  });
}
