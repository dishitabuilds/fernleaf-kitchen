import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { DeliveryDropResponse, KitchenBoardResponse, OperationalOrderResponse, OrderDetail, OrderInput, OrderQuoteResponse, PrepUnitResponse, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { timingRisk } from '../../apps/api/src/domain/operations';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Operations tests require a separate TEST_DATABASE_URL ending in _test.');
const ORIGIN = 'http://localhost:3000', TODAY = '2026-10-07';
type Login = { cookie: string; csrf: string };

describe('Phase 3 real PostgreSQL preparation, dispatch and own-today delivery', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login, kitchen: Login, dispatch: Login, driver: Login, menuItemId: string;
  let now = new Date('2026-10-07T05:00:00Z');
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect(); await resetPhase1Fixture(prisma);
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now));
    await app.init();
  });
  beforeEach(async () => {
    now = new Date('2026-10-07T05:00:00Z'); await resetPhase1Fixture(prisma);
    [admin, kitchen, dispatch, driver] = await Promise.all(['admin', 'kitchen', 'dispatch', 'driver'].map((role) => login(`${role}@test.com`)));
    menuItemId = (await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } })).id;
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });
  async function login(email: string): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function get(path: string, identity = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', identity.cookie); }
  function post(path: string, body: object, identity = admin) { return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function action(value: { version: number }, extra: object = {}) { return { version: value.version, actionId: randomUUID(), ...extra }; }
  async function confirmed(overrides: Partial<OrderInput> = {}, secondOptionId?: string): Promise<OrderDetail> {
    const combinations = [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] },
      ...(secondOptionId ? [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: secondOptionId }] }] : [])];
    const input: OrderInput = { employeeId: SEED_IDS.employee, deliveryDate: TODAY, deliveryTime: '12:30',
      lines: [{ menuItemId, quantity: secondOptionId ? 4 : 2, combinations }], ...overrides };
    const quote = (await post('/orders/quote', { ...input, overrideReason: 'Synthetic overdue operational fixture' }).expect(201)).body as OrderQuoteResponse;
    return (await post('/orders/override-create', { ...input, actionId: randomUUID(), acceptedQuote: quote.fingerprint, reason: 'Synthetic overdue operational fixture' }).expect(201)).body as OrderDetail;
  }
  async function secondOption(): Promise<string> {
    const id = randomUUID();
    await prisma.option.create({ data: { id, name: 'Jeera rice', costMinor: 50 } });
    await prisma.groupOption.create({ data: { groupId: SEED_IDS.group, optionId: id, sortOrder: 1 } });
    await prisma.optionTierPrice.create({ data: { optionId: id, tierId: SEED_IDS.defaultTier, amountMinor: 120 } });
    return id;
  }
  async function replacementDriver() {
    const original = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    const user = await prisma.staffUser.create({ data: { id: randomUUID(), email: 'replacement-driver@test.com', displayName: 'Replacement Driver', role: 'DRIVER', passwordHash: original.passwordHash } });
    return { user, identity: await login(user.email) };
  }
  async function board(date = TODAY): Promise<KitchenBoardResponse> { return (await get(`/kitchen?date=${date}`, kitchen).expect(200)).body as KitchenBoardResponse; }
  async function readDrop(id: string): Promise<DeliveryDropResponse> { return (await get(`/drops/${id}`, dispatch).expect(200)).body as DeliveryDropResponse; }
  async function completeAll(order: OrderDetail): Promise<DeliveryDropResponse> {
    const units = (await board(order.deliveryDate)).items.filter((unit) => unit.orderId === order.id);
    for (const unit of units) await post(`/prep-units/${unit.id}/complete`, action(unit), kitchen).expect(200);
    return readDrop(order.dropId!);
  }
  async function departure(order: OrderDetail): Promise<DeliveryDropResponse> {
    const ready = await completeAll(order);
    const dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    return (await post(`/drops/${ready.id}/depart`, action(dispatched), dispatch).expect(200)).body as DeliveryDropResponse;
  }

  it('enforces role routes, authentication, CSRF and field redaction', async () => {
    const order = await confirmed();
    await request(app.getHttpServer()).get('/api/v1/kitchen').expect(401);
    await get('/kitchen', dispatch).expect(403); await get('/drops', kitchen).expect(403); await get('/driver/today', kitchen).expect(403);
    await get(`/orders/${order.id}`, kitchen).expect(403); await get(`/orders/${order.id}`, dispatch).expect(403); await get(`/orders/${order.id}`, driver).expect(403);
    const unit = (await board()).items[0];
    await post(`/prep-units/${unit.id}/complete`, action(unit), dispatch).expect(403);
    await post(`/kitchen/orders/${order.id}/force-complete`, action(order, { reason: 'No permission' }), kitchen).expect(403);
    await post(`/drops/${order.dropId}/deliver`, action(await readDrop(order.dropId!)), dispatch).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/prep-units/${unit.id}/start`).set('Cookie', kitchen.cookie).set('Origin', ORIGIN).send(action(unit)).expect(403);
    for (const path of ['/kitchen', `/kitchen/orders/${order.id}`, `/drops/${order.dropId}`, '/driver/today']) {
      const identity = path.startsWith('/kitchen') ? kitchen : path.startsWith('/driver') ? driver : dispatch;
      const data = (await get(path, identity).expect(200)).body;
      expect(JSON.stringify(data)).not.toMatch(/"(?:priceMinor|unitPriceMinor|totalMinor|basePriceMinor|costMinor|billingEmail|billingAddress|purchaseSnapshot)"/);
    }
  });

  it('reads confirmed snapshot work with station/status pagination and excludes cancellation', async () => {
    const first = await confirmed(), second = await confirmed({ deliveryTime: '13:30' });
    const station = await prisma.referenceValue.findUniqueOrThrow({ where: { kind_name: { kind: 'KITCHEN_STATION', name: 'Hot kitchen' } } });
    await prisma.dish.update({ where: { id: SEED_IDS.dish }, data: { name: 'Changed live dish', active: false } });
    const result = (await get(`/kitchen?date=${TODAY}&stationId=${station.id}&status=PENDING&page=2&pageSize=1`, kitchen).expect(200)).body as KitchenBoardResponse;
    expect(result).toMatchObject({ total: 2, page: 2, pageSize: 1 }); expect(result.items).toHaveLength(1);
    expect(result.items[0].dish.name).toBe('Roasted vegetable rice box'); expect(result.stations).toEqual([{ id: station.id, name: 'Hot kitchen' }]);
    await post(`/orders/${second.id}/override`, action(second, { reason: 'Cancelled before preparation', action: 'CANCEL' })).expect(201);
    expect((await board()).items.map((unit) => unit.orderId)).toEqual([first.id]);
    expect((await get(`/drops?date=${TODAY}`, dispatch).expect(200)).body.total).toBe(1);
    await get('/kitchen?pageSize=101', kitchen).expect(400); await get('/kitchen?date=2026-02-30', kitchen).expect(400);
  });

  it('records direct completion start/done, earliest start and latest all-unit readiness', async () => {
    const order = await confirmed({}, await secondOption()), units = (await board()).items;
    const firstTime = new Date(now);
    const started = (await post(`/prep-units/${units[0].id}/start`, action(units[0]), kitchen).expect(200)).body as PrepUnitResponse;
    expect(started.startedAt).toBe(firstTime.toISOString()); expect(started.doneAt).toBeNull();
    now = new Date(now.getTime() + 10_000);
    await post(`/prep-units/${units[1].id}/complete`, action(units[1]), kitchen).expect(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).kitchenReadyAt).toBeNull();
    now = new Date(now.getTime() + 10_000);
    await post(`/prep-units/${started.id}/complete`, action(started), kitchen).expect(200);
    const actual = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(actual.kitchenStartedAt).toEqual(firstTime); expect(actual.kitchenReadyAt).toEqual(now);
    expect((await readDrop(order.dropId!))).toMatchObject({ status: 'KITCHEN_READY', kitchenReadyAt: now.toISOString() });
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'PREP_STARTED' } })).toBe(2);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'PREP_COMPLETED' } })).toBe(2);
  });

  it('replays duplicate actions and concurrent completion exactly once with key binding', async () => {
    const order = await confirmed(), unit = (await board()).items[0], body = action(unit);
    const responses = await Promise.all([post(`/prep-units/${unit.id}/complete`, body, kitchen), post(`/prep-units/${unit.id}/complete`, body, kitchen)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]); expect(responses[1].body).toEqual(responses[0].body);
    expect((await post(`/prep-units/${unit.id}/complete`, body, kitchen).expect(200)).body).toEqual(responses[0].body);
    expect((await post(`/prep-units/${unit.id}/start`, body, kitchen).expect(409)).body.code).toBe('ACTION_ID_REUSED');
    await post(`/prep-units/${unit.id}/complete`, action(unit), kitchen).expect(409);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'PREP_COMPLETED' } })).toBe(1);
    expect(await prisma.operationalAction.count()).toBe(1);
  });

  it('versions same-state membership additions and departed cancellations with immutable readiness history', async () => {
    const first = await confirmed(), pending = await readDrop(first.dropId!);
    const second = await confirmed(), joined = await readDrop(first.dropId!);
    expect(second.dropId).toBe(first.dropId); expect(joined.status).toBe('AWAITING_KITCHEN'); expect(joined.version).toBeGreaterThan(pending.version);
    await post(`/drops/${joined.id}/assign`, action(pending, { driverId: joined.driver!.id }), dispatch).expect(409);
    await completeAll(first); const departed = await departure(second);
    const fresh = (await get(`/orders/${first.id}`).expect(200)).body as OrderDetail;
    await post(`/orders/${first.id}/override`, action(fresh, { action: 'CANCEL', reason: 'Company cancelled one order while van was travelling' })).expect(201);
    const after = await readDrop(departed.id);
    expect(after.status).toBe('OUT_FOR_DELIVERY'); expect(after.version).toBeGreaterThan(departed.version); expect(after.orderCount).toBe(1);
    expect(after.departedAt).toBe(departed.departedAt); expect(after.kitchenReadyAt).toBe(departed.kitchenReadyAt);
    expect(after.dispatchReadyAt).toBe(departed.dispatchReadyAt); expect(after.targetAtDeparture).toBe(departed.targetAtDeparture);
    expect(after.events.some((event) => event.type === 'DROP_MEMBERSHIP_CHANGED')).toBe(true);
    expect(after.events.some((event) => event.type === 'KITCHEN_READY')).toBe(true);
    const last = after.events.at(-1)!;
    expect(last.details).toMatchObject({ activeOrderCount: 1, activeOrderIds: [second.id] });
    await post(`/driver/drops/${after.id}/deliver`, action(departed), driver).expect(409);
    await post(`/driver/drops/${after.id}/deliver`, action(after), driver).expect(200);
  });

  it('serializes simultaneous final units and final orders in one exact drop', async () => {
    const option = await secondOption(), first = await confirmed({}, option), second = await confirmed({}, option);
    expect(first.dropId).toBe(second.dropId);
    const units = (await board()).items;
    // Two bounded competing transactions at a time exercise last-unit and
    // last-order aggregation without intentionally exhausting the retry bound.
    for (const order of [first, second]) {
      const pair = units.filter((unit) => unit.orderId === order.id);
      expect((await Promise.all(pair.map((unit) => post(`/prep-units/${unit.id}/complete`, action(unit), kitchen)))).map((response) => response.status)).toEqual([200, 200]);
    }
    const drop = await readDrop(first.dropId!); expect(drop.status).toBe('KITCHEN_READY'); expect(drop.orders.every((order) => order.kitchenReadyAt !== null)).toBe(true);
    expect(await prisma.orderEvent.count({ where: { type: 'PREP_COMPLETED' } })).toBe(4);
  });

  it('force completion requires a reason and retains already-recorded prep history', async () => {
    const order = await confirmed({}, await secondOption()), units = (await board()).items;
    const done = (await post(`/prep-units/${units[0].id}/complete`, action(units[0]), kitchen).expect(200)).body as PrepUnitResponse;
    const fresh = (await get(`/kitchen/orders/${order.id}`, kitchen).expect(200)).body as OperationalOrderResponse;
    await post(`/kitchen/orders/${order.id}/force-complete`, action(fresh, { reason: '   ' })).expect(400);
    now = new Date(now.getTime() + 10_000);
    const body = action(fresh, { reason: 'Supervisor checked the remaining prepared meals' });
    const response = (await post(`/kitchen/orders/${order.id}/force-complete`, body).expect(200)).body as OperationalOrderResponse;
    expect(response.kitchenReadyAt).toBe(now.toISOString()); expect(response.prepUnits.find((unit) => unit.id === done.id)?.doneAt).toBe(done.doneAt);
    expect((await post(`/kitchen/orders/${order.id}/force-complete`, body).expect(200)).body).toEqual(response);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'KITCHEN_FORCE_COMPLETED' } })).toBe(1);
  });

  it('serializes simultaneous final orders so their shared drop becomes ready', async () => {
    const first = await confirmed(), second = await confirmed(), units = (await board()).items;
    expect(first.dropId).toBe(second.dropId);
    const responses = await Promise.all(units.map((unit) => post(`/prep-units/${unit.id}/complete`, action(unit), kitchen)));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const ready = await readDrop(first.dropId!);
    expect(ready.status).toBe('KITCHEN_READY'); expect(ready.orders.every((order) => order.kitchenReadyAt !== null)).toBe(true);
    expect(await prisma.orderEvent.count({ where: { type: 'PREP_COMPLETED' } })).toBe(2);
  });

  it('defines exact risk boundaries and exposes incomplete work risk on the board', async () => {
    const plan = new Date(now);
    expect(timingRisk(now, plan, false, 15)).toBe('AT_RISK'); expect(timingRisk(new Date(now.getTime() + 1), plan, false, 15)).toBe('LATE');
    expect(timingRisk(new Date(now.getTime() - 900_000), plan, false, 15)).toBe('AT_RISK');
    expect(timingRisk(new Date(now.getTime() - 900_001), plan, false, 15)).toBe('ON_TRACK');
    expect(timingRisk(now, null, false, 15)).toBe('MISSING_PLAN'); expect(timingRisk(now, null, true, 15)).toBe('COMPLETE');
    const order = await confirmed(), planAt = new Date(order.plannedKitchenReadyAt);
    now = new Date(planAt); expect((await board()).items[0].risk).toBe('AT_RISK');
    now = new Date(planAt.getTime() + 1); expect((await board()).items[0].risk).toBe('LATE');
    await completeAll(order); expect((await board()).items[0].risk).toBe('COMPLETE');
  });

  it('rejects premature dispatch/departure, invalid drivers and stale versions', async () => {
    const order = await confirmed(), pending = await readDrop(order.dropId!);
    await post(`/drops/${pending.id}/dispatch-ready`, action(pending), dispatch).expect(409);
    await post(`/drops/${pending.id}/depart`, action(pending), dispatch).expect(409);
    const kitchenUser = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'kitchen@test.com' } });
    await post(`/drops/${pending.id}/assign`, action(pending, { driverId: kitchenUser.id }), dispatch).expect(400);
    const ready = await completeAll(order);
    await post(`/drops/${ready.id}/dispatch-ready`, action(pending), dispatch).expect(409);
    const driverUser = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    await prisma.staffUser.update({ where: { id: driverUser.id }, data: { active: false } });
    const dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    expect((await post(`/drops/${ready.id}/depart`, action(dispatched), dispatch).expect(409)).body.code).toBe('DRIVER_REQUIRED');
    expect((await get('/drops/drivers', dispatch).expect(200)).body).toEqual([]);
  });

  it('assigns an active Driver and carries one purchase through all four roles', async () => {
    const order = await confirmed(), ready = await completeAll(order);
    const other = await prisma.staffUser.create({ data: { id: randomUUID(), email: 'second-driver@test.com', displayName: 'Second Driver', role: 'DRIVER', passwordHash: 'not-a-login-fixture' } });
    const assigned = (await post(`/drops/${ready.id}/assign`, action(ready, { driverId: other.id }), dispatch).expect(200)).body as DeliveryDropResponse;
    expect(assigned.driver).toEqual({ id: other.id, name: 'Second Driver' });
    const initialDriver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    const restored = (await post(`/drops/${ready.id}/assign`, action(assigned, { driverId: initialDriver.id }), dispatch).expect(200)).body as DeliveryDropResponse;
    const dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(restored), dispatch).expect(200)).body as DeliveryDropResponse;
    const departed = (await post(`/drops/${ready.id}/depart`, action(dispatched), dispatch).expect(200)).body as DeliveryDropResponse;
    expect((await get('/driver/today', driver).expect(200)).body.items[0].id).toBe(departed.id);
    now = new Date(departed.targetAtDeparture!);
    const delivered = (await post(`/driver/drops/${departed.id}/deliver`, action(departed, { note: 'Handed to company reception' }), driver).expect(200)).body as DeliveryDropResponse;
    expect(delivered).toMatchObject({ status: 'DELIVERED', onTime: true, deliveredAt: now.toISOString(), note: 'Handed to company reception' });
    const actual = (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
    expect(actual).toMatchObject({ status: 'DELIVERED', totalMinor: order.totalMinor, purchase: order.purchase, deliveredAt: now.toISOString() });
    expect((await board()).total).toBe(0);
  });

  it('delivers every active member atomically once under simultaneous driver clicks', async () => {
    const first = await confirmed(), second = await confirmed(); await completeAll(first);
    const departed = await departure(second), body = action(departed);
    now = new Date(new Date(departed.targetAtDeparture!).getTime() + 1);
    const responses = await Promise.all([post(`/driver/drops/${departed.id}/deliver`, body, driver), post(`/driver/drops/${departed.id}/deliver`, body, driver)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]); expect(responses[0].body).toEqual(responses[1].body);
    expect(responses[0].body.onTime).toBe(false);
    const members = await prisma.order.findMany({ where: { dropId: departed.id } }); expect(members.map((order) => order.status)).toEqual(['DELIVERED', 'DELIVERED']);
    expect(members.every((order) => order.deliveredAt?.getTime() === now.getTime())).toBe(true);
    expect(await prisma.dropEvent.count({ where: { dropId: departed.id, type: 'DELIVERED' } })).toBe(1);
    expect(await prisma.orderEvent.count({ where: { type: 'DELIVERED' } })).toBe(2);
  });

  it('requires Admin and a reason for travelling reassignment and rejects inactive/non-Driver accounts', async () => {
    const order = await confirmed(), departed = await departure(order), replacement = await replacementDriver();
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id, reason: 'Dispatch may not change travelling Driver' }), dispatch).expect(403);
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id }), kitchen).expect(403);
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id }), driver).expect(403);
    expect((await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id })).expect(400)).body.code).toBe('REASON_REQUIRED');
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id, reason: '   ' })).expect(400);
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id, reason: null })).expect(400);
    const kitchenUser = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'kitchen@test.com' } });
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: kitchenUser.id, reason: 'Wrong role' })).expect(400);
    await prisma.staffUser.update({ where: { id: replacement.user.id }, data: { active: false } });
    await post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id, reason: 'Inactive replacement' })).expect(400);
    expect(await readDrop(departed.id)).toEqual(departed);
    expect(await prisma.dropEvent.count({ where: { type: 'DRIVER_REASSIGNED' } })).toBe(0);
  });

  it('atomically transfers own-today access, records reason once and retains Delivered Driver history', async () => {
    const first = await confirmed(), second = await confirmed(); await completeAll(first);
    const departed = await departure(second), replacement = await replacementDriver();
    const reason = 'Original Driver vehicle failed; replacement collects the same meals';
    const body = action(departed, { driverId: replacement.user.id, reason });
    const reassigned = (await post(`/drops/${departed.id}/assign`, body).expect(200)).body as DeliveryDropResponse;
    expect(reassigned).toMatchObject({ status: 'OUT_FOR_DELIVERY', driver: { id: replacement.user.id, name: replacement.user.displayName },
      departedAt: departed.departedAt, targetAtDeparture: departed.targetAtDeparture, dispatchReadyAt: departed.dispatchReadyAt });
    expect((await post(`/drops/${departed.id}/assign`, body).expect(200)).body).toEqual(reassigned);
    expect((await post(`/drops/${departed.id}/assign`, { ...body, reason: 'Different reason using the same action ID' }).expect(409)).body.code).toBe('ACTION_ID_REUSED');
    const events = reassigned.events.filter((event) => event.type === 'DRIVER_REASSIGNED'); expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason, actorName: 'Demo Admin', details: { beforeDriverId: departed.driver!.id,
      driverId: replacement.user.id, travelling: true, affectedOrderIds: [first.id, second.id] } });
    expect(await prisma.orderEvent.count({ where: { type: 'DRIVER_REASSIGNED' } })).toBe(2);
    await get(`/driver/drops/${departed.id}`, driver).expect(404); await post(`/driver/drops/${departed.id}/deliver`, action(departed), driver).expect(404);
    expect((await get('/driver/today', driver).expect(200)).body.total).toBe(0);
    expect((await get('/driver/today', replacement.identity).expect(200)).body.items[0].id).toBe(departed.id);
    expect((await post(`/driver/drops/${departed.id}/deliver`, action(departed), replacement.identity).expect(409)).body.code).toBe('STALE_VERSION');
    const delivered = (await post(`/driver/drops/${reassigned.id}/deliver`, action(reassigned), replacement.identity).expect(200)).body as DeliveryDropResponse;
    await post(`/drops/${delivered.id}/assign`, action(delivered, { driverId: departed.driver!.id, reason: 'Attempt to rewrite actual delivery Driver' })).expect(409);
    await post(`/drops/${delivered.id}/assign`, action(delivered, { driverId: departed.driver!.id }), dispatch).expect(409);
    expect((await readDrop(delivered.id)).driver).toEqual(reassigned.driver);
    // Stable successful replay never reruns assignment or rewrites Delivered history.
    expect((await post(`/drops/${departed.id}/assign`, body).expect(200)).body).toEqual(reassigned);
    expect((await readDrop(delivered.id)).status).toBe('DELIVERED');
    for (const initial of [first, second]) expect((await get(`/orders/${initial.id}`).expect(200)).body.purchase).toEqual(initial.purchase);
  });

  it('serializes travelling reassignment against an old Driver delivery click', async () => {
    const order = await confirmed(), departed = await departure(order), replacement = await replacementDriver();
    const [assign, deliver] = await Promise.all([
      post(`/drops/${departed.id}/assign`, action(departed, { driverId: replacement.user.id, reason: 'Simultaneous replacement Driver action' })),
      post(`/driver/drops/${departed.id}/deliver`, action(departed), driver),
    ]);
    expect([[200, 404], [200, 409], [409, 200]]).toContainEqual([assign.status, deliver.status]);
    const actual = await readDrop(departed.id);
    if (assign.status === 200) {
      expect(actual.status).toBe('OUT_FOR_DELIVERY'); expect(actual.driver?.id).toBe(replacement.user.id);
      expect(await prisma.orderEvent.count({ where: { type: 'DELIVERED' } })).toBe(0);
      await post(`/driver/drops/${actual.id}/deliver`, action(actual), driver).expect(404);
    } else {
      expect(actual.status).toBe('DELIVERED'); expect(actual.driver?.id).toBe(departed.driver!.id);
      expect(await prisma.dropEvent.count({ where: { type: 'DRIVER_REASSIGNED' } })).toBe(0);
    }
  });

  it('invalidates dispatch readiness for packaging alone without regrouping and locks packaging after departure', async () => {
    const order = await confirmed(), ready = await completeAll(order);
    const dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    const fresh = (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
    const packaging = await prisma.referenceValue.findUniqueOrThrow({ where: { kind_name: { kind: 'PACKAGING_TYPE', name: 'Reusable tray' } } });
    const units = await prisma.prepUnit.findMany();
    const changed = (await post(`/orders/${fresh.id}/override`, action(fresh, { action: 'DELIVERY', reason: 'Reusable tray requested before loading', packagingId: packaging.id })).expect(201)).body as OrderDetail;
    expect(changed.dropId).toBe(order.dropId); expect(changed.purchase).toEqual(order.purchase); expect(await prisma.prepUnit.findMany()).toEqual(units);
    const invalidated = await readDrop(order.dropId!);
    expect(invalidated.status).toBe('KITCHEN_READY'); expect(invalidated.dispatchReadyAt).toBe(dispatched.dispatchReadyAt); expect(invalidated.version).toBeGreaterThan(dispatched.version);
    expect(invalidated.events.at(-1)).toMatchObject({ type: 'DISPATCH_INVALIDATED', reason: 'Reusable tray requested before loading', actorName: 'Demo Admin' });
    await post(`/drops/${invalidated.id}/depart`, action(invalidated), dispatch).expect(409);
    const reReady = (await post(`/drops/${invalidated.id}/dispatch-ready`, action(invalidated), dispatch).expect(200)).body as DeliveryDropResponse;
    const departed = (await post(`/drops/${reReady.id}/depart`, action(reReady), dispatch).expect(200)).body as DeliveryDropResponse;
    const travelling = (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
    await post(`/orders/${travelling.id}/override`, action(travelling, { action: 'DELIVERY', reason: 'Packaging change after van departure', packagingId: null })).expect(409);
    expect(await readDrop(departed.id)).toEqual(departed);
  });

  it('enforces fresh driver ownership and kitchen-local today for reads, writes and replay', async () => {
    const today = await confirmed(), tomorrow = await confirmed({ deliveryDate: '2026-10-08' });
    const departed = await departure(today), otherDate = await departure(tomorrow);
    expect((await get('/driver/today', driver).expect(200)).body.items.map((drop: DeliveryDropResponse) => drop.id)).toEqual([departed.id]);
    await get(`/driver/drops/${otherDate.id}`, driver).expect(404); await post(`/driver/drops/${otherDate.id}/deliver`, action(otherDate), driver).expect(404);
    await get('/driver/today?date=2026-10-08', driver).expect(400); await get(`/driver/today?driverId=${randomUUID()}`, driver).expect(400);
    const body = action(departed); await post(`/driver/drops/${departed.id}/deliver`, body, driver).expect(200);
    now = new Date('2026-10-07T18:30:00Z'); // Kitchen midnight, still 7 Oct UTC.
    await get(`/driver/drops/${departed.id}`, driver).expect(404); await post(`/driver/drops/${departed.id}/deliver`, body, driver).expect(404);
    const other = await prisma.staffUser.create({ data: { id: randomUUID(), email: 'ownership@test.com', displayName: 'Different Driver', role: 'DRIVER', passwordHash: 'not-a-login-fixture' } });
    await prisma.deliveryDrop.update({ where: { id: otherDate.id }, data: { driverId: other.id } });
    await get(`/driver/drops/${otherDate.id}`, driver).expect(404); await post(`/driver/drops/${otherDate.id}/deliver`, action(otherDate), driver).expect(404);
  });

  it('moves an order before departure preserving completed prep and invalidating both drops', async () => {
    const first = await confirmed(), second = await confirmed(); await completeAll(first);
    const ready = await completeAll(second), dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    const original = await prisma.prepUnit.findMany({ where: { combination: { line: { orderId: first.id } } } });
    const fresh = (await get(`/orders/${first.id}`).expect(200)).body as OrderDetail;
    const changed = (await post(`/orders/${first.id}/override`, action(fresh, { action: 'DELIVERY', reason: 'Different meeting time', deliveryTime: '13:15' })).expect(201)).body as OrderDetail;
    expect(changed.dropId).not.toBe(dispatched.id); expect(changed.purchase).toEqual(first.purchase);
    expect(await prisma.prepUnit.findMany({ where: { combination: { line: { orderId: first.id } } } })).toEqual(original);
    const old = await readDrop(dispatched.id), next = await readDrop(changed.dropId!);
    expect(old.status).toBe('KITCHEN_READY'); expect(old.dispatchReadyAt).toBe(dispatched.dispatchReadyAt); expect(next.status).toBe('KITCHEN_READY');
    expect(changed.plannedDispatchReadyAt).not.toBe(first.plannedDispatchReadyAt);
  });

  it('blocks empty/cancelled drops and cancelled prep while preserving actual history', async () => {
    const order = await confirmed(), ready = await completeAll(order), before = await prisma.prepUnit.findFirstOrThrow();
    const fresh = (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
    await post(`/orders/${order.id}/override`, action(fresh, { action: 'CANCEL', reason: 'Company no longer needs this undelivered order' })).expect(201);
    expect((await board()).total).toBe(0); expect((await get('/drops', dispatch).expect(200)).body.total).toBe(0);
    expect((await get('/driver/today', driver).expect(200)).body.total).toBe(0);
    const old = await readDrop(ready.id); expect(old.orderCount).toBe(0); expect(old.status).toBe('AWAITING_KITCHEN');
    await post(`/drops/${old.id}/dispatch-ready`, action(old), dispatch).expect(409);
    const initialDriver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    await post(`/drops/${old.id}/assign`, action(old, { driverId: initialDriver.id }), dispatch).expect(409);
    await post(`/prep-units/${before.id}/complete`, action(before), kitchen).expect(409);
    expect(await prisma.prepUnit.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  });

  it('serializes regroup against departure without a mixed travelling membership', async () => {
    const first = await confirmed(), second = await confirmed(); await completeAll(first);
    const ready = await completeAll(second), dispatched = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    const fresh = (await get(`/orders/${first.id}`).expect(200)).body as OrderDetail;
    const [move, depart] = await Promise.all([
      post(`/orders/${first.id}/override`, action(fresh, { action: 'DELIVERY', reason: 'Concurrent revised meeting time', deliveryTime: '13:00' })),
      post(`/drops/${ready.id}/depart`, action(dispatched), dispatch),
    ]);
    expect([[201, 409], [409, 200]]).toContainEqual([move.status, depart.status]);
    const actual = await prisma.order.findUniqueOrThrow({ where: { id: first.id } });
    const original = await readDrop(ready.id);
    if (depart.status === 200) {
      expect(actual.dropId).toBe(ready.id); expect(original.status).toBe('OUT_FOR_DELIVERY'); expect(original.orderCount).toBe(2);
    } else {
      expect(actual.dropId).not.toBe(ready.id); expect(original.status).toBe('KITCHEN_READY'); expect(original.orderCount).toBe(1);
    }
  });

  it('corrects the whole travelling/drop history while preserving departure target and original outcome', async () => {
    const first = await confirmed(), second = await confirmed(); await completeAll(first);
    const departed = await departure(second), originalTarget = departed.targetAtDeparture;
    const changed = (await post(`/drops/${departed.id}/correct`, action(departed, { reason: 'Reception moved all meals to another building', deliveryTime: '14:00',
      address: { label: 'Corrected reception', line1: '100 New Road', line2: null, city: 'Bengaluru', region: 'Karnataka', postalCode: '560010', country: 'India' } })).expect(200)).body as DeliveryDropResponse;
    expect(changed.orders).toHaveLength(2); expect(changed.orders.every((order) => order.address.line1 === '100 New Road' && order.deliveryAt === changed.deliveryAt)).toBe(true);
    expect(changed).toMatchObject({ id: departed.id, targetAtDeparture: originalTarget, departedAt: departed.departedAt, status: 'OUT_FOR_DELIVERY', onTime: null });
    now = new Date(new Date(originalTarget!).getTime() + 1);
    const delivered = (await post(`/driver/drops/${changed.id}/deliver`, action(changed), driver).expect(200)).body as DeliveryDropResponse;
    expect(delivered.onTime).toBe(false); // New target is later; original target still governs.
    const afterDelivery = (await post(`/drops/${changed.id}/correct`, action(delivered, { reason: 'Recorded final reception correction', deliveryTime: '15:00' })).expect(200)).body as DeliveryDropResponse;
    expect(afterDelivery).toMatchObject({ status: 'DELIVERED', deliveredAt: delivered.deliveredAt, departedAt: departed.departedAt, targetAtDeparture: originalTarget, onTime: false });
    for (const initial of [first, second]) {
      const actual = (await get(`/orders/${initial.id}`).expect(200)).body as OrderDetail;
      expect(actual.purchase).toEqual(initial.purchase); expect(actual.totalMinor).toBe(initial.totalMinor);
      expect(actual.events.filter((event) => event.type === 'DROP_CORRECTED')).toHaveLength(2);
    }
    const raw = await prisma.dropEvent.findMany({ where: { dropId: changed.id }, orderBy: { sequence: 'asc' } });
    expect(afterDelivery.events.map((event) => event.id)).toEqual(raw.map((event) => event.id));
    await expect(prisma.dropEvent.update({ where: { id: raw[0].id }, data: { reason: 'Overwrite history' } })).rejects.toBeDefined();
  });

  it('rejects correction without reason, before departure and grouping collision', async () => {
    const first = await confirmed(), other = await confirmed({ deliveryTime: '14:00' }), pending = await readDrop(first.dropId!);
    await post(`/drops/${pending.id}/correct`, action(pending, { reason: 'Before departure', deliveryTime: '13:00' })).expect(409);
    const departed = await departure(first);
    await post(`/drops/${departed.id}/correct`, action(departed, { reason: ' ', deliveryTime: '13:00' })).expect(400);
    expect((await post(`/drops/${departed.id}/correct`, action(departed, { reason: 'Same key as a different drop', deliveryTime: '14:00' })).expect(409)).body).toMatchObject({ code: 'DROP_CORRECTION_CONFLICT', details: { dropId: other.dropId } });
    expect((await readDrop(departed.id)).deliveryAt).toBe(departed.deliveryAt);
    await post(`/drops/${departed.id}/correct`, action(departed, { reason: 'Empty request' })).expect(400);
  });

  it('allows historical unchanged-date metadata correction after calendar edits but rejects a new closed date', async () => {
    const order = await confirmed(), departed = await departure(order);
    const delivered = (await post(`/driver/drops/${departed.id}/deliver`, action(departed), driver).expect(200)).body as DeliveryDropResponse;
    // No live Confirmed orders remain on these dates, so later company calendar
    // maintenance may legitimately close the historical delivery date.
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { holidays: [TODAY, '2026-10-08'] } });
    const corrected = (await post(`/drops/${delivered.id}/correct`, action(delivered, { reason: 'Historical reception address spelling',
      address: { label: 'Reception', line1: '42 Example Street reception', line2: null, city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' } })).expect(200)).body as DeliveryDropResponse;
    expect(corrected).toMatchObject({ status: 'DELIVERED', deliveryDate: TODAY, deliveredAt: delivered.deliveredAt, targetAtDeparture: delivered.targetAtDeparture, onTime: delivered.onTime });
    expect((await post(`/drops/${corrected.id}/correct`, action(corrected, { reason: 'New closed scheduled date', deliveryDate: '2026-10-08' })).expect(400)).body.code).toBe('COMPANY_DATE_CLOSED');
  });
});
