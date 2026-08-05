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
import { env } from '../env.js';
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
import { paymentEnabled, paymentConfig, verifyPayment, usdgBalanceOf } from '../lib/payment.js';
import { deliveryEnabled, deliverDrop } from '../lib/delivery.js';

const openBody = z.object({
  packId: z.string().min(1),
  clientSeed: z.string().trim().min(1).max(100).optional(),
  txHash: z.string().optional(), // USDG payment tx (required when payments are enabled)
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

  // ---- payment config for the front-end (public) ----
  app.get('/api/pay/config', async () => {
    return paymentConfig();
  });

  // ---- USDG balance of the logged-in player (drives the "Not enough USDG" panel) ----
  // Read server-side via our own RPC, so it doesn't depend on the wallet's eth_call.
  app.get('/api/pay/balance', { preHandler: requireAuth }, async (request) => {
    const bal = await usdgBalanceOf(request.user.address);
    if (!bal) return { live: paymentEnabled(), balance: null, decimals: null };
    return { live: true, balance: bal.raw, decimals: bal.decimals };
  });

  // ---- live jackpot total (public): sum of the jackpot slice across REAL paid opens ----
  // Demo/free opens (no paymentTx) don't count — the vault only reflects real money in.
  app.get('/api/jackpot', async () => {
    const where = { paymentTx: { not: null } };
    const [agg, opens] = await Promise.all([
      prisma.opening.aggregate({ _sum: { jackpotContribution: true }, where }),
      prisma.opening.count({ where }),
    ]);
    const total = agg._sum.jackpotContribution ?? 0;
    return { jackpot: Math.round(total * 100) / 100, opens };
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

    // ---- Real USDG payment gate (only when USDG_ADDRESS + TREASURY_ADDRESS are set) ----
    let paymentTx: string | null = null;
    if (paymentEnabled()) {
      const txHash = parsed.data.txHash?.trim();
      if (!txHash) {
        return reply.code(402).send({ error: 'payment_required', message: 'A USDG payment is required to open this pack.' });
      }
      paymentTx = txHash.toLowerCase();
      // Prevent re-using one payment for many opens.
      const seen = await prisma.opening.findFirst({ where: { paymentTx } });
      if (seen) {
        return reply.code(409).send({ error: 'tx_used', message: 'This payment has already been used.' });
      }
      const check = await verifyPayment(txHash, request.user.address, pack.price);
      if (!check.ok) {
        return reply.code(402).send({
          error: 'payment_unverified',
          message: `Couldn't verify your USDG payment (${check.reason}). If the transaction just went through, wait a few seconds and try again.`,
        });
      }
    }

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
        paymentTx,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        roll,
      },
    });

    // ---- On-chain payout delivery (Option A). Best-effort; never breaks the open. ----
    // Only for real paid opens (paymentTx present). deliverDrop() never throws.
    let delivery: { status: string; tx: string | null; token: string | null; amount: string | null } = {
      status: 'none',
      tx: null,
      token: null,
      amount: null,
    };
    if (deliveryEnabled() && paymentTx) {
      const d = await deliverDrop({ sym: drop.sym, payoutValue, recipient: request.user.address });
      delivery = {
        status: d.status,
        tx: d.transferTx ?? d.swapTx ?? null,
        token: d.token ?? null,
        amount: d.amount ?? null,
      };
      try {
        await prisma.opening.update({
          where: { id: opening.id },
          data: {
            deliveryStatus: d.status,
            deliveryTx: d.transferTx ?? null,
            deliveredToken: d.token ?? null,
            deliveredAmt: d.amount ?? null,
          },
        });
      } catch {
        /* recording delivery status is non-critical — the open already succeeded */
      }
    }

    return {
      opening: {
        id: opening.id,
        packId: pack.id,
        packName: pack.name,
        createdAt: opening.createdAt,
      },
      // How the real token payout settled on chain (status "none" when delivery is off).
      delivery,
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

  // ---- admin: wipe all openings (clears the live feed + jackpot; demo reset) ----
  // Disabled unless ADMIN_KEY is set. Call with header `x-admin-key: <ADMIN_KEY>`.
  app.post('/api/admin/reset-openings', async (request, reply) => {
    if (!env.ADMIN_KEY) return reply.code(404).send({ error: 'not_found', message: 'Not enabled.' });
    if (request.headers['x-admin-key'] !== env.ADMIN_KEY) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Bad admin key.' });
    }
    const del = await prisma.opening.deleteMany({});
    // nonce is derived from the opening count, so it resets automatically to 0.
    return { ok: true, deletedOpenings: del.count };
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
