import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogueDish, CatalogueMenuItem, CompanyResponse, DeliveryDropResponse, InvoiceDetail, MenuCategory, OperationalOrderResponse, OrderDetail, OrderQuoteResponse, PriceTierRecord, ReferenceValueResponse, SessionResponse, StaffPage } from '@fernleaf/contracts';

test.use({ timezoneId: 'America/Los_Angeles' });
test.setTimeout(90_000);

async function login(page: Page, role = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.com`);
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${({ admin: 'dashboard', kitchen: 'kitchen', dispatch: 'dispatch', driver: 'today' } as Record<string, string>)[role]}$`));
}
async function headers(page: Page) {
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(200);
  return { Origin: new URL(page.url()).origin, 'x-csrf-token': (await me.json() as SessionResponse).csrfToken };
}
async function write<T>(page: Page, path: string, data: object, method = 'POST', status = method === 'POST' ? 201 : 200): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: await headers(page) });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(status);
  return await response.json() as T;
}
async function readInvoice(page: Page, id: string): Promise<InvoiceDetail> {
  const response = await page.request.get(`/api/v1/billing/invoices/${id}`);
  expect(response.status()).toBe(200);
  return await response.json() as InvoiceDetail;
}

// Dedicated append-only scenario; no global settings or existing records change.
async function billingFixture(page: Page) {
  const key = randomUUID(), name = `Billing browser ${key.slice(0, 8)}`, domain = `billing-${key}.example`;
  const station = await write<ReferenceValueResponse>(page, '/reference-data', { kind: 'KITCHEN_STATION', name: `${name} station` });
  const tier = await write<PriceTierRecord>(page, '/price-tiers', { name: `${name} tier`, rule: 'MANUAL', numerator: 1, denominator: 1 });
  const dish = await write<CatalogueDish>(page, '/dishes', { sku: `BILL-${key}`, name: `${name} meal`, description: 'Synthetic billing verification.', temperature: 'HOT', costMinor: 100, stationId: station.id, minQuantity: 1 });
  await write(page, `/price-tiers/${tier.id}/matrix`, { entries: [{ kind: 'DISH', itemId: dish.id, amountMinor: 211 }] }, 'PATCH');
  const category = await write<MenuCategory>(page, '/categories', { name: `${name} menu`, secret: false, sortOrder: 0 });
  const item = await write<CatalogueMenuItem>(page, '/menu-items', { categoryId: category.id, dishId: dish.id, sortOrder: 0 });
  const company = await write<CompanyResponse>(page, '/companies', {
    name, billingName: name, billingEmail: `billing@${domain}`, billingAddress: '21 Synthetic Billing Road', billingContactName: 'Synthetic Accounts', domains: [domain],
    owner: { name: `${name} owner`, email: `owner@${domain}` }, priceTierId: tier.id,
    address: { label: 'Office', line1: '21 Synthetic Billing Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' },
    deliveryTime: '12:30', deliveryMinutes: 60, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [],
  });
  const date = new Date(); date.setUTCDate(date.getUTCDate() - 7);
  const reason = 'Synthetic billing browser: accepted past-cutoff purchase.';
  const orders: OrderDetail[] = [];
  for (const quantity of [1, 2]) {
    const input = { employeeId: company.ownerEmployeeId!, deliveryDate: date.toISOString().slice(0, 10), deliveryTime: quantity === 1 ? '12:30' : '13:00', lines: [{ menuItemId: item.id, quantity, combinations: [{ quantity, selections: [] }] }] };
    const quote = await write<OrderQuoteResponse>(page, '/orders/quote', { ...input, overrideReason: reason });
    const order = await write<OrderDetail>(page, '/orders/override-create', { ...input, reason, acceptedQuote: quote.fingerprint, actionId: randomUUID() });
    expect(order.status).toBe('CONFIRMED'); expect(order.totalMinor).toBe(quantity * 211); orders.push(order);
  }
  // Shortage credits require actual delivery. Progress the first isolated drop
  // through real Admin operations; the second stays Confirmed for cancellation.
  const kitchenResponse = await page.request.get(`/api/v1/kitchen/orders/${orders[0].id}`);
  expect(kitchenResponse.status()).toBe(200);
  const kitchen = await kitchenResponse.json() as OperationalOrderResponse;
  await write(page, `/kitchen/orders/${kitchen.id}/force-complete`, { version: kitchen.version, actionId: randomUUID(), reason: 'Synthetic billing delivery preparation.' }, 'POST', 200);
  const staffResponse = await page.request.get('/api/v1/staff?pageSize=100');
  expect(staffResponse.status()).toBe(200);
  const driver = (await staffResponse.json() as StaffPage).items.find(user => user.email === 'driver@test.com')!;
  expect(driver.role).toBe('DRIVER');
  const dropResponse = await page.request.get(`/api/v1/drops/${orders[0].dropId}`);
  expect(dropResponse.status()).toBe(200);
  let drop = await dropResponse.json() as DeliveryDropResponse;
  drop = await write<DeliveryDropResponse>(page, `/drops/${drop.id}/assign`, { version: drop.version, driverId: driver.id, actionId: randomUUID() }, 'POST', 200);
  for (const action of ['dispatch-ready', 'depart', 'deliver']) {
    drop = await write<DeliveryDropResponse>(page, `/drops/${drop.id}/${action}`, { version: drop.version, actionId: randomUUID() }, 'POST', 200);
  }
  expect(drop.status).toBe('DELIVERED');
  return { company, orders };
}

