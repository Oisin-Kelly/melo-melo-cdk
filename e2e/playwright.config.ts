import { defineConfig } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  workers: 1,
  projects: [
    {
      name: 'api',
      testDir: './api',
      use: {},
    },
    {
      name: 'ui',
      testDir: './ui',
      use: {
        browserName: 'chromium',
        baseURL: process.env.WEB_BASE_URL,
      },
    },
  ],
});
