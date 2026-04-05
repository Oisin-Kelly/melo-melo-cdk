import { test as base, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser } from './cognito';

export interface UiFixtures {
  authenticatedPage: Page;
  user: TestUser;
}

// Placeholder for future browser-based UI tests.
// When the React app is built, extend this fixture to:
// 1. Navigate to the login page
// 2. Fill in user.username + user.password
// 3. Wait for redirect / auth token stored
// 4. Yield the logged-in page
export const test = base.extend<UiFixtures>({
  user: async ({}, use) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await createTestUser(suffix);
    await use(user);
    await deleteTestUser(user.username);
  },

  authenticatedPage: async ({ page, user }, use) => {
    // TODO: implement login flow once React app is available
    // await page.goto('/login');
    // await page.fill('[name=username]', user.username);
    // await page.fill('[name=password]', user.password);
    // await page.click('[type=submit]');
    // await page.waitForURL('/home');
    await use(page);
  },
});

export { expect } from '@playwright/test';
