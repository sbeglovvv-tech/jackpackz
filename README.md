<div align="center">

# JackPackz — `$JACKZ`

**Provably-fair collectible booster packs on Robinhood Chain.**
Rip a pack, and a verifiable on-chain roll drops a collectible straight to your wallet.

[![License: MIT](https://img.shields.io/badge/License-MIT-8CFF3B.svg)](./LICENSE)
[![Frontend: Vercel](https://img.shields.io/badge/Frontend-Vercel-000000.svg?logo=vercel)](https://vercel.com)
[![Backend: Railway](https://img.shields.io/badge/Backend-Railway-8b5cf6.svg?logo=railway)](https://railway.app)
[![Chain: Robinhood 4663](https://img.shields.io/badge/Chain-Robinhood%204663-8CFF3B.svg)](https://robinhoodchain.blockscout.com)

</div>

---

## Overview

JackPackz is a browser-based collectible booster-pack experience. Every pack contains
stock-themed and meme-themed collectible cards; opening one runs a **provably-fair** roll
that anyone can verify, and the card you pull settles to your own wallet — self-custody,
never an IOU. `$JACKZ` is an **optional** membership token that unlocks deterministic perks
and never changes the odds.

- **Provably-fair** — every roll is committed and re-checkable (see below).
- **Self-custody** — the drop lands in your wallet; the team never holds it.
- **Wallet sign-in** — passwordless login via a wallet signature (SIWE / EIP-4361).
- **No hidden odds** — published rarity weights, identical for everyone.

## Repository structure

```
.
├── web/                 # Static front-end (deployed on Vercel)
│   ├── index.html       # Landing + pack-opening app (self-contained)
│   ├── token.html       # $JACKZ token / membership page
│   ├── docs.html        # Full documentation (GitBook-style)
│   ├── assets/          # Images & icons
│   └── vercel.json      # Vercel config
│
└── backend/             # API (deployed on Railway)
    ├── src/
    │   ├── server.ts        # Fastify app entry
    │   ├── routes/          # auth (SIWE), packs, me, token
    │   ├── lib/             # provably-fair engine, auth, token balance
    │   └── data/            # pack catalog, token tiers
    ├── prisma/          # PostgreSQL schema + seed
    └── package.json
```

## Tech stack

| Layer     | Stack                                                        |
|-----------|-------------------------------------------------------------|
| Front-end | Vanilla HTML/CSS/JS, single self-contained document, WalletConnect, EIP-6963 |
| Back-end  | Node.js · Fastify · TypeScript · Prisma · PostgreSQL        |
| Auth      | Sign-In With Ethereum (EIP-4361) + JWT                      |
| Chain     | Robinhood Chain (chain ID `4663`)                          |
| Hosting   | Vercel (web) · Railway (API + Postgres)                     |

## How provably-fair works

Each opening is decided by a number in `[0, 1)` that neither side can secretly control:

```
serverSeedHash = SHA-256(serverSeed)                  # published BEFORE the roll
roll           = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
value          = parseInt(roll.slice(0, 13), 16) / 16^13
```

The card is picked by walking rarity weights (Legendary 1 · Epic 5 · Rare 14 · Common 80).
After the roll, `serverSeed` is revealed at `GET /api/verify/:id` so anyone can confirm:

1. `SHA-256(serverSeed) === serverSeedHash` — the seed wasn't swapped.
2. Re-computing the HMAC reproduces the same roll and the same card.

## API

| Method | Path                 | Auth | Purpose                          |
|--------|----------------------|------|----------------------------------|
| GET    | `/api/packs`         | —    | Pack catalog + published odds    |
| GET    | `/api/auth/nonce`    | —    | Issue a one-time login nonce     |
| POST   | `/api/auth/verify`   | —    | Verify SIWE signature → JWT      |
| POST   | `/api/packs/open`    | JWT  | Open a pack → drop + proof       |
| GET    | `/api/feed`          | —    | Recent public drops              |
| GET    | `/api/verify/:id`    | —    | Full re-checkable proof          |
| GET    | `/api/me`            | JWT  | Profile, totals, collections     |
| GET    | `/api/token/stats`   | —    | Tier table, XP, vaults           |
| GET    | `/api/token/me`      | JWT  | Your tier, XP, level             |

## Running locally

**Front-end** — it's static, just serve the folder:

```bash
cd web
npx serve .        # or any static server; open the printed URL
```

**Back-end**:

```bash
cd backend
cp .env.example .env      # fill DATABASE_URL, JWT_SECRET, SIWE_DOMAIN, CORS_ORIGINS
npm install
npx prisma db push
npm run dev
```

## Deploy

- **Front-end (Vercel):** import the repo (root directory `web`) or run `npx vercel --prod` from `web/`.
- **Back-end (Railway):** deploy the repo with **Root Directory = `/backend`**, add a PostgreSQL
  plugin, and set the environment variables from `.env.example`
  (`DATABASE_URL`, `JWT_SECRET`, `SIWE_DOMAIN`, `CORS_ORIGINS`).

## Contracts

| Contract        | Address |
|-----------------|---------|
| `$JACKZ` token  | soon    |
| Pack contract   | soon    |
| Jackpot vault   | soon    |

## Disclaimer

JackPackz is an independent, community-built project on Robinhood Chain (chain ID 4663).
It is not affiliated with, endorsed by, or operated by Robinhood Markets, Inc. Tier benefits
never change pack odds. Digital assets are volatile and nothing here is financial advice.

## License

[MIT](./LICENSE)
