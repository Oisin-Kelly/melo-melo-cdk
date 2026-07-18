import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Denormalized counters (trackCount / totalDurationSeconds / shareCount) and the
// recipients endpoints. shareCount is owner-only; recipients endpoints are owner-only.

test.describe('Counters and recipients', () => {
  test('album track/duration/share counters and recipients endpoint', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    const [t1, t2] = await Promise.all([
      uploadTrack(apiContext, `E2E counter A ${runId}`),
      uploadTrack(apiContext, `E2E counter B ${runId}`),
    ]);

    const create = await apiContext.post('/albums', {
      data: { name: `E2E counters ${runId}`, trackIds: [t1, t2] },
    });
    expect(create.status()).toBe(201);
    const album = await create.json();
    expect(album.trackCount).toBe(2);
    expect(album.totalDurationSeconds).toBeGreaterThan(0);
    const twoTrackDuration = album.totalDurationSeconds;

    try {
      // Share → owner sees shareCount, recipient does not
      const share = await apiContext.post(`/albums/${album.id}/share`, {
        data: { add: [userB.username] },
      });
      expect(share.status()).toBe(200);

      const ownerView = await apiContext.get(`/albums/${album.id}`);
      expect((await ownerView.json()).album.shareCount).toBe(1);

      const recipientView = await apiContextB.get(`/albums/${album.id}`);
      const recipientAlbum = (await recipientView.json()).album;
      expect(recipientAlbum.shareCount).toBeUndefined();
      expect(recipientAlbum.trackCount).toBe(2); // track/duration counts are public

      // Recipients endpoint — owner only
      const recipients = await apiContext.get(`/albums/${album.id}/recipients`);
      expect(recipients.status()).toBe(200);
      expect((await recipients.json()).items.map((r: { user: { username: string } }) => r.user.username)).toContain(
        userB.username
      );
      expect((await apiContextB.get(`/albums/${album.id}/recipients`)).status()).toBe(404);

      // Save the tracklist without t2 → trackCount and duration drop
      const remove = await apiContext.put(`/albums/${album.id}/tracks`, {
        data: { trackIds: [t1] },
      });
      expect(remove.status()).toBe(200);
      expect(await remove.json()).toMatchObject({ trackCount: 1, added: 0, removed: 1 });

      const afterRemove = await apiContext.get(`/albums/${album.id}`);
      const afterAlbum = (await afterRemove.json()).album;
      expect(afterAlbum.trackCount).toBe(1);
      expect(afterAlbum.totalDurationSeconds).toBeLessThan(twoTrackDuration);
      expect(afterAlbum.totalDurationSeconds).toBeGreaterThan(0);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${t1}`);
      await apiContext.delete(`/tracks/${t2}`);
    }
  });

  test('playlist track/duration counters', async ({ apiContext }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const t1 = await uploadTrack(apiContext, `E2E pl counter ${runId}`);

    const create = await apiContext.post('/playlists', {
      data: { name: `E2E pl counters ${runId}` },
    });
    const playlist = await create.json();

    try {
      expect(playlist.trackCount).toBe(0);

      const add = await apiContext.post(`/playlists/${playlist.id}/tracks/${t1}`);
      expect(add.status()).toBe(200);
      expect(await add.json()).toMatchObject({ added: true });

      const detail = await apiContext.get(`/playlists/${playlist.id}`);
      const pl = (await detail.json()).playlist;
      expect(pl.trackCount).toBe(1);
      expect(pl.totalDurationSeconds).toBeGreaterThan(0);
    } finally {
      await apiContext.delete(`/playlists/${playlist.id}`);
      await apiContext.delete(`/tracks/${t1}`);
    }
  });

  test('track shareCount is owner-only and recipients endpoint works', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E track share counter ${runId}`);

    try {
      const share = await apiContext.post(`/tracks/${trackId}/share`, {
        data: { add: [userB.username] },
      });
      expect(share.status()).toBe(200);

      const ownerView = await apiContext.get(`/tracks/${trackId}`);
      expect((await ownerView.json()).shareCount).toBe(1);

      const recipientView = await apiContextB.get(`/tracks/${trackId}`);
      expect((await recipientView.json()).shareCount).toBeUndefined();

      const recipients = await apiContext.get(`/tracks/${trackId}/recipients`);
      expect(recipients.status()).toBe(200);
      expect((await recipients.json()).items.map((r: { user: { username: string } }) => r.user.username)).toContain(
        userB.username
      );
      expect((await apiContextB.get(`/tracks/${trackId}/recipients`)).status()).toBe(404);
    } finally {
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
