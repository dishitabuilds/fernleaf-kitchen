import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { readConfig } from '../../apps/api/src/config';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { CutoffsService } from '../../apps/api/src/modules/cutoffs/cutoffs.service';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Job tests require a separate TEST_DATABASE_URL ending in _test.');
const ORIGIN = 'http://localhost:3000', TOKEN = 'synthetic-job-test-credential-32-characters';

describe('Authenticated external maintenance with shared database workflows', () => {
  let prisma: PrismaClient, app: NestExpressApplication;
  let now = new Date('2026-10-05T10:29:59.000Z');
  const previousFlag = process.env.DEMO_FIXTURES_ENABLED;
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect(); await resetPhase1Fixture(prisma);
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: ORIGIN, production: false, port: 3001, sessionTtlHours: 12, maintenanceToken: TOKEN });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => now);
    await app.init();
  });
  beforeEach(async () => { now = new Date('2026-10-05T10:29:59.000Z'); process.env.DEMO_FIXTURES_ENABLED = 'false'; await resetPhase1Fixture(prisma); });
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) { await resetPhase1Fixture(prisma); await prisma.$disconnect(); }
    if (previousFlag === undefined) delete process.env.DEMO_FIXTURES_ENABLED; else process.env.DEMO_FIXTURES_ENABLED = previousFlag;
  });
  const maintain = () => request(app.getHttpServer()).post('/api/v1/jobs/maintain').set('Origin', ORIGIN).set('Authorization', `Bearer ${TOKEN}`);

  it('rejects missing/wrong bearer credentials and incorrect Origin without creating work', async () => {
    for (const credential of [undefined, 'Bearer wrong', `Basic ${TOKEN}`]) {
      const call = request(app.getHttpServer()).post('/api/v1/jobs/maintain').set('Origin', ORIGIN);
      if (credential) call.set('Authorization', credential);
      const response = await call.expect(401);
      expect(response.body.code).toBe('JOB_UNAUTHORIZED');
    }
    await request(app.getHttpServer()).post('/api/v1/jobs/maintain').set('Origin', 'https://wrong.example').set('Authorization', `Bearer ${TOKEN}`).expect(403);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.prepUnit.count()).toBe(0);
  });

  it('disables the external endpoint when no maintenance token is configured', async () => {
    const disabled = await createApplication({ databaseUrl: databaseUrl!, webOrigin: ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    try {
      await disabled.init();
      const response = await request(disabled.getHttpServer()).post('/api/v1/jobs/maintain').set('Origin', ORIGIN).set('Authorization', `Bearer ${TOKEN}`).expect(404);
      expect(response.body.code).toBe('JOB_DISABLED');
      expect(await prisma.order.count()).toBe(0);
    } finally { await disabled.close(); }
  });

  it('processes passed purchases/drafts exactly once with the shared cutoff service', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: 'admin@test.com', password: 'Test@1234' }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', ORIGIN).set('Cookie', cookie).set('x-csrf-token', login.body.csrfToken).send(body);
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } });
    const input = { employeeId: SEED_IDS.employee, deliveryDate: '2026-10-07', lines: [{ menuItemId: item.id, quantity: 2,
      combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }] };
    const quote = await post('/orders/quote', input).expect(201);
    const placed = await post('/orders', { ...input, status: 'PLACED', acceptedQuote: quote.body.fingerprint, actionId: randomUUID() }).expect(201);
    const draft = await post('/orders', { ...input, status: 'DRAFT', actionId: randomUUID() }).expect(201);
    now = new Date('2026-10-05T10:30:00Z');
    const first = await maintain().expect(200);
    expect(first.body).toEqual({ cutoffs: { dates: 1, confirmed: 1, cancelled: 1, skipped: 0, failed: 0 }, fixtures: null });
    const repeat = await maintain().expect(200);
    expect(repeat.body.cutoffs).toEqual({ dates: 0, confirmed: 0, cancelled: 0, skipped: 0, failed: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).status).toBe('CONFIRMED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: draft.body.id } })).status).toBe('CANCELLED');
    expect(await prisma.prepUnit.count()).toBe(1);
    expect(await prisma.deliveryDrop.count()).toBe(1);
  });

  it('runs optional fixtures idempotently and preserves reviewer delivery notes', async () => {
    process.env.DEMO_FIXTURES_ENABLED = 'true';
    const first = await maintain().expect(200);
    expect(first.body.fixtures.date).toBe('2026-10-05');
    expect(first.body.fixtures.insertedOrders).toBeGreaterThan(0);
    const stop = await prisma.deliveryDrop.findFirstOrThrow({ where: { deliveryDate: '2026-10-05', status: 'OUT_FOR_DELIVERY' } });
    await prisma.deliveryDrop.update({ where: { id: stop.id }, data: { note: 'Preserve reviewer note after external job.' } });
    const count = await prisma.order.count();
    expect((await maintain().expect(200)).body.fixtures.insertedOrders).toBe(0);
    expect(await prisma.order.count()).toBe(count);
    expect((await prisma.deliveryDrop.findUniqueOrThrow({ where: { id: stop.id } })).note).toBe('Preserve reviewer note after external job.');
  });

  it('reports a sanitized retryable failure instead of exposing database errors or credentials', async () => {
    const failure = jest.spyOn(app.get(CutoffsService), 'scanDue').mockRejectedValueOnce(new Error(`Private database URL and ${TOKEN}`));
    try {
      const response = await maintain().expect(503);
      expect(response.body.code).toBe('MAINTENANCE_FAILED');
      expect(JSON.stringify(response.body)).not.toContain(TOKEN);
      expect(JSON.stringify(response.body)).not.toContain('Private database URL');
      expect(await prisma.order.count()).toBe(0);
    } finally { failure.mockRestore(); }
  });

  it('validates a configured maintenance token and permits explicit disablement', () => {
    const previous = process.env.MAINTENANCE_TOKEN;
    try {
      for (const token of ['short-token', 'contains whitespace even when longer than thirty two']) {
        process.env.MAINTENANCE_TOKEN = token;
        expect(() => readConfig()).toThrow('MAINTENANCE_TOKEN');
      }
      process.env.MAINTENANCE_TOKEN = TOKEN;
      expect(readConfig().maintenanceToken).toBe(TOKEN);
      process.env.MAINTENANCE_TOKEN = '';
      expect(readConfig().maintenanceToken).toBeUndefined();
    } finally { if (previous === undefined) delete process.env.MAINTENANCE_TOKEN; else process.env.MAINTENANCE_TOKEN = previous; }
  });
});
