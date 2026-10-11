import { mkdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

mkdirSync('test-results/logs', { recursive: true });

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 780 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: [
    {
      command: 'node scripts/run-logged.mjs test-results/logs/api.log npm run start -w @rinda/backend',
      url: 'http://localhost:3000/api/v1/health',
      env: { APP_ENV: 'development', LOG_LEVEL: 'info', DATABASE_URL: '' },
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: 'npm run preview -w @rinda/frontend',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
