import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { CompanyCreateRequest, CompanyResponse, EmployeeResponse, SessionResponse, SettingsResponse, SettingsUpdateRequest } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { SEED_IDS, seedConfiguration } from '../../apps/api/prisma/seed-configuration';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) throw new Error('Configuration integration tests require a separate TEST_DATABASE_URL ending in _test.');
const WEB_ORIGIN = 'http://localhost:3000';
type Login = { cookie: string; csrf: string };
function companyInput(domain = 'example-customer.example'): CompanyCreateRequest {
  return { name: 'Example customer', billingName: 'Example customer LLC', billingEmail: 'billing@example-customer.example', billingAddress: '1 Example Avenue, Bengaluru', billingContactName: 'Accounts team',
    domains: [domain], owner: { name: 'Customer owner', email: 'owner@example-customer.example' },
    address: { label: 'Head office', line1: '1 Example Avenue', city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' },
    deliveryTime: '12:30', deliveryMinutes: 45, workingDays: [1, 2, 3, 4, 5], holidays: [] };
}

describe('Phase 1 company, employee and settings persistence using PostgreSQL', () => {
  let app: NestExpressApplication, prisma: PrismaClient, admin: Login;
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
  function post(path: string, body: object, identity = admin) { return request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function patch(path: string, body: object, identity = admin) { return request(app.getHttpServer()).patch(`/api/v1${path}`).set('Cookie', identity.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', identity.csrf).send(body); }
  function get(path: string, identity = admin) { return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', identity.cookie); }
  async function createCompany(domain?: string): Promise<CompanyResponse> { return (await post('/companies', companyInput(domain)).expect(201)).body as CompanyResponse; }
  async function settings(): Promise<SettingsResponse> { return (await get('/settings').expect(200)).body as SettingsResponse; }
  function editable(value: SettingsResponse): SettingsUpdateRequest { return { version: value.version, defaultPriceTierId: value.defaultPriceTierId, workingDays: value.workingDays, holidays: value.holidays, cutoffTime: value.cutoffTime, cutoffWorkingDays: value.cutoffWorkingDays, riskThresholdMinutes: value.riskThresholdMinutes }; }

  it.each(['kitchen', 'dispatch', 'driver'])('denies %s direct configuration reads and writes', async (role) => {
    const identity = await login(`${role}@test.com`);
    for (const path of ['/companies', '/employees', '/reference-data', '/settings/cutoff?deliveryDate=2026-10-07']) await get(path, identity).expect(403);
    await post('/companies', companyInput(), identity).expect(403);
    await patch('/settings', editable(await settings()), identity).expect(403);
  });

  it('creates normalized domains, initial address and same-company owner atomically', async () => {
    const body = companyInput('  CUSTOM.EXAMPLE  '); body.owner.email = ' OWNER@CUSTOM.EXAMPLE ';
    const company = (await post('/companies', body).expect(201)).body as CompanyResponse;
    expect(company.domains).toEqual(['custom.example']);
    expect(company.employees[0]).toMatchObject({ id: company.ownerEmployeeId, companyId: company.id, email: 'owner@custom.example', canChooseAddress: false, canChangeTime: false, canChangePackaging: false });
    expect(company.addresses[0]).toMatchObject({ id: company.defaultAddressId, companyId: company.id, active: true });
    expect((await get(`/companies/${company.id}`).expect(200)).body).toEqual(company);
    expect((await get('/companies?search=custom.example&pageSize=1').expect(200)).body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
  });

  it('rolls back company/domain/owner inserts when initial address setup fails', async () => {
    const before = await prisma.company.count();
    const body = { ...companyInput(), address: { label: 'Incomplete' } };
    await post('/companies', body).expect(400);
    await post('/companies', { ...companyInput(), owner: [companyInput().owner] }).expect(400);
    expect(await prisma.company.count()).toBe(before);
    expect(await prisma.companyDomain.count({ where: { domain: 'example-customer.example' } })).toBe(0);
    expect(await prisma.employee.count({ where: { email: 'owner@example-customer.example' } })).toBe(0);
    await post('/companies', { ...companyInput(), address: { ...companyInput().address, active: false } }).expect(400);
  });

  it('rejects malformed/public/duplicate normalized domains and enforces data-backed restrictions', async () => {
    for (const domain of ['gmail.com', ' Gmail.Com ', 'https://company.example', 'person@company.example', '-bad.example', 'localhost']) await post('/companies', companyInput(domain)).expect(400);
    await post('/companies', { ...companyInput(), domains: ['CUSTOM.EXAMPLE', 'custom.example'] }).expect(400);
    await post('/reference-data', { kind: 'PUBLIC_EMAIL_DOMAIN', name: 'MAIL.EXAMPLE' }).expect(201);
    await post('/companies', companyInput('mail.example')).expect(400);
    const idn = await createCompany('bücher.example'); expect(idn.domains).toEqual(['xn--bcher-kva.example']);
  });

  it('concurrent claims for one normalized domain create exactly one complete company', async () => {
    const responses = await Promise.all([post('/companies', companyInput('race.example')), post('/companies', { ...companyInput('RACE.EXAMPLE'), name: 'Second claimant' })]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.companyDomain.count({ where: { domain: 'race.example' } })).toBe(1);
    expect(await prisma.company.count()).toBe(2);
    expect(await prisma.employee.count()).toBe(3);
  });

  it('enforces owner/address company membership in API and database', async () => {
    const company = await createCompany();
    await patch(`/companies/${company.id}`, { version: company.version, ownerEmployeeId: SEED_IDS.owner }).expect(400);
    await patch(`/companies/${company.id}`, { version: company.version, defaultAddressId: SEED_IDS.address }).expect(400);
    await expect(prisma.company.update({ where: { id: company.id }, data: { ownerEmployeeId: SEED_IDS.owner } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.company.update({ where: { id: company.id }, data: { defaultAddressId: SEED_IDS.address } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('requires owner replacement for transfer and updates source/target atomically', async () => {
    const target = await createCompany();
    const blocked = await post(`/employees/${SEED_IDS.owner}/transfer`, { companyId: target.id }).expect(409);
    expect(blocked.body.code).toBe('REPLACEMENT_OWNER_REQUIRED');
    await post(`/employees/${SEED_IDS.owner}/transfer`, { companyId: target.id, replacementOwnerId: target.ownerEmployeeId }).expect(400);
    const moved = (await post(`/employees/${SEED_IDS.owner}/transfer`, { companyId: target.id, replacementOwnerId: SEED_IDS.employee }).expect(201)).body as EmployeeResponse;
    expect(moved.companyId).toBe(target.id);
    expect((await get(`/companies/${SEED_IDS.company}`).expect(200)).body).toMatchObject({ ownerEmployeeId: SEED_IDS.employee, version: 2 });
    await patch(`/employees/${SEED_IDS.employee}`, { active: false }).expect(409);
  });

  it('normalizes employee email and rolls back an owner transfer colliding in target company', async () => {
    const target = await createCompany();
    await post('/employees', { companyId: target.id, name: 'Duplicate', email: ' OWNER@FERNLEAF-DEMO.EXAMPLE ' }).expect(201);
    await post('/employees', { companyId: target.id, name: 'Repeated', email: 'owner@fernleaf-demo.example' }).expect(409);
    await post(`/employees/${SEED_IDS.owner}/transfer`, { companyId: target.id, replacementOwnerId: SEED_IDS.employee }).expect(409);
    expect((await get(`/companies/${SEED_IDS.company}`).expect(200)).body).toMatchObject({ ownerEmployeeId: SEED_IDS.owner, version: 1 });
    expect((await get(`/employees/${SEED_IDS.owner}`).expect(200)).body.companyId).toBe(SEED_IDS.company);
  });

  it('persists employee permissions/allergy guidance and rejects the wrong reference kind', async () => {
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    const tag = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'DIETARY_TAG' } });
    const employee = (await post('/employees', { companyId: SEED_IDS.company, name: 'Configured employee', email: 'configured@fernleaf-demo.example', canChooseAddress: true, canChangeTime: true, canChangePackaging: true, allergenIds: [allergen.id], dietaryTagIds: [tag.id] }).expect(201)).body as EmployeeResponse;
    expect(employee).toMatchObject({ canChooseAddress: true, canChangeTime: true, canChangePackaging: true, allergenIds: [allergen.id], dietaryTagIds: [tag.id] });
    await patch(`/employees/${employee.id}`, { allergenIds: [tag.id] }).expect(400);
    await patch(`/employees/${employee.id}`, { companyId: 'another-company' }).expect(400);
    await patch(`/employees/${employee.id}`, { canChangeTime: 'true' }).expect(400);
    expect((await get(`/employees?companyId=${SEED_IDS.company}&search=configured&pageSize=1`).expect(200)).body).toMatchObject({ total: 1, items: [employee] });
  });

  it('requires active correct-kind defaults and protects the default address', async () => {
    const company = (await get(`/companies/${SEED_IDS.company}`).expect(200)).body as CompanyResponse;
    const kitchen = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'kitchen@test.com' } });
    const allergen = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'ALLERGEN' } });
    await patch(`/companies/${company.id}`, { version: company.version, defaultDriverId: kitchen.id }).expect(400);
    await patch(`/companies/${company.id}`, { version: company.version, packagingId: allergen.id }).expect(400);
    await patch(`/companies/${company.id}/addresses/${company.defaultAddressId}`, { active: false }).expect(409);
    expect((await get('/companies/drivers').expect(200)).body).toEqual([expect.objectContaining({ displayName: 'Demo Driver' })]);
    const address = (await post(`/companies/${company.id}/addresses`, { ...companyInput().address, label: 'Second office' }).expect(201)).body;
    await patch(`/companies/${company.id}`, { version: company.version, defaultAddressId: address.id }).expect(200);
    await patch(`/companies/${company.id}/addresses/${company.defaultAddressId}`, { active: false }).expect(200);
  });

  it('saves company restrictions/calendar with optimistic concurrency and rejects invalid dates', async () => {
    const company = (await get(`/companies/${SEED_IDS.company}`).expect(200)).body as CompanyResponse;
    await patch(`/companies/${company.id}`, { version: company.version, holidays: ['2026-02-30'] }).expect(400);
    await patch(`/companies/${company.id}`, { version: company.version, workingDays: [] }).expect(400);
    const menuItem = await prisma.menuItem.findFirstOrThrow({ where: { categoryId: SEED_IDS.category } });
    const saved = await patch(`/companies/${company.id}`, { version: company.version, hiddenCategoryIds: [SEED_IDS.secretCategory], hiddenMenuItemIds: [menuItem.id], holidays: ['2026-10-07'], deliveryTime: '13:30', driverInstructions: 'Ring reception.' }).expect(200);
    expect(saved.body).toMatchObject({ version: 2, hiddenCategoryIds: [SEED_IDS.secretCategory], hiddenMenuItemIds: [menuItem.id], deliveryTime: '13:30' });
    await patch(`/companies/${company.id}`, { version: company.version, name: 'Stale write' }).expect(409);
    await patch(`/companies/${company.id}`, { name: 'No version' }).expect(400);
  });

  it('keeps references manageable, retirement safe and seeded edits intact', async () => {
    const portion = (await post('/reference-data', { kind: 'PORTION_SIZE', name: 'Small', sortOrder: 3 }).expect(201)).body;
    await post('/reference-data', { kind: 'PORTION_SIZE', name: 'SMALL' }).expect(409);
    await patch(`/reference-data/${portion.id}`, { active: false }).expect(200);
    const packaging = await prisma.referenceValue.findFirstOrThrow({ where: { kind: 'PACKAGING_TYPE', name: 'Meal box' } });
    await patch(`/reference-data/${packaging.id}`, { active: false }).expect(409);
    await post('/reference-data', { kind: 'PUBLIC_EMAIL_DOMAIN', name: 'fernleaf-demo.example' }).expect(409);
    await prisma.company.update({ where: { id: SEED_IDS.company }, data: { name: 'Reviewer change' } });
    await prisma.dishTierPrice.delete({ where: { tierId_dishId: { tierId: SEED_IDS.defaultTier, dishId: SEED_IDS.dish } } });
    await seedConfiguration(prisma);
    expect((await get(`/companies/${SEED_IDS.company}`).expect(200)).body.name).toBe('Reviewer change');
    expect((await get('/reference-data?kind=PORTION_SIZE').expect(200)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: portion.id, active: false })]));
    expect(await prisma.dishTierPrice.findUnique({ where: { tierId_dishId: { tierId: SEED_IDS.defaultTier, dishId: SEED_IDS.dish } } })).toBeNull();
  });

  it('persists kitchen settings and previews cutoff using kitchen calendar independently of company holidays', async () => {
    const original = await settings();
    await patch('/settings', { ...editable(original), holidays: ['2026-10-05'] }).expect(200);
    const company = (await get(`/companies/${SEED_IDS.company}`).expect(200)).body as CompanyResponse;
    await patch(`/companies/${company.id}`, { version: company.version, holidays: ['2026-10-07'] }).expect(200);
    const preview = await get(`/settings/cutoff?deliveryDate=2026-10-07&companyId=${company.id}`).expect(200);
    expect(preview.body).toEqual({ deliveryDate: '2026-10-07', cutoffAt: '2026-10-02T10:30:00.000Z', companyDeliveryAllowed: false, settingsVersion: 2 });
    await patch('/settings', { ...editable(original), cutoffWorkingDays: 0 }).expect(409);
    await patch('/settings', { ...editable(await settings()), cutoffWorkingDays: 0 }).expect(200);
    expect((await get('/settings/cutoff?deliveryDate=2026-10-07').expect(200)).body.cutoffAt).toBe('2026-10-07T10:30:00.000Z');
    await patch('/settings', { ...editable(await settings()), holidays: ['2026-02-30'] }).expect(400);
    await patch('/settings', { ...editable(await settings()), cutoffWorkingDays: 31 }).expect(400);
    await patch('/settings', { ...editable(await settings()), timezone: 'UTC' }).expect(400);
  });

  it('accepts only one concurrent settings/company write with the same version', async () => {
    const original = await settings();
    const responses = await Promise.all([patch('/settings', { ...editable(original), cutoffTime: '15:00' }), patch('/settings', { ...editable(original), cutoffTime: '14:00' })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await settings()).version).toBe(2);
    const responsesCompany = await Promise.all([patch(`/companies/${SEED_IDS.company}`, { version: 1, name: 'First update' }), patch(`/companies/${SEED_IDS.company}`, { version: 1, name: 'Second update' })]);
    expect(responsesCompany.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await get(`/companies/${SEED_IDS.company}`).expect(200)).body.version).toBe(2);
  });

  it('rejects absent calendars at the database boundary as well as over HTTP', async () => {
    await expect(prisma.$executeRaw`UPDATE "KitchenSettings" SET "workingDays" = NULL WHERE "id" = 1`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "Company" SET "holidays" = NULL WHERE "id" = ${SEED_IDS.company}::uuid`).rejects.toThrow();
    expect((await settings()).workingDays).toEqual([1, 2, 3, 4, 5]);
    expect((await get(`/companies/${SEED_IDS.company}`).expect(200)).body.holidays).toEqual([]);
  });
});
