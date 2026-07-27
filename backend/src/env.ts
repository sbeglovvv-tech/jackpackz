// Loads and validates environment variables ONCE at startup.
// If something required is missing, the server refuses to start with a clear message
// instead of failing in a confusing way later.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  SIWE_DOMAIN: z.string().min(1, 'SIWE_DOMAIN is required (e.g. localhost:5173)'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Railway injects PORT automatically; default to 8080 for local dev.
  PORT: z.coerce.number().default(8080),
  // Optional — set on token launch day to enable on-chain $JACKZ balance/tier reads.
  TOKEN_ADDRESS: z.string().optional(),
  RPC_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Turn the comma-separated CORS string into an array of clean origins.
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
