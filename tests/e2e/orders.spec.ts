import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogueDish, CatalogueOption, CatalogueMenuItem, CompanyResponse, CutoffPreviewResponse, EmployeeResponse, MenuCategory, OrderDetail, PriceTierRecord, ReferenceValueResponse, SessionResponse } from '@fernleaf/contracts';

test.use({ timezoneId: 'America/Los_Angeles' });
test.setTimeout(60_000);

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@test.com');
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function identity(page: Page) {
  const response = await page.request.get('/api/v1/auth/me');
  expect(response.status()).toBe(200);
  const session = await response.json() as SessionResponse;
  return { Origin: new URL(page.url()).origin, 'x-csrf-token': session.csrfToken };
}
async function mutation<T>(page: Page, path: string, data: object, method: 'POST' | 'PATCH' | 'PUT' = 'POST', status = method === 'POST' ? 201 : 200): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: await identity(page) });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(status);
  return await response.json() as T;
}
async function readOrder(page: Page, id: string): Promise<OrderDetail> {
  const response = await page.request.get(`/api/v1/orders/${id}`);
  expect(response.status()).toBe(200);
  return await response.json() as OrderDetail;
}
function kitchenToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((name) => parts.find((part) => part.type === name)!.value).join('-');
}
function dateAfter(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
async function dates(page: Page) {
  const today = kitchenToday();
  // Ask the authoritative service rather than assuming the reviewer has kept
  // the default calendar, working-day count or cutoff time unchanged.
  for (let offset = 3; offset <= 12288; offset *= 2) {
    const future = dateAfter(today, offset);
    const response = await page.request.get(`/api/v1/settings/cutoff?deliveryDate=${future}`);
    expect(response.status()).toBe(200);
    const preview = await response.json() as CutoffPreviewResponse;
    if (Date.parse(preview.cutoffAt) > Date.now() + 60 * 60 * 1000) return { future, past: dateAfter(today, -3), cutoffAt: preview.cutoffAt };
  }
  throw new Error('Could not find a future kitchen cutoff for the synthetic browser fixture.');
}

async function fixture(page: Page) {
  const key = randomUUID(), name = `Order browser ${Date.now()} ${key.slice(0, 8)}`;
  const domain = `orders-${key}.example`;
  const station = await mutation<ReferenceValueResponse>(page, '/reference-data', { kind: 'KITCHEN_STATION', name: `${name} station` });
  const tier = await mutation<PriceTierRecord>(page, '/price-tiers', { name: `${name} tier`, rule: 'MANUAL', numerator: 1, denominator: 1 });
  const dish = await mutation<CatalogueDish>(page, '/dishes', { sku: `ORDER-${key}`, name: `${name} lunch`, description: 'Dedicated synthetic order browser fixture.', temperature: 'HOT', costMinor: 211, stationId: station.id, minQuantity: 1 });
  const brown = await mutation<CatalogueOption>(page, '/options', { name: `${name} brown rice`, costMinor: 50 });
  const jeera = await mutation<CatalogueOption>(page, '/options', { name: `${name} jeera rice`, costMinor: 90 });
  const grouped = await mutation<CatalogueDish>(page, `/dishes/${dish.id}/groups`, { groups: [{ name: 'Grain', required: true, sortOrder: 0, optionIds: [brown.id, jeera.id] }] }, 'PUT');
  await mutation(page, `/price-tiers/${tier.id}/matrix`, { entries: [
    { kind: 'DISH', itemId: dish.id, amountMinor: 800 }, { kind: 'OPTION', itemId: brown.id, amountMinor: 80 }, { kind: 'OPTION', itemId: jeera.id, amountMinor: 120 },
  ] }, 'PATCH');
  const category = await mutation<MenuCategory>(page, '/categories', { name: `${name} menu`, secret: false, sortOrder: 0 });
  const item = await mutation<CatalogueMenuItem>(page, '/menu-items', { categoryId: category.id, dishId: dish.id, sortOrder: 0 });
  const company = await mutation<CompanyResponse>(page, '/companies', { name: `${name} company`, billingName: `${name} billing`, billingEmail: `billing@${domain}`, billingAddress: '42 Browser Order Road, Bengaluru', billingContactName: 'Order browser accounts',
    domains: [domain], owner: { name: `${name} owner`, email: `owner@${domain}` }, priceTierId: tier.id,
    address: { label: 'Browser order office', line1: '42 Browser Order Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' },
    deliveryTime: '12:30', deliveryMinutes: 60, packagingId: null, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] });
  const employee = await mutation<EmployeeResponse>(page, '/employees', { companyId: company.id, name: `${name} employee`, email: `employee@${domain}`, canChooseAddress: true, canChangeTime: true, canChangePackaging: true });
  return { company, employee, tier, dish, brown, jeera, item, groupId: grouped.groups[0].id, ...(await dates(page)) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fillNewOrder(page: Page, data: Fixture, deliveryDate = data.future) {
  await page.goto('/orders/new');
  await page.getByLabel('Employee', { exact: true }).selectOption(data.employee.id);
  await page.getByLabel('Delivery date', { exact: true }).fill(deliveryDate);
  await page.getByLabel('Choose a dish', { exact: true }).selectOption(data.item.id);
  await page.getByRole('button', { name: 'Add dish', exact: true }).click();
  await page.getByLabel('Grain for combination 1', { exact: true }).selectOption(data.brown.id);
}
async function reviewAndAccept(page: Page) {
  const response = page.waitForResponse((value) => value.url().endsWith('/api/v1/orders/quote') && value.request().method() === 'POST');
  await page.getByRole('button', { name: 'Review server quote', exact: true }).click();
  expect((await response).status()).toBe(201);
  await page.getByLabel('I accept this server quote', { exact: true }).check();
}
async function createFromButton(page: Page, button = 'Place order', endpoint = '/api/v1/orders'): Promise<OrderDetail> {
  const response = page.waitForResponse((value) => value.url().endsWith(endpoint) && value.request().method() === 'POST');
  await page.getByRole('button', { name: button, exact: true }).click();
  const value = await response; expect(value.status()).toBe(201);
  const order = await value.json() as OrderDetail;
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  return order;
}

test('Admin edits a split-combination draft, accepts 89.60 USD and retains its purchase after catalogue changes', async ({ page }, testInfo) => {
  await login(page); const data = await fixture(page);
  await fillNewOrder(page, data);
  await page.getByLabel('Line 1 quantity', { exact: true }).fill('10');
  await page.getByLabel('Combination 1 quantity', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Add combination', exact: true }).click();
  await page.getByLabel('Combination 2 quantity', { exact: true }).fill('3');
  await page.getByLabel('Grain for combination 2', { exact: true }).selectOption(data.jeera.id);
  const draft = await createFromButton(page, 'Save draft');
  expect(draft).toMatchObject({ status: 'DRAFT', quantity: 10, totalMinor: 8920, purchase: null });
  await page.getByRole('link', { name: 'Edit / place draft', exact: true }).click();
  await expect(page.getByLabel('Line 1 quantity', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Combination 1 quantity', { exact: true })).toHaveValue('7');
  await page.getByLabel('Combination 1 quantity', { exact: true }).fill('6');
  await page.getByLabel('Combination 2 quantity', { exact: true }).fill('4');
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeDisabled();
  await reviewAndAccept(page);
  await expect(page.getByText('$89.60', { exact: true }).first()).toBeVisible();
  const placed = await createFromButton(page, 'Place order', `/api/v1/orders/${draft.id}/place`);
  expect(placed).toMatchObject({ status: 'PLACED', quantity: 10, totalMinor: 8960 });
  expect(placed.purchase?.lines[0].combinations.map((combination) => combination.quantity).sort((a, b) => a - b)).toEqual([4, 6]);
  const recorded = page.getByRole('heading', { name: 'Recorded purchase', exact: true }).locator('..');
  await expect(recorded.getByRole('heading', { name: data.dish.name, exact: true })).toBeVisible();
  await expect(recorded).toContainText(data.brown.name); await expect(recorded).toContainText(data.jeera.name);
  await mutation(page, `/dishes/${data.dish.id}`, { name: `${data.dish.name} future`, sku: `${data.dish.sku}-FUTURE`, costMinor: 999 }, 'PATCH');
  await mutation(page, `/options/${data.brown.id}`, { name: `${data.brown.name} future` }, 'PATCH');
  await mutation(page, `/price-tiers/${data.tier.id}/matrix`, { entries: [{ kind: 'DISH', itemId: data.dish.id, amountMinor: 1200 }] }, 'PATCH');
  await page.reload();
  expect((await readOrder(page, placed.id)).purchase).toEqual(placed.purchase);
  await expect(recorded.getByRole('heading', { name: data.dish.name, exact: true })).toBeVisible();
  await expect(recorded).toContainText('$89.60'); await expect(recorded).not.toContainText(`${data.dish.name} future`);
  const timeline = page.getByRole('heading', { name: 'Progress timeline', exact: true }).locator('..');
  await expect(timeline.getByRole('heading', { level: 3 })).toHaveText(['Draft created', 'Draft updated', 'Order placed']);
  const screenshot = testInfo.outputPath('split-order-snapshot.png'); await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('split-order-snapshot', { path: screenshot, contentType: 'image/png' });
});

test('A changed server price replaces the reviewed quote and requires fresh acceptance before placement', async ({ page }) => {
  await login(page); const data = await fixture(page);
  await fillNewOrder(page, data); await reviewAndAccept(page);
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeEnabled();
  await mutation(page, `/price-tiers/${data.tier.id}/matrix`, { entries: [{ kind: 'DISH', itemId: data.dish.id, amountMinor: 901 }] }, 'PATCH');
  const response = page.waitForResponse((value) => value.url().endsWith('/api/v1/orders') && value.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  const refused = await response; expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe('QUOTE_CHANGED');
  await expect(page.getByRole('alert').filter({ hasText: 'Review and accept the current server quote before saving.' })).toBeVisible();
  await expect(page.getByLabel('I accept this server quote', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Place order', exact: true })).toBeDisabled();
  await expect(page.getByText('$9.81', { exact: true }).first()).toBeVisible();
  await page.getByLabel('I accept this server quote', { exact: true }).check();
  const placed = await createFromButton(page);
  expect(placed).toMatchObject({ status: 'PLACED', quantity: 1, totalMinor: 981 }); expect(placed.revisions).toHaveLength(1);
  expect((await readOrder(page, placed.id)).totalMinor).toBe(981);
});

test('Explicit late Admin placement immediately confirms exactly once and records placement before cutoff confirmation', async ({ page }, testInfo) => {
  await login(page); const data = await fixture(page);
  await fillNewOrder(page, data, data.past);
  await page.getByLabel('Explicit Admin placement exception', { exact: true }).check();
  await page.getByLabel('Exception reason', { exact: true }).fill('Synthetic review of an explicitly accepted late order.');
  await reviewAndAccept(page);
  const confirmed = await createFromButton(page, 'Place with Admin exception', '/api/v1/orders/override-create');
  expect(confirmed).toMatchObject({ status: 'CONFIRMED', prepUnitCount: 1, quantity: 1, totalMinor: 880 }); expect(confirmed.dropId).toBeTruthy();
  expect(confirmed.events.map((event) => event.type)).toEqual(['ADMIN_OVERRIDE_PLACED', 'CONFIRMED']);
  const progress = page.getByRole('heading', { name: 'Order progress', exact: true }).locator('..');
  await expect(progress.getByText('Confirmed', { exact: true }).first()).toBeVisible();
  const timeline = page.getByRole('heading', { name: 'Progress timeline', exact: true }).locator('..');
  await expect(timeline.getByRole('heading', { level: 3 })).toHaveText(['Admin placement exception', 'Cutoff confirmation']);
  await expect(timeline).toContainText('Synthetic review of an explicitly accepted late order.');
  await expect(page.getByRole('link', { name: 'Edit placed purchase', exact: true })).toHaveCount(0);
  const rerun = await mutation<{ confirmed: number; failed: number }>(page, '/cutoffs/process', { deliveryDate: data.past }, 'POST', 200);
  expect(rerun.confirmed).toBe(0); expect(rerun.failed).toBe(0);
  const after = await readOrder(page, confirmed.id); expect(after.purchase).toEqual(confirmed.purchase); expect(after.events).toEqual(confirmed.events); expect(after.prepUnitCount).toBe(1);
  const screenshot = testInfo.outputPath('late-confirmed-order.png'); await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('late-confirmed-order', { path: screenshot, contentType: 'image/png' });
});

test('After employee transfer the purchase editor is unavailable while an explicit delivery correction keeps original billing', async ({ page }) => {
  await login(page); const data = await fixture(page);
  const packaging = await mutation<ReferenceValueResponse>(page, '/reference-data', { kind: 'PACKAGING_TYPE', name: `${data.dish.name} packaging` });
  const companyResponse = await page.request.get(`/api/v1/companies/${data.company.id}`); expect(companyResponse.status()).toBe(200);
  const currentCompany = await companyResponse.json() as CompanyResponse;
  data.company = await mutation<CompanyResponse>(page, `/companies/${data.company.id}`, { version: currentCompany.version, packagingId: packaging.id }, 'PATCH');
  await fillNewOrder(page, data); await reviewAndAccept(page); const placed = await createFromButton(page);
  expect(placed.delivery.packaging).toEqual({ id: packaging.id, name: packaging.name });
  const key = randomUUID(), domain = `target-${key}.example`;
  const target = await mutation<CompanyResponse>(page, '/companies', { name: `Order transfer target ${key.slice(0, 8)}`, billingName: 'Browser target billing', billingEmail: `billing@${domain}`, billingAddress: '11 Target Office', billingContactName: 'Target accounts', domains: [domain], owner: { name: 'Browser target owner', email: `owner@${domain}` },
    address: { label: 'Target office', line1: '11 Target Office', city: 'Bengaluru', region: 'Karnataka', postalCode: '560002', country: 'India' }, deliveryTime: '13:00', deliveryMinutes: 45, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] });
  await mutation(page, `/employees/${data.employee.id}/transfer`, { companyId: target.id });
  await page.reload();
  await expect(page.getByText(/The employee has moved to another company/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit placed purchase', exact: true })).toHaveCount(0);
  const refused = await page.request.post('/api/v1/orders/quote', { data: { ...placed.input, orderId: placed.id }, headers: await identity(page) });
  expect(refused.status()).toBe(409); expect((await refused.json()).code).toBe('EMPLOYEE_TRANSFERRED');
  await page.getByRole('button', { name: 'Override delivery', exact: true }).click();
  const form = page.getByRole('form', { name: 'Admin delivery exception', exact: true });
  await expect(form.getByLabel('Recorded-company delivery address', { exact: true })).toHaveValue(data.company.defaultAddressId!);
  await expect(form.getByLabel('Packaging', { exact: true })).toHaveValue(packaging.id);
  await form.getByLabel('Delivery time (IST)', { exact: true }).fill('14:00');
  await form.getByLabel('Reason', { exact: true }).fill('Delivery correction retains the purchased company after transfer.');
  const response = page.waitForResponse((value) => value.url().endsWith(`/api/v1/orders/${placed.id}/override`) && value.request().method() === 'POST');
  await form.getByRole('button', { name: 'Admin delivery exception', exact: true }).click();
  expect((await response).status()).toBe(201); await expect(form).toHaveCount(0);
  const changed = await readOrder(page, placed.id);
  expect(changed.companyId).toBe(data.company.id); expect(changed.company).toEqual(placed.company); expect(changed.purchase).toEqual(placed.purchase);
  expect(changed.totalMinor).toBe(880); expect(changed.delivery.deliveryTime).toBe('14:00'); expect(changed.delivery.address.id).toBe(data.company.defaultAddressId);
  expect(changed.delivery.packaging).toEqual(placed.delivery.packaging);
  const current = page.getByRole('heading', { name: 'Current delivery', exact: true }).locator('..'); await expect(current).toContainText('14:00 IST');
  await expect(page.getByRole('heading', { name: 'Progress timeline', exact: true }).locator('..')).toContainText('Delivery correction retains the purchased company after transfer.');
});
