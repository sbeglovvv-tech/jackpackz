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
import { quoteV3, swapV3ToRecipient } from '../src/lib/uniswapV3.js';

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

  const bps = BigInt(10_000 - env.DELIVERY_SLIPPAGE_BPS);

  console.log('1) Quoting pool (v3 first, then v4)…');
  const q3 = await quoteV3(token, amountIn);
  if (q3) {
    const minOut = (q3.amountOut * bps) / 10_000n;
    console.log(`   v3 fee ${q3.fee}, expected out ≈ ${q3.amountOut}, minOut (after ${env.DELIVERY_SLIPPAGE_BPS}bps) = ${minOut}\n`);
    console.log('2) v3 swap USDG -> token, straight to recipient…');
    const r = await swapV3ToRecipient(token, amountIn, minOut, q3.fee, recipient);
    console.log(`   tx:        ${r.tx}`);
    console.log(`   delivered: ${r.delivered} base units (${formatUnits(r.delivered, 18)} @18dp display)\n`);
    console.log('✅ Done (v3). Check the recipient wallet + tx on the explorer.');
    return;
  }

  const q4 = await quoteUsdgIn(token, amountIn);
  if (!q4) { console.error('   No live USDG pool (v3 or v4) for this token. Aborting.'); process.exit(1); }
  const minOut = (q4.amountOut * bps) / 10_000n;
  console.log(`   v4 fee ${q4.fee}, expected out ≈ ${q4.amountOut}, minOut (after ${env.DELIVERY_SLIPPAGE_BPS}bps) = ${minOut}\n`);

  console.log('2) v4 swap USDG -> token (into operator wallet)…');
  const swap = await swapUsdgForToken(token, amountIn, minOut);
  console.log(`   swapTx:   ${swap.swapTx}`);
  console.log(`   received: ${swap.received} base units (${formatUnits(swap.received, 18)} @18dp display)\n`);

  console.log('3) Transferring token -> recipient…');
  const transferTx = await transferToken(token, recipient, swap.received);
  console.log(`   transferTx: ${transferTx}\n`);

  console.log('✅ Done (v4). Check the recipient wallet + both txs on the explorer.');
}

main().catch((e) => {
  console.error('❌ Test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
