import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';

// Test-only staff let the browser exercise a real change of Driver ownership.
// This script cannot write to the application or integration-test database.
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL to the isolated browser database.');
  const destination = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname) || !destination.pathname.endsWith('_browser_test')) {
    throw new Error('Browser staff fixtures require a local database name ending in _browser_test.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
  try {
    const user = await prisma.staffUser.upsert({
      where: { email: 'replacement-driver@test.com' }, update: {},
      create: { id: '4fb5e4d6-705a-47bd-b53a-b80f69211eb9', email: 'replacement-driver@test.com',
        displayName: 'Synthetic Replacement Driver', role: 'DRIVER', active: true, passwordHash: await hashPassword('Test@1234') },
    });
    if (user.role !== 'DRIVER' || !user.active) throw new Error('The isolated replacement Driver fixture was edited; review it before running browser tests.');
    console.log('Synthetic replacement Driver is present in the isolated browser database. Existing data was preserved.');
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser staff fixture setup failed.');
  process.exitCode = 1;
});
