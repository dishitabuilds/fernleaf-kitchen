import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedUsers } from './seed-users';
import { seedConfiguration } from './seed-configuration';
import { seedDemoFixtures } from '../src/modules/demo/demo-fixtures';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
  try {
    await seedUsers(prisma);
    await seedConfiguration(prisma);
    const fixtures = await seedDemoFixtures(prisma);
    console.log(JSON.stringify({ event: 'demo_seed_completed', ...fixtures }));
    console.log('Demo staff, configuration, dated operations and fixture-only billing are present. Existing records were preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Seed failed. Check PostgreSQL connectivity and apply migrations first.');
  process.exitCode = 1;
});
