// Login routes — the SIWE (Sign-In With Ethereum) handshake.
//
//   1. GET  /api/auth/nonce   → we hand the wallet a one-time random word.
//   2. Wallet signs a message that includes that word.
//   3. POST /api/auth/verify  → we check the signature and issue a JWT.
//
// NOTE: we parse the SIWE message ourselves with small regexes instead of the
// strict `siwe` library. The front-end signs a LOWERCASE address (so it doesn't
// need a checksum library in the browser), and the `siwe` parser rejects any
// address that isn't EIP-55 checksummed — which threw "Could not parse the SIWE
// message". Parsing the three fields we actually need (domain, address, nonce)
// by hand and verifying the signature with viem works with any address casing.

import type { FastifyInstance } from 'fastify';
import { generateNonce } from 'siwe';
import { recoverMessageAddress } from 'viem';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env, normalizeDomain } from '../env.js';
import { normalizeAddress } from '../lib/auth.js';

const NONCE_TTL_MS = 10 * 60 * 1000; // a nonce is valid for 10 minutes

const verifyBody = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  // Step 1 — issue a fresh nonce and remember it.
  app.get('/api/auth/nonce', async () => {
    const nonce = generateNonce();
    await prisma.nonce.create({ data: { value: nonce } });
    return { nonce };
  });

  // Step 3 — verify the signed message, then log the player in.
  app.post('/api/auth/verify', async (request, reply) => {
    const parsed = verifyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', message: 'message and signature are required.' });
    }

    const message = parsed.data.message;

    // Pull the fields we care about straight out of the EIP-4361 message text.
    const domainMatch = message.match(/^([^\n]+?) wants you to sign in with your Ethereum account:/);
    const addressMatch = message.match(/\n(0x[0-9a-fA-F]{40})\n/);
    const nonceMatch = message.match(/\nNonce: ([^\n]+)/);

    if (!domainMatch || !addressMatch || !nonceMatch) {
      return reply.code(400).send({ error: 'bad_message', message: 'Could not parse the SIWE message.' });
    }

    const domain = domainMatch[1].trim();
    const claimedAddress = addressMatch[1];
    const nonce = nonceMatch[1].trim();

    // The message must be for OUR site, not some other app. We compare after
    // normalizing both sides (lowercase, no "www.") so the apex and www hosts —
    // and any stray whitespace in the env var — all count as the same site.
    if (!env.siweDomains.includes(normalizeDomain(domain))) {
      return reply.code(401).send({ error: 'bad_domain', message: 'This message was not signed for this app.' });
    }

    // The nonce must be one we issued, unused, and fresh.
    const nonceRow = await prisma.nonce.findUnique({ where: { value: nonce } });
    if (!nonceRow || nonceRow.used || Date.now() - nonceRow.createdAt.getTime() > NONCE_TTL_MS) {
      return reply.code(401).send({ error: 'bad_nonce', message: 'Login expired — please try again.' });
    }

    // Verify the wallet actually signed this exact message: recover the signer's
    // address from the signature and compare it to the address in the message.
    let valid = false;
    try {
      const recovered = await recoverMessageAddress({
        message,
        signature: parsed.data.signature as `0x${string}`,
      });
      valid = recovered.toLowerCase() === claimedAddress.toLowerCase();
    } catch {
      valid = false;
    }
    if (!valid) {
      return reply.code(401).send({ error: 'bad_signature', message: 'Signature did not match.' });
    }

    // Burn the nonce so the same signature can't be replayed.
    await prisma.nonce.update({ where: { value: nonce }, data: { used: true } });

    // Create the player on first login, or fetch the existing one.
    const address = normalizeAddress(claimedAddress);
    const user = await prisma.user.upsert({
      where: { address },
      update: {},
      create: { address },
    });

    // Hand back a 7-day token the front-end stores and sends on future calls.
    const token = app.jwt.sign({ sub: user.id, address }, { expiresIn: '7d' });

    return { token, user: { id: user.id, address } };
  });
}
