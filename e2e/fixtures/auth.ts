import { test as base, APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { signIn, TestAccount, TestUser } from './cognito';
import accounts from '../test-accounts.json';

export const TEST_USER_A: TestAccount = accounts.userA;
export const TEST_USER_B: TestAccount = accounts.userB;
export const TEST_USER_C: TestAccount = accounts.userC;

export async function newApiContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  idToken: string
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: process.env.API_BASE_URL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });
}

export interface ApiFixtures {
  apiContext: APIRequestContext;
}

export interface ApiWorkerFixtures {
  user: TestUser;
}

export const test = base.extend<ApiFixtures, ApiWorkerFixtures>({
  user: [
    async ({}, use) => {
      const user = await signIn(TEST_USER_A);
      await use(user);
    },
    { scope: 'worker' },
  ],

  apiContext: async ({ playwright, user }, use) => {
    const ctx = await newApiContext(playwright, user.idToken);
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from '@playwright/test';
