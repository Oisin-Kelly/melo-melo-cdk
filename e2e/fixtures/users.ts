import { APIRequestContext } from '@playwright/test';
import { test as base, newApiContext, TEST_USER_B, TEST_USER_C } from './auth';
import { signIn, TestUser } from './cognito';

export const test = base.extend<
  { apiContextB: APIRequestContext; apiContextC: APIRequestContext },
  { userB: TestUser; userC: TestUser }
>({
  userB: [
    async ({}, use) => {
      const userB = await signIn(TEST_USER_B);
      await use(userB);
    },
    { scope: 'worker' },
  ],

  apiContextB: async ({ playwright, userB }, use) => {
    const ctx = await newApiContext(playwright, userB.idToken);
    await use(ctx);
    await ctx.dispose();
  },

  userC: [
    async ({}, use) => {
      const userC = await signIn(TEST_USER_C);
      await use(userC);
    },
    { scope: 'worker' },
  ],

  apiContextC: async ({ playwright, userC }, use) => {
    const ctx = await newApiContext(playwright, userC.idToken);
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from '@playwright/test';
