import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { DashboardResponse, DeliveryDropResponse, InvoiceDetail, OrderDetail, OrderInput, OrderQuoteResponse, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Billing tests require a separate TEST_DATABASE_URL ending in _test.');
const ORIGIN = 'http://localhost:3000', TODAY = '2026-10-07';
type Login = { cookie: string; csrf: string };

describe('Must release billing, dashboards and staff on isolated PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login, kitchen: Login, dispatch: Login, driver: Login, menuItemId: string;
  const now = new Date('2026-10-07T05:00:00Z');
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect(); await resetPhase1Fixture(prisma);
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now)); await app.init();
  });
  beforeEach(async () => {
    await resetPhase1Fixture(prisma);
    [admin, kitchen, dispatch, driver] = await Promise.all(['admin', 'kitchen', 'dispatch', 'driver'].map((role) => login(`${role}@test.com`)));
    menuItemId = (await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } })).id;
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });
  async function login(email: string, password = 'Test@1234'): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function get(path: string, identity = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', identity.cookie); }
  function post(path: string, body: object, identity = admin) { return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function patch(path: string, body: object, identity = admin) { return request(app.getHttpServer()).patch(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function action(value: { version: number }, extra: object = {}) { return { version: value.version, actionId: randomUUID(), ...extra }; }
  async function confirmed(deliveryTime = '12:30'): Promise<OrderDetail> {
    const input: OrderInput = { employeeId: SEED_IDS.employee, deliveryDate: TODAY, deliveryTime,
      lines: [{ menuItemId, quantity: 2, combinations: [{ quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }] };
    const quote = (await post('/orders/quote', { ...input, overrideReason: 'Isolated late order fixture' }).expect(201)).body as OrderQuoteResponse;
    return (await post('/orders/override-create', { ...input, actionId: randomUUID(), acceptedQuote: quote.fingerprint, reason: 'Isolated late order fixture' }).expect(201)).body as OrderDetail;
  }
  async function invoice(...orders: OrderDetail[]): Promise<InvoiceDetail> {
    return (await post('/billing/invoices', { companyId: orders[0].companyId, orderIds: orders.map((order) => order.id), actionId: randomUUID() }).expect(201)).body as InvoiceDetail;
  }
  async function delivered(order: OrderDetail): Promise<OrderDetail> {
    await post(`/kitchen/orders/${order.id}/force-complete`, action(order, { reason: 'Isolated prepared fixture' })).expect(200);
    const ready = (await get(`/drops/${order.dropId}`, dispatch).expect(200)).body as DeliveryDropResponse;
    const packed = (await post(`/drops/${ready.id}/dispatch-ready`, action(ready), dispatch).expect(200)).body as DeliveryDropResponse;
    const departed = (await post(`/drops/${ready.id}/depart`, action(packed), dispatch).expect(200)).body as DeliveryDropResponse;
    await post(`/driver/drops/${ready.id}/deliver`, action(departed), driver).expect(200);
    return (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
  }

  it('enforces billing/staff Admin-only access and role-scoped financial redaction', async () => {
    await request(app.getHttpServer()).get('/api/v1/billing/invoices').expect(401);
    for (const identity of [kitchen, dispatch, driver]) {
      await get('/billing/invoices', identity).expect(403); await get('/staff', identity).expect(403);
      await post('/billing/invoices', { companyId: SEED_IDS.company, orderIds: [], actionId: randomUUID() }, identity).expect(403);
      const dashboard = (await get('/dashboard', identity).expect(200)).body as DashboardResponse;
      expect(JSON.stringify(dashboard)).not.toMatch(/totalMinor|uninvoiced|outstandingBalance|paidAmount|billingEmail/);
    }
    await get('/billing/invoices?pageSize=101').expect(400); await get('/staff?pageSize=101').expect(400);
    await get('/dashboard?date=2026-02-30').expect(400);
  });

  it('creates one multi-order invoice with exact gross and immutable historical billing identity', async () => {
    const first = await confirmed(), second = await confirmed('13:30');
    await prisma.company.update({ where: { id: first.companyId }, data: { name: 'New current name', billingEmail: 'new@fernleaf-demo.example' } });
    const issued = await invoice(second, first);
    expect(issued.orderCount).toBe(2); expect(issued.totalMinor).toBe(first.totalMinor! + second.totalMinor!);
    expect(issued.orders.reduce((sum, order) => sum + order.totalMinor, 0)).toBe(issued.totalMinor);
    expect(issued.company).toEqual(first.company); expect(issued.companyName).toBe(first.companyName);
    expect(issued.orders.map((order) => order.company.billingEmail)).toEqual([first.company.billingEmail, second.company.billingEmail]);
    expect((await get(`/billing/companies/${first.companyId}/uninvoiced`).expect(200)).body).toEqual([]);
    await expect(prisma.invoice.update({ where: { id: issued.id }, data: { totalMinor: issued.totalMinor + 1 } })).rejects.toThrow();
    await expect(prisma.order.update({ where: { id: first.id }, data: { invoiceId: null } })).rejects.toThrow();
  });

  it('replays a concurrently repeated invoice action and binds its exact selected membership', async () => {
    const first = await confirmed(), second = await confirmed('13:30');
    const body = { companyId: first.companyId, orderIds: [first.id, second.id], actionId: randomUUID() };
    const responses = await Promise.all([post('/billing/invoices', body), post('/billing/invoices', { ...body, orderIds: [second.id, first.id] })]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]); expect(responses[0].body).toEqual(responses[1].body);
    expect(await prisma.invoice.count()).toBe(1); expect(await prisma.order.count({ where: { invoiceId: responses[0].body.id } })).toBe(2);
    expect((await post('/billing/invoices', { ...body, orderIds: [first.id] }).expect(409)).body.code).toBe('ACTION_ID_REUSED');
  });

  it('races independent invoice requests without double billing or orphan partial invoices', async () => {
    const first = await confirmed(), second = await confirmed('13:30');
    const results = await Promise.all([post('/billing/invoices', { companyId: first.companyId, orderIds: [first.id, second.id], actionId: randomUUID() }), post('/billing/invoices', { companyId: first.companyId, orderIds: [first.id], actionId: randomUUID() })]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]); expect(await prisma.invoice.count()).toBe(1);
    const issued = results.find((result) => result.status === 201)!.body as InvoiceDetail;
    expect(issued.totalMinor).toBe(issued.orders.reduce((sum, order) => sum + order.totalMinor, 0));
  });

  it('rolls back every membership when any selection is unbillable or missing', async () => {
    const first = await confirmed(), second = await confirmed('13:30');
    await post(`/orders/${second.id}/override`, action(second, { action: 'CANCEL', reason: 'Unbillable fixture' })).expect(201);
    await post('/billing/invoices', { companyId: first.companyId, orderIds: [first.id, second.id], actionId: randomUUID() }).expect(400);
    await post('/billing/invoices', { companyId: first.companyId, orderIds: [first.id, randomUUID()], actionId: randomUUID() }).expect(404);
    await post('/billing/invoices', { companyId: first.companyId, orderIds: [first.id, first.id], actionId: randomUUID() }).expect(400);
    expect(await prisma.invoice.count()).toBe(0); expect((await prisma.order.findUniqueOrThrow({ where: { id: first.id } })).invoiceId).toBeNull();
  });

  it('settles only current net due, replays payment, then shows post-payment shortage as company credit', async () => {
    const order = await delivered(await confirmed()), issued = await invoice(order);
    await post(`/billing/invoices/${issued.id}/pay`, { amountMinor: issued.totalMinor - 1, actionId: randomUUID() }).expect(409);
    const body = { amountMinor: issued.totalMinor, actionId: randomUUID() };
    const results = await Promise.all([post(`/billing/invoices/${issued.id}/pay`, body), post(`/billing/invoices/${issued.id}/pay`, body)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]); expect(results[0].body).toEqual(results[1].body);
    const credited = (await post(`/billing/invoices/${issued.id}/credit`, { orderId: order.id, amountMinor: 125, reason: 'Delivered shortage', actionId: randomUUID() }).expect(201)).body as InvoiceDetail;
    expect(credited).toMatchObject({ totalMinor: issued.totalMinor, paidAmountMinor: issued.totalMinor, netDueMinor: -125, creditTotalMinor: 125 });
    const dashboard = (await get('/dashboard').expect(200)).body;
    expect(dashboard.data).toMatchObject({ outstandingBalanceMinor: 0, companyCreditMinor: 125 });
    await expect(prisma.invoice.update({ where: { id: issued.id }, data: { paidAmountMinor: 0 } })).rejects.toThrow();
  });

  it('bounds concurrent shortage credits and rejects reused IDs with different amounts', async () => {
    const order = await delivered(await confirmed()), issued = await invoice(order);
    const body = { orderId: order.id, amountMinor: 100, reason: 'Shortage', actionId: randomUUID() };
    const repeats = await Promise.all([post(`/billing/invoices/${issued.id}/credit`, body), post(`/billing/invoices/${issued.id}/credit`, body)]);
    expect(repeats.map((result) => result.status)).toEqual([201, 201]); expect(await prisma.billingCredit.count()).toBe(1);
    await post(`/billing/invoices/${issued.id}/credit`, { ...body, amountMinor: 101 }).expect(409);
    const remaining = issued.totalMinor - 100;
    const races = await Promise.all([post(`/billing/invoices/${issued.id}/credit`, { ...body, amountMinor: remaining, actionId: randomUUID() }), post(`/billing/invoices/${issued.id}/credit`, { ...body, amountMinor: remaining, actionId: randomUUID() })]);
    expect(races.map((result) => result.status).sort()).toEqual([201, 400]);
    expect((await get(`/billing/invoices/${issued.id}`).expect(200)).body).toMatchObject({ creditTotalMinor: issued.totalMinor, totalMinor: issued.totalMinor, netDueMinor: 0 });
    await post(`/billing/invoices/${issued.id}/pay`, { amountMinor: 0, actionId: randomUUID() }).expect(201);
  });

  it('cancels an invoiced confirmed order with a full replay-safe credit preserving invoice membership', async () => {
    const order = await confirmed(), issued = await invoice(order);
    await post(`/billing/invoices/${issued.id}/credit`, { orderId: order.id, amountMinor: 1, reason: 'Not delivered', actionId: randomUUID() }).expect(409);
    await post(`/billing/invoices/${issued.id}/pay`, { amountMinor: issued.totalMinor, actionId: randomUUID() }).expect(201);
    const body = action(order, { action: 'CANCEL', reason: 'Company cancelled invoiced order' });
    const responses = await Promise.all([post(`/orders/${order.id}/override`, body), post(`/orders/${order.id}/override`, body)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]); expect(await prisma.billingCredit.count()).toBe(1);
    const history = (await get(`/orders/${order.id}`).expect(200)).body as OrderDetail;
    expect(history.status).toBe('CANCELLED'); expect(history.purchase).toEqual(order.purchase); expect(history.invoiced).toBe(true);
    expect((await get(`/billing/invoices/${issued.id}`).expect(200)).body).toMatchObject({ totalMinor: issued.totalMinor, creditTotalMinor: issued.totalMinor, netDueMinor: -issued.totalMinor, orderCount: 1 });
  });

  it('reconciles role counts and excludes cancelled/empty and other-date driver drops', async () => {
    const first = await confirmed(), second = await confirmed('13:30');
    await post(`/orders/${second.id}/override`, action(second, { action: 'CANCEL', reason: 'Remove empty stop' })).expect(201);
    const adminCounts = (await get('/dashboard').expect(200)).body.data;
    expect(adminCounts).toMatchObject({ todayOrders: 1, todayMeals: 2, uninvoicedTotalMinor: first.totalMinor });
    const billableQueue = (await get('/orders?billable=true&invoiced=false').expect(200)).body;
    expect(billableQueue.items.map((item: { id: string }) => item.id)).toEqual([first.id]);
    const kitchenCounts = (await get('/dashboard', kitchen).expect(200)).body.data;
    expect(kitchenCounts.unitsByStation.reduce((sum: number, item: { remaining: number }) => sum + item.remaining, 0)).toBe(1);
    expect((await get('/dashboard', dispatch).expect(200)).body.data).toMatchObject({ waiting: 1, ready: 0, delivered: 0 });
    await delivered(first);
    const drop = await prisma.deliveryDrop.findUniqueOrThrow({ where: { id: first.dropId! } });
    await prisma.deliveryDrop.create({ data: { companyId: drop.companyId, deliveryDate: '2026-10-08', deliveryAt: new Date('2026-10-08T07:00:00Z'), addressKey: 'f'.repeat(64), addressSnapshot: drop.addressSnapshot!, driverInstructions: '', driverId: drop.driverId } });
    expect((await get('/dashboard?date=2026-10-08', driver).expect(200)).body.data).toMatchObject({ totalDrops: 1, completedDrops: 1, timedCompletedDrops: 1, onTimeCount: 1, missingTimingCount: 0, nextDrop: null });
  });

  it('validates staff emails, keeps one Admin, and atomically invalidates changed credentials', async () => {
    await post('/staff', { email: 'not-email', displayName: 'Bad email', password: 'Test@1234', role: 'KITCHEN' }).expect(400);
    const onlyAdmin = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    await patch(`/staff/${onlyAdmin.id}`, { active: false }).expect(409);
    const created = (await post('/staff', { email: ' NEW.KITCHEN@test.com ', displayName: 'New Kitchen', password: 'Test@1234', role: 'KITCHEN' }).expect(201)).body;
    expect(created.email).toBe('new.kitchen@test.com'); expect(created.passwordHash).toBeUndefined();
    const identity = await login(created.email);
    await patch(`/staff/${created.id}`, { role: 'DISPATCH', password: 'Changed@1234' }).expect(200);
    await get('/auth/me', identity).expect(401);
    const changed = await login(created.email, 'Changed@1234'); await get('/drops', changed).expect(200); await get('/kitchen', changed).expect(403);
    await patch(`/staff/${created.id}`, { active: false }).expect(200); await get('/auth/me', changed).expect(401);
    const defaultDriver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    expect((await patch(`/staff/${defaultDriver.id}`, { active: false }).expect(409)).body.code).toBe('DRIVER_IN_USE');
  });
});
