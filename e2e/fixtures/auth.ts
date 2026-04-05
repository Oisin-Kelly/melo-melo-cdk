import { test as base, APIRequestContext } from '@playwright/test';
import { signIn, TestAccount, TestUser } from './cognito';
import accounts from '../test-accounts.json';

export const TEST_USER_A: TestAccount = accounts.userA;
export const TEST_USER_B: TestAccount = accounts.userB;

export interface ApiFixtures {
    apiContext: APIRequestContext;
    user: TestUser;
}

export const test = base.extend<ApiFixtures>({
    user: async ({}, use) => {
        const user = await signIn(TEST_USER_A);
        await use(user);
    },

    apiContext: async ({ playwright, user }, use) => {
        const ctx = await playwright.request.newContext({
            baseURL: process.env.API_BASE_URL,
            extraHTTPHeaders: {
                Authorization: `Bearer ${user.idToken}`,
                'Content-Type': 'application/json',
            },
        });
        await use(ctx);
        await ctx.dispose();
    },
});

export { expect } from '@playwright/test';
