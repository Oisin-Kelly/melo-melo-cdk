import { test, expect } from '../fixtures/auth';

test.describe('GET /users/{username}', () => {
  test('returns the authenticated user profile', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      username: user.username,
    });
  });

  test('returns 404 for a nonexistent user', async ({ apiContext }) => {
    const res = await apiContext.get('/users/this-user-does-not-exist-xyz');
    expect(res.status()).toBe(404);
  });
});
