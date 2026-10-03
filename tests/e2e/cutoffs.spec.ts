import { expect, test, type Page } from '@playwright/test';
import type { CutoffPreviewResponse } from '@fernleaf/contracts';

test.use({ timezoneId: 'America/Los_Angeles' });

async function openCutoff(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@test.com');
  await page.getByLabel('Password', { exact: true }).fill('Test@1234');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Process passed cutoff', exact: true }).click();
  return page.getByRole('heading', { name: 'Process a passed cutoff', exact: true }).locator('..');
}

test('Admin cannot manually process a future kitchen cutoff', async ({ page }) => {
  const panel = await openCutoff(page);
  const futureDate = '2030-10-07';
  const preview = await (await page.request.get(`/api/v1/settings/cutoff?deliveryDate=${futureDate}`)).json() as CutoffPreviewResponse;
  expect(new Date(preview.cutoffAt).getTime()).toBeGreaterThan(Date.now());
  await panel.getByLabel('Delivery date', { exact: true }).fill(futureDate);
  const response = page.waitForResponse((value) => value.url().endsWith('/api/v1/cutoffs/process') && value.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Process this cutoff', exact: true }).click();
  const rejected = await response;
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).code).toBe('CUTOFF_NOT_PASSED');
  await expect(panel.getByRole('alert')).toContainText('already-passed kitchen cutoff');
  await expect(panel.getByText('0 confirmed', { exact: true })).toHaveCount(0);
});

test('Admin processes an empty historical date twice and sees accurate result counts', async ({ page }) => {
  const panel = await openCutoff(page);
  // A dedicated historical date outside the operational seed/review scenarios.
  // The cutoff date policy is appended; existing orders/configuration are preserved.
  const pastDate = '2000-01-01';
  const preview = await (await page.request.get(`/api/v1/settings/cutoff?deliveryDate=${pastDate}`)).json() as CutoffPreviewResponse;
  expect(new Date(preview.cutoffAt).getTime()).toBeLessThan(Date.now());
  await panel.getByLabel('Delivery date', { exact: true }).fill(pastDate);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = page.waitForResponse((value) => value.url().endsWith('/api/v1/cutoffs/process') && value.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Process this cutoff', exact: true }).click();
    const processed = await response;
    expect(processed.status()).toBe(200);
    expect(await processed.json()).toEqual({ deliveryDate: pastDate, confirmed: 0, cancelled: 0, skipped: 0, failed: 0, failures: [] });
    for (const label of ['0 confirmed', '0 drafts cancelled', '0 skipped', '0 failed']) await expect(panel.getByText(label, { exact: true })).toBeVisible();
  }
});
