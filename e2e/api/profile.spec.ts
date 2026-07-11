import { test, expect } from '../fixtures/auth';

// POST /profile/update replaces every field it receives, so each run simply
// re-sets the test account's profile — no cleanup needed.

test.describe('POST /profile/update', () => {
  test('updates profile fields and returns the new profile', async ({ apiContext, user }) => {
    const runId = Date.now();
    const update = {
      displayName: `E2E User ${runId % 10_000}`,
      firstName: 'Melo',
      lastName: 'Tester',
      city: 'Dublin',
      country: 'Ireland',
      bio: `Updated by the e2e suite at ${runId}`,
      followersPrivate: false,
      followingsPrivate: false,
      clearedImage: false,
    };

    const res = await apiContext.post('/profile/update', { data: update });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      username: user.username,
      displayName: update.displayName,
      firstName: update.firstName,
      lastName: update.lastName,
      city: update.city,
      country: update.country,
      bio: update.bio,
    });
  });

  test('changes are reflected in GET /users/{username}', async ({ apiContext, user }) => {
    const bio = `Round-trip bio ${Date.now()}`;

    const update = await apiContext.post('/profile/update', {
      data: { displayName: 'Round Trip', bio },
    });
    expect(update.status()).toBe(200);

    const res = await apiContext.get(`/users/${user.username}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.displayName).toBe('Round Trip');
    expect(body.bio).toBe(bio);
  });

  test('sanitises extra whitespace in single-line fields', async ({ apiContext }) => {
    const res = await apiContext.post('/profile/update', {
      data: { displayName: '  spaced    out   name  ', city: ' Dub   lin ' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.displayName).toBe('spaced out name');
    expect(body.city).toBe('Dub lin');
  });

  test('returns 400 when displayName exceeds 30 characters', async ({ apiContext }) => {
    const res = await apiContext.post('/profile/update', {
      data: { displayName: 'x'.repeat(31) },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when bio exceeds 2000 characters', async ({ apiContext }) => {
    const res = await apiContext.post('/profile/update', {
      data: { bio: 'x'.repeat(2001) },
    });
    expect(res.status()).toBe(400);
  });
});
