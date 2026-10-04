import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { DEMO_COMPANY_IDS, seedDemoFixtures } from '../../apps/api/src/modules/demo/demo-fixtures';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Fixture tests require a separate TEST_DATABASE_URL ending in _test.');

describe('Append-only rolling review-day fixtures on isolated PostgreSQL', () => {
  let prisma: PrismaClient;
  const sunday = new Date('2026-10-04T06:00:00Z');
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect();
    await resetPhase1Fixture(prisma);
  });
  afterAll(async () => { if (prisma) { await resetPhase1Fixture(prisma); await prisma.$disconnect(); } });

  it('installs exactly four staff, realistic configuration and valid Sunday driver work with reconciled purchase/invoice totals', async () => {
    const result = await seedDemoFixtures(prisma, sunday);
    expect(result.insertedOrders).toBeGreaterThan(20);
    expect(await prisma.staffUser.count()).toBe(4);
    expect(await prisma.company.count()).toBe(4);
    expect(await prisma.employee.count()).toBe(26);
    expect(await prisma.dish.count()).toBe(15);
    const driver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    const stop = await prisma.deliveryDrop.findFirstOrThrow({ where: { driverId: driver.id, deliveryDate: '2026-10-04', status: 'OUT_FOR_DELIVERY' },
      include: { orders: { include: { lines: { include: { combinations: { include: { prepUnit: true } } } } } } } });
    expect(stop.orders).toHaveLength(2);
    expect(stop.departedAt!.getTime()).toBeLessThan(sunday.getTime());
    expect(stop.targetAtDeparture).toEqual(stop.deliveryAt);
    for (const order of stop.orders) {
      expect(order.status).toBe('CONFIRMED');
      expect(order.invoiceId).toBeNull();
      expect(order.kitchenReadyAt!.getTime()).toBeLessThanOrEqual(stop.departedAt!.getTime());
      expect(order.lines.reduce((total, line) => total + line.totalMinor, 0)).toBe(order.totalMinor);
      for (const line of order.lines) {
        expect(line.combinations.reduce((total, combination) => total + combination.quantity, 0)).toBe(line.quantity);
        expect(line.combinations.every((combination) => combination.prepUnit?.status === 'DONE')).toBe(true);
      }
    }
    expect(new Set((await prisma.order.findMany()).map((order) => order.status))).toEqual(new Set(['DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED']));
    const invoices = await prisma.invoice.findMany({ include: { orders: true } });
    expect(invoices.length).toBeGreaterThan(0);
    for (const invoice of invoices) {
      expect(invoice.orders).toHaveLength(2);
      expect(invoice.orders.every((order) => order.status === 'DELIVERED' && order.companyId === invoice.companyId)).toBe(true);
      expect(invoice.orders.reduce((total, order) => total + (order.totalMinor ?? 0), 0)).toBe(invoice.totalMinor);
      expect(invoice.companySnapshot).toEqual(invoice.orders[0].companySnapshot);
    }
    expect(await prisma.billingCredit.count()).toBeGreaterThan(0);
  });

  it('preserves reviewer changes and completed stops on rerun, then appends Monday without duplicate concurrent work', async () => {
    const originalCounts = { orders: await prisma.order.count(), invoices: await prisma.invoice.count() };
    const stop = await prisma.deliveryDrop.findFirstOrThrow({ where: { deliveryDate: '2026-10-04', status: 'OUT_FOR_DELIVERY' } });
    await prisma.deliveryDrop.update({ where: { id: stop.id }, data: { note: 'Reviewer recorded this note' } });
    await prisma.company.update({ where: { id: DEMO_COMPANY_IDS[0] }, data: { billingName: 'Reviewer changed legal name' } });
    const repeat = await seedDemoFixtures(prisma, sunday);
    expect(repeat.insertedOrders).toBe(0);
    expect(await prisma.order.count()).toBe(originalCounts.orders);
    expect(await prisma.invoice.count()).toBe(originalCounts.invoices);
    expect((await prisma.deliveryDrop.findUniqueOrThrow({ where: { id: stop.id } })).note).toBe('Reviewer recorded this note');
    expect((await prisma.company.findUniqueOrThrow({ where: { id: DEMO_COMPANY_IDS[0] } })).billingName).toBe('Reviewer changed legal name');
    const monday = new Date('2026-10-05T06:00:00Z');
    await Promise.all([seedDemoFixtures(prisma, monday), seedDemoFixtures(prisma, monday)]);
    expect(await prisma.deliveryDrop.count({ where: { deliveryDate: '2026-10-05', status: 'OUT_FOR_DELIVERY' } })).toBe(1);
    const tomorrowStop = await prisma.deliveryDrop.findFirstOrThrow({ where: { deliveryDate: '2026-10-05', status: 'OUT_FOR_DELIVERY' }, include: { orders: true } });
    expect(tomorrowStop.orders).toHaveLength(2);
    const stableCount = await prisma.order.count();
    expect((await seedDemoFixtures(prisma, monday)).insertedOrders).toBe(0);
    expect(await prisma.order.count()).toBe(stableCount);
  });

  it('serves only the actual kitchen-day driver stop over HTTP and retains aggregate delivery after fixture rerun', async () => {
    const monday = new Date('2026-10-05T06:00:00Z'), origin = 'http://localhost:3000';
    let app: NestExpressApplication | undefined;
    try {
      app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: origin, production: false, port: 3001, sessionTtlHours: 12 });
      jest.spyOn(app.get(Clock), 'now').mockImplementation(() => monday);
      await app.init();
      const server = app.getHttpServer();
      const login = await request(server).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'driver@test.com', password: 'Test@1234' }).expect(200);
      const cookie = login.headers['set-cookie'][0].split(';')[0];
      const list = await request(server).get('/api/v1/driver/today').set('Cookie', cookie).expect(200);
      expect(list.body.date).toBe('2026-10-05');
      const stop = list.body.items.find((item: { status: string }) => item.status === 'OUT_FOR_DELIVERY');
      expect(stop).toBeDefined();
      const yesterday = await prisma.deliveryDrop.findFirstOrThrow({ where: { deliveryDate: '2026-10-04', status: 'OUT_FOR_DELIVERY' } });
      // Resource scoping hides prior-day stops as absent, matching the Driver
      // endpoint's existing non-disclosure policy.
      const denied = await request(server).get(`/api/v1/driver/drops/${yesterday.id}`).set('Cookie', cookie).expect(404);
      expect(denied.body.code).toBe('DROP_NOT_FOUND');
      await request(server).post(`/api/v1/driver/drops/${stop.id}/deliver`).set('Cookie', cookie).set('Origin', origin)
        .set('x-csrf-token', login.body.csrfToken).send({ version: stop.version, actionId: '00000000-0000-4000-8000-000000000101', note: 'Reviewer delivered the demo stop.' }).expect(200);
      await seedDemoFixtures(prisma, monday);
      const delivered = await prisma.deliveryDrop.findUniqueOrThrow({ where: { id: stop.id }, include: { orders: true } });
      expect(delivered.status).toBe('DELIVERED');
      expect(delivered.note).toBe('Reviewer delivered the demo stop.');
      expect(delivered.orders.every((order) => order.status === 'DELIVERED' && order.deliveredAt?.getTime() === monday.getTime())).toBe(true);
    } finally { if (app) await app.close(); }
  });
});
