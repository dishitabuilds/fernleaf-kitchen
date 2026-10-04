import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { KitchenBoardResponse, OrderInput, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { json } from '../../apps/api/src/modules/orders/order.mapping';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Kitchen load checks require a separate TEST_DATABASE_URL ending in _test.');
}
const WEB_ORIGIN = 'http://localhost:3000';
const DELIVERY_DATE = '2026-10-07';
type Login = { cookie: string; csrf: string };

describe('400-order kitchen workload on isolated PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login, kitchen: Login;
  let now = new Date('2026-10-05T10:29:59.999Z');

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect();
    await resetPhase1Fixture(prisma);
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: WEB_ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now));
    await app.init();
    admin = await login('admin@test.com');
    kitchen = await login('kitchen@test.com');
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  async function login(email: string): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN)
      .send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function post(path: string, body: object) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', admin.cookie)
      .set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf).send(body);
  }

  it('paginates and filters 400 confirmed orders without query counts growing with page size', async () => {
    const menuItem = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } });
    const coldStation = await prisma.referenceValue.findUniqueOrThrow({ where: { kind_name: { kind: 'KITCHEN_STATION', name: 'Cold kitchen' } } });
    const input: OrderInput = { employeeId: SEED_IDS.employee, deliveryDate: DELIVERY_DATE,
      lines: [{ menuItemId: menuItem.id, quantity: 2, combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }] };

    // Capture two real API purchases, before and after a station change. Bulk
    // copies below are labelled synthetic test history, never reviewer data.
    for (const stationId of [null, coldStation.id]) {
      if (stationId) await prisma.dish.update({ where: { id: SEED_IDS.dish }, data: { stationId } });
      const quote = (await post('/orders/quote', input).expect(201)).body as { fingerprint: string };
      await post('/orders', { ...input, status: 'PLACED', actionId: randomUUID(), acceptedQuote: quote.fingerprint }).expect(201);
    }
    now = new Date('2026-10-05T10:30:00.000Z');
    await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    const templates = await prisma.order.findMany({ orderBy: { number: 'asc' }, include: {
      lines: { include: { combinations: { include: { selections: true, prepUnit: true } } } },
    } });
    expect(templates).toHaveLength(2);

    await prisma.$transaction(async (tx) => {
      const orders = [], lines = [], combinations = [], selections = [], units = [], revisions = [], events = [];
      for (let index = 0; index < 398; index++) {
        const template = templates[index % 2], orderId = randomUUID();
        const { id: _id, number: _number, createdAt: _createdAt, updatedAt: _updatedAt, lines: templateLines, ...scalars } = template;
        void _id; void _number; void _createdAt; void _updatedAt;
        orders.push({ ...scalars, id: orderId, employeeSnapshot: json(template.employeeSnapshot),
          companySnapshot: json(template.companySnapshot), deliverySnapshot: json(template.deliverySnapshot),
          input: json(template.input), purchaseSnapshot: json(template.purchaseSnapshot), createdAt: template.createdAt });
        revisions.push({ orderId, version: 1, snapshot: json(template.purchaseSnapshot), actorId: template.createdById, createdAt: template.placedAt! });
        events.push({ orderId, actionKey: 'load-fixture:placed', type: 'PLACED', actorId: template.createdById,
          actorName: 'Synthetic load fixture', details: { fixture: '400-order kitchen check' }, createdAt: template.placedAt! },
        { orderId, actionKey: 'load-fixture:confirmed', type: 'CONFIRMED', actorId: template.createdById,
          actorName: 'Synthetic load fixture', details: { fixture: '400-order kitchen check' }, createdAt: template.confirmedAt! });
        for (const line of templateLines) {
          const lineId = randomUUID();
          lines.push({ id: lineId, orderId, dishId: line.dishId, menuItemId: line.menuItemId, sortOrder: line.sortOrder,
            quantity: line.quantity, basePriceMinor: line.basePriceMinor, totalMinor: line.totalMinor, dishSnapshot: json(line.dishSnapshot) });
          for (const combination of line.combinations) {
            const combinationId = randomUUID();
            combinations.push({ id: combinationId, lineId, canonicalKey: combination.canonicalKey, quantity: combination.quantity,
              unitPriceMinor: combination.unitPriceMinor, totalMinor: combination.totalMinor });
            for (const selection of combination.selections) {
              const { id: _selectionId, combinationId: _combinationId, ...selected } = selection;
              void _selectionId; void _combinationId;
              selections.push({ ...selected, id: randomUUID(), combinationId,
                allergens: json(selection.allergens), dietaryTags: json(selection.dietaryTags) });
            }
            units.push({ combinationId, stationId: combination.prepUnit!.stationId, stationName: combination.prepUnit!.stationName });
          }
        }
      }
      await tx.order.createMany({ data: orders });
      await tx.orderLine.createMany({ data: lines });
      await tx.orderCombination.createMany({ data: combinations });
      await tx.selectionSnapshot.createMany({ data: selections });
      await tx.prepUnit.createMany({ data: units });
      await tx.orderRevision.createMany({ data: revisions });
      await tx.orderEvent.createMany({ data: events });
    });
    expect(await prisma.order.count({ where: { status: 'CONFIRMED' } })).toBe(400);
    expect(await prisma.prepUnit.count()).toBe(400);

    // Observe actual node-postgres SQL calls, including auth/transaction queries.
    // Comparing page sizes catches per-unit queries without imposing an invented
    // wall-clock target on different development and CI machines.
    const sql = jest.spyOn(Client.prototype, 'query');
    async function measure(query: string) {
      sql.mockClear();
      const started = performance.now();
      const response = await request(app.getHttpServer()).get(`/api/v1/kitchen?date=${DELIVERY_DATE}&${query}`)
        .set('Cookie', kitchen.cookie).expect(200);
      const result = { body: response.body as KitchenBoardResponse, ms: Math.round((performance.now() - started) * 10) / 10,
        sqlCalls: sql.mock.calls.length, bytes: Buffer.byteLength(response.text) };
      expect(result.sqlCalls).toBeGreaterThan(0);
      return result;
    }
    try {
      const single = await measure('pageSize=1');
      const full = await measure('pageSize=100');
      const next = await measure('pageSize=100&page=2');
      const filtered = await measure(`pageSize=100&stationId=${coldStation.id}&status=PENDING`);
      expect(full.body).toMatchObject({ total: 400, page: 1, pageSize: 100, date: DELIVERY_DATE });
      expect(full.body.items).toHaveLength(100);
      expect(next.body.items).toHaveLength(100);
      expect(new Set([...full.body.items, ...next.body.items].map((unit) => unit.id)).size).toBe(200);
      expect(full.body.items.reduce((total, unit) => total + unit.quantity, 0)).toBe(200);
      expect(filtered.body.total).toBe(200);
      expect(filtered.body.items).toHaveLength(100);
      expect(filtered.body.items.every((unit) => unit.station?.id === coldStation.id && unit.status === 'PENDING')).toBe(true);
      expect(full.body.stations).toHaveLength(2);
      expect(full.sqlCalls).toBeLessThanOrEqual(single.sqlCalls + 2);
      expect(next.sqlCalls).toBeLessThanOrEqual(single.sqlCalls + 2);
      expect(filtered.sqlCalls).toBeLessThanOrEqual(single.sqlCalls + 2);
      console.info('400-order kitchen evidence', JSON.stringify({ orders: 400, units: 400, meals: 800,
        oneUnit: { ms: single.ms, sqlCalls: single.sqlCalls, bytes: single.bytes },
        page100: { ms: full.ms, sqlCalls: full.sqlCalls, bytes: full.bytes },
        page2: { ms: next.ms, sqlCalls: next.sqlCalls, bytes: next.bytes },
        stationFiltered: { ms: filtered.ms, sqlCalls: filtered.sqlCalls, bytes: filtered.bytes } }));
    } finally { sql.mockRestore(); }
  });
});
