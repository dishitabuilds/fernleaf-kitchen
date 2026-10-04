import { defineConfig, devices } from '@playwright/test';

// This check reads a separately prepared workload. It never starts servers or
// creates fixtures, and must not accidentally point at a hosted/reviewer app.
const suppliedUrl = process.env.E2E_BASE_URL;
if (!suppliedUrl) throw new Error('Set E2E_BASE_URL to the already-running local web app backed by the guarded 400-order test database.');
const workloadUrl = new URL(suppliedUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(workloadUrl.hostname) || workloadUrl.protocol !== 'http:' || workloadUrl.username || workloadUrl.password || workloadUrl.pathname !== '/' || workloadUrl.search || workloadUrl.hash) {
  throw new Error('Kitchen workload UI checks require a local HTTP origin such as http://localhost:3000, without credentials or a path.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'kitchen-workload.check.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results/kitchen-workload',
  use: {
    baseURL: workloadUrl.origin,
    viewport: { width: 1280, height: 900 },
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-workload', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: undefined,
});
