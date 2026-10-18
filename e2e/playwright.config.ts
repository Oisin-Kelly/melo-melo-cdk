import { defineConfig } from '@playwright/test';
import 'dotenv/config';

// Specs asserting on a shared test user's global/aggregate state run after the parallel
// `api` project (see the api-mutating project below)
const MUTATING_SPEC = ['**/sharing-permissions.spec.ts', '**/shared-user-state.spec.ts'];

export default defineConfig({
  timeout: 30_000,
  retries: 1,
  reporter: 'list',
  workers: 4,
  projects: [
    {
      name: 'api',
      testDir: './api',
      testIgnore: MUTATING_SPEC,
      use: {},
    },
    {
      name: 'api-mutating',
      testDir: './api',
      testMatch: MUTATING_SPEC,
      dependencies: ['api'],
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
