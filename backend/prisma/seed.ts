// Optional demo seed: creates a couple of fake players and openings so the
// live feed and leaderboard aren't empty while you build the front-end.
// Run with:  npm run db:seed
import { prisma } from '../src/db.js';
import { getPack } from '../src/data/catalog.js';
import { computeRoll, newServerSeed, pickDrop, sha256 } from '../src/lib/provablyFair.js';

const DEMO_WALLETS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
];
const OPENABLE = ['ai', 'mag7', 'meme', 'index', 'future'];

async function main() {
  for (const address of DEMO_WALLETS) {
    const user = await prisma.user.upsert({
      where: { address },
      update: {},
      create: { address, clientSeed: 'demo' },
    });

    const rounds = 4;
    for (let nonce = 0; nonce < rounds; nonce++) {
      const packId = OPENABLE[(nonce + address.length) % OPENABLE.length];
      const pack = getPack(packId)!;
      const serverSeed = newServerSeed();
      const roll = computeRoll(serverSeed, 'demo', nonce);
      const drop = pickDrop(pack, roll);
      await prisma.opening.create({
        data: {
          userId: user.id,
          packId: pack.id,
          packName: pack.name,
          cardSym: drop.sym,
          cardName: drop.name,
          rarity: drop.rarity,
          serverSeed,
          serverSeedHash: sha256(serverSeed),
          clientSeed: 'demo',
          nonce,
          roll,
        },
      });
    }
  }
  console.log('✅ Seeded demo players and openings.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
