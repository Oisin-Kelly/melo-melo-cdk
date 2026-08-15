import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Recipient-side "remove from my library": DELETE /tracks/shared/{id} and
// DELETE /albums/shared/{id}. The invariant under test is that the two footprints are
// disjoint — removing a directly-shared track keeps album-granted access, and removing a
// shared album keeps a direct track share. Each test owns freshly-uploaded resources
// (unique runId), so shareCount is fully controlled and never races other specs.

type SharedTrackRow = { track: { id: string } };
type SharedAlbumRow = { album: { id: string } };

const sharedTrackIds = async (ctx: import('@playwright/test').APIRequestContext) =>
  ((await (await ctx.get('/tracks/shared?limit=100')).json()).items as SharedTrackRow[]).map((i) => i.track.id);

const sharedAlbumIds = async (ctx: import('@playwright/test').APIRequestContext) =>
  ((await (await ctx.get('/albums/shared?limit=100')).json()).items as SharedAlbumRow[]).map((i) => i.album.id);

test.describe('Remove from library', () => {
  test('DELETE /tracks/shared/{id} drops the direct share but album-granted access survives', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E remove-track ${runId}`);
    const album = await (
      await apiContext.post('/albums', { data: { name: `E2E remove-track album ${runId}`, trackIds: [trackId] } })
    ).json();

    try {
      // The track is BOTH directly shared to B (shareCount 1) AND granted via the shared album
      expect((await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } })).status()).toBe(200);
      expect((await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } })).status()).toBe(200);

      // B can access it and it appears in B's direct-share list; owner sees shareCount 1
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);
      await expect.poll(async () => (await sharedTrackIds(apiContextB)).includes(trackId), { timeout: 15_000 }).toBe(true);
      expect((await (await apiContext.get(`/tracks/${trackId}`)).json()).shareCount).toBe(1);

      // B removes the track from their library
      expect((await apiContextB.delete(`/tracks/shared/${trackId}`)).status()).toBe(200);

      // Direct share is gone: dropped from B's shared list, owner shareCount decremented to 0
      await expect.poll(async () => (await sharedTrackIds(apiContextB)).includes(trackId), { timeout: 15_000 }).toBe(false);
      await expect.poll(async () => (await (await apiContext.get(`/tracks/${trackId}`)).json()).shareCount, { timeout: 15_000 }).toBe(0);

      // KEY: the album grant was never touched → B can STILL access the track via the album
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);

      // Idempotent: a second remove is a no-op and does not double-decrement shareCount
      expect((await apiContextB.delete(`/tracks/shared/${trackId}`)).status()).toBe(200);
      expect((await (await apiContext.get(`/tracks/${trackId}`)).json()).shareCount).toBe(0);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });

  test('DELETE /albums/shared/{id} revokes album access but a direct track share survives', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E remove-album ${runId}`);
    const album = await (
      await apiContext.post('/albums', { data: { name: `E2E remove-album ${runId}`, trackIds: [trackId] } })
    ).json();

    try {
      // The track is BOTH directly shared to B AND in the album shared to B
      expect((await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } })).status()).toBe(200);
      expect((await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } })).status()).toBe(200);

      // B is a recipient (album resolves) and it appears in B's shared-albums; owner sees shareCount 1
      expect((await apiContextB.get(`/albums/${album.id}`)).status()).toBe(200);
      await expect.poll(async () => (await sharedAlbumIds(apiContextB)).includes(album.id), { timeout: 15_000 }).toBe(true);
      expect((await (await apiContext.get(`/albums/${album.id}`)).json()).album.shareCount).toBe(1);

      // B removes the album from their library
      expect((await apiContextB.delete(`/albums/shared/${album.id}`)).status()).toBe(200);

      // Album access revoked: 404 for B, dropped from shared-albums, owner shareCount decremented to 0
      await expect.poll(async () => (await apiContextB.get(`/albums/${album.id}`)).status(), { timeout: 15_000 }).toBe(404);
      await expect.poll(async () => (await sharedAlbumIds(apiContextB)).includes(album.id), { timeout: 15_000 }).toBe(false);
      await expect.poll(async () => (await (await apiContext.get(`/albums/${album.id}`)).json()).album.shareCount, { timeout: 15_000 }).toBe(0);

      // KEY: the direct track share was never touched → B can STILL access the track
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);

      // Idempotent: a second remove is a no-op
      expect((await apiContextB.delete(`/albums/shared/${album.id}`)).status()).toBe(200);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
