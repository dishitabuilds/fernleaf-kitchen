import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { EmployeeMenuPreview, PriceMatrix, SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Catalogue integration tests require an isolated TEST_DATABASE_URL ending in _test.');
}
const WEB_ORIGIN = 'http://localhost:3000';
type Login = { cookie: string; csrf: string };

describe('Phase 1 catalogue, pricing and employee menu on real PostgreSQL', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let admin: Login;
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect();
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: WEB_ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    await app.init();
  });
  beforeEach(async () => { await resetPhase1Fixture(prisma); admin = await login(); });
  afterAll(async () => { if (app) await app.close(); if (prisma) await prisma.$disconnect(); });
  async function login(email = 'admin@test.com'): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: (response.body as SessionResponse).csrfToken };
  }
  function get(path: string, user = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', user.cookie); }
  function patch(path: string, body: object, user = admin) {
    return request(app.getHttpServer()).patch(`/api/v1${path}`).set('Cookie', user.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', user.csrf).send(body);
  }
  function post(path: string, body: object) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf).send(body);
  }
  function groups(body: object) {
    return request(app.getHttpServer()).put(`/api/v1/dishes/${SEED_IDS.dish}/groups`).set('Cookie', admin.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', admin.csrf).send(body);
  }
  async function preview(categoryId?: string): Promise<EmployeeMenuPreview> {
    const response = await get(`/employees/${SEED_IDS.employee}/menu${categoryId ? `/categories/${categoryId}` : ''}`).expect(200);
    return response.body as EmployeeMenuPreview;
  }

  it.each(['kitchen', 'dispatch', 'driver'])('rejects direct %s catalogue and matrix edits plus employee previews', async (role) => {
    const user = await login(`${role}@test.com`);
    await get('/dishes', user).expect(403);
    await get(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, user).expect(403);
    await get(`/employees/${SEED_IDS.employee}/menu`, user).expect(403);
    await patch(`/dishes/${SEED_IDS.dish}`, { costMinor: 0 }, user).expect(403);
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [] }, user).expect(403);
  });

  it('persists complete dish fields/references, enforces SKU uniqueness, and deactivates without deleting', async () => {
    const station = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'KITCHEN_STATION' } });
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    const tag = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'DIETARY_TAG' } });
    const input = { sku: '  new-1  ', name: 'Chilled bowl', description: 'Whole grains', imageUrl: 'https://images.example/bowl.jpg', temperature: 'COLD', costMinor: 250, stationId: station.id, minQuantity: 4, allergenIds: [allergen.id], dietaryTagIds: [tag.id] };
    const created = await post('/dishes', input).expect(201);
    expect(created.body).toMatchObject({ sku: 'NEW-1', name: 'Chilled bowl', description: 'Whole grains', temperature: 'COLD', costMinor: 250, stationId: station.id, minQuantity: 4, active: true });
    expect(created.body.allergens[0].referenceId).toBe(allergen.id);
    expect(created.body.dietaryTags[0].referenceId).toBe(tag.id);
    await post('/dishes', { ...input, sku: 'NEW-1' }).expect(409);
    await patch(`/dishes/${created.body.id}`, { sku: ' new-2 ' }).expect(200);
    expect((await get(`/dishes/${created.body.id}`).expect(200)).body.sku).toBe('NEW-2');
    await patch(`/dishes/${created.body.id}`, { active: false, minQuantity: null, stationId: null }).expect(200);
    const record = await get(`/dishes/${created.body.id}`).expect(200);
    expect(record.body).toMatchObject({ active: false, minQuantity: null, stationId: null, costMinor: 250 });
    expect(await prisma.dish.count({ where: { id: created.body.id } })).toBe(1);
  });

  it('rejects wrong reference kinds, null nonnullable fields, fractional money and unexpected nested choices', async () => {
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    await patch(`/dishes/${SEED_IDS.dish}`, { stationId: allergen.id }).expect(400);
    for (const invalid of [{ costMinor: 2.11 }, { costMinor: -1 }, { costMinor: null }, { active: null }, { name: '  ' }, { allergens: [] }]) await patch(`/dishes/${SEED_IDS.dish}`, invalid).expect(400);
    await groups({ groups: [{ name: 'Choice', required: true, sortOrder: 0, optionIds: [], automaticFree: true }] }).expect(400);
    await groups({ groups: [{ name: 'Choice', required: true, sortOrder: 0, optionIds: [SEED_IDS.option, SEED_IDS.option] }] }).expect(400);
    expect((await prisma.dish.findUniqueOrThrow({ where: { id: SEED_IDS.dish } })).costMinor).toBe(211);
  });

  it('updates ordered reusable groups atomically and rejects foreign group IDs', async () => {
    const option = await post('/options', { name: 'Jeera rice', costMinor: 90 }).expect(201);
    const saved = await groups({ groups: [{ id: SEED_IDS.group, name: 'Grain', required: true, sortOrder: 2, optionIds: [option.body.id, SEED_IDS.option] }, { name: 'Extra', required: false, sortOrder: 1, optionIds: [SEED_IDS.option] }] }).expect(200);
    expect(saved.body.groups.map((group: { name: string }) => group.name)).toEqual(['Extra', 'Grain']);
    expect(saved.body.groups[1].options.map((entry: { optionId: string }) => entry.optionId)).toEqual([option.body.id, SEED_IDS.option]);
    await groups({ groups: [{ id: randomUUID(), name: 'Invalid', required: false, sortOrder: 0, optionIds: [] }] }).expect(400);
    expect(await prisma.dishOptionGroup.count({ where: { dishId: SEED_IDS.dish } })).toBe(2);
    await groups({ groups: [] }).expect(200);
    expect(await prisma.dishOptionGroup.count({ where: { dishId: SEED_IDS.dish } })).toBe(0);
  });

  it('provides server-side list filters/pagination and persistent category/menu ordering', async () => {
    const category = await post('/categories', { name: 'Breakfast', sortOrder: 5, secret: true }).expect(201);
    const item = await post('/menu-items', { categoryId: category.body.id, dishId: SEED_IDS.dish, sortOrder: 8 }).expect(201);
    await post('/menu-items', { categoryId: category.body.id, dishId: SEED_IDS.dish }).expect(409);
    await patch(`/menu-items/${item.body.id}`, { active: false, sortOrder: 2 }).expect(200);
    const filtered = await get(`/menu-items?categoryId=${category.body.id}&active=false&pageSize=1`).expect(200);
    expect(filtered.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(filtered.body.items[0]).toMatchObject({ active: false, sortOrder: 2, category: { secret: true } });
    const dishes = await get('/dishes?q=demo-rice&pageSize=1').expect(200);
    expect(dishes.body.total).toBe(1);
    expect(dishes.body.items[0].id).toBe(SEED_IDS.dish);
    await get('/dishes?pageSize=201').expect(400);
  });

  it('rounds cost/reference derivation upwards to nickels, preserving explicit overrides and zero', async () => {
    await patch(`/price-tiers/${SEED_IDS.costTier}`, { numerator: 1, denominator: 1 }).expect(200);
    let matrix = (await get(`/price-tiers/${SEED_IDS.costTier}/matrix?q=Roasted`).expect(200)).body as PriceMatrix;
    expect(matrix.items[0]).toMatchObject({ effectiveMinor: 215, explicitMinor: null, source: 'COST' });
    const reference = await post('/price-tiers', { name: 'Reference plus 50%', rule: 'REFERENCE', referenceTierId: SEED_IDS.costTier, numerator: 3, denominator: 2 }).expect(201);
    matrix = (await get(`/price-tiers/${reference.body.id}/matrix?q=Roasted`).expect(200)).body;
    expect(matrix.items[0]).toMatchObject({ effectiveMinor: 325, source: 'REFERENCE' });
    await patch(`/price-tiers/${SEED_IDS.costTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: 211 }, { kind: 'OPTION', itemId: SEED_IDS.option, amountMinor: 0 }] }).expect(200);
    matrix = (await get(`/price-tiers/${SEED_IDS.costTier}/matrix`).expect(200)).body;
    expect(matrix.items.find((entry) => entry.itemId === SEED_IDS.dish)).toMatchObject({ effectiveMinor: 211, source: 'EXPLICIT' });
    expect(matrix.items.find((entry) => entry.itemId === SEED_IDS.option)).toMatchObject({ effectiveMinor: 0, source: 'EXPLICIT' });
  });

  it('bulk matrix edits roll back entirely on bad items and null removes an override', async () => {
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: 999 }, { kind: 'OPTION', itemId: randomUUID(), amountMinor: 60 }] }).expect(400);
    expect((await prisma.dishTierPrice.findUniqueOrThrow({ where: { tierId_dishId: { tierId: SEED_IDS.defaultTier, dishId: SEED_IDS.dish } } })).amountMinor).toBe(800);
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish }] }).expect(400);
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: null }] }).expect(200);
    const matrix = (await get(`/price-tiers/${SEED_IDS.defaultTier}/matrix?missing=true&kind=DISH`).expect(200)).body as PriceMatrix;
    expect(matrix.items.map((entry) => entry.itemId)).toContain(SEED_IDS.dish);
    expect(matrix.items.every((entry) => entry.source === 'MISSING')).toBe(true);
  });

  it('rejects tier cycles and deactivating tiers used by defaults, companies or references', async () => {
    const reference = await post('/price-tiers', { name: 'Standard reference', rule: 'REFERENCE', referenceTierId: SEED_IDS.defaultTier }).expect(201);
    const cycle = await patch(`/price-tiers/${SEED_IDS.defaultTier}`, { rule: 'REFERENCE', referenceTierId: reference.body.id }).expect(400);
    expect(cycle.body.code).toBe('PRICE_TIER_CYCLE');
    await patch(`/price-tiers/${SEED_IDS.defaultTier}`, { active: false }).expect(409);
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { priceTierId: SEED_IDS.costTier } });
    await patch(`/price-tiers/${SEED_IDS.costTier}`, { active: false }).expect(409);
    const unusedBase = await post('/price-tiers', { name: 'Reference-only base', rule: 'MANUAL' }).expect(201);
    await post('/price-tiers', { name: 'Reference-only child', rule: 'REFERENCE', referenceTierId: unusedBase.body.id }).expect(201);
    await patch(`/price-tiers/${unusedBase.body.id}`, { active: false }).expect(409);
    await patch(`/price-tiers/${reference.body.id}`, { active: false }).expect(200);
  });

  it('prevents a reference cycle under simultaneous cross-reference edits', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = await post('/price-tiers', { name: `Cycle A ${attempt}`, rule: 'MANUAL' }).expect(201);
      const b = await post('/price-tiers', { name: `Cycle B ${attempt}`, rule: 'MANUAL' }).expect(201);
      const responses = await Promise.all([
        patch(`/price-tiers/${a.body.id}`, { rule: 'REFERENCE', referenceTierId: b.body.id }),
        patch(`/price-tiers/${b.body.id}`, { rule: 'REFERENCE', referenceTierId: a.body.id }),
      ]);
      const winner = responses.findIndex((response) => response.status === 200);
      expect(winner).toBeGreaterThanOrEqual(0);
      const loser = responses[1 - winner];
      if (loser.status === 409) expect(loser.body.code).toBe('CONCURRENT_CHANGE');
      else {
        expect(loser.status).toBe(400);
        expect(loser.body.code).toBe('PRICE_TIER_CYCLE');
      }
      const tiers = await prisma.priceTier.findMany({ where: { id: { in: [a.body.id, b.body.id] } } });
      expect(tiers.filter((tier) => tier.rule === 'REFERENCE')).toHaveLength(1);
      const rejectedId = winner === 0 ? b.body.id : a.body.id;
      const committedId = winner === 0 ? a.body.id : b.body.id;
      const retried = await patch(`/price-tiers/${rejectedId}`, { rule: 'REFERENCE', referenceTierId: committedId }).expect(400);
      expect(retried.body.code).toBe('PRICE_TIER_CYCLE');
    }
  });

  it('uses company tier without missing-item fallback and excludes missing dish/option prices', async () => {
    let menu = await preview();
    expect(menu.tierId).toBe(SEED_IDS.defaultTier);
    expect(menu.categories.flatMap((category) => category.dishes).map((dish) => dish.dishId)).toEqual([SEED_IDS.dish]);
    expect(menu.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: SEED_IDS.missingDish, reason: 'DISH_PRICE_MISSING' })]));
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { priceTierId: SEED_IDS.missingTier } });
    menu = await preview();
    expect(menu.tierId).toBe(SEED_IDS.missingTier);
    expect(menu.categories).toEqual([]);
    await patch(`/price-tiers/${SEED_IDS.missingTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.dish, amountMinor: 700 }] }).expect(200);
    menu = await preview();
    expect(menu.categories).toEqual([]);
    expect(menu.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: SEED_IDS.dish, reason: 'REQUIRED_GROUP_NO_PRICED_OPTION' })]));
    await patch(`/price-tiers/${SEED_IDS.missingTier}/matrix`, { entries: [{ kind: 'OPTION', itemId: SEED_IDS.option, amountMinor: 0 }] }).expect(200);
    menu = await preview();
    expect(menu.categories[0].dishes[0]).toMatchObject({ dishId: SEED_IDS.dish, priceMinor: 700, groups: [{ required: true, options: [{ priceMinor: 0 }] }] });
  });

  it('secret direct preview still obeys company category/item hiding, active flags and pricing', async () => {
    expect((await preview()).categories.some((category) => category.secret)).toBe(false);
    let direct = await preview(SEED_IDS.secretCategory);
    expect(direct.categories[0].dishes[0].dishId).toBe(SEED_IDS.secretDish);
    await prisma.companyHiddenCategory.create({ data: { companyId: SEED_IDS.company, categoryId: SEED_IDS.secretCategory } });
    direct = await preview(SEED_IDS.secretCategory);
    expect(direct.categories).toEqual([]);
    expect(direct.diagnostics[0].reason).toBe('CATEGORY_HIDDEN');
    await prisma.companyHiddenCategory.deleteMany();
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.secretCategory, dishId: SEED_IDS.secretDish } } });
    await prisma.companyHiddenMenuItem.create({ data: { companyId: SEED_IDS.company, menuItemId: item.id } });
    expect((await preview(SEED_IDS.secretCategory)).categories).toEqual([]);
    await prisma.companyHiddenMenuItem.deleteMany();
    await patch(`/dishes/${SEED_IDS.secretDish}`, { active: false }).expect(200);
    expect((await preview(SEED_IDS.secretCategory)).diagnostics[0].reason).toBe('DISH_INACTIVE');
    await patch(`/dishes/${SEED_IDS.secretDish}`, { active: true }).expect(200);
    await patch(`/price-tiers/${SEED_IDS.defaultTier}/matrix`, { entries: [{ kind: 'DISH', itemId: SEED_IDS.secretDish, amountMinor: null }] }).expect(200);
    expect((await preview(SEED_IDS.secretCategory)).diagnostics[0].reason).toBe('DISH_PRICE_MISSING');
  });

  it('applies every active flag and rejects inactive employees/companies at the API boundary', async () => {
    await patch(`/categories/${SEED_IDS.category}`, { active: false }).expect(200);
    expect((await preview()).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: SEED_IDS.dish, reason: 'CATEGORY_INACTIVE' })]));
    await patch(`/categories/${SEED_IDS.category}`, { active: true }).expect(200);
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { categoryId_dishId: { categoryId: SEED_IDS.category, dishId: SEED_IDS.dish } } });
    await patch(`/menu-items/${item.id}`, { active: false }).expect(200);
    expect((await preview()).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: SEED_IDS.dish, reason: 'MENU_ITEM_INACTIVE' })]));
    await patch(`/menu-items/${item.id}`, { active: true }).expect(200);
    await patch(`/options/${SEED_IDS.option}`, { active: false }).expect(200);
    expect((await preview()).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ dishId: SEED_IDS.dish, reason: 'REQUIRED_GROUP_NO_PRICED_OPTION' })]));
    await prisma.employee.update({ where: { id: SEED_IDS.employee }, data: { active: false } });
    await get(`/employees/${SEED_IDS.employee}/menu`).expect(400);
    await prisma.employee.update({ where: { id: SEED_IDS.employee }, data: { active: true } });
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { active: false } });
    await get(`/employees/${SEED_IDS.employee}/menu`).expect(400);
  });

  it('shows matching allergy warnings and dietary tags as guidance without automatic filtering', async () => {
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    const tag = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'DIETARY_TAG' } });
    await prisma.employeeAllergen.create({ data: { employeeId: SEED_IDS.employee, referenceId: allergen.id } });
    await patch(`/dishes/${SEED_IDS.dish}`, { allergenIds: [allergen.id], dietaryTagIds: [tag.id] }).expect(200);
    await patch(`/options/${SEED_IDS.option}`, { allergenIds: [allergen.id] }).expect(200);
    const dish = (await preview()).categories[0].dishes[0];
    expect(dish.allergyWarnings).toEqual([allergen.name]);
    expect(dish.dietaryTags).toEqual([tag.name]);
    expect(dish.groups[0].options[0].allergyWarnings).toEqual([allergen.name]);
  });
});
