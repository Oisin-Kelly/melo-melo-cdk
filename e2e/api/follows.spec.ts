import { test, expect } from '../fixtures/users';

type Activity = { type: string; actor: { username: string }; targetType: string; targetId: string };

test.describe('Follow lifecycle', () => {
  test('follow-status is false before following', async ({ apiContext, user, userB }) => {
    const res = await apiContext.get(`/users/${userB.username}/follow-status`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.followStatus).toBe(false);
  });

  test('follow → check status → unfollow', async ({ apiContext, user, userB, userC }) => {
    // Follow both B and C
    for (const target of [userB, userC]) {
      const follow = await apiContext.post(`/users/${target.username}/follow-user`, {
        data: { newValue: true },
      });
      expect(follow.status()).toBe(200);
      expect((await follow.json()).newValue).toBe(true);

      const status = await apiContext.get(`/users/${target.username}/follow-status`);
      expect((await status.json()).followStatus).toBe(true);
    }

    // userB's followers list should include user
    const followers = await apiContext.get(`/users/${userB.username}/followers`);
    expect(followers.status()).toBe(200);
    const followersBody = await followers.json();
    const usernames = followersBody.items.map((u: { username: string }) => u.username);
    expect(usernames).toContain(user.username);

    // user's followings list should include both B and C
    const followings = await apiContext.get(`/users/${user.username}/followings`);
    expect(followings.status()).toBe(200);
    const followingsBody = await followings.json();
    const followingUsernames = followingsBody.items.map((u: { username: string }) => u.username);
    expect(followingUsernames).toContain(userB.username);
    expect(followingUsernames).toContain(userC.username);

    // Unfollowing B must not touch the C relationship
    const unfollow = await apiContext.post(`/users/${userB.username}/follow-user`, {
      data: { newValue: false },
    });
    expect(unfollow.status()).toBe(200);
    expect((await unfollow.json()).newValue).toBe(false);

    expect(
      (await (await apiContext.get(`/users/${userB.username}/follow-status`)).json()).followStatus
    ).toBe(false);
    expect(
      (await (await apiContext.get(`/users/${userC.username}/follow-status`)).json()).followStatus
    ).toBe(true);

    // Clean up: unfollow C too
    await apiContext.post(`/users/${userC.username}/follow-user`, { data: { newValue: false } });
    expect(
      (await (await apiContext.get(`/users/${userC.username}/follow-status`)).json()).followStatus
    ).toBe(false);
  });

  // Uses the B→A direction (untouched by the A→B/A→C tests above) so it never races on the
  // shared follow graph. Follow writes a USER_FOLLOWED activity for the followed user; unfollow
  // deletes it; a re-follow is idempotent (no duplicate row / no double count).
  test('follow writes USER_FOLLOWED activity, unfollow removes it, re-follow is idempotent', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    // Clean slate: ensure B is not already following A (also clears any leftover activity item)
    await apiContextB.post(`/users/${user.username}/follow-user`, { data: { newValue: false } });

    // A's activity rows that represent "B started following you"
    const followRows = async () =>
      ((await (await apiContext.get('/activity')).json()).items as Activity[]).filter(
        (a) => a.type === 'USER_FOLLOWED' && a.actor.username === userB.username
      );

    try {
      // B follows A → exactly one USER_FOLLOWED row reaches A, targeting the follower (USER)
      expect((await apiContextB.post(`/users/${user.username}/follow-user`, { data: { newValue: true } })).status()).toBe(200);
      await expect.poll(async () => (await followRows()).length, { timeout: 15_000 }).toBe(1);
      expect((await followRows())[0].targetType).toBe('USER');

      // Re-follow without an intervening unfollow is idempotent → still exactly one row (guard holds)
      expect((await apiContextB.post(`/users/${user.username}/follow-user`, { data: { newValue: true } })).status()).toBe(200);
      await expect.poll(async () => (await followRows()).length, { timeout: 15_000 }).toBe(1);

      // Unfollow → the activity row is deleted
      expect((await apiContextB.post(`/users/${user.username}/follow-user`, { data: { newValue: false } })).status()).toBe(200);
      await expect.poll(async () => (await followRows()).length, { timeout: 15_000 }).toBe(0);
    } finally {
      await apiContextB.post(`/users/${user.username}/follow-user`, { data: { newValue: false } });
    }
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
