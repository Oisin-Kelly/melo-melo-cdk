import { test, expect } from '../fixtures/users';

test.describe('GET /users/{username}', () => {
  test('returns the authenticated user profile', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      username: user.username,
    });
  });

  test('all three test users have profiles', async ({ apiContext, user, userB, userC }) => {
    for (const u of [user, userB, userC]) {
      const res = await apiContext.get(`/users/${u.username}`);
      expect(res.status(), `profile for ${u.username}`).toBe(200);
      expect((await res.json()).username).toBe(u.username);
    }
  });

  test('returns 404 for a nonexistent user', async ({ apiContext }) => {
    const res = await apiContext.get('/users/this-user-does-not-exist-xyz');
    expect(res.status()).toBe(404);
  });
});

test.describe('GET /users/search', () => {
  test('finds users by username prefix', async ({ apiContext, user, userB, userC }) => {
    const res = await apiContext.get('/users/search?q=melotest&limit=50');
    expect(res.status()).toBe(200);

    const body = await res.json();
    const usernames = body.items.map((u: { username: string }) => u.username);
    for (const u of [user, userB, userC]) {
      expect(usernames).toContain(u.username);
    }
    expect('nextCursor' in body).toBe(true);
  });

  test('is case-insensitive', async ({ apiContext, user }) => {
    const res = await apiContext.get('/users/search?q=MELOTEST&limit=50');
    expect(res.status()).toBe(200);

    const usernames = (await res.json()).items.map((u: { username: string }) => u.username);
    expect(usernames).toContain(user.username);
  });

  test('respects limit and paginates without duplicates', async ({ apiContext }) => {
    const page1 = await apiContext.get('/users/search?q=melotest&limit=1');
    expect(page1.status()).toBe(200);
    const body1 = await page1.json();
    expect(body1.items).toHaveLength(1);
    expect(body1.nextCursor).toBeTruthy();

    const page2 = await apiContext.get(
      `/users/search?q=melotest&limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`,
    );
    expect(page2.status()).toBe(200);
    const body2 = await page2.json();
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0].username).not.toBe(body1.items[0].username);
  });

  test('returns an empty page when nothing matches', async ({ apiContext }) => {
    const res = await apiContext.get('/users/search?q=zzz_no_such_user_xyz');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  test('400 when q is missing', async ({ apiContext }) => {
    const res = await apiContext.get('/users/search');
    expect(res.status()).toBe(400);
  });

  test('400 when q has characters outside the username charset', async ({ apiContext }) => {
    const res = await apiContext.get('/users/search?q=' + encodeURIComponent('bad query!'));
    expect(res.status()).toBe(400);
  });
});
