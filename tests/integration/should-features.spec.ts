import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { EmployeeImportResult, CatalogueDish, EmployeeMenuPreview, KitchenBoardResponse, OrderDetail, OrderInput, OrderQuoteResponse, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { Clock } from '../../apps/api/src/common/clock';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';
import { parseCsv } from '../../apps/api/src/domain/csv';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Should-feature tests require a separate TEST_DATABASE_URL ending in _test.');
const ORIGIN = 'http://localhost:3000', TODAY = '2026-10-07';
type Login = { cookie: string; csrf: string };

describe('Should features: portions and employee CSV import on isolated PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login, kitchen: Login, menuItemId: string;
  const now = new Date('2026-10-07T05:00:00Z');
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect(); await resetPhase1Fixture(prisma);
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now)); await app.init();
  });
  beforeEach(async () => {
    await resetPhase1Fixture(prisma);
    [admin, kitchen] = await Promise.all(['admin', 'kitchen'].map((role) => login(`${role}@test.com`)));
    menuItemId = (await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } })).id;
  });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });
  async function login(email: string): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function get(path: string, identity = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', identity.cookie); }
  function send(method: 'post' | 'put', path: string, body: object, identity = admin) {
    return request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', ORIGIN).set('x-csrf-token', identity.csrf).send(body);
  }
  async function sizes() {
    const all = await prisma.referenceValue.findMany({ where: { kind: 'PORTION_SIZE' } });
    return { regular: all.find((size) => size.name === 'Regular')!.id, large: all.find((size) => size.name === 'Large')!.id };
  }
  async function portionGroup() {
    const { regular, large } = await sizes();
    const body = { groups: [{ id: SEED_IDS.group, name: 'Grain', required: true, sortOrder: 0, optionIds: [SEED_IDS.option], portionSizeIds: [regular, large],
      portionSurcharges: [{ optionId: SEED_IDS.option, portionSizeId: regular, surchargeMinor: 0 }, { optionId: SEED_IDS.option, portionSizeId: large, surchargeMinor: 125 }] }] };
    return { regular, large, body };
  }

  describe('portions', () => {
    it('requires every option in a portion group to price every size, and only Admin can configure it', async () => {
      const { large, body } = await portionGroup();
      const incomplete = { groups: [{ ...body.groups[0], portionSurcharges: body.groups[0].portionSurcharges.slice(0, 1) }] };
      expect((await send('put', `/dishes/${SEED_IDS.dish}/groups`, incomplete).expect(400)).body.code).toBe('GROUP_PORTIONS_INVALID');
      const stray = { groups: [{ ...body.groups[0], portionSizeIds: [], portionSurcharges: [{ optionId: SEED_IDS.option, portionSizeId: large, surchargeMinor: 1 }] }] };
      expect((await send('put', `/dishes/${SEED_IDS.dish}/groups`, stray).expect(400)).body.code).toBe('GROUP_PORTIONS_INVALID');
      expect((await send('put', `/dishes/${SEED_IDS.dish}/groups`, { groups: [{ ...body.groups[0], portionSizeIds: [SEED_IDS.option] }] }).expect(400)).body.code).toMatch(/PORTION/);
      await send('put', `/dishes/${SEED_IDS.dish}/groups`, body, kitchen).expect(403);
      const saved = (await send('put', `/dishes/${SEED_IDS.dish}/groups`, body).expect(200)).body as CatalogueDish;
      expect(saved.groups[0].portionSizes.map((entry) => entry.portionSize.name)).toEqual(['Regular', 'Large']);
      expect(saved.groups[0].options[0].portionPrices).toEqual(expect.arrayContaining([{ portionSizeId: large, surchargeMinor: 125 }]));
    });

    it('prices, snapshots and routes a portioned combination to its own prep unit', async () => {
      const { regular, large, body } = await portionGroup();
      await send('put', `/dishes/${SEED_IDS.dish}/groups`, body).expect(200);
      const menu = (await get(`/employees/${SEED_IDS.employee}/menu`).expect(200)).body as EmployeeMenuPreview;
      const group = menu.categories.flatMap((category) => category.dishes).find((dish) => dish.dishId === SEED_IDS.dish)!.groups[0];
      expect(group.portionSizes.map((size) => size.name)).toEqual(['Regular', 'Large']);
      expect(group.options[0].portions).toEqual([{ portionSizeId: regular, name: 'Regular', surchargeMinor: 0 }, { portionSizeId: large, name: 'Large', surchargeMinor: 125 }]);
      const base: OrderInput = { employeeId: SEED_IDS.employee, deliveryDate: TODAY, lines: [] };
      const missing = { ...base, lines: [{ menuItemId, quantity: 1, combinations: [{ quantity: 1, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option }] }] }], overrideReason: 'Portion test' };
      expect((await send('post', '/orders/quote', missing).expect(400)).body.code).toBe('PORTION_REQUIRED');
      const input: OrderInput = { ...base, lines: [{ menuItemId, quantity: 5, combinations: [
        { quantity: 3, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option, portionSizeId: large }] },
        { quantity: 2, selections: [{ groupId: SEED_IDS.group, optionId: SEED_IDS.option, portionSizeId: regular }] }] }] };
      const quote = (await send('post', '/orders/quote', { ...input, overrideReason: 'Portion test' }).expect(201)).body as OrderQuoteResponse;
      const optionPrice = quote.lines[0].combinations.find((entry) => entry.selections[0].portionSizeId === regular)!.selections[0].priceMinor;
      const largeCombination = quote.lines[0].combinations.find((entry) => entry.selections[0].portionSizeId === large)!;
      expect(largeCombination.selections[0]).toMatchObject({ portionName: 'Large', portionSurchargeMinor: 125, priceMinor: optionPrice + 125 });
      expect(quote.totalMinor).toBe(quote.lines[0].combinations.reduce((total, entry) => total + entry.totalMinor, 0));
      const order = (await send('post', '/orders/override-create', { ...input, actionId: randomUUID(), acceptedQuote: quote.fingerprint, reason: 'Portion test' }).expect(201)).body as OrderDetail;
      await send('put', `/dishes/${SEED_IDS.dish}/groups`, { groups: [{ ...body.groups[0], portionSurcharges: body.groups[0].portionSurcharges.map((entry) => ({ ...entry, surchargeMinor: 999 })) }] }).expect(200);
      expect(((await get(`/orders/${order.id}`).expect(200)).body as OrderDetail).totalMinor).toBe(quote.totalMinor);
      const board = (await get(`/kitchen?date=${TODAY}&pageSize=100`, kitchen).expect(200)).body as KitchenBoardResponse;
      const units = board.items.filter((unit) => unit.orderId === order.id);
      expect(units.map((unit) => unit.selections[0].portionName).sort()).toEqual(['Large', 'Regular']);
    });
  });

  describe('employee CSV import', () => {
    it('parses quoted RFC 4180 fields, CRLF and a BOM', () => {
      expect(parseCsv('\ufeffname,email\r\n"Rao, Asha","a@x.example"\r\n\r\n"Say ""hi""\nthere",b@x.example')).toEqual([
        { line: 1, cells: ['name', 'email'] }, { line: 2, cells: ['Rao, Asha', 'a@x.example'] }, { line: 4, cells: ['Say "hi"\nthere', 'b@x.example'] }]);
    });

    it('creates valid rows and reports every invalid row by line without rejecting the file', async () => {
      const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN', active: true } });
      const existing = await prisma.employee.findUniqueOrThrow({ where: { id: SEED_IDS.employee } });
      const csv = [
        'Name,Email,Phone,can_choose_address,Allergens',
        `Meera Kapoor,MEERA@acme.example,+91 90000 00001,yes,${allergen.name.toUpperCase()}`,
        ',missing-name@acme.example,,,',
        'Bad Email,not-an-email,,,',
        `Already Here,${existing.email},,,`,
        'Flag Typo,flag@acme.example,,maybe,',
        'Unknown Allergy,ua@acme.example,,,Moonbeans',
        '"Shah, Dev",dev@acme.example,,0,',
        'Dev Again,DEV@acme.example,,,',
      ].join('\n');
      const body = { companyId: SEED_IDS.company, csv };
      await send('post', '/employees/import', body, kitchen).expect(403);
      const before = await prisma.employee.count();
      const dry = (await send('post', '/employees/import', { ...body, dryRun: true }).expect(200)).body as EmployeeImportResult;
      expect(dry).toMatchObject({ dryRun: true, totalRows: 8, created: 0, valid: 2, failed: 6 });
      expect(await prisma.employee.count()).toBe(before);
      const result = (await send('post', '/employees/import', body).expect(200)).body as EmployeeImportResult;
      expect(result).toMatchObject({ dryRun: false, totalRows: 8, created: 2, failed: 6 });
      const byLine = Object.fromEntries(result.rows.map((row) => [row.line, row]));
      expect(byLine[2]).toMatchObject({ status: 'CREATED', email: 'meera@acme.example' });
      expect(byLine[3].errors).toEqual(['name is required.']);
      expect(byLine[4].errors[0]).toMatch(/not a valid email/);
      expect(byLine[5].errors[0]).toMatch(/already exists/);
      expect(byLine[6].errors[0]).toMatch(/can_choose_address must be/);
      expect(byLine[7].errors[0]).toMatch(/Unknown allergen "Moonbeans"/);
      expect(byLine[8]).toMatchObject({ status: 'CREATED', name: 'Shah, Dev' });
      expect(byLine[9].errors[0]).toMatch(/repeated; it first appears on line 8/);
      const meera = await prisma.employee.findUniqueOrThrow({ where: { id: byLine[2].employeeId! }, include: { allergens: true } });
      expect(meera).toMatchObject({ companyId: SEED_IDS.company, canChooseAddress: true, canChangeTime: false, phone: '+91 90000 00001' });
      expect(meera.allergens.map((entry) => entry.referenceId)).toEqual([allergen.id]);
      const again = (await send('post', '/employees/import', body).expect(200)).body as EmployeeImportResult;
      expect(again.created).toBe(0);
    });

    it('rejects only files that cannot be read as a table', async () => {
      for (const [csv, code] of [['email\nx@y.example', 'CSV_COLUMNS_INVALID'], ['name,email,salary\na,b@c.example,1', 'CSV_COLUMNS_INVALID'], ['name,email', 'CSV_EMPTY'], ['name,email\n"open,a@b.example', 'CSV_UNREADABLE']] as const) {
        expect((await send('post', '/employees/import', { companyId: SEED_IDS.company, csv }).expect(400)).body.code).toBe(code);
      }
    });
  });
});
