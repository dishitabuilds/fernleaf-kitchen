import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { CompanyResponse, OrderDetail, OrderInput, OrderQuoteResponse, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Orders integration tests require a separate TEST_DATABASE_URL ending in _test.');
const WEB_ORIGIN = 'http://localhost:3000';
const DELIVERY_DATE = '2026-10-07';
const CUTOFF = '2026-10-05T10:30:00.000Z';
type Login = { cookie: string; csrf: string };

describe('Phase 2 Orders API, accepted purchases and concurrent transitions on PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login, menuItemId: string;
  let now = new Date('2026-10-05T10:29:59.999Z');
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect(); await resetPhase1Fixture(prisma);
    // Exercise the real production registration and user-confirmed quote policy.
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: WEB_ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now));
    await app.init();
  });
  beforeEach(async () => {
    now = new Date('2026-10-05T10:29:59.999Z'); await resetPhase1Fixture(prisma); admin = await login();
    menuItemId = (await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } })).id;
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  async function login(email = 'admin@test.com'): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function post(path: string, body: object, identity = admin) { return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function patch(path: string, body: object, identity = admin) { return request(app.getHttpServer()).patch(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function get(path: string, identity = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', identity.cookie); }
  function input(overrides: Partial<OrderInput> = {}): OrderInput {
    return { employeeId: SEED_IDS.employee, deliveryDate: DELIVERY_DATE,
      lines: [{ menuItemId, quantity: 2, combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }], ...overrides };
  }
  async function quote(body = input(), extras: { orderId?: string; overrideReason?: string } = {}): Promise<OrderQuoteResponse> { return (await post('/orders/quote', { ...body, ...extras }).expect(201)).body as OrderQuoteResponse; }
  async function create(status: 'DRAFT' | 'PLACED' = 'PLACED', body = input()): Promise<OrderDetail> {
    const accepted = status === 'PLACED' ? (await quote(body)).fingerprint : undefined;
    return (await post('/orders', { ...body, status, actionId: randomUUID(), ...(accepted ? { acceptedQuote: accepted } : {}) }).expect(201)).body as OrderDetail;
  }
  async function read(id: string): Promise<OrderDetail> { return (await get(`/orders/${id}`).expect(200)).body as OrderDetail; }
  function reason(order: OrderDetail, extra: object = {}) { return { version: order.version, actionId: randomUUID(), reason: 'Reviewer action reason', ...extra }; }
  async function targetCompany(): Promise<CompanyResponse> {
    return (await post('/companies', { name: 'Transferred employee company', billingName: 'Target LLC', billingEmail: 'billing@target.example', billingAddress: 'Target office', billingContactName: 'Target accounts',
      domains: ['target.example'], owner: { name: 'Target owner', email: 'owner@target.example' },
      address: { label: 'Target', line1: '11 Target Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560002', country: 'India' },
      workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], deliveryTime: '13:00', deliveryMinutes: 45 }).expect(201)).body as CompanyResponse;
  }

  it.each(['kitchen', 'dispatch', 'driver'])('denies %s direct order reads and every mutation capability', async (role) => {
    const order = await create(), identity = await login(`${role}@test.com`);
    await get('/orders', identity).expect(403); await get(`/orders/${order.id}`, identity).expect(403);
    for (const path of ['/orders/quote', '/orders', '/orders/override-create', `/orders/${order.id}/place`, `/orders/${order.id}/cancel`, `/orders/${order.id}/reject`, `/orders/${order.id}/override`]) await post(path, {}, identity).expect(403);
    await patch(`/orders/${order.id}`, {}, identity).expect(403);
    expect((await read(order.id)).status).toBe('PLACED');
  });

  it('requires authentication, a matching Origin and CSRF token for order mutations', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    await request(app.getHttpServer()).post('/api/v1/orders/quote').set('Origin', WEB_ORIGIN).send(input()).expect(401);
    await request(app.getHttpServer()).post('/api/v1/orders/quote').set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).send(input()).expect(403);
    await request(app.getHttpServer()).post('/api/v1/orders/quote').set('Cookie', admin.cookie).set('Origin', 'https://foreign.example').set('x-csrf-token', admin.csrf).send(input()).expect(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('stores an empty draft estimate and rejects placing it or malformed nested quantities', async () => {
    const empty = input({ lines: [] }), estimate = await quote(empty), draft = await create('DRAFT', empty);
    expect(draft).toMatchObject({ status: 'DRAFT', totalMinor: 0, quantity: 0, purchase: null, revisions: [], prepUnitCount: 0, dropId: null });
    const placement = await post(`/orders/${draft.id}/place`, { version: draft.version, actionId: randomUUID(), acceptedQuote: estimate.fingerprint }).expect(400);
    expect(placement.body.code).toBe('ORDER_EMPTY');
    for (const quantity of [0, -1, 1.5, null]) await post('/orders/quote', input({ lines: [{ ...input().lines[0], quantity: quantity as number }] })).expect(400);
    await post('/orders/quote', { ...input(), lines: [{ ...input().lines[0], combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option, free: true }] }] }] }).expect(400);
    expect((await read(draft.id)).version).toBe(1); expect(await prisma.orderRevision.count()).toBe(0);
  });

  it('quotes exact dish/option totals, merges canonical identical combinations and persists one purchased combination', async () => {
    const body = input({ lines: [{ menuItemId, quantity: 10, combinations: [
      { quantity: 6, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] },
      { quantity: 4, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] },
    ] }] });
    const current = await quote(body);
    expect(current).toMatchObject({ currency: 'USD', totalMinor: 8800, cutoffAt: CUTOFF, company: { id: SEED_IDS.company },
      delivery: { deliveryAt: '2026-10-07T07:00:00.000Z', plannedDispatchReadyAt: '2026-10-07T06:00:00.000Z', plannedKitchenReadyAt: '2026-10-07T05:30:00.000Z' } });
    expect(current.lines[0]).toMatchObject({ quantity: 10, basePriceMinor: 800, totalMinor: 8800, combinations: [{ quantity: 10, unitPriceMinor: 880, totalMinor: 8800 }] });
    const order = await create('PLACED', body);
    expect(order.purchase).toEqual(current); expect(order.revisions).toHaveLength(1);
    expect(await prisma.orderCombination.count()).toBe(1); expect(await prisma.selectionSnapshot.count()).toBe(1);
    expect(order.prepUnitCount).toBe(0); expect(order.dropId).toBeNull();
  });

  it('rejects sum errors, unsatisfied required groups, wrong group/options, duplicate choices, MOQ and duplicate dish lines', async () => {
    await prisma.dish.update({ where: { id: SEED_IDS.dish }, data: { minQuantity: 4 } });
    await post('/orders/quote', input()).expect(400);
    const validLine = { ...input().lines[0], quantity: 4, combinations: [{ quantity: 4, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] };
    for (const combinations of [[{ quantity: 3, selections: validLine.combinations[0].selections }], [{ quantity: 4, selections: [] }],
      [{ quantity: 4, selections: [{ groupId: randomUUID(), optionId: SEED_IDS.option }] }], [{ quantity: 4, selections: [{ groupId: SEED_IDS.group, optionId: randomUUID() }] }],
      [{ quantity: 4, selections: [validLine.combinations[0].selections[0], validLine.combinations[0].selections[0]] }]]) await post('/orders/quote', input({ lines: [{ ...validLine, combinations }] })).expect(400);
    expect((await post('/orders/quote', input({ lines: [validLine, validLine] })).expect(400)).body.code).toBe('DUPLICATE_DISH_LINE');
    expect(await prisma.order.count()).toBe(0);
  });

  it('reconciles the six brown-rice/four jeera example to 8960 cents and two distinct prep units', async () => {
    const option = (await post('/options', { name: 'Jeera rice', costMinor: 90 }).expect(201)).body as { id: string };
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'OPTION', itemId: option.id, amountMinor: 120 }] }).expect(200);
    await request(app.getHttpServer()).put(`/api/v1/dishes/${SEED_IDS.dish}/groups`).set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf)
      .send({ groups: [{ id: SEED_IDS.group, name: 'Grain', required: true, sortOrder: 0, optionIds: [SEED_IDS.option, option.id] }] }).expect(200);
    const body = input({ lines: [{ menuItemId, quantity: 10, combinations: [
      { quantity: 6, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] },
      { quantity: 4, selections: [{ groupId: SEED_IDS.group, optionId: option.id }] },
    ] }] });
    const current = await quote(body);
    expect(current.totalMinor).toBe(8960); expect(current.lines[0].totalMinor).toBe(8960);
    expect(current.lines[0].combinations).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 6, unitPriceMinor: 880, totalMinor: 5280 }),
      expect.objectContaining({ quantity: 4, unitPriceMinor: 920, totalMinor: 3680 }),
    ]));
    const order = await create('PLACED', body); now = new Date(CUTOFF);
    await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    expect((await read(order.id)).prepUnitCount).toBe(2);
    const units = await prisma.prepUnit.findMany({ include: { combination: true } });
    expect(units.map((unit) => unit.combination.quantity).sort((a, b) => a - b)).toEqual([4, 6]);
    expect(units.reduce((total, unit) => total + unit.combination.totalMinor, 0)).toBe(8960);
  });

  it('refreshes a draft on save and places the same accepted quote in a separate versioned action', async () => {
    const draft = await create('DRAFT'); const changed = input({ lines: [{ ...input().lines[0], quantity: 3, combinations: [{ ...input().lines[0].combinations[0], quantity: 3 }] }] });
    const accepted = await quote(changed, { orderId: draft.id });
    const saved = (await patch(`/orders/${draft.id}`, { ...changed, version: draft.version, actionId: randomUUID() }).expect(200)).body as OrderDetail;
    expect(saved).toMatchObject({ version: 2, status: 'DRAFT', totalMinor: 2640, purchase: null, revisions: [] });
    const placed = (await post(`/orders/${draft.id}/place`, { version: saved.version, actionId: randomUUID(), acceptedQuote: accepted.fingerprint }).expect(201)).body as OrderDetail;
    expect(placed).toMatchObject({ version: 3, status: 'PLACED', totalMinor: 2640, quantity: 3 });
    expect(placed.purchase).toEqual(accepted); expect(placed.revisions[0]).toMatchObject({ version: 3, snapshot: accepted });
    expect(placed.events.map((event) => event.type)).toEqual(['DRAFT_CREATED', 'DRAFT_UPDATED', 'PLACED']);
  });

  it('returns a replacement quote for a changed price and writes no rejected placement', async () => {
    const accepted = await quote();
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: 901 }] }).expect(200);
    const actionId = randomUUID(), body = { ...input(), status: 'PLACED', actionId, acceptedQuote: accepted.fingerprint };
    const response = await post('/orders', body).expect(409);
    expect(response.body.code).toBe('QUOTE_CHANGED'); expect(response.body.details.quote.totalMinor).toBe(1962);
    expect(await prisma.order.count()).toBe(0); expect(await prisma.orderAction.count()).toBe(0); expect(await prisma.orderEvent.count()).toBe(0);
    const replacement = response.body.details.quote as OrderQuoteResponse;
    const placed = (await post('/orders', { ...body, acceptedQuote: replacement.fingerprint }).expect(201)).body as OrderDetail;
    expect(placed.purchase).toEqual(replacement); expect(placed.totalMinor).toBe(1962);
  });

  it('rejects a stale purchase revision without changing lines, events or immutable earlier revisions', async () => {
    const order = await create(), accepted = await quote(input(), { orderId: order.id });
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'OPTION', itemId: SEED_IDS.option, amountMinor: 101 }] }).expect(200);
    const response = await patch(`/orders/${order.id}`, { ...input(), version: order.version, actionId: randomUUID(), acceptedQuote: accepted.fingerprint }).expect(409);
    expect(response.body).toMatchObject({ code: 'QUOTE_CHANGED', details: { quote: { totalMinor: 1802 } } });
    expect(await read(order.id)).toEqual(order);
    const revised = (await patch(`/orders/${order.id}`, { ...input(), version: order.version, actionId: randomUUID(), acceptedQuote: response.body.details.quote.fingerprint }).expect(200)).body as OrderDetail;
    expect(revised).toMatchObject({ version: 2, totalMinor: 1802 }); expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0]).toEqual(order.revisions[0]); expect(revised.purchase?.totalMinor).toBe(1802);
  });

  it('keeps purchased names, prices, groups, allergens and billing stable after catalogue/group/company replacement', async () => {
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    await patch(`/dishes/${SEED_IDS.dish}`, { allergenIds: [allergen.id] }).expect(200);
    await prisma.employeeAllergen.create({ data: { employeeId: SEED_IDS.employee, referenceId: allergen.id } });
    const order = await create();
    expect(order.purchase?.lines[0].allergyWarnings).toEqual([allergen.name]);
    expect(order.purchase?.lines[0].dish.allergens).toEqual([{ id: allergen.id, name: allergen.name }]);
    await patch(`/dishes/${SEED_IDS.dish}`, { name: 'Renamed future dish', sku: 'FUTURE-SKU', costMinor: 999, allergenIds: [] }).expect(200);
    await patch(`/options/${SEED_IDS.option}`, { name: 'Renamed future option' }).expect(200);
    await request(app.getHttpServer()).put(`/api/v1/dishes/${SEED_IDS.dish}/groups`).set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf).send({ groups: [{ name: 'Replacement group', required: true, sortOrder: 0, optionIds: [SEED_IDS.option] }] }).expect(200);
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: 1000 }] }).expect(200);
    await patch(`/companies/${SEED_IDS.company}`, { version: 1, name: 'Future company name', billingName: 'Future billing name' }).expect(200);
    expect(await read(order.id)).toEqual(order);
    now = new Date(CUTOFF); await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    const confirmed = await read(order.id); expect(confirmed.purchase).toEqual(order.purchase); expect(confirmed.company).toEqual(order.company);
    expect(confirmed.totalMinor).toBe(1760); expect(confirmed.prepUnitCount).toBe(1);
  });

  it('retains placed company/billing after employee transfer, blocks purchase edits and allows explicit logistics/cancellation', async () => {
    const order = await create(), target = await targetCompany();
    await post(`/employees/${SEED_IDS.employee}/transfer`, { companyId: target.id }).expect(201);
    expect(await read(order.id)).toEqual(order);
    expect((await post('/orders/quote', { ...input(), orderId: order.id }).expect(409)).body.code).toBe('EMPLOYEE_TRANSFERRED');
    expect((await patch(`/orders/${order.id}`, { ...input(), version: order.version, actionId: randomUUID(), acceptedQuote: order.purchase!.fingerprint }).expect(409)).body.code).toBe('EMPLOYEE_TRANSFERRED');
    const changed = (await post(`/orders/${order.id}/override`, reason(order, { action: 'DELIVERY', deliveryTime: '14:00' })).expect(201)).body as OrderDetail;
    expect(changed.companyId).toBe(SEED_IDS.company); expect(changed.company).toEqual(order.company); expect(changed.purchase).toEqual(order.purchase);
    expect(changed.delivery.deliveryTime).toBe('14:00');
    const cancelled = (await post(`/orders/${order.id}/cancel`, reason(changed)).expect(201)).body as OrderDetail;
    expect(cancelled.status).toBe('CANCELLED'); expect(cancelled.purchase).toEqual(order.purchase);
  });

  it('uses the employee new company for resubmitted drafts without changing already placed purchases', async () => {
    const draft = await create('DRAFT'), target = await targetCompany();
    await post(`/employees/${SEED_IDS.employee}/transfer`, { companyId: target.id }).expect(201);
    const current = await quote(input(), { orderId: draft.id });
    const saved = (await patch(`/orders/${draft.id}`, { ...input(), version: draft.version, actionId: randomUUID() }).expect(200)).body as OrderDetail;
    expect(saved.companyId).toBe(target.id); expect(saved.delivery.address.id).toBe(target.defaultAddressId); expect(saved.delivery.deliveryTime).toBe('13:00');
    const placed = (await post(`/orders/${draft.id}/place`, { version: saved.version, actionId: randomUUID(), acceptedQuote: current.fingerprint }).expect(201)).body as OrderDetail;
    expect(placed.companyId).toBe(target.id); expect(placed.purchase?.company.billingName).toBe('Target LLC');
  });

  it('replays identical concurrent action IDs once and rejects reusing the ID for different payloads', async () => {
    const accepted = await quote(), body = { ...input(), status: 'PLACED', actionId: randomUUID(), acceptedQuote: accepted.fingerprint };
    const responses = await Promise.all([post('/orders', body).expect(201), post('/orders', body).expect(201)]);
    expect(responses[0].body).toEqual(responses[1].body); expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderAction.count()).toBe(1); expect(await prisma.orderEvent.count()).toBe(1); expect(await prisma.orderRevision.count()).toBe(1);
    expect((await post('/orders', { ...body, deliveryTime: '13:00' }).expect(409)).body.code).toBe('ACTION_ID_REUSED');
    expect((await post('/orders', body).expect(201)).body).toEqual(responses[0].body);
  });

  it('allows one same-version edit under concurrency and preserves the winner on stale retry', async () => {
    const draft = await create('DRAFT');
    const a = input({ deliveryTime: '13:00' }), b = input({ deliveryTime: '14:00' });
    const bodies = [{ ...a, version: draft.version, actionId: randomUUID() }, { ...b, version: draft.version, actionId: randomUUID() }];
    const results = await Promise.all(bodies.map((body) => patch(`/orders/${draft.id}`, body)));
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = results.find((response) => response.status === 200)!; const loser = results.find((response) => response.status === 409)!;
    expect(['STALE_VERSION', 'CONCURRENT_CHANGE']).toContain(loser.body.code);
    // A bounded serialization retry may report contention during the race.
    // After the winner committed, that same old version must fail explicitly.
    const losingBody = bodies[results.findIndex((response) => response.status === 409)];
    expect((await patch(`/orders/${draft.id}`, losingBody).expect(409)).body.code).toBe('STALE_VERSION');
    expect(await read(draft.id)).toEqual(winner.body);
    expect(await prisma.orderEvent.count({ where: { orderId: draft.id } })).toBe(2); expect(await prisma.orderAction.count()).toBe(2);
  });

  it('enforces employee default flags and captured-company address/packaging membership against crafted HTTP input', async () => {
    const other = (await post(`/companies/${SEED_IDS.company}/addresses`, { label: 'Second office', line1: '2 Other Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560002', country: 'India' }).expect(201)).body as { id: string };
    const differentPackaging = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'PACKAGING_TYPE', name: 'Reusable tray' } });
    await patch(`/employees/${SEED_IDS.employee}`, { canChooseAddress: false, canChangeTime: false, canChangePackaging: false }).expect(200);
    for (const fields of [{ addressId: other.id }, { deliveryTime: '14:00' }, { packagingId: differentPackaging.id }, { packagingId: null }]) await post('/orders/quote', input(fields)).expect(403);
    const defaultQuote = await quote(); expect(defaultQuote.delivery.address.id).toBe(SEED_IDS.address); expect(defaultQuote.delivery.deliveryTime).toBe('12:30');
    const explicitDefaults = await quote(input({ addressId: defaultQuote.delivery.address.id!, deliveryTime: '12:30', packagingId: defaultQuote.delivery.packaging!.id }));
    expect(explicitDefaults.fingerprint).toBe(defaultQuote.fingerprint);
    const customAddress = { label: 'Custom', line1: '9 Personal Road', line2: null, city: 'Bengaluru', region: 'Karnataka', postalCode: '560009', country: 'India' };
    await post('/orders/quote', input({ customAddress })).expect(400);
    const overridden = await quote(input({ customAddress, deliveryTime: '14:00', packagingId: differentPackaging.id }), { overrideReason: 'Explicit delivery exception' });
    expect(overridden.delivery).toMatchObject({ address: { id: null, line1: '9 Personal Road' }, deliveryTime: '14:00', packaging: { id: differentPackaging.id } });
    await patch(`/employees/${SEED_IDS.employee}`, { canChooseAddress: true, canChangePackaging: true }).expect(200);
    const target = await targetCompany(); await post('/orders/quote', input({ addressId: target.defaultAddressId! })).expect(400);
    const wrongKind = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } }); await post('/orders/quote', input({ packagingId: wrongKind.id })).expect(400);
  });

  it('shares menu hiding/pricing/active validation, including the secret direct category path', async () => {
    const secret = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.secretCategory, dishId: SEED_IDS.secretDish } } });
    const secretInput = input({ lines: [{ menuItemId: secret.id, quantity: 1, combinations: [{ quantity: 1, selections: [] }] }] });
    expect((await quote(secretInput)).totalMinor).toBe(900);
    await prisma.companyHiddenCategory.create({ data: { companyId: SEED_IDS.company, categoryId: SEED_IDS.secretCategory } }); await post('/orders/quote', secretInput).expect(400);
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { priceTierId: SEED_IDS.missingTier } });
    expect((await post('/orders/quote', input()).expect(400)).body.code).toBe('MENU_ITEM_UNAVAILABLE');
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { priceTierId: null } }); await patch(`/options/${SEED_IDS.option}`, { active: false }).expect(200);
    await post('/orders/quote', input()).expect(400); await patch(`/options/${SEED_IDS.option}`, { active: true }).expect(200);
    await patch(`/employees/${SEED_IDS.employee}`, { active: false }).expect(200); await post('/orders/quote', input()).expect(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it('locks edits, placement and ordinary cancellation exactly at cutoff even before the job runs', async () => {
    const placed = await create(), draft = await create('DRAFT'), accepted = await quote(input(), { orderId: draft.id });
    now = new Date(CUTOFF);
    for (const order of [placed, draft]) {
      expect((await patch(`/orders/${order.id}`, { ...input(), version: order.version, actionId: randomUUID(), acceptedQuote: placed.purchase!.fingerprint }).expect(409)).body.code).toBe('CUTOFF_PASSED');
      expect((await post(`/orders/${order.id}/cancel`, reason(order)).expect(409)).body.code).toBe('CUTOFF_PASSED');
    }
    expect((await post(`/orders/${draft.id}/place`, { version: draft.version, actionId: randomUUID(), acceptedQuote: accepted.fingerprint }).expect(409)).body.code).toBe('CUTOFF_PASSED');
    expect((await post('/orders', { ...input(), status: 'PLACED', actionId: randomUUID(), acceptedQuote: placed.purchase!.fingerprint }).expect(409)).body.code).toBe('CUTOFF_PASSED');
    expect((await read(placed.id)).status).toBe('PLACED'); expect((await read(draft.id)).status).toBe('DRAFT');
    await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    expect((await read(placed.id)).status).toBe('CONFIRMED'); expect((await read(draft.id)).status).toBe('CANCELLED');
  });

  it('performs explicit late Admin creation and draft placement atomically with confirmed replay and unique work', async () => {
    const draft = await create('DRAFT'); now = new Date(CUTOFF);
    const current = await quote(input(), { overrideReason: 'Late review placement' }), actionId = randomUUID();
    const body = { ...input(), actionId, acceptedQuote: current.fingerprint, reason: 'Late review placement' };
    const created = (await post('/orders/override-create', body).expect(201)).body as OrderDetail;
    const replay = (await post('/orders/override-create', body).expect(201)).body as OrderDetail;
    expect(replay).toEqual(created); expect(created).toMatchObject({ status: 'CONFIRMED', version: 2, prepUnitCount: 1, totalMinor: 1760 });
    expect(created.events.map((event) => event.type)).toEqual(['ADMIN_OVERRIDE_PLACED', 'CONFIRMED']);
    const placed = (await post(`/orders/${draft.id}/override`, reason(draft, { action: 'PLACE', acceptedQuote: current.fingerprint })).expect(201)).body as OrderDetail;
    expect(placed).toMatchObject({ status: 'CONFIRMED', version: 3, prepUnitCount: 1 }); expect(placed.dropId).toBe(created.dropId);
    expect(await prisma.prepUnit.count()).toBe(2); expect(await prisma.deliveryDrop.count()).toBe(1); expect(await prisma.orderEvent.count({ where: { type: 'CONFIRMED' } })).toBe(2);
    const rerun = await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200); expect(rerun.body).toMatchObject({ confirmed: 0, cancelled: 0, failed: 0 });
    await post('/orders/override-create', { ...body, actionId: randomUUID(), reason: ' ' }).expect(400);
  });

  it('records ordinary rejection once, rejects invalid transitions and preserves delivered order history', async () => {
    const order = await create(), body = reason(order);
    const rejected = (await post(`/orders/${order.id}/reject`, body).expect(201)).body as OrderDetail;
    expect(rejected).toMatchObject({ status: 'REJECTED', version: 2 }); expect(rejected.purchase).toEqual(order.purchase);
    expect((await post(`/orders/${order.id}/reject`, body).expect(201)).body).toEqual(rejected);
    await post(`/orders/${order.id}/cancel`, reason(rejected)).expect(409);
    const draft = await create('DRAFT'); await post(`/orders/${draft.id}/reject`, reason(draft)).expect(409);
    const another = await create(); now = new Date(CUTOFF); await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    const confirmed = await read(another.id); await post(`/orders/${confirmed.id}/override`, reason(confirmed, { action: 'REJECT' })).expect(409);
    await prisma.order.update({ where: { id: confirmed.id }, data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } } });
    const delivered = await read(confirmed.id); await post(`/orders/${delivered.id}/override`, reason(delivered, { action: 'CANCEL' })).expect(409);
    expect(await read(delivered.id)).toEqual(delivered);
  });

  it('keeps confirmed money/prep history during logistics regrouping and removes cancelled orders from active drop membership', async () => {
    const order = await create(); now = new Date(CUTOFF); await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    const confirmed = await read(order.id), started = new Date('2026-10-06T07:00:00Z'), done = new Date('2026-10-06T07:10:00Z');
    await prisma.prepUnit.updateMany({ data: { status: 'DONE', startedAt: started, doneAt: done } });
    await prisma.order.update({ where: { id: order.id }, data: { kitchenStartedAt: started, kitchenReadyAt: done } });
    const oldUnits = await prisma.prepUnit.findMany();
    const changed = (await post(`/orders/${order.id}/override`, reason(confirmed, { action: 'DELIVERY', deliveryTime: '14:00' })).expect(201)).body as OrderDetail;
    expect(changed.purchase).toEqual(confirmed.purchase); expect(changed.revisions).toEqual(confirmed.revisions); expect(changed.totalMinor).toBe(1760);
    expect(changed.delivery.plannedDispatchReadyAt).toBe('2026-10-07T07:30:00.000Z'); expect(changed.delivery.plannedKitchenReadyAt).toBe('2026-10-07T07:00:00.000Z');
    expect(changed.dropId).not.toBe(confirmed.dropId); expect(await prisma.prepUnit.findMany()).toEqual(oldUnits);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ kitchenStartedAt: started, kitchenReadyAt: done });
    expect(await prisma.deliveryDrop.findUniqueOrThrow({ where: { id: confirmed.dropId! } })).toMatchObject({ status: 'AWAITING_KITCHEN', dispatchReadyAt: null });
    const cancellation = reason(changed, { action: 'CANCEL' });
    const cancelled = (await post(`/orders/${order.id}/override`, cancellation).expect(201)).body as OrderDetail;
    expect(cancelled).toMatchObject({ status: 'CANCELLED', dropId: null }); expect(cancelled.purchase).toEqual(confirmed.purchase);
    expect(await prisma.prepUnit.findMany()).toEqual(oldUnits); expect(await prisma.order.count({ where: { dropId: changed.dropId, status: 'CONFIRMED' } })).toBe(0);
    expect((await post(`/orders/${order.id}/override`, cancellation).expect(201)).body).toEqual(cancelled);
  });

  it('rejects invalid company dates and per-order changes to an already departed grouped drop', async () => {
    const order = await create(); now = new Date(CUTOFF); await post('/cutoffs/process', { deliveryDate: DELIVERY_DATE }).expect(200);
    const confirmed = await read(order.id);
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { holidays: ['2026-10-08'] } });
    await post('/orders/quote', input({ deliveryDate: '2026-10-08' })).expect(400);
    await post('/orders/quote', { ...input({ deliveryDate: '2026-10-08' }), overrideReason: 'Calendar exceptions remain prohibited' }).expect(400);
    expect((await post(`/orders/${order.id}/override`, reason(confirmed, { action: 'DELIVERY', deliveryDate: '2026-10-08' })).expect(400)).body.code).toBe('COMPANY_DATE_CLOSED');
    await prisma.deliveryDrop.update({ where: { id: confirmed.dropId! }, data: { status: 'OUT_FOR_DELIVERY', departedAt: now, targetAtDeparture: new Date(confirmed.deliveryAt) } });
    expect((await post(`/orders/${order.id}/override`, reason(confirmed, { action: 'DELIVERY', deliveryTime: '15:00' })).expect(409)).body.code).toBe('DROP_ALREADY_DEPARTED');
    expect(await read(order.id)).toEqual(confirmed);
  });

  it('returns stable server filters, pages, timeline and truthful empty invoiced results', async () => {
    const first = await create(), second = await create('DRAFT', input({ deliveryDate: '2026-10-08' }));
    const third = await create(); await post(`/orders/${third.id}/reject`, reason(third)).expect(201);
    const filtered = await get(`/orders?from=${DELIVERY_DATE}&to=${DELIVERY_DATE}&companyId=${SEED_IDS.company}&status=PLACED&q=${first.number}&pageSize=1`).expect(200);
    expect(filtered.body).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ id: first.id, invoiced: false }] });
    const page1 = await get('/orders?pageSize=1').expect(200), page2 = await get('/orders?pageSize=1&page=2').expect(200);
    expect(page1.body.items[0].id).toBe(second.id); expect(page2.body.items[0].id).toBe(third.id);
    expect((await get('/orders?invoiced=true').expect(200)).body).toMatchObject({ total: 0, items: [] });
    expect((await get('/orders?invoiced=false').expect(200)).body.total).toBe(3);
    await get('/orders?from=2026-10-09&to=2026-10-07').expect(400); await get('/orders?from=2026-02-30').expect(400); await get('/orders?pageSize=101').expect(400);
    expect((await read(first.id)).events).toEqual(first.events);
  });
});
