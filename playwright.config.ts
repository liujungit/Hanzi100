import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    channel: process.env.PW_CHANNEL || undefined,
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
