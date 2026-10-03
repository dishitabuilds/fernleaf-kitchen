import { defineConfig, devices } from '@playwright/test';

const externalUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalUrl ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build, migrate and seed first. These servers exercise production output.
  webServer: externalUrl ? undefined : [
    { command: 'pnpm --filter @fernleaf/api start', url: 'http://localhost:3001/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'pnpm --filter @fernleaf/web start', url: 'http://localhost:3000/login', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
