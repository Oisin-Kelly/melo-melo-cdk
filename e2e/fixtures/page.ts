import { Page } from '@playwright/test';
import { test as base } from './auth';

// Placeholder for future browser-based UI tests. Reuses the auth fixture's
// signed-in `user`. When the React app is built, extend this fixture to:
// 1. Navigate to the login page
// 2. Fill in credentials
// 3. Wait for redirect / auth token stored
// 4. Yield the logged-in page
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page, user }, use) => {
    // TODO: implement login flow once React app is available
    // await page.goto('/login');
    // await page.fill('[name=username]', user.username);
    // await page.click('[type=submit]');
    // await page.waitForURL('/home');
    await use(page);
  },
});

export { expect } from '@playwright/test';
