import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { ROLE_PERMISSIONS, type Role, type SessionResponse } from '@fernleaf/contracts';
import { createApplication } from '../../apps/api/src/bootstrap';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { seedUsers } from '../../apps/api/prisma/seed-users';
import { hashPassword } from '../../apps/api/src/modules/auth/password';
import { hashSessionToken } from '../../apps/api/src/modules/auth/session-token';
import { resetPhase1Fixture } from './fixtures';

loadEnvironment({ path: resolve(__dirname, '../../apps/api/.env'), quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Integration tests require a separate TEST_DATABASE_URL whose database name ends in _test. Apply migrations to it first.');
}

const WEB_ORIGIN = 'http://localhost:3000';
const DEMO_ROLES: Role[] = ['ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER'];
type Login = { cookie: string; token: string; session: SessionResponse };

describe('Phase 0 authentication and access using real PostgreSQL', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }) });
    await prisma.$connect();
    app = await createApplication({ databaseUrl: databaseUrl!, webOrigin: WEB_ORIGIN, production: false, port: 3001, sessionTtlHours: 12 });
    await app.init();
  });

  beforeEach(async () => {
    // The explicit _test database guard above keeps this isolated from review data.
    await resetPhase1Fixture(prisma);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  async function login(email = 'admin@test.com'): Promise<Login> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login')
      .set('Origin', WEB_ORIGIN).send({ email, password: 'Test@1234' }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies[0].split(';')[0];
    return { cookie, token: cookie.split('=')[1], session: response.body as SessionResponse };
  }

  it('health makes a PostgreSQL query and has no public caching', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', database: 'connected', service: 'fernleaf-api' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(DEMO_ROLES)('signs in %s with its isolated current permissions', async (role) => {
    const signedIn = await login(`${role.toLowerCase()}@test.com`);
    expect(signedIn.session.user.role).toBe(role);
    expect(signedIn.session.permissions).toEqual(ROLE_PERMISSIONS[role]);
    expect(signedIn.session.csrfToken).toHaveLength(43);
    expect(Date.parse(signedIn.session.expiresAt)).toBeGreaterThan(Date.now());
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(200);
    expect(response.body).toEqual(signedIn.session);
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('normalizes staff email and stores only a hash of the opaque session token', async () => {
    const signedIn = await login('  ADMIN@Test.Com  ');
    const user = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    expect(user.passwordHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(user.passwordHash).not.toContain('Test@1234');
    const session = await prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(signedIn.token) } });
    expect(session.tokenHash).toHaveLength(64);
    expect(session.tokenHash).not.toBe(signedIn.token);
  });

  it('rejects wrong credentials and missing accounts with the same error', async () => {
    for (const email of ['admin@test.com', 'absent@test.com']) {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN)
        .send({ email, password: 'Wrong@1234' }).expect(401);
      expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
    }
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects malformed and unexpected login fields with actionable errors', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN)
      .send({ email: 'invalid', password: 'x', role: 'ADMIN' }).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.fieldErrors).toHaveProperty('email');
    expect(response.body.fieldErrors).toHaveProperty('password');
    expect(response.body.fieldErrors).toHaveProperty('role');
  });

  it('requires the configured origin even for public login', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'Test@1234' }).expect(403);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', 'https://untrusted.example')
      .send({ email: 'admin@test.com', password: 'Test@1234' }).expect(403);
    expect(response.body.code).toBe('ORIGIN_FORBIDDEN');
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects anonymous reads and direct mutation attempts', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/settings').expect(401);
    const response = await request(app.getHttpServer()).post('/api/v1/settings/check-access').set('Origin', WEB_ORIGIN).expect(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it.each(['kitchen', 'dispatch', 'driver'])('rejects direct %s settings reads and mutations', async (role) => {
    const signedIn = await login(`${role}@test.com`);
    await request(app.getHttpServer()).get('/api/v1/settings').set('Cookie', signedIn.cookie).expect(403);
    const response = await request(app.getHttpServer()).post('/api/v1/settings/check-access')
      .set('Cookie', signedIn.cookie).set('Origin', WEB_ORIGIN).set('x-csrf-token', signedIn.session.csrfToken).expect(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('allows admin settings access only with valid origin and session-bound CSRF', async () => {
    const signedIn = await login();
    const settings = await request(app.getHttpServer()).get('/api/v1/settings').set('Cookie', signedIn.cookie).expect(200);
    expect(settings.body).toMatchObject({ timezone: 'Asia/Kolkata', currency: 'USD', phase: 3, cutoffWorkingDays: 2, cutoffTime: '16:00', version: 1 });
    const missingCsrf = await request(app.getHttpServer()).post('/api/v1/settings/check-access')
      .set('Cookie', signedIn.cookie).set('Origin', WEB_ORIGIN).expect(403);
    expect(missingCsrf.body.code).toBe('CSRF_INVALID');
    await request(app.getHttpServer()).post('/api/v1/settings/check-access').set('Cookie', signedIn.cookie)
      .set('Origin', 'https://untrusted.example').set('x-csrf-token', signedIn.session.csrfToken).expect(403);
    const other = await login();
    await request(app.getHttpServer()).post('/api/v1/settings/check-access').set('Cookie', signedIn.cookie)
      .set('Origin', WEB_ORIGIN).set('x-csrf-token', other.session.csrfToken).expect(403);
    const response = await request(app.getHttpServer()).post('/api/v1/settings/check-access').set('Cookie', signedIn.cookie)
      .set('Origin', WEB_ORIGIN).set('x-csrf-token', signedIn.session.csrfToken).expect(200);
    expect(response.body).toEqual({ allowed: true });
  });

  it('deletes sessions on logout and rejects reuse of a copied cookie', async () => {
    const signedIn = await login();
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', signedIn.cookie).set('Origin', WEB_ORIGIN).expect(403);
    expect(await prisma.session.count()).toBe(1);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', signedIn.cookie)
      .set('Origin', WEB_ORIGIN).set('x-csrf-token', signedIn.session.csrfToken).expect(204);
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(await prisma.session.count()).toBe(0);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(401);
  });

  it('expires persisted sessions using server time', async () => {
    const signedIn = await login();
    await prisma.session.update({ where: { tokenHash: hashSessionToken(signedIn.token) }, data: {
      createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000),
    } });
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(401);
    expect(response.body.code).toBe('SESSION_EXPIRED');
    expect(await prisma.session.count()).toBe(0);
  });

  it('checks the current database role and activation on every request', async () => {
    const signedIn = await login();
    await prisma.staffUser.update({ where: { email: 'admin@test.com' }, data: { role: 'KITCHEN' } });
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(200);
    expect(response.body.user.role).toBe('KITCHEN');
    expect(response.body.permissions).toEqual(ROLE_PERMISSIONS.KITCHEN);
    await request(app.getHttpServer()).get('/api/v1/settings').set('Cookie', signedIn.cookie).expect(403);
    await prisma.staffUser.update({ where: { email: 'admin@test.com' }, data: { active: false } });
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', WEB_ORIGIN)
      .send({ email: 'admin@test.com', password: 'Test@1234' }).expect(401);
  });

  it('rotates and invalidates the previous browser session when signing in again', async () => {
    const previous = await login();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Cookie', previous.cookie)
      .set('Origin', WEB_ORIGIN).send({ email: 'admin@test.com', password: 'Test@1234' }).expect(200);
    expect(response.headers['set-cookie'][0]).not.toContain(previous.token);
    expect(await prisma.session.count()).toBe(1);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', previous.cookie).expect(401);
  });

  it('seeding is idempotent and preserves edited accounts', async () => {
    const existing = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'admin@test.com' } });
    const passwordHash = await hashPassword('Changed@1234');
    await prisma.staffUser.update({ where: { id: existing.id }, data: { displayName: 'Reviewer change', passwordHash, active: false, role: 'DRIVER' } });
    await seedUsers(prisma);
    const preserved = await prisma.staffUser.findUniqueOrThrow({ where: { id: existing.id } });
    expect(preserved).toMatchObject({ displayName: 'Reviewer change', passwordHash, active: false, role: 'DRIVER' });
    expect(await prisma.staffUser.count()).toBe(4);
  });

  it('issues Secure, HttpOnly, SameSite cookies with host scope in production mode', async () => {
    const productionApp = await createApplication({ databaseUrl: databaseUrl!, webOrigin: 'https://fernleaf.example', production: true, port: 3001, sessionTtlHours: 12 });
    try {
      await productionApp.init();
      const response = await request(productionApp.getHttpServer()).post('/api/v1/auth/login').set('Origin', 'https://fernleaf.example')
        .send({ email: 'admin@test.com', password: 'Test@1234' }).expect(200);
      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toMatch(/^__Host-fernleaf_session=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    } finally {
      await productionApp.close();
    }
  });
});
