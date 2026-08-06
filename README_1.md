# UniPackz — $UNIPACKZ

**Provably-fair collectible booster packs on Robinhood Chain (chainId 4663).**
Rip a pack, and a provably-fair on-chain roll settles a real tokenized asset — a stock or a Robinhood-chain meme — straight to your wallet. Stocks for the floor, memes for the moon.

- Website: https://unipackz.xyz
- X (Twitter): https://x.com/unipackz
- Docs: https://unipackz.xyz/docs

---

## What it is

UniPackz is a booster-pack platform on Robinhood Chain. You buy a themed pack in USDG, a provably-fair draw decides what you pull, and the pack **settles the real asset to your wallet** — it is never an IOU or a database credit. Every drop is an ERC-20 token that arrives through the same public Uniswap pools everyone else trades.

Nothing about the outcome is decided after you pay: the commitment to the roll is published **before** you click, and any past open can be re-derived by anyone.

## How an open works

1. **Pay** — you send the pack price in USDG to the treasury (verified on-chain before anything rolls).
2. **Roll** — the server produces a provably-fair result from a pre-committed seed.
3. **Settle** — the payout value in USDG is swapped for the exact asset you pulled through Uniswap, and the token lands in your wallet in the same flow.
4. **Keep** — you always keep whatever dropped. There is no claim step.

If a token has no live pool, the swap is skipped rather than faked.

## Provably-fair

UniPackz uses an HMAC-SHA256 commit-reveal scheme:

```
roll = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)  →  first 13 hex ÷ 16^13
```

- The **hash of the server seed** is published *before* the roll.
- The **server seed**, your **client seed**, and the **nonce** are revealed *after*, so anyone can reproduce the exact number — and the exact card.
- Every past open is independently verifiable via the public verify endpoint.

## Published odds & return

Rarity tiers are fixed and published:

| Tier | Pull chance |
|------|-------------|
| Legendary | ~1% |
| Epic | ~5% |
| Rare | ~14% |
| Common | ~80% |

Odds and payout multipliers are two independent, published tables, so the whole model stays auditable. The payout value of a drop is `packPrice × multiplier[rarity]`, targeting an overall return-to-player of ~75%. The remaining edge is a fixed contribution off every pack, split into the jackpot vault, the liquidity that funds payouts, a $UNIPACKZ buyback-and-burn, and treasury.

## On-chain settlement

Payouts are delivered by swapping USDG into the dropped token on **Uniswap** and sending it to the player:

- **Uniswap v3** (SwapRouter02) is the primary route — the swap sends the token straight to the player's wallet in a single transaction.
- **Uniswap v4** (Universal Router) is the fallback route.
- Only assets with a live USDG pool are delivered on-chain (liquidity-gated); everything else settles as a recorded result.

Payments are real USDG transfers, verified on-chain before every open.

## Non-custodial jackpot

Every pack feeds a shared jackpot vault. It is non-custodial — the team can't withdraw it. It grows with every real, paid open, and `1 in 25,000` rips wins `90%` of the vault, or it stays locked.

## Assets

Packs pull from tokenized equities (e.g. NVDA, AMD, AAPL, MSFT, TSLA, …) and the loudest Robinhood-chain memes (CashCat, Robinhood Wallet, VLAD, Repe, Brodie). Each asset is a real ERC-20 on Robinhood Chain; clicking one opens its contract on the block explorer.

## $UNIPACKZ token

`$UNIPACKZ` is an **optional** membership layer — packs always work without it. Holding it never changes pack odds; it only unlocks deterministic benefits across tiers (Basic → Bronze → Silver → Gold → Diamond): pack discounts, bonus asset value, XP multipliers, and the Pack Printer.

## Architecture

- **Frontend** — static, self-contained `index.html` (HTML/CSS/JS, assets inlined as data-URIs), deployed on **Vercel**. Wallet connectivity via EIP-6963 + WalletConnect.
- **Backend** — **Fastify** + **TypeScript** API with **Prisma** + **PostgreSQL**, deployed on **Railway**.
- **Auth** — Sign-In With Ethereum (SIWE / EIP-4361) with JWT sessions.
- **Chain** — Robinhood Chain (chainId 4663); USDG for payments; Uniswap v3/v4 for settlement.

## Verify an open

Every open exposes its full proof (server seed, server-seed hash, client seed, nonce, roll). Re-run the HMAC yourself, or hit the public verify endpoint to re-check any past opening's fairness and economics.

## Deploy

**Frontend (Vercel)** — static, no build step:

```bash
# local preview
npx serve .            # or: python3 -m http.server 5173

# deploy
npm i -g vercel
cd unipackz
vercel                 # preview
vercel --prod          # production
```

**Backend (Railway)** — Fastify + Prisma. Secrets (operator key, token addresses) are set as environment variables on Railway and **never** hardcoded.

## Security

- Private keys and contract addresses are **never** committed to the repo — everything sensitive lives in environment variables.
- Real-money flows (payments, delivery) are env-gated and off by default until explicitly enabled.
- The RPC for Robinhood Chain is public; no private keys are required to run the frontend.

## License

MIT.

---

*UniPackz is an independent, community-built application deployed on Robinhood Chain (chainId 4663). It is not affiliated with, endorsed by, or operated by Robinhood Markets, Inc. "Robinhood" is referenced only to identify the public blockchain network. Opening packs involves chance and financial risk. Digital assets are volatile and memecoins can go to zero. Nothing here is financial advice.*
