import { performance } from 'node:perf_hooks';
import { expect, test, type Page, type Response } from '@playwright/test';
import type { KitchenBoardResponse } from '@fernleaf/contracts';

const DELIVERY_DATE = '2026-10-07';
const elapsed = (started: number) => Math.round((performance.now() - started) * 10) / 10;
const cards = (page: Page) => page.getByRole('article', { name: /^Preparation unit / });

function boardResponse(page: Page, expectedPage: number, stationId = '', status = '') {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/v1/kitchen' &&
      url.searchParams.get('date') === DELIVERY_DATE && url.searchParams.get('page') === String(expectedPage) &&
      (url.searchParams.get('stationId') ?? '') === stationId && (url.searchParams.get('status') ?? '') === status;
  });
}

async function renderedBoard(page: Page, response: Response, total: number, expectedPage: number) {
  expect(response.status()).toBe(200);
  const board = await response.json() as KitchenBoardResponse;
  expect(board).toMatchObject({ date: DELIVERY_DATE, page: expectedPage, pageSize: 50, total });
  expect(board.items).toHaveLength(50);
  await expect(cards(page)).toHaveCount(50);
  // A count alone could still describe the previous 50-card page.
  await expect(cards(page).first()).toHaveAttribute('aria-label', `Preparation unit ${board.items[0].id}`);
  await expect(page.getByText(new RegExp(`^${total} records .*Page ${expectedPage} of ${Math.ceil(total / 50)}$`))).toBeVisible();
  return board;
}

test('400-order Kitchen board renders bounded pages and the station/status subset', async ({ page }, testInfo) => {
  // Preparation is performed separately by the guarded PostgreSQL fixture
  // test. Only authentication and read/navigation/filter requests occur here.
  const unexpectedMutations: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname !== '/api/v1/auth/login') {
      unexpectedMutations.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill('kitchen@test.com');
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/kitchen$/);

  const firstResponse = boardResponse(page, 1);
  const started = performance.now();
  await page.goto(`/kitchen?date=${DELIVERY_DATE}`);
  await expect(page.getByRole('heading', { name: 'Kitchen workspace', exact: true })).toBeVisible();
  const first = await renderedBoard(page, await firstResponse, 400, 1);
  const firstPageMs = elapsed(started);
  expect(first.stations).toHaveLength(2);
  expect(first.items.every((unit) => unit.status === 'PENDING')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await cards(page).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('kitchen-400-page-1.png'), fullPage: false });

  const ids = new Set(first.items.map((unit) => unit.id));
  let meals = first.items.reduce((total, unit) => total + unit.quantity, 0);
  const pageTimes: number[] = [];
  for (let currentPage = 2; currentPage <= 8; currentPage++) {
    const response = boardResponse(page, currentPage);
    const changed = performance.now();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const board = await renderedBoard(page, await response, 400, currentPage);
    pageTimes.push(elapsed(changed));
    for (const unit of board.items) { expect(ids.has(unit.id)).toBe(false); ids.add(unit.id); }
    meals += board.items.reduce((total, unit) => total + unit.quantity, 0);
  }
  expect(ids.size).toBe(400);
  expect(meals).toBe(800);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await cards(page).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('kitchen-400-page-8.png'), fullPage: false });

  const cold = first.stations.find((station) => station.name === 'Cold kitchen');
  expect(cold, 'Prepared fixture must contain the Cold kitchen snapshot station').toBeDefined();
  const stationResponse = boardResponse(page, 1, cold!.id);
  const stationStarted = performance.now();
  await page.getByLabel('Kitchen station', { exact: true }).selectOption(cold!.id);
  const filtered = await renderedBoard(page, await stationResponse, 200, 1);
  expect(filtered.items.every((unit) => unit.station?.id === cold!.id)).toBe(true);
  const stationFilterMs = elapsed(stationStarted);

  const pendingResponse = boardResponse(page, 1, cold!.id, 'PENDING');
  const pendingStarted = performance.now();
  await page.getByLabel('Preparation status', { exact: true }).selectOption('PENDING');
  const pending = await renderedBoard(page, await pendingResponse, 200, 1);
  expect(pending.items.every((unit) => unit.station?.id === cold!.id && unit.status === 'PENDING')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const statusFilterMs = elapsed(pendingStarted);
  await cards(page).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('kitchen-400-station-pending.png'), fullPage: false });
  expect(browserErrors).toEqual([]);
  expect(unexpectedMutations).toEqual([]);
  console.info('400-order Kitchen browser evidence', JSON.stringify({ orders: 400, units: ids.size, meals,
    renderedCardsPerPage: 50, pages: 8, filteredUnits: pending.total, filteredPages: 4,
    firstPageMs, pageChangeMs: pageTimes, stationFilterMs, statusFilterMs,
    viewport: { width: 1280, height: 900 }, timezone: 'America/Los_Angeles' }));
});
