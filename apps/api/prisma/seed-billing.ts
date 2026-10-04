import type { PrismaClient } from '../src/generated/prisma/client';
import { seedDemoFixtures } from '../src/modules/demo/demo-fixtures';

// Compatibility for existing callers. Invoice only generated historical fixtures.
export async function seedBilling(prisma: PrismaClient): Promise<void> {
  await seedDemoFixtures(prisma);
}
