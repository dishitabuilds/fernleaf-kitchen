import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { CatalogueDish, CatalogueMenuItem, CatalogueOption, CompanyResponse, DeliveryDropPage, DeliveryDropResponse, EmployeeResponse, KitchenBoardResponse, MenuCategory, OperationalOrderResponse, OrderDetail, OrderQuoteResponse, PriceTierRecord, ReferenceValueResponse, SessionResponse } from '@fernleaf/contracts';

test.use({ timezoneId: 'America/Los_Angeles' });
test.setTimeout(120_000);

type BrowserRole = 'admin' | 'kitchen' | 'dispatch' | 'driver' | 'replacement-driver';
async function login(page: Page, role: BrowserRole = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.com`);
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${({ admin: 'dashboard', kitchen: 'kitchen', dispatch: 'dispatch', driver: 'today', 'replacement-driver': 'today' })[role]}$`));
}
async function headers(page: Page) {
  const response = await page.request.get('/api/v1/auth/me');
  expect(response.status()).toBe(200);
  const session = await response.json() as SessionResponse;
  return { Origin: new URL(page.url()).origin, 'x-csrf-token': session.csrfToken };
}
async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.status(), `GET ${path}: ${await response.text()}`).toBe(200);
  return await response.json() as T;
}
async function mutate<T>(page: Page, path: string, data: object, method = 'POST', status = method === 'POST' ? 201 : 200): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, { method, data, headers: await headers(page) });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(status);
  return await response.json() as T;
}
async function clickAction<T>(page: Page, name: string, path: string): Promise<T> {
  const response = page.waitForResponse((value) => value.url().endsWith(`/api/v1${path}`) && value.request().method() === 'POST');
  await page.getByRole('button', { name, exact: true }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return await result.json() as T;
}
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((part) => parts.find((value) => value.type === part)!.value).join('-');
}
async function rolePage(browser: Browser, baseURL: string, role: BrowserRole, mobile = false) {
  const context = await browser.newContext({ baseURL, timezoneId: 'America/Los_Angeles', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  const page = await context.newPage(); await login(page, role);
  return { context, page };
}

// Append a dedicated, labelled scenario through the real API. A passed-date
// Admin purchase is confirmed first, then an explicit logistics correction
// brings it to kitchen-today. No database reset, fake clock or global setting.
async function fixture(page: Page) {
  const key = randomUUID(), name = `Operations browser ${Date.now()} ${key.slice(0, 8)}`, domain = `operations-${key}.example`;
  const station = await mutate<ReferenceValueResponse>(page, '/reference-data', { kind: 'KITCHEN_STATION', name: `${name} station` });
  const tier = await mutate<PriceTierRecord>(page, '/price-tiers', { name: `${name} tier`, rule: 'MANUAL', numerator: 1, denominator: 1 });
  const dish = await mutate<CatalogueDish>(page, '/dishes', { sku: `OPS-${key}`, name: `${name} lunch`, description: 'Dedicated synthetic kitchen-to-delivery browser scenario.', temperature: 'HOT', costMinor: 211, stationId: station.id, minQuantity: 1 });
  const brown = await mutate<CatalogueOption>(page, '/options', { name: `${name} brown rice`, costMinor: 50 });
  const jeera = await mutate<CatalogueOption>(page, '/options', { name: `${name} jeera rice`, costMinor: 90 });
  const grouped = await mutate<CatalogueDish>(page, `/dishes/${dish.id}/groups`, { groups: [{ name: 'Grain', required: true, sortOrder: 0, optionIds: [brown.id, jeera.id] }] }, 'PUT');
  await mutate(page, `/price-tiers/${tier.id}/matrix`, { entries: [{ kind: 'DISH', itemId: dish.id, amountMinor: 800 }, { kind: 'OPTION', itemId: brown.id, amountMinor: 80 }, { kind: 'OPTION', itemId: jeera.id, amountMinor: 120 }] }, 'PATCH');
  const category = await mutate<MenuCategory>(page, '/categories', { name: `${name} menu`, secret: false, sortOrder: 0 });
  const item = await mutate<CatalogueMenuItem>(page, '/menu-items', { categoryId: category.id, dishId: dish.id, sortOrder: 0 });
  const company = await mutate<CompanyResponse>(page, '/companies', { name: `${name} company`, billingName: `${name} billing`, billingEmail: `billing@${domain}`, billingAddress: '51 Synthetic Operations Road', billingContactName: 'Synthetic accounts', domains: [domain], owner: { name: `${name} owner`, email: `owner@${domain}` }, priceTierId: tier.id, address: { label: 'Synthetic operations office', line1: '51 Synthetic Operations Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' }, deliveryTime: '23:50', deliveryMinutes: 60, defaultDriverId: null, workingDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] });
  const employee = await mutate<EmployeeResponse>(page, '/employees', { companyId: company.id, name: `${name} employee`, email: `employee@${domain}`, phone: '+919000000123', canChooseAddress: true, canChangeTime: true, canChangePackaging: true });
  const currentDate = today(), pastValue = new Date(`${currentDate}T00:00:00Z`); pastValue.setUTCDate(pastValue.getUTCDate() - 3);
  const past = pastValue.toISOString().slice(0, 10), reason = 'Synthetic browser scenario: explicit past-cutoff placement.';
  const orders: OrderDetail[] = [];
  for (const quantities of [[6, 4], [1]]) {
    const input = { employeeId: employee.id, deliveryDate: past, deliveryTime: '23:50', lines: [{ menuItemId: item.id, quantity: quantities.reduce((sum, value) => sum + value, 0), combinations: quantities.map((quantity, index) => ({ quantity, selections: [{ groupId: grouped.groups[0].id, optionId: index ? jeera.id : brown.id }] })) }] };
    const quote = await mutate<OrderQuoteResponse>(page, '/orders/quote', { ...input, overrideReason: reason });
    const confirmed = await mutate<OrderDetail>(page, '/orders/override-create', { ...input, reason, actionId: randomUUID(), acceptedQuote: quote.fingerprint });
    expect(confirmed.status).toBe('CONFIRMED');
    orders.push(await mutate<OrderDetail>(page, `/orders/${confirmed.id}/override`, { version: confirmed.version, actionId: randomUUID(), action: 'DELIVERY', reason: 'Synthetic browser scenario: keep reviewer work on the actual kitchen date.', deliveryDate: currentDate, deliveryTime: '23:50' }));
  }
  expect(orders[0].dropId).toBe(orders[1].dropId);
  const drop = await read<DeliveryDropResponse>(page, `/drops/${orders[0].dropId}`);
  expect(drop).toMatchObject({ status: 'AWAITING_KITCHEN', orderCount: 2, quantity: 11 });
  expect(drop.orders.flatMap((order) => order.prepUnits)).toHaveLength(3);
  expect(orders[0].totalMinor).toBe(8960);
  return { station, company, employee, orders, drop, currentDate };
}

test('Kitchen completes three combinations, Dispatch departs one grouped stop, and mobile Driver delivers both orders atomically', async ({ page, browser, baseURL }, testInfo) => {
  await login(page); const data = await fixture(page);
  const kitchen = await rolePage(browser, baseURL!, 'kitchen');
  const dispatch = await rolePage(browser, baseURL!, 'dispatch');
  const driver = await rolePage(browser, baseURL!, 'driver', true);
  try {
    const driverSession = await read<SessionResponse>(driver.page, '/auth/me');
    await dispatch.page.goto(`/dispatch/${data.drop.id}`);
    await expect(dispatch.page.getByRole('button', { name: 'Mark dispatch ready', exact: true })).toBeDisabled();
    const premature = await dispatch.page.request.post(`/api/v1/drops/${data.drop.id}/depart`, { headers: await headers(dispatch.page), data: { version: data.drop.version, actionId: randomUUID() } });
    expect(premature.status()).toBe(409);
    await kitchen.page.goto(`/kitchen?date=${data.currentDate}`);
    await kitchen.page.getByLabel('Kitchen station', { exact: true }).selectOption(data.station.id);
    await expect(kitchen.page.getByText('3 preparation units match these delivery-date, station and status filters.', { exact: true })).toBeVisible();
    const board = await read<KitchenBoardResponse>(kitchen.page, `/kitchen?date=${data.currentDate}&stationId=${data.station.id}`);
    expect(board.items.map((unit) => unit.quantity).sort((left, right) => left - right)).toEqual([1, 4, 6]);
    expect(JSON.stringify(board)).not.toMatch(/priceMinor|costMinor|billingEmail|totalMinor/);
    for (let index = 0; index < board.items.length; index++) {
      const unit = board.items[index];
      const card = kitchen.page.getByRole('article', { name: `Preparation unit ${unit.id}`, exact: true });
      if (index === 0) {
        const response = kitchen.page.waitForResponse((value) => value.url().endsWith(`/api/v1/prep-units/${unit.id}/start`) && value.request().method() === 'POST');
        await card.getByRole('button', { name: 'Start prep', exact: true }).click();
        const result = await response; expect(result.status()).toBe(200);
        const original = await result.json();
        const replay = await mutate(kitchen.page, `/prep-units/${unit.id}/start`, result.request().postDataJSON(), 'POST', 200);
        expect(replay).toEqual(original);
        await expect(card.locator('.status-pill')).toHaveText('Started');
      }
      const response = kitchen.page.waitForResponse((value) => value.url().endsWith(`/api/v1/prep-units/${unit.id}/complete`) && value.request().method() === 'POST');
      await card.getByRole('button', { name: 'Complete prep', exact: true }).click();
      expect((await response).status()).toBe(200); await expect(card.locator('.status-pill')).toHaveText('Done');
      if (index < board.items.length - 1) expect((await read<DeliveryDropResponse>(page, `/drops/${data.drop.id}`)).status).toBe('AWAITING_KITCHEN');
    }
    const ready = await read<DeliveryDropResponse>(page, `/drops/${data.drop.id}`);
    expect(ready.status).toBe('KITCHEN_READY'); expect(ready.orders.every((order) => order.kitchenStartedAt && order.kitchenReadyAt)).toBe(true);
    await dispatch.page.getByRole('button', { name: 'Refresh delivery group', exact: true }).click();
    await dispatch.page.getByLabel('Delivery driver', { exact: true }).selectOption(driverSession.user.id);
    await expect(dispatch.page.getByRole('list', { name: 'Delivery progress', exact: true }).getByText('Kitchen ready', { exact: true })).toHaveAttribute('aria-current', 'step');
    await expect(dispatch.page.getByLabel('Delivery driver', { exact: true })).toHaveValue(driverSession.user.id);
    const assigned = await clickAction<DeliveryDropResponse>(dispatch.page, 'Assign driver', `/drops/${data.drop.id}/assign`);
    await expect(dispatch.page.getByText(`2 order(s) · 11 meals · Driver: ${assigned.driver!.name}`, { exact: true })).toBeVisible();
    await expect(dispatch.page.getByRole('button', { name: 'Mark dispatch ready', exact: true })).toBeEnabled();
    await clickAction(dispatch.page, 'Mark dispatch ready', `/drops/${data.drop.id}/dispatch-ready`);
    await expect(dispatch.page.getByRole('button', { name: 'Depart delivery', exact: true })).toBeEnabled();
    const departed = await clickAction<DeliveryDropResponse>(dispatch.page, 'Depart delivery', `/drops/${data.drop.id}/depart`);
    expect(departed).toMatchObject({ status: 'OUT_FOR_DELIVERY', targetAtDeparture: data.drop.deliveryAt });
    await driver.page.goto('/today');
    const stop = driver.page.getByRole('article', { name: `Delivery group ${data.drop.id}`, exact: true });
    await expect(stop).toContainText('2 order(s)'); await expect(stop).toContainText('11 meals');
    await stop.getByRole('link', { name: 'Open delivery stop', exact: true }).click();
    await expect(driver.page.getByRole('heading', { name: 'Your delivery stop', exact: true })).toBeVisible();
    await driver.page.getByLabel('Delivery note (optional)', { exact: true }).fill('Synthetic phone review: handed all meals to reception.');
    const delivered = await clickAction<DeliveryDropResponse>(driver.page, 'Mark delivered', `/driver/drops/${data.drop.id}/deliver`);
    expect(delivered.status).toBe('DELIVERED'); expect(delivered.orders).toHaveLength(2);
    expect(delivered.orders.every((order) => order.status === 'DELIVERED' && order.deliveredAt === delivered.deliveredAt)).toBe(true);
    expect(delivered.onTime).toBe(Date.parse(delivered.deliveredAt!) <= Date.parse(delivered.targetAtDeparture!));
    await expect(driver.page.getByRole('button', { name: 'Mark delivered', exact: true })).toHaveCount(0);
    expect(await driver.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await driver.page.screenshot({ path: testInfo.outputPath('driver-delivered-phone.png'), fullPage: true });
    for (const order of data.orders) {
      const current = await read<OrderDetail>(page, `/orders/${order.id}`); expect(current.status).toBe('DELIVERED'); expect(current.purchase).toEqual(order.purchase);
    }
    const forbidden = await driver.page.request.get('/api/v1/drops'); expect(forbidden.status()).toBe(403);
    const dateInjection = await driver.page.request.get('/api/v1/driver/today?date=2020-01-01'); expect(dateInjection.status()).toBe(400);
    const own = await read<DeliveryDropPage>(driver.page, '/driver/today'); expect(own.date).toBe(data.currentDate);
  } finally { await kitchen.context.close(); await dispatch.context.close(); await driver.context.close(); }
});

test('Admin reasoned force completion and departed/delivered group correction preserve all purchases and original timing', async ({ page, browser, baseURL }) => {
  await login(page); const data = await fixture(page);
  const driver = await rolePage(browser, baseURL!, 'driver');
  try {
    const driverSession = await read<SessionResponse>(driver.page, '/auth/me');
    for (const order of data.orders) {
      await page.goto(`/kitchen/orders/${order.id}`);
      await page.getByText('Admin force completion', { exact: true }).click();
      await page.getByLabel('Force completion reason', { exact: true }).fill('Synthetic review: Admin confirms all remaining preparation is complete.');
      await clickAction(page, 'Force complete order', `/kitchen/orders/${order.id}/force-complete`);
      await expect(page.getByText('Admin force completion', { exact: true })).toHaveCount(0);
    }
    let drop = await read<DeliveryDropResponse>(page, `/drops/${data.drop.id}`);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/assign`, { version: drop.version, actionId: randomUUID(), driverId: driverSession.user.id }, 'POST', 200);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/dispatch-ready`, { version: drop.version, actionId: randomUUID() }, 'POST', 200);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/depart`, { version: drop.version, actionId: randomUUID() }, 'POST', 200);
    const departed = drop;
    await page.goto(`/dispatch/${drop.id}`);
    await page.getByText('Admin drop-wide correction', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Correct entire delivery group', exact: true });
    const affected = page.getByRole('heading', { name: 'All affected orders', exact: true }).locator('..');
    for (const order of data.orders) await expect(affected).toContainText(`Order #${order.number}`);
    await form.getByLabel('Corrected delivery time', { exact: true }).fill('22:20');
    await form.getByLabel('Address line 1', { exact: true }).fill('52 Synthetic Corrected Operations Road');
    await form.getByLabel('Drop correction reason', { exact: true }).fill('Synthetic review: reception moved; every travelling order stays together.');
    await form.getByLabel('I reviewed every affected order in this group', { exact: true }).check();
    drop = await clickAction<DeliveryDropResponse>(page, 'Correct entire group', `/drops/${drop.id}/correct`);
    expect(drop.orders).toHaveLength(2); expect(drop.address.line1).toBe('52 Synthetic Corrected Operations Road');
    expect(drop.targetAtDeparture).toBe(departed.targetAtDeparture); expect(drop.departedAt).toBe(departed.departedAt);
    expect(drop.orders.every((order) => order.deliveryAt === drop.deliveryAt && order.address.line1 === drop.address.line1)).toBe(true);
    await expect(page.getByText(/52 Synthetic Corrected Operations Road/).first()).toBeVisible();
    await page.getByLabel('Delivery note (optional)', { exact: true }).fill('Synthetic Admin delivery completion.');
    drop = await clickAction<DeliveryDropResponse>(page, 'Mark delivered', `/drops/${drop.id}/deliver`);
    const actualDeliveredAt = drop.deliveredAt, originalOutcome = drop.onTime;
    await expect(page.getByRole('button', { name: 'Mark delivered', exact: true })).toHaveCount(0);
    await page.getByText('Admin drop-wide correction', { exact: true }).click();
    const deliveredForm = page.getByRole('form', { name: 'Correct entire delivery group', exact: true });
    await deliveredForm.getByLabel('Corrected delivery time', { exact: true }).fill('21:10');
    await deliveredForm.getByLabel('Drop correction reason', { exact: true }).fill('Synthetic review: correct the historical target without rewriting actual delivery.');
    await deliveredForm.getByLabel('I reviewed every affected order in this group', { exact: true }).check();
    const corrected = await clickAction<DeliveryDropResponse>(page, 'Correct entire group', `/drops/${drop.id}/correct`);
    expect(corrected.status).toBe('DELIVERED'); expect(corrected.deliveredAt).toBe(actualDeliveredAt); expect(corrected.onTime).toBe(originalOutcome); expect(corrected.targetAtDeparture).toBe(departed.targetAtDeparture);
    for (const order of data.orders) expect((await read<OrderDetail>(page, `/orders/${order.id}`)).purchase).toEqual(order.purchase);
  } finally { await driver.context.close(); }
});

test('Admin reassigns a travelling group with a reason; previous Driver loses access and delivered Driver stays locked', async ({ page, browser, baseURL }) => {
  await login(page); const data = await fixture(page);
  const previous = await rolePage(browser, baseURL!, 'driver');
  const replacement = await rolePage(browser, baseURL!, 'replacement-driver', true);
  const dispatch = await rolePage(browser, baseURL!, 'dispatch');
  try {
    const oldSession = await read<SessionResponse>(previous.page, '/auth/me');
    const newSession = await read<SessionResponse>(replacement.page, '/auth/me');
    for (const order of data.orders) {
      const current = await read<OperationalOrderResponse>(page, `/kitchen/orders/${order.id}`);
      await mutate(page, `/kitchen/orders/${order.id}/force-complete`, { version: current.version, actionId: randomUUID(), reason: 'Synthetic reassignment scenario: all meals are prepared.' }, 'POST', 200);
    }
    let drop = await read<DeliveryDropResponse>(page, `/drops/${data.drop.id}`);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/assign`, { version: drop.version, actionId: randomUUID(), driverId: oldSession.user.id }, 'POST', 200);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/dispatch-ready`, { version: drop.version, actionId: randomUUID() }, 'POST', 200);
    drop = await mutate<DeliveryDropResponse>(page, `/drops/${drop.id}/depart`, { version: drop.version, actionId: randomUUID() }, 'POST', 200);
    const departed = drop;
    await previous.page.goto(`/today/${drop.id}`);
    await expect(previous.page.getByRole('button', { name: 'Mark delivered', exact: true })).toBeVisible();
    await dispatch.page.goto(`/dispatch/${drop.id}`);
    await expect(dispatch.page.getByText('Admin travelling driver reassignment', { exact: true })).toHaveCount(0);
    const forbidden = await dispatch.page.request.post(`/api/v1/drops/${drop.id}/assign`, { headers: await headers(dispatch.page), data: { version: drop.version, actionId: randomUUID(), driverId: newSession.user.id, reason: 'Dispatch cannot change an already travelling Driver.' } });
    expect(forbidden.status()).toBe(403);
    await page.goto(`/dispatch/${drop.id}`);
    await page.getByText('Admin travelling driver reassignment', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Reassign travelling driver', exact: true });
    await form.getByLabel('Delivery driver', { exact: true }).selectOption(newSession.user.id);
    await form.getByRole('button', { name: 'Reassign travelling driver', exact: true }).click();
    expect(await form.getByLabel('Driver reassignment reason', { exact: true }).evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
    const missingReason = await page.request.post(`/api/v1/drops/${drop.id}/assign`, { headers: await headers(page), data: { version: drop.version, actionId: randomUUID(), driverId: newSession.user.id } });
    expect(missingReason.status()).toBe(400); expect((await missingReason.json()).code).toBe('REASON_REQUIRED');
    const reason = 'Synthetic review: replacement Driver takes over the travelling group.';
    await form.getByLabel('Driver reassignment reason', { exact: true }).fill(reason);
    const reassigned = await clickAction<DeliveryDropResponse>(page, 'Reassign travelling driver', `/drops/${drop.id}/assign`);
    expect(reassigned.driver?.id).toBe(newSession.user.id);
    expect(reassigned.departedAt).toBe(departed.departedAt); expect(reassigned.targetAtDeparture).toBe(departed.targetAtDeparture);
    const history = page.getByRole('heading', { name: 'Delivery group history', exact: true }).locator('..');
    await expect(history).toContainText(reason);
    await expect(history).toContainText(`Driver: ${oldSession.user.displayName} → ${newSession.user.displayName}`);
    const oldRead = await previous.page.request.get(`/api/v1/driver/drops/${drop.id}`); expect(oldRead.status()).toBe(404);
    const oldDeliver = await previous.page.request.post(`/api/v1/driver/drops/${drop.id}/deliver`, { headers: await headers(previous.page), data: { version: reassigned.version, actionId: randomUUID() } });
    expect(oldDeliver.status()).toBe(404);
    await replacement.page.goto('/today');
    const stop = replacement.page.getByRole('article', { name: `Delivery group ${drop.id}`, exact: true });
    await expect(stop).toContainText('2 order(s)');
    await stop.getByRole('link', { name: 'Open delivery stop', exact: true }).click();
    const delivered = await clickAction<DeliveryDropResponse>(replacement.page, 'Mark delivered', `/driver/drops/${drop.id}/deliver`);
    expect(delivered.driver?.id).toBe(newSession.user.id); expect(delivered.orders.every((order) => order.status === 'DELIVERED')).toBe(true);
    await page.getByRole('button', { name: 'Refresh delivery group', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Delivery progress', exact: true }).getByText('Delivered', { exact: true })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByText('Admin travelling driver reassignment', { exact: true })).toHaveCount(0);
    const locked = await page.request.post(`/api/v1/drops/${drop.id}/assign`, { headers: await headers(page), data: { version: delivered.version, actionId: randomUUID(), driverId: oldSession.user.id, reason: 'Attempted historical Driver change.' } });
    expect(locked.status()).toBe(409); expect((await locked.json()).code).toBe('DROP_ALREADY_DELIVERED');
    expect((await read<DeliveryDropResponse>(page, `/drops/${drop.id}`)).driver?.id).toBe(newSession.user.id);
  } finally { await previous.context.close(); await replacement.context.close(); await dispatch.context.close(); }
});
