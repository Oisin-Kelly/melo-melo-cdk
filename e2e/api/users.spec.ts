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
