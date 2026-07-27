// Authentication helpers.
//
// Login is passwordless: the player signs a SIWE (Sign-In With Ethereum) message
// with their wallet, we verify the signature, and hand back a JWT (a signed token).
// On later requests the token proves who they are — no password ever touches us.

import type { FastifyReply, FastifyRequest } from 'fastify';

// The shape of the data we store inside the JWT.
export type AuthUser = {
  sub: string; // user id
  address: string; // lowercase wallet address
};

// Make TypeScript aware that `request.user` holds our AuthUser after jwtVerify().
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

// Wallet addresses are case-insensitive; we always store & compare them lowercase.
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

// A preHandler you attach to any route that must be logged in.
// If the token is missing or invalid, it replies 401 and stops the request.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'unauthorized', message: 'Login required.' });
  }
}