test('Admin invoices original purchases, settles exact balance, records post-payment credit and preserves cancellation membership', async ({ page }) => {
  await login(page); const fixture = await billingFixture(page);
  await page.getByRole('link', { name: 'Billing', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create invoice', exact: true }).click();
  await page.getByRole('combobox', { name: 'Company', exact: true }).selectOption(fixture.company.id);
  await expect(page.getByRole('button', { name: 'Create invoice for $6.33', exact: true })).toBeEnabled();
  const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/billing/invoices') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create invoice for $6.33', exact: true }).click();
  const created = await createdResponse; expect(created.status()).toBe(201);
  const invoice = await created.json() as InvoiceDetail;
  expect(invoice.totalMinor).toBe(633); expect(invoice.orders.map(order => order.id).sort()).toEqual(fixture.orders.map(order => order.id).sort());
  expect(invoice.orders.reduce((sum, order) => sum + order.totalMinor, 0)).toBe(invoice.totalMinor);
  await page.getByText(`INV-${invoice.number}`, { exact: true }).click();
  await expect(page.getByRole('heading', { name: `Invoice INV-${invoice.number}`, exact: true })).toBeVisible();
  const paidResponse = page.waitForResponse(response => response.url().endsWith(`/api/v1/billing/invoices/${invoice.id}/pay`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Mark paid', exact: true }).click();
  expect((await paidResponse).status()).toBe(201);
  await expect(page.getByRole('button', { name: 'Mark paid', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Credit order', exact: true }).selectOption(fixture.orders[0].id);
  await page.getByRole('spinbutton', { name: 'Credit amount ($)', exact: true }).fill('1.11');
  await page.getByRole('textbox', { name: 'Credit reason', exact: true }).fill('Synthetic shortage after company settlement.');
  const creditResponse = page.waitForResponse(response => response.url().endsWith(`/api/v1/billing/invoices/${invoice.id}/credit`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add credit', exact: true }).click();
  expect((await creditResponse).status()).toBe(201);
  const credited = await readInvoice(page, invoice.id);
  expect(credited).toMatchObject({ totalMinor: 633, paidAmountMinor: 633, creditTotalMinor: 111, netDueMinor: -111 });
  const orderResponse = await page.request.get(`/api/v1/orders/${fixture.orders[1].id}`);
  expect(orderResponse.status()).toBe(200);
  const order = await orderResponse.json() as OrderDetail;
  const cancelled = await write<OrderDetail>(page, `/orders/${order.id}/override`, { version: order.version, actionId: randomUUID(), action: 'CANCEL', reason: 'Synthetic invoiced cancellation.' });
  expect(cancelled.status).toBe('CANCELLED');
  const final = await readInvoice(page, invoice.id);
  expect(final).toMatchObject({ totalMinor: 633, paidAmountMinor: 633, creditTotalMinor: 533, netDueMinor: -533 });
  expect(final.orders.find(value => value.id === order.id)?.status).toBe('CANCELLED');
  expect(final.orders.reduce((sum, value) => sum + value.totalMinor, 0)).toBe(633);
  const excess = await page.request.post(`/api/v1/billing/invoices/${invoice.id}/credit`, { headers: await headers(page), data: { orderId: fixture.orders[0].id, amountMinor: 101, reason: 'Must exceed the original delivered purchase.', actionId: randomUUID() } });
  expect(excess.status()).toBe(400);
});

for (const role of ['kitchen', 'dispatch', 'driver']) {
  test(`${role} cannot read or mutate billing/staff through direct HTTP or open restricted pages`, async ({ page }) => {
    await login(page, role);
    const authorization = await headers(page);
    for (const path of ['/billing/invoices', '/staff']) {
      expect((await page.request.get(`/api/v1${path}`)).status()).toBe(403);
      expect((await page.request.post(`/api/v1${path}`, { headers: authorization, data: {} })).status()).toBe(403);
    }
    for (const path of ['/billing', '/staff']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Access restricted', exact: true })).toBeVisible();
    }
  });
}
