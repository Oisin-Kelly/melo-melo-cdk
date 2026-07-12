import { test, expect } from '../fixtures/users';

// The incomingShares setting (EVERYONE | FOLLOWING | NONE) gates who can share
// tracks/albums with a user. Blocked recipients are silently dropped from
// sharedWith — indistinguishable from unknown usernames.
//
// Uses userC as the recipient and restores EVERYONE afterwards so the other
// specs (which share to B/C expecting delivery) keep working.

test.describe('incomingShares setting', () => {
  test.afterAll(async ({ apiContextC }) => {
    await apiContextC.post('/profile/update', { data: { incomingShares: 'EVERYONE' } });
  });

  test('rejects an invalid value with 400', async ({ apiContext }) => {
    const res = await apiContext.post('/profile/update', {
      data: { incomingShares: 'SOMETIMES' },
    });
    expect(res.status()).toBe(400);
  });

  test('is returned on the profile after updating', async ({ apiContextC, userC }) => {
    const update = await apiContextC.post('/profile/update', {
      data: { incomingShares: 'EVERYONE' },
    });
    expect(update.status()).toBe(200);
    expect((await update.json()).incomingShares).toBe('EVERYONE');

    const profile = await apiContextC.get(`/users/${userC.username}`);
    expect((await profile.json()).incomingShares).toBe('EVERYONE');
  });

  test('a profile update without the field leaves the setting unchanged', async ({
    apiContextC,
    userC,
  }) => {
    await apiContextC.post('/profile/update', { data: { incomingShares: 'FOLLOWING' } });

    const update = await apiContextC.post('/profile/update', {
      data: { displayName: 'Setting Untouched' },
    });
    expect(update.status()).toBe(200);

    const profile = await apiContextC.get(`/users/${userC.username}`);
    expect((await profile.json()).incomingShares).toBe('FOLLOWING');
  });

  test('NONE blocks album shares; FOLLOWING allows them only once the recipient follows the sender', async ({
    apiContext,
    user,
    apiContextC,
    userC,
  }) => {
    // Empty album is enough — the share records are what the feed and the
    // sharedWith response are built from
    const create = await apiContext.post('/albums', {
      data: { name: `E2E incomingShares ${Date.now()}` },
    });
    expect(create.status()).toBe(201);
    const album = await create.json();

    try {
      // NONE: silently dropped
      await apiContextC.post('/profile/update', { data: { incomingShares: 'NONE' } });
      const shareBlocked = await apiContext.post(`/albums/${album.id}/share`, {
        data: { add: [userC.username] },
      });
      expect(shareBlocked.status()).toBe(200);
      expect((await shareBlocked.json()).sharedWith).not.toContain(userC.username);

      // FOLLOWING, but C does not follow A: still dropped
      await apiContextC.post('/profile/update', { data: { incomingShares: 'FOLLOWING' } });
      const shareNotFollowing = await apiContext.post(`/albums/${album.id}/share`, {
        data: { add: [userC.username] },
      });
      expect((await shareNotFollowing.json()).sharedWith).not.toContain(userC.username);

      // C follows A: the share now goes through and lands in C's feed
      const follow = await apiContextC.post(`/users/${user.username}/follow-user`, {
        data: { newValue: true },
      });
      expect(follow.status()).toBe(200);
      try {
        const shareAllowed = await apiContext.post(`/albums/${album.id}/share`, {
          data: { add: [userC.username] },
        });
        expect((await shareAllowed.json()).sharedWith).toContain(userC.username);

        const feed = await apiContextC.get('/albums/shared');
        const feedIds = (await feed.json()).items.map(
          (s: { album: { id: string } }) => s.album.id
        );
        expect(feedIds).toContain(album.id);
      } finally {
        await apiContextC.post(`/users/${user.username}/follow-user`, { data: { newValue: false } });
      }
    } finally {
      await apiContextC.post('/profile/update', { data: { incomingShares: 'EVERYONE' } });
      await apiContext.delete(`/albums/${album.id}`);
    }
  });
});
