import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedUsers } from './seed-users';
import { seedConfiguration } from './seed-configuration';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
  try {
    await seedUsers(prisma);
    await seedConfiguration(prisma);
    console.log('Demo staff and Phase 1 configuration are present. Existing records were preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Seed failed. Check PostgreSQL connectivity and apply migrations first.');
  process.exitCode = 1;
});
