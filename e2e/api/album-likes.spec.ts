import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Album likes mirror track likes: like record + owner-only likeCount + likedByMe,
// idempotent toggle, owner-only likers list, and a "liked albums" listing.

test.describe('Album likes', () => {
  test('like → likedByMe/likeCount → likers → liked list → unlike, idempotent and access-gated', async ({
    apiContext,
    apiContextB,
    apiContextC,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E album-like track ${runId}`);

    const album = await (
      await apiContext.post('/albums', { data: { name: `E2E album likes ${runId}`, trackIds: [trackId] } })
    ).json();

    try {
      // Not shared with C → C cannot like it
      expect(
        (await apiContextC.post(`/albums/${album.id}/like`, { data: { newValue: true } })).status()
      ).toBe(404);

      // Share with B, B likes it
      await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } });
      expect(
        (await apiContextB.post(`/albums/${album.id}/like`, { data: { newValue: true } })).status()
      ).toBe(200);

      // Idempotent — liking again keeps the count at 1
      await apiContextB.post(`/albums/${album.id}/like`, { data: { newValue: true } });

      // B sees likedByMe true, no likeCount (not owner)
      const bView = (await (await apiContextB.get(`/albums/${album.id}`)).json()).album;
      expect(bView.likedByMe).toBe(true);
      expect(bView.likeCount).toBeUndefined();

      // Owner sees likeCount 1
      const ownerView = (await (await apiContext.get(`/albums/${album.id}`)).json()).album;
      expect(ownerView.likeCount).toBe(1);

      // Owner-only likers list includes B; non-owner gets 404
      const likers = await (await apiContext.get(`/albums/${album.id}/likes`)).json();
      expect(likers.items.map((l: { user: { username: string } }) => l.user.username)).toContain(userB.username);
      expect((await apiContextB.get(`/albums/${album.id}/likes`)).status()).toBe(404);

      // B's liked-albums listing includes it
      const liked = await (await apiContextB.get('/albums/liked')).json();
      expect(liked.items.map((a: { id: string }) => a.id)).toContain(album.id);

      // Unlike → count back to 0, likedByMe false
      expect(
        (await apiContextB.post(`/albums/${album.id}/like`, { data: { newValue: false } })).status()
      ).toBe(200);
      expect((await (await apiContext.get(`/albums/${album.id}`)).json()).album.likeCount).toBe(0);
      expect((await (await apiContextB.get(`/albums/${album.id}`)).json()).album.likedByMe).toBe(false);
      expect(
        (await (await apiContextB.get('/albums/liked')).json()).items.map((a: { id: string }) => a.id)
      ).not.toContain(album.id);

      // newValue required
      expect((await apiContextB.post(`/albums/${album.id}/like`, { data: {} })).status()).toBe(400);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
