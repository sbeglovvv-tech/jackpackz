// App entry point — wires everything together and starts listening.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './env.js';
import { prisma } from './db.js';
import authRoutes from './routes/auth.js';
import packRoutes from './routes/packs.js';
import meRoutes from './routes/me.js';
import tokenRoutes from './routes/token.js';

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
  },
});

async function main() {
  // Allow our front-end origins to call the API (and send the auth header).
  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
  });

  // JWT support — enables app.jwt.sign(...) and request.jwtVerify().
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Simple health check (Railway pings this to know the app is alive).
  app.get('/health', async () => ({ ok: true, service: 'jackpackz-backend' }));
  app.get('/', async () => ({ ok: true, message: 'JackPackz API' }));

  // Feature routes.
  await app.register(authRoutes);
  await app.register(packRoutes);
  await app.register(meRoutes);
  await app.register(tokenRoutes);

  // Railway provides PORT; bind to 0.0.0.0 so it is reachable in the container.
  const port = Number(process.env.PORT) || env.PORT;
  await app.listen({ port, host: '0.0.0.0' });
}

// Close the DB connection cleanly on shutdown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
