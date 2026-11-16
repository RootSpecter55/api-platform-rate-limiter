import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Example tiers for a demo, not tuned for any real workload.
const tiers = [
  { code: 'free', name: 'Free', burst: 10, requestsPerMinute: 60 },
  { code: 'pro', name: 'Pro', burst: 50, requestsPerMinute: 600 },
  { code: 'enterprise', name: 'Enterprise', burst: 200, requestsPerMinute: 6_000 },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  for (const tier of tiers) {
    await prisma.tier.upsert({ where: { code: tier.code }, update: tier, create: tier });
  }
  await prisma.$disconnect();
  console.log(`Seeded ${tiers.length} tiers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
