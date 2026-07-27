// Reads a wallet's $JACKZ balance. This is the ONE place that changes on launch day.
//
// Right now the token does not exist, so every wallet reports a balance of 0 and everyone
// is on the Basic tier. When the contract is deployed, set TOKEN_ADDRESS (and RPC_URL) in
// the environment and fill in the on-chain read below — nothing else in the app changes.

import { env } from '../env.js';

// LAUNCH-DAY TODO — replace the stub body with a real ERC-20 read, e.g. with viem:
//
//   import { createPublicClient, http, erc20Abi, getAddress } from 'viem';
//   const client = createPublicClient({ transport: http(env.RPC_URL) });
//   const raw = await client.readContract({
//     address: getAddress(env.TOKEN_ADDRESS!),
//     abi: erc20Abi,
//     functionName: 'balanceOf',
//     args: [getAddress(address)],
//   });
//   const decimals = await client.readContract({ address: getAddress(env.TOKEN_ADDRESS!), abi: erc20Abi, functionName: 'decimals' });
//   return Number(raw / 10n ** BigInt(decimals));  // whole tokens
//
// Consider caching per-address for ~30s so the token page doesn't spam the RPC.

export async function getTokenBalance(address: string): Promise<number> {
  // Token not deployed yet → everyone is Basic. This keeps the whole tier system
  // working end-to-end today; launch day just makes the number real.
  if (!env.TOKEN_ADDRESS) return 0;

  // Placeholder until the on-chain read above is wired in.
  void address;
  return 0;
}
