import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { CompanyResponse, DeliveryAddressSnapshot, OrderQuoteResponse, SessionResponse, SettingsResponse, SettingsUpdateRequest } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { CutoffsService } from '../../apps/api/src/modules/cutoffs/cutoffs.service';
import { CutoffsScheduler } from '../../apps/api/src/modules/cutoffs/cutoffs.scheduler';
import { json } from '../../apps/api/src/modules/orders/order.mapping';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Cutoff integration tests require a separate TEST_DATABASE_URL ending in _test.');
}
const WEB_ORIGIN = 'http://localhost:3000';
const DELIVERY_DATE = '2026-10-07';
const CUTOFF = '2026-10-05T10:30:00.000Z';
type Login = { cookie: string; csrf: string };

describe('Phase 2 transactional cutoff processing and calendar policies on PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login;
  let now = new Date('2026-10-05T10:29:59.999Z');

  async function application(): Promise<NestExpressApplication> {
    const instance = await createApplication({ databaseUrl: databaseUrl!, webOrigin: WEB_ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(instance.get(Clock), 'now').mockImplementation(() => new Date(now));
    await instance.init();
    return instance;
  }
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect();
    await resetPhase1Fixture(prisma);
    app = await application();
  });
  beforeEach(async () => {
    now = new Date('2026-10-05T10:29:59.999Z');
    await resetPhase1Fixture(prisma);
    admin = await login();
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  async function login(email = 'admin@test.com'): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function post(path: string, body: object, identity = admin) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', identity.csrf).send(body);
  }
  function patch(path: string, body: object) {
    return request(app.getHttpServer()).patch(`/api/v1${path}`).set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf).send(body);
  }
  function get(path: string) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', admin.cookie); }
  async function settings(): Promise<SettingsResponse> { return (await get('/settings').expect(200)).body as SettingsResponse; }
  function editable(value: SettingsResponse): SettingsUpdateRequest {
    return { version: value.version, defaultPriceTierId: value.defaultPriceTierId, workingDays: value.workingDays, holidays: value.holidays,
      cutoffTime: value.cutoffTime, cutoffWorkingDays: value.cutoffWorkingDays, riskThresholdMinutes: value.riskThresholdMinutes };
  }
  function process(deliveryDate = DELIVERY_DATE) { return post('/cutoffs/process', { deliveryDate }); }

  // Valid producer-independent purchases exercise the cutoff transaction rather
  // than depending on the Orders API's quote/placement implementation.
  async function fixture(options: { draft?: boolean; date?: string; time?: string; address?: Partial<DeliveryAddressSnapshot>; omitCombinations?: boolean } = {}) {
    const date = options.date ?? DELIVERY_DATE;
    const time = options.time ?? '12:30';
    const company = await prisma.company.findUniqueOrThrow({ where: { id: SEED_IDS.company }, include: { packaging: true, defaultAddress: true } });
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: SEED_IDS.employee } });
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: SEED_IDS.dish }, include: { station: true } });
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } });
    const user = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    const saved = company.defaultAddress!;
    const address: DeliveryAddressSnapshot = { id: saved.id, label: saved.label, line1: saved.line1, line2: saved.line2,
      city: saved.city, region: saved.region, postalCode: saved.postalCode, country: saved.country, ...options.address };
    const deliveryAt = new Date(`${date}T${time}:00+05:30`);
    const plannedDispatchReadyAt = new Date(deliveryAt.getTime() - company.deliveryMinutes * 60_000);
    const plannedKitchenReadyAt = new Date(plannedDispatchReadyAt.getTime() - 30 * 60_000);
    const cutoff = await prisma.$transaction((tx) => app.get(CutoffsService).ensureDate(tx, date));
    const quote: OrderQuoteResponse = {
      fingerprint: 'fixture-accepted-quote', currency: 'USD', cutoffAt: cutoff.cutoffAt.toISOString(), settingsVersion: cutoff.settingsVersion,
      employee: { id: employee.id, name: employee.name, email: employee.email, phone: employee.phone, canChooseAddress: employee.canChooseAddress,
        canChangeTime: employee.canChangeTime, canChangePackaging: employee.canChangePackaging, allergens: [], dietaryTags: [] },
      company: { id: company.id, name: company.name, billingName: company.billingName, billingEmail: company.billingEmail, billingAddress: company.billingAddress,
        billingContactName: company.billingContactName, phone: company.phone, deliveryMinutes: company.deliveryMinutes },
      delivery: { deliveryDate: date, deliveryTime: time, deliveryAt: deliveryAt.toISOString(), address,
        packaging: company.packaging ? { id: company.packaging.id, name: company.packaging.name } : null,
        driverInstructions: company.driverInstructions, defaultDriverId: company.defaultDriverId,
        plannedDispatchReadyAt: plannedDispatchReadyAt.toISOString(), plannedKitchenReadyAt: plannedKitchenReadyAt.toISOString() },
      tier: { id: SEED_IDS.defaultTier, name: 'Standard' }, totalMinor: 1760,
      lines: [{ menuItemId: item.id, dish: { id: dish.id, sku: dish.sku, name: dish.name, description: dish.description, imageUrl: dish.imageUrl,
        temperature: dish.temperature, station: dish.station ? { id: dish.station.id, name: dish.station.name } : null, allergens: [], dietaryTags: [] },
        quantity: 2, basePriceMinor: 800, priceSource: 'EXPLICIT', tierId: SEED_IDS.defaultTier, totalMinor: 1760, allergyWarnings: [],
        combinations: [{ canonicalKey: createHash('sha256').update('Grain:Brown rice').digest('hex'), quantity: 2, unitPriceMinor: 880, totalMinor: 1760,
          selections: [{ groupId: SEED_IDS.group, groupName: 'Grain', optionId: SEED_IDS.option, optionName: 'Brown rice', priceMinor: 80,
            priceSource: 'EXPLICIT', tierId: SEED_IDS.defaultTier, allergens: [], dietaryTags: [] }] }] }],
    };
    const input = { employeeId: employee.id, deliveryDate: date, addressId: saved.id, deliveryTime: time,
      lines: options.draft ? [] : [{ menuItemId: item.id, quantity: 2, combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }] };
    const addressKey = createHash('sha256').update(JSON.stringify([address.line1, address.line2 ?? '', address.city, address.region, address.postalCode, address.country]
      .map((value) => value.trim().replace(/\s+/g, ' ').toLowerCase()))).digest('hex');
    return prisma.order.create({ data: {
      employeeId: employee.id, companyId: company.id, employeeName: employee.name, companyName: company.name,
      employeeSnapshot: json(quote.employee), companySnapshot: json(quote.company), deliverySnapshot: json(quote.delivery), input: json(input),
      deliveryDate: date, deliveryAt, cutoffAt: cutoff.cutoffAt, addressKey, plannedDispatchReadyAt, plannedKitchenReadyAt,
      createdById: user.id, status: options.draft ? 'DRAFT' : 'PLACED',
      ...(options.draft ? {} : { purchaseSnapshot: json(quote), totalMinor: quote.totalMinor, placedAt: new Date(now),
        lines: { create: [{ dishId: dish.id, menuItemId: item.id, sortOrder: 0, quantity: 2, basePriceMinor: 800, totalMinor: 1760, dishSnapshot: json(quote.lines[0].dish),
          ...(options.omitCombinations ? {} : { combinations: { create: [{ canonicalKey: quote.lines[0].combinations[0].canonicalKey, quantity: 2, unitPriceMinor: 880, totalMinor: 1760,
            selections: { create: [{ groupId: SEED_IDS.group, groupName: 'Grain', optionId: SEED_IDS.option, optionName: 'Brown rice', priceMinor: 80,
              priceSource: 'EXPLICIT', tierId: SEED_IDS.defaultTier, sortOrder: 0, allergens: [], dietaryTags: [] }] } }] } }),
        }] } }),
    } });
  }

  it('locks at the exact cutoff boundary, confirms a purchase and cancels an empty draft', async () => {
    const placed = await fixture(), draft = await fixture({ draft: true });
    await process().expect(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).status).toBe('PLACED');
    now = new Date(CUTOFF);
    const result = await process().expect(200);
    expect(result.body).toEqual({ deliveryDate: DELIVERY_DATE, confirmed: 1, cancelled: 1, skipped: 0, failed: 0, failures: [] });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).toMatchObject({ status: 'CONFIRMED', version: 2, totalMinor: 1760, confirmedAt: now });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: 'CANCELLED', version: 2, cancelledAt: now, totalMinor: null });
    const prep = await prisma.prepUnit.findMany(); expect(prep).toHaveLength(1);
    expect(prep[0]).toMatchObject({ status: 'PENDING', stationName: 'Hot kitchen', startedAt: null, doneAt: null });
    const drops = await prisma.deliveryDrop.findMany(); expect(drops).toHaveLength(1);
    const driver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    expect(drops[0]).toMatchObject({ companyId: SEED_IDS.company, driverId: driver.id, status: 'AWAITING_KITCHEN' });
    expect(await prisma.orderEvent.count({ where: { type: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.orderEvent.count({ where: { type: 'CANCELLED' } })).toBe(1);
    expect((await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } })).processedAt).toEqual(now);
  });

  it('repeated and concurrent manual runs create exactly one transition and fulfilment set', async () => {
    await fixture(); await fixture({ draft: true }); now = new Date(CUTOFF);
    const results = await Promise.all([process().expect(200), process().expect(200)]);
    expect(results.reduce((count, result) => count + result.body.confirmed, 0)).toBe(1);
    expect(results.reduce((count, result) => count + result.body.cancelled, 0)).toBe(1);
    expect(results.every((result) => result.body.failed === 0)).toBe(true);
    expect((await process().expect(200)).body).toMatchObject({ confirmed: 0, cancelled: 0, skipped: 2, failed: 0 });
    expect(await prisma.prepUnit.count()).toBe(1); expect(await prisma.deliveryDrop.count()).toBe(1); expect(await prisma.orderEvent.count()).toBe(2);
  });

  it('groups actual address text and exact time across different reference IDs and labels', async () => {
    const first = await fixture(), second = await fixture({ address: { id: randomUUID(), label: 'Separate saved record', line1: ' 42   EXAMPLE STREET ' } });
    const differentTime = await fixture({ time: '12:31' }), differentAddress = await fixture({ address: { postalCode: '560002' } });
    now = new Date(CUTOFF); expect((await process().expect(200)).body.confirmed).toBe(4);
    const ids = await Promise.all([first, second, differentTime, differentAddress].map((order) => prisma.order.findUniqueOrThrow({ where: { id: order.id } })));
    expect(ids[0].dropId).toBe(ids[1].dropId); expect(ids[2].dropId).not.toBe(ids[0].dropId); expect(ids[3].dropId).not.toBe(ids[0].dropId);
    expect(await prisma.deliveryDrop.count()).toBe(3); expect(await prisma.prepUnit.count()).toBe(4);
  });

  it('rescans already processed dates for newly eligible records', async () => {
    await fixture(); now = new Date(CUTOFF); await process().expect(200);
    const additional = await fixture();
    const results = await app.get(CutoffsService).scanDue();
    expect(results).toEqual([{ deliveryDate: DELIVERY_DATE, confirmed: 1, cancelled: 0, skipped: 1, failed: 0, failures: [] }]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: additional.id } })).status).toBe('CONFIRMED');
    expect(await prisma.prepUnit.count()).toBe(2); expect(await prisma.deliveryDrop.count()).toBe(1);
  });

  it('rejects future manual processing without persisting a processed policy', async () => {
    await fixture(); const response = await process().expect(400); expect(response.body.code).toBe('CUTOFF_NOT_PASSED');
    expect((await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } })).processedAt).toBeNull();
    await process('not-a-date').expect(400); await process('2026-02-30').expect(400);
  });

  it.each(['kitchen', 'dispatch', 'driver'])('denies direct %s manual cutoff processing', async (role) => {
    now = new Date(CUTOFF); await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }, await login(`${role}@test.com`)).expect(403);
    expect(await prisma.deliveryDateCutoff.count()).toBe(0);
  });

  it('denies anonymous manual processing', async () => {
    await request(app.getHttpServer()).post('/api/v1/cutoffs/process').set('Origin', WEB_ORIGIN).send({ deliveryDate: DELIVERY_DATE }).expect(401);
  });

  it('startup catch-up processes multiple overdue past dates with no test interval', async () => {
    const first = await fixture({ date: '2026-10-01' }), second = await fixture({ date: '2026-10-02' });
    now = new Date('2026-10-08T08:00:00.000Z');
    const restarted = await application();
    try {
      expect((await prisma.order.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('CONFIRMED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('CONFIRMED');
      expect(await prisma.prepUnit.count()).toBe(2);
      expect(await restarted.get(CutoffsService).scanDue()).toEqual([]);
      await restarted.get(CutoffsScheduler).catchUp(); expect(await prisma.orderEvent.count()).toBe(2);
    } finally { await restarted.close(); }
  });

  it('recomputes unprocessed policy, order versions and explicit events before immediate due processing', async () => {
    const placed = await fixture(), draft = await fixture({ draft: true });
    const current = await settings();
    await patch('/settings', { ...editable(current), cutoffTime: '15:00' }).expect(200);
    const policy = await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } });
    expect(policy).toMatchObject({ cutoffAt: new Date('2026-10-05T09:30:00.000Z'), settingsVersion: 2, processedAt: now });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).toMatchObject({ status: 'CONFIRMED', version: 3, cutoffAt: policy.cutoffAt });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: 'CANCELLED', version: 3, cutoffAt: policy.cutoffAt });
    const changes = await prisma.orderEvent.findMany({ where: { type: 'CUTOFF_CHANGED' } }); expect(changes).toHaveLength(2);
    expect(changes[0].actorName).toBe('Demo Admin');
    expect(changes[0].details).toEqual({ before: CUTOFF, after: '2026-10-05T09:30:00.000Z', settingsVersion: 2 });
    expect(await prisma.orderEvent.count()).toBe(4);
  });

  it('moves an unprocessed cutoff later with an event but cannot reopen a processed date', async () => {
    const placed = await fixture();
    await patch('/settings', { ...editable(await settings()), cutoffTime: '17:00' }).expect(200);
    const adjusted = await prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(adjusted).toMatchObject({ status: 'PLACED', version: 2, cutoffAt: new Date('2026-10-05T11:30:00.000Z') });
    expect((await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } })).processedAt).toBeNull();
    now = new Date('2026-10-05T11:30:00.000Z'); await process().expect(200);
    const frozen = await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } });
    await patch('/settings', { ...editable(await settings()), cutoffWorkingDays: 0, cutoffTime: '20:00' }).expect(200);
    const after = await prisma.deliveryDateCutoff.findUniqueOrThrow({ where: { deliveryDate: DELIVERY_DATE } });
    expect(after).toEqual(frozen);
    expect((await get(`/settings/cutoff?deliveryDate=${DELIVERY_DATE}`).expect(200)).body).toMatchObject({ cutoffAt: frozen.cutoffAt.toISOString(), settingsVersion: frozen.settingsVersion });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).status).toBe('CONFIRMED');
    expect(await prisma.orderEvent.count({ where: { type: 'CUTOFF_CHANGED' } })).toBe(1);
  });

  it('rejects company calendar edits invalidating live orders and returns exact affected links', async () => {
    const placed = await fixture(), draft = await fixture({ draft: true });
    const company = (await get(`/companies/${SEED_IDS.company}`).expect(200)).body as CompanyResponse;
    const result = await patch(`/companies/${company.id}`, { version: company.version, holidays: [DELIVERY_DATE] }).expect(409);
    expect(result.body.code).toBe('CALENDAR_HAS_LIVE_ORDERS');
    expect(result.body.details.orders).toEqual([{ id: placed.id, number: placed.number, deliveryDate: DELIVERY_DATE, status: 'PLACED' },
      { id: draft.id, number: draft.number, deliveryDate: DELIVERY_DATE, status: 'DRAFT' }]);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).holidays).toEqual([]);
    now = new Date(CUTOFF); await process().expect(200);
    expect((await patch(`/companies/${company.id}`, { version: company.version, holidays: [DELIVERY_DATE] }).expect(409)).body.details.orders).toHaveLength(1);
  });

  it('enforces same-company order/drop membership in the database', async () => {
    const order = await fixture();
    const other = await prisma.company.create({ data: { id: randomUUID(), name: 'Other fixture company', billingName: 'Other LLC', billingEmail: 'billing@other.example',
      billingAddress: 'Other address', billingContactName: 'Other accounts', workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] } });
    const drop = await prisma.deliveryDrop.create({ data: { companyId: other.id, deliveryDate: DELIVERY_DATE, deliveryAt: order.deliveryAt,
      addressKey: order.addressKey, addressSnapshot: {}, driverInstructions: '' } });
    await expect(prisma.order.update({ where: { id: order.id }, data: { dropId: drop.id } })).rejects.toMatchObject({ code: 'P2003' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).dropId).toBeNull();
  });

  it('rolls back a failed per-order confirmation and reports its actionable code', async () => {
    const order = await fixture({ omitCombinations: true }); now = new Date(CUTOFF);
    const result = await process().expect(200);
    expect(result.body).toEqual({ deliveryDate: DELIVERY_DATE, confirmed: 0, cancelled: 0, skipped: 0, failed: 1,
      failures: [{ orderId: order.id, code: 'ORDER_COMBINATIONS_MISSING' }] });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PLACED', version: 1, confirmedAt: null, dropId: null });
    expect(await prisma.orderEvent.count()).toBe(0); expect(await prisma.prepUnit.count()).toBe(0); expect(await prisma.deliveryDrop.count()).toBe(0);
  });
});
