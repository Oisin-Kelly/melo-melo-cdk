import { test, expect } from '../fixtures/users';

// Uses a track of userA's that is already shared with userB (created by upload.spec's
// pipeline test on an earlier run). Skips gracefully when none exists yet.

test.describe('Track likes', () => {
  test('like → owner sees liker → idempotent → unlike', async ({
    apiContext,
    apiContextB,
    apiContextC,
    user,
    userB,
    userC,
  }) => {
    const shared = await apiContextB.get('/tracks/shared');
    const sharedItems = (await shared.json()).items;
    test.skip(sharedItems.length === 0, 'no shared tracks yet — run the upload spec first');

    const trackId = sharedItems[0].track.id;

    // Liking requires access — A shares the track with C too (idempotent if already shared)
    const grantC = await apiContext.post(`/tracks/${trackId}/share`, {
      data: { add: [userC.username] },
    });
    expect(grantC.status()).toBe(200);

    // B and C both like the track
    for (const ctx of [apiContextB, apiContextC]) {
      const like = await ctx.post(`/tracks/${trackId}/like`, { data: { newValue: true } });
      expect(like.status()).toBe(200);
      expect((await like.json()).newValue).toBe(true);

      // Each sees likedByMe (but no likeCount — they are not the owner)
      const trackBody = await (await ctx.get(`/tracks/${trackId}`)).json();
      expect(trackBody.likedByMe).toBe(true);
      expect(trackBody.likeCount).toBeUndefined();
    }

    // Owner (A) sees the like count and both likers
    const likesForA = await apiContext.get(`/tracks/${trackId}/likes`);
    expect(likesForA.status()).toBe(200);
    const likesBody = await likesForA.json();
    const countBoth = likesBody.likeCount;
    expect(countBoth).toBeGreaterThanOrEqual(2);
    const likers = likesBody.items.map((l: { user: { username: string } }) => l.user.username);
    expect(likers).toContain(userB.username);
    expect(likers).toContain(userC.username);

    // The track appears in B's likes playlist
    const likesPlaylist = await apiContextB.get('/playlists/likes');
    expect(likesPlaylist.status()).toBe(200);
    const likesPlaylistBody = await likesPlaylist.json();
    expect(likesPlaylistBody.playlist.type).toBe('LIKES');
    expect(likesPlaylistBody.tracks.items.map((t: { id: string }) => t.id)).toContain(trackId);

    // Double-like is idempotent — count unchanged
    await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: true } });
    const afterDouble = await apiContext.get(`/tracks/${trackId}/likes`);
    expect((await afterDouble.json()).likeCount).toBe(countBoth);

    // B unlikes — C's like must survive
    const unlike = await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: false } });
    expect(unlike.status()).toBe(200);

    const afterUnlike = await apiContext.get(`/tracks/${trackId}/likes`);
    const afterUnlikeBody = await afterUnlike.json();
    expect(afterUnlikeBody.likeCount).toBe(countBoth - 1);
    const likersAfter = afterUnlikeBody.items.map(
      (l: { user: { username: string } }) => l.user.username
    );
    expect(likersAfter).not.toContain(userB.username);
    expect(likersAfter).toContain(userC.username);

    expect((await (await apiContextB.get(`/tracks/${trackId}`)).json()).likedByMe).toBe(false);

    // C unlikes too — back to the starting count
    await apiContextC.post(`/tracks/${trackId}/like`, { data: { newValue: false } });
    const afterBoth = await apiContext.get(`/tracks/${trackId}/likes`);
    expect((await afterBoth.json()).likeCount).toBe(countBoth - 2);
  });

  test('non-owner cannot view track likes', async ({ apiContextB }) => {
    const shared = await apiContextB.get('/tracks/shared');
    const sharedItems = (await shared.json()).items;
    test.skip(sharedItems.length === 0, 'no shared tracks yet — run the upload spec first');

    const res = await apiContextB.get(`/tracks/${sharedItems[0].track.id}/likes`);
    expect(res.status()).toBe(404);
  });

  test('returns 400 when newValue is missing', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/some-track-id/like', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('returns 404 when liking a nonexistent track', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/nonexistent-track-xyz/like', {
      data: { newValue: true },
    });
    expect(res.status()).toBe(404);
  });
});
