import { expect, test, type Page } from '@playwright/test';

const accounts = [
  { role: 'Admin', email: 'admin@test.com', path: '/dashboard', title: 'Operations overview' },
  { role: 'Kitchen', email: 'kitchen@test.com', path: '/kitchen', title: 'Kitchen workspace' },
  { role: 'Dispatch', email: 'dispatch@test.com', path: '/dispatch', title: 'Dispatch workspace' },
  { role: 'Driver', email: 'driver@test.com', path: '/today', title: 'Your delivery day' },
];

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

for (const account of accounts) {
  test(`${account.role} signs in, retains its session after refresh, and signs out`, async ({ page }) => {
    await login(page, account.email);
    await expect(page).toHaveURL(new RegExp(`${account.path}$`));
    await expect(page.getByRole('heading', { name: account.title, exact: true })).toBeVisible();
    await expect(page.getByText('Kitchen service connected', { exact: true })).toBeVisible();
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: account.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const revoked = await page.request.get('/api/v1/auth/me');
    expect(revoked.status()).toBe(401);
    await page.goto(account.path);
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('invalid credentials show an actionable error without opening a workspace', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@test.com');
  await page.getByLabel('Password', { exact: true }).fill('Wrong@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Sign in', exact: true }).getByRole('alert')).toContainText(/email|password|credentials/i);
  await expect(page).toHaveURL(/\/login$/);
});

test('Admin can read settings and prove protected access with its CSRF token', async ({ page, baseURL }) => {
  await login(page, 'admin@test.com');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Asia/Kolkata', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('USD', { exact: true })).toBeVisible();
  const me = await page.request.get('/api/v1/auth/me');
  const session = await me.json() as { csrfToken: string };
  const proof = await page.request.post('/api/v1/settings/check-access', {
    headers: { origin: new URL(baseURL!).origin, 'x-csrf-token': session.csrfToken },
  });
  expect(proof.status()).toBeGreaterThanOrEqual(200);
  expect(proof.status()).toBeLessThan(300);
});

for (const account of accounts.filter((item) => item.role !== 'Admin')) {
  test(`${account.role} cannot read or mutate Admin settings, including direct HTTP requests`, async ({ page, baseURL }) => {
    await login(page, account.email);
    await expect(page).toHaveURL(new RegExp(`${account.path}$`));
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
    const me = await page.request.get('/api/v1/auth/me');
    const session = await me.json() as { csrfToken: string };
    const read = await page.request.get('/api/v1/settings');
    expect(read.status()).toBe(403);
    const write = await page.request.post('/api/v1/settings/check-access', {
      headers: { origin: new URL(baseURL!).origin, 'x-csrf-token': session.csrfToken },
    });
    expect(write.status()).toBe(403);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
    await expect(page.getByText('Kitchen defaults', { exact: true })).toHaveCount(0);
  });
}

test('Driver workspace and sign-out remain usable at phone width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'driver@test.com');
  await expect(page.getByRole('heading', { name: 'Your delivery day', exact: true })).toBeVisible();
  await expect(page.getByText(/Only your own kitchen-today stops appear/)).toBeVisible();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.screen);
  const screenshotPath = testInfo.outputPath('driver-phone.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('driver-phone', { path: screenshotPath, contentType: 'image/png' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
