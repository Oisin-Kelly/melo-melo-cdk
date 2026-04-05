import { test, expect } from '../fixtures/auth';

test.describe('GET /tracks/{trackId}', () => {
  test('returns 404 for a nonexistent track', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks/nonexistent-track-id');
    expect(res.status()).toBe(404);
  });
});

test.describe('GET /tracks', () => {
  test('returns a paginated result shape', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  test('items array has at most 10 entries', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(10);
  });

  test('accepts a cursor query param', async ({ apiContext }) => {
    // First page
    const first = await apiContext.get('/tracks');
    const firstBody = await first.json();

    if (!firstBody.nextCursor) {
      test.skip(); // not enough data to paginate
    }

    const second = await apiContext.get(`/tracks?cursor=${firstBody.nextCursor}`);
    expect(second.status()).toBe(200);

    const secondBody = await second.json();
    expect(Array.isArray(secondBody.items)).toBe(true);
  });
});

test.describe('GET /buckets/dropbox', () => {
  test('returns a presigned URL when given a key', async ({ apiContext }) => {
    const res = await apiContext.get('/buckets/dropbox?key=test/upload.mp3');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.url).toBe('string');
    expect(body.url.length).toBeGreaterThan(0);
  });

  test('returns 400 when key is missing', async ({ apiContext }) => {
    const res = await apiContext.get('/buckets/dropbox');
    expect(res.status()).toBe(400);
  });
});
