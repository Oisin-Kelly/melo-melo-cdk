import { test, expect } from '../fixtures/auth';

// Shared track endpoints depend on tracks being uploaded via the S3 dropbox
// pipeline. These tests verify the response shape only, since seeding real
// track data requires a full upload flow outside the scope of API tests.

test.describe('GET /tracks/shared', () => {
  test('returns a paginated result shape', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks/shared');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  test('items array has at most 10 entries', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks/shared');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(10);
  });

  test('accepts a cursor query param', async ({ apiContext }) => {
    const first = await apiContext.get('/tracks/shared');
    const firstBody = await first.json();

    if (!firstBody.nextCursor) {
      test.skip();
    }

    const second = await apiContext.get(`/tracks/shared?cursor=${firstBody.nextCursor}`);
    expect(second.status()).toBe(200);

    const secondBody = await second.json();
    expect(Array.isArray(secondBody.items)).toBe(true);
  });
});

test.describe('GET /users/{username}/shared', () => {
  test('returns a paginated result shape', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}/shared`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  test('items array has at most 10 entries', async ({ apiContext, user }) => {
    const res = await apiContext.get(`/users/${user.username}/shared`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(10);
  });
});
