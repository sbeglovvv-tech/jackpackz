# JackPackz — Backend (Phase 2)

Wallet login (SIWE) + **provably-fair** pack opening, recorded in PostgreSQL.
Off-chain demo: no real money or tokens — the server rolls the outcome fairly and
stores every opening so the live feed, leaderboard and profiles run on real data.

**Stack:** Fastify + TypeScript · Prisma · PostgreSQL · deployed on Railway.

---

## What's inside

```
jackpackz-backend/
├── prisma/
│   ├── schema.prisma        # database models: User, Opening, Nonce
│   └── seed.ts              # optional demo data
├── src/
│   ├── server.ts            # app entry — CORS, JWT, routes
│   ├── env.ts               # validates environment variables
│   ├── db.ts                # shared Prisma client
│   ├── data/catalog.ts      # packs, assets, rarities, odds (mirrors the site)
│   ├── lib/
│   │   ├── provablyFair.ts  # HMAC roll + weighted pick + verify
│   │   └── auth.ts          # SIWE helpers + requireAuth guard
│   └── routes/
│       ├── auth.ts          # /api/auth/nonce, /api/auth/verify
│       ├── packs.ts         # /api/packs, /api/packs/open, /api/feed, /api/verify/:id
│       └── me.ts            # /api/me, /api/me/openings
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Run locally

Prerequisites: **Node 20+** and a PostgreSQL database (local Docker, or the
Railway one — see below).

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL, JWT_SECRET, SIWE_DOMAIN
npm run db:push               # creates the tables from schema.prisma
npm run db:seed               # optional: demo feed data
npm run dev                   # http://localhost:8080
```

Quick check: open `http://localhost:8080/health` → `{"ok":true}`.

---

## Deploy on Railway (step by step)

1. Push this folder to a **GitHub** repo.
2. On [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick the repo.
3. In the same project → **New** → **Database** → **Add PostgreSQL**.
   Railway auto-creates a `DATABASE_URL` variable and shares it with the service.
4. Open your **service → Variables** and add:
   - `JWT_SECRET` — a long random string
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `SIWE_DOMAIN` — your front-end host, e.g. `jackpackz.vercel.app`
   - `CORS_ORIGINS` — your front-end URL, e.g. `https://jackpackz.vercel.app`
   - *(Railway sets `PORT` and `DATABASE_URL` for you — don't add them.)*
5. **Settings → Deploy → Start Command:**
   ```
   npx prisma db push --accept-data-loss && npm start
   ```
   (`db push` creates/updates the tables from `schema.prisma` on every deploy —
   no migration files needed for this demo. The build command `npm run build`
   runs automatically before start.)
6. Deploy. Your API is live at the Railway-provided URL. Test `…/health`.

---

## API

| Method | Path                 | Auth | Purpose                                  |
| ------ | -------------------- | ---- | ---------------------------------------- |
| GET    | `/health`            | —    | liveness                                 |
| GET    | `/api/packs`         | —    | catalog + published odds                 |
| GET    | `/api/auth/nonce`    | —    | start login, returns a one-time nonce    |
| POST   | `/api/auth/verify`   | —    | `{message, signature}` → `{token, user}` |
| POST   | `/api/packs/open`    | JWT  | `{packId, clientSeed?}` → card + proof   |
| GET    | `/api/feed`          | —    | 30 most recent openings                  |
| GET    | `/api/me`            | JWT  | profile, rarity counts, collections      |
| GET    | `/api/me/openings`   | JWT  | your opening history                     |
| GET    | `/api/verify/:id`    | —    | re-check an opening's fairness           |

Authenticated requests send the token as `Authorization: Bearer <token>`.

---

## Provably-fair, in one paragraph

Each opening's outcome is a number in `[0, 1)`:

```
roll = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)  → first 13 hex ÷ 16^13
```

`serverSeed` is random and secret; we publish `sha256(serverSeed)` and reveal the
seed after the roll. `clientSeed` is chosen by the player; `nonce` is their opening
counter. Anyone can hit `GET /api/verify/:id` (or recompute locally) to confirm
`sha256(serverSeed)` matches and the roll wasn't faked. The `roll` then picks an
asset weighted by rarity (Legendary ≈1%, Epic ≈5%, Rare ≈14%, Common ≈80%).

---

## Front-end login flow (for reference)

```
1. GET  /api/auth/nonce                       → { nonce }
2. build a SIWE message (domain = SIWE_DOMAIN, address, nonce)
3. wallet: personal_sign(message)             → signature
4. POST /api/auth/verify { message, signature } → { token }
5. store token; send `Authorization: Bearer <token>` on protected calls
```
