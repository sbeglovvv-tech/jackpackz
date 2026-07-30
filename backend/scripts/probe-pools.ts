// Read-only pool prober — spends nothing, needs no operator key.
//
// For every token in DELIVERY_TOKENS (or the addresses you pass on the CLI) it asks the
// Uniswap v4 Quoter whether a live USDG pool exists and prints the fee tier + a sample
// quote. Use it to decide which assets are actually deliverable on chain (liquidity gate)
// — e.g. which meme tokens have real pools before you feature them on the site.
//
// Usage:
//   USDG_ADDRESS=0x... npx tsx scripts/probe-pools.ts
//   USDG_ADDRESS=0x... npx tsx scripts/probe-pools.ts 0xTokenA 0xTokenB
//
// Requires only: RPC (defaults to Robinhood mainnet) + USDG_ADDRESS.

import { formatUnits, parseUnits } from 'viem';
import { env } from '../src/env.js';
import { quoteUsdgIn, usdgDecimals } from '../src/lib/uniswap.js';

async function main() {
  if (!env.USDG_ADDRESS) {
    console.error('Set USDG_ADDRESS before running (the USDG contract on Robinhood Chain).');
    process.exit(1);
  }

  // Tokens to check: CLI args win; otherwise use DELIVERY_TOKENS.
  const cli = process.argv.slice(2);
  const entries: Array<[string, string]> = cli.length
    ? cli.map((a, i) => [`ARG${i + 1}`, a])
    : Object.entries(env.deliveryTokens);

  if (!entries.length) {
    console.error('Nothing to probe. Pass token addresses as arguments, or set DELIVERY_TOKENS.');
    process.exit(1);
  }

  const dec = await usdgDecimals();
  const sample = parseUnits('10', dec); // quote 10 USDG in
  console.log(`Probing ${entries.length} token(s) against USDG (${env.USDG_ADDRESS}), 10 USDG sample:\n`);

  for (const [sym, addr] of entries) {
    try {
      const q = await quoteUsdgIn(addr, sample);
      if (!q) {
        console.log(`  ❌ ${sym.padEnd(10)} ${addr}  — no live USDG pool found`);
      } else {
        const out = formatUnits(q.amountOut, 18); // display only; real decimals vary per token
        console.log(`  ✅ ${sym.padEnd(10)} ${addr}  — pool fee ${q.fee} (tickSpacing ${q.tickSpacing}), 10 USDG ≈ ${out} tokens`);
      }
    } catch (e) {
      console.log(`  ⚠️  ${sym.padEnd(10)} ${addr}  — probe error: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log('\nOnly the ✅ tokens will be delivered on chain; everything else settles as before.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
