// LIVE swap test — spends REAL USDG. Run this ONCE with a tiny amount before you enable
// delivery in production, to prove the whole Option-A path works end-to-end on chain.
//
// It performs exactly what a real drop does: quote -> swap USDG->token -> transfer to a
// recipient. Start with something like 0.10 USDG.
//
// Usage:
//   OPERATOR_PRIVATE_KEY=0x... USDG_ADDRESS=0x... \
//     npx tsx scripts/delivery-test.ts <tokenAddress> <usdgAmount> <recipient>
//
// Example:
//   ... npx tsx scripts/delivery-test.ts 0xToken 0.10 0xYourOtherWallet

import { formatUnits, parseUnits } from 'viem';
import { env } from '../src/env.js';
import {
  operatorAddress,
  usdgDecimals,
  quoteUsdgIn,
  swapUsdgForToken,
  transferToken,
} from '../src/lib/uniswap.js';

async function main() {
  const [token, amountStr, recipient] = process.argv.slice(2);
  if (!token || !amountStr || !recipient) {
    console.error('Usage: tsx scripts/delivery-test.ts <tokenAddress> <usdgAmount> <recipient>');
    process.exit(1);
  }
  if (!operatorAddress) {
    console.error('OPERATOR_PRIVATE_KEY is not set — cannot run a live swap.');
    process.exit(1);
  }
  if (!env.USDG_ADDRESS) {
    console.error('USDG_ADDRESS is not set.');
    process.exit(1);
  }

  const amount = Number(amountStr);
  if (!(amount > 0)) { console.error('Amount must be > 0.'); process.exit(1); }
  if (amount > 5) {
    console.error(`Refusing ${amount} USDG — this is a test. Use <= 5 USDG.`);
    process.exit(1);
  }

  const dec = await usdgDecimals();
  const amountIn = parseUnits(amount.toFixed(dec), dec);

  console.log(`Operator:  ${operatorAddress}`);
  console.log(`USDG:      ${env.USDG_ADDRESS} (${dec} decimals)`);
  console.log(`Token out: ${token}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount in: ${amount} USDG\n`);

  console.log('1) Quoting pool…');
  const q = await quoteUsdgIn(token, amountIn);
  if (!q) { console.error('   No live USDG pool for this token. Aborting.'); process.exit(1); }
  const bps = BigInt(10_000 - env.DELIVERY_SLIPPAGE_BPS);
  const minOut = (q.amountOut * bps) / 10_000n;
  console.log(`   fee ${q.fee}, expected out ≈ ${q.amountOut}, minOut (after ${env.DELIVERY_SLIPPAGE_BPS}bps) = ${minOut}\n`);

  console.log('2) Swapping USDG -> token (into operator wallet)…');
  const swap = await swapUsdgForToken(token, amountIn, minOut);
  console.log(`   swapTx:   ${swap.swapTx}`);
  console.log(`   received: ${swap.received} base units (${formatUnits(swap.received, 18)} @18dp display)\n`);

  console.log('3) Transferring token -> recipient…');
  const transferTx = await transferToken(token, recipient, swap.received);
  console.log(`   transferTx: ${transferTx}\n`);

  console.log('✅ Done. Check the recipient wallet + both txs on the explorer.');
}

main().catch((e) => {
  console.error('❌ Test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
