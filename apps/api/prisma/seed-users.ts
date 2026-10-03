import type { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';

const DEMO_USERS = [
  { email: 'admin@test.com', displayName: 'Demo Admin', role: 'ADMIN' },
  { email: 'kitchen@test.com', displayName: 'Demo Kitchen', role: 'KITCHEN' },
  { email: 'dispatch@test.com', displayName: 'Demo Dispatch', role: 'DISPATCH' },
  { email: 'driver@test.com', displayName: 'Demo Driver', role: 'DRIVER' },
] as const;

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  for (const user of DEMO_USERS) {
    // Insert absent demo accounts only. Re-running seed preserves reviewer edits.
    await prisma.staffUser.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash: await hashPassword('Test@1234') },
    });
  }
}
