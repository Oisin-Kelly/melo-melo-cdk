import { Page } from '@playwright/test';
import { test as base, TEST_USER_A } from './auth';

// UI fixture: `authenticatedPage` is signed in as user A through the real login screen
// (Cognito SRP via Amplify), landing on Home. Needs WEB_BASE_URL pointing at the web
// app (local `npm run dev` or the deployed CloudFront URL).
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill(TEST_USER_A.username);
    await page.getByLabel('Password').fill(TEST_USER_A.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
