// Loads and validates environment variables ONCE at startup.
// If something required is missing, the server refuses to start with a clear message
// instead of failing in a confusing way later.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // One or more allowed sign-in domains, comma-separated. The value must match the
  // host in the browser's address bar (what the front-end puts in the SIWE message),
  // e.g. "jackpackz.xyz" or "jackpackz.xyz,www.jackpackz.xyz" or "localhost:5173".
  SIWE_DOMAIN: z.string().min(1, 'SIWE_DOMAIN is required (e.g. jackpackz.xyz)'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Railway injects PORT automatically; default to 8080 for local dev.
  PORT: z.coerce.number().default(8080),
  // Optional — set to enable the admin reset endpoint (POST /api/admin/reset-openings).
  // Leave unset in normal operation; the endpoint 404s when this is missing.
  ADMIN_KEY: z.string().optional(),
  // Optional — set on token launch day to enable on-chain $JACKZ balance/tier reads.
  TOKEN_ADDRESS: z.string().optional(),
  RPC_URL: z.string().optional(),
  // Real USDG payments. Set BOTH to require & verify an on-chain USDG payment before
  // every pack open. Leave unset to keep the free (demo) opening flow.
  //   USDG_ADDRESS     — the USDG token contract on Robinhood Chain
  //   TREASURY_ADDRESS — the wallet that receives pack payments (== the operator wallet)
  USDG_ADDRESS: z.string().optional(),
  TREASURY_ADDRESS: z.string().optional(),

  // ---------------------------------------------------------------------------
  // Option A — real on-chain token delivery (operator swap). ALL OPTIONAL.
  // When OPERATOR_PRIVATE_KEY is unset the whole delivery layer is a no-op and packs
  // settle exactly like today (provably-fair result + recorded USD value, no transfer).
  // ---------------------------------------------------------------------------
  //   OPERATOR_PRIVATE_KEY — hot wallet that pays out drops. SET THIS ON RAILWAY ONLY,
  //     never anywhere it can leak. Its public address should equal TREASURY_ADDRESS so
  //     the same wallet both receives payments and funds the swaps (self-funding house).
  OPERATOR_PRIVATE_KEY: z.string().optional(),
  //   DELIVERY_TOKENS — JSON map of asset symbol -> ERC-20 address on Robinhood Chain,
  //     e.g. {"NVDA":"0x…","VLAD":"0x…"}. Only symbols listed here can be delivered on
  //     chain; anything else settles as before. Never hardcode addresses in code.
  DELIVERY_TOKENS: z.string().optional(),
  //   DELIVERY_SLIPPAGE_BPS — max slippage for a payout swap, in basis points (300 = 3%).
  DELIVERY_SLIPPAGE_BPS: z.coerce.number().min(0).max(5000).default(300),
  //   Uniswap v4 infrastructure on Robinhood Chain. Defaults below are the public
  //     deployment; override only if Uniswap redeploys.
  UNIVERSAL_ROUTER: z.string().default('0x8876789976decbfcbbbe364623c63652db8c0904'),
  V4_QUOTER: z.string().default('0x8dc178efb8111bb0973dd9d722ebeff267c98f94'),
  PERMIT2_ADDRESS: z.string().default('0x000000000022D473030F116dDEE9F6B43aC78BA3'),
  //   Uniswap v3 on Robinhood Chain — used first for delivery (deep USDG pools live on v3).
  //   SwapRouter02 sends the swapped token straight to the player; plain ERC-20 approve, no Permit2.
  V3_SWAP_ROUTER: z.string().default('0xcaf681a66d020601342297493863e78c959e5cb2'),
  V3_QUOTER: z.string().default('0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Normalize a host so "www.Jackpackz.xyz " and "jackpackz.xyz" count as the same site:
// trim spaces, lowercase, and drop a leading "www.".
export function normalizeDomain(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}

// Parse DELIVERY_TOKENS (JSON) into a clean { SYM: address } record. Bad JSON -> {} + warn,
// so a typo disables delivery instead of crashing the whole server.
function parseDeliveryTokens(raw?: string): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [sym, addr] of Object.entries(obj)) {
      if (typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr.trim())) {
        out[sym.toUpperCase()] = addr.trim();
      }
    }
    return out;
  } catch {
    console.warn('⚠️  DELIVERY_TOKENS is not valid JSON — on-chain delivery disabled for all assets.');
    return {};
  }
}

export const env = {
  ...parsed.data,
  // Turn the comma-separated CORS string into an array of clean origins.
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // All accepted sign-in domains, normalized. Accepts both apex and www automatically.
  siweDomains: parsed.data.SIWE_DOMAIN.split(',')
    .map((s) => normalizeDomain(s))
    .filter(Boolean),
  // Symbol -> ERC-20 address for on-chain delivery (empty = delivery off).
  deliveryTokens: parseDeliveryTokens(parsed.data.DELIVERY_TOKENS),
};
