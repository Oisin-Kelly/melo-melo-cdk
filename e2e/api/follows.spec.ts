import { test as base, expect, TEST_USER_B } from '../fixtures/auth';
import { signIn, TestUser } from '../fixtures/cognito';
import { APIRequestContext } from '@playwright/test';

// Extends the base fixture with a second fixed test user.
const test = base.extend<{ userB: TestUser; apiContextB: APIRequestContext }>({
  userB: async ({}, use) => {
    const userB = await signIn(TEST_USER_B);
    await use(userB);
  },

  apiContextB: async ({ playwright, userB }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${userB.idToken}`,
        'Content-Type': 'application/json',
      },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

test.describe('Follow lifecycle', () => {
  test('follow-status is false before following', async ({ apiContext, user, userB }) => {
    const res = await apiContext.get(`/users/${userB.username}/follow-status`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.followStatus).toBe(false);
  });

  test('follow → check status → unfollow', async ({ apiContext, user, userB }) => {
    // Follow
    const follow = await apiContext.post(`/users/${userB.username}/follow-user`, {
      data: { newValue: true },
    });
    expect(follow.status()).toBe(200);
    expect((await follow.json()).newValue).toBe(true);

    // Status should now be true
    const status = await apiContext.get(`/users/${userB.username}/follow-status`);
    const statusBody = await status.json();
    expect(statusBody.followStatus).toBe(true);

    // userB's followers list should include user
    const followers = await apiContext.get(`/users/${userB.username}/followers`);
    expect(followers.status()).toBe(200);
    const followersBody = await followers.json();
    const usernames = followersBody.items.map((u: { username: string }) => u.username);
    expect(usernames).toContain(user.username);

    // user's followings list should include userB
    const followings = await apiContext.get(`/users/${user.username}/followings`);
    expect(followings.status()).toBe(200);
    const followingsBody = await followings.json();
    const followingUsernames = followingsBody.items.map((u: { username: string }) => u.username);
    expect(followingUsernames).toContain(userB.username);

    // Unfollow
    const unfollow = await apiContext.post(`/users/${userB.username}/follow-user`, {
      data: { newValue: false },
    });
    expect(unfollow.status()).toBe(200);
    expect((await unfollow.json()).newValue).toBe(false);

    // Status should be false again
    const statusAfter = await apiContext.get(`/users/${userB.username}/follow-status`);
    expect((await statusAfter.json()).followStatus).toBe(false);
  });

  test('returns 400 when newValue is missing', async ({ apiContext, userB }) => {
    const res = await apiContext.post(`/users/${userB.username}/follow-user`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('returns 404 when following a nonexistent user', async ({ apiContext }) => {
    const res = await apiContext.post('/users/nonexistent-user-xyz/follow-user', {
      data: { newValue: true },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('GET /users/{username}/followers', () => {
  test('returns paginated result shape', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}/followers`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });
});

test.describe('GET /users/{username}/followings', () => {
  test('returns paginated result shape', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}/followings`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });
});
