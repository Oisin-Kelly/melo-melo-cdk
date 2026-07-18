import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// GET /feed — unified home feed of tracks + albums shared with the viewer, with
// an optional type filter. Feed items are written on share and removed on unshare/delete.

type FeedEntry = {
  type: string;
  sender: { username: string };
  track?: { id: string };
  album?: { id: string };
};

test.describe('GET /feed', () => {
  test('aggregates shared tracks and albums, filters by type, and cleans up on unshare', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    const [feedTrack, albumTrack] = await Promise.all([
      uploadTrack(apiContext, `E2E feed track ${runId}`),
      uploadTrack(apiContext, `E2E feed album track ${runId}`),
    ]);

    const albumRes = await apiContext.post('/albums', {
      data: { name: `E2E feed album ${runId}`, trackIds: [albumTrack] },
    });
    const album = await albumRes.json();

    const feedIds = async (queryString = '') => {
      const res = await apiContextB.get(`/feed${queryString}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect('nextCursor' in body).toBe(true);
      return body.items as FeedEntry[];
    };

    try {
      // Share the track and the album with B
      expect(
        (await apiContext.post(`/tracks/${feedTrack}/share`, { data: { add: [userB.username] } })).status()
      ).toBe(200);
      expect(
        (await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } })).status()
      ).toBe(200);

      // Both appear in B's feed
      const all = await feedIds();
      const trackEntry = all.find((e) => e.type === 'TRACK' && e.track?.id === feedTrack);
      const albumEntry = all.find((e) => e.type === 'ALBUM' && e.album?.id === album.id);
      expect(trackEntry).toBeTruthy();
      expect(albumEntry).toBeTruthy();
      expect(trackEntry!.sender.username).toBe(user.username);

      // Sender is a slim UserSummary — no counts/settings; rows are summaries with
      // likedByMe but never the owner-only counts
      expect(trackEntry!.sender.incomingShares).toBeUndefined();
      expect(trackEntry!.sender.followerCount).toBeUndefined();
      expect(typeof trackEntry!.track.likedByMe).toBe('boolean');
      expect(trackEntry!.track.shareCount).toBeUndefined();
      expect(trackEntry!.track.likeCount).toBeUndefined();
      expect(albumEntry!.album.trackCount).toBe(1);

      // type filter
      const onlyTracks = await feedIds('?type=TRACK');
      expect(onlyTracks.every((e) => e.type === 'TRACK')).toBe(true);
      expect(onlyTracks.some((e) => e.track?.id === feedTrack)).toBe(true);
      expect(onlyTracks.some((e) => e.album?.id === album.id)).toBe(false);

      const onlyAlbums = await feedIds('?type=ALBUM');
      expect(onlyAlbums.every((e) => e.type === 'ALBUM')).toBe(true);
      expect(onlyAlbums.some((e) => e.album?.id === album.id)).toBe(true);

      // invalid type → 400
      expect((await apiContextB.get('/feed?type=PLAYLIST')).status()).toBe(400);

      // Unshare the track → it leaves the feed, album stays
      expect(
        (await apiContext.post(`/tracks/${feedTrack}/share`, { data: { remove: [userB.username] } })).status()
      ).toBe(200);
      const afterUnshare = await feedIds();
      expect(afterUnshare.some((e) => e.track?.id === feedTrack)).toBe(false);
      expect(afterUnshare.some((e) => e.album?.id === album.id)).toBe(true);

      // Delete the album → it leaves the feed too
      expect((await apiContext.delete(`/albums/${album.id}`)).status()).toBe(200);
      const afterDelete = await feedIds();
      expect(afterDelete.some((e) => e.album?.id === album.id)).toBe(false);
    } finally {
      await apiContext.delete(`/albums/${album.id}`).catch(() => {});
      await apiContext.delete(`/tracks/${feedTrack}`);
      await apiContext.delete(`/tracks/${albumTrack}`);
    }
  });

  test('a track shared at upload time lands in the feed', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    // Exercises CreateTrackAsync's feed write (distinct from POST /tracks/{id}/share)
    const trackId = await uploadTrack(apiContext, `E2E feed at upload ${Date.now()}`, [userB.username]);

    try {
      const res = await apiContextB.get('/feed?type=TRACK');
      expect(res.status()).toBe(200);
      const items = (await res.json()).items as FeedEntry[];
      expect(items.some((e) => e.track?.id === trackId)).toBe(true);
    } finally {
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });

  test('profile shows how many tracks a user has shared with you', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const trackId = await uploadTrack(apiContext, `E2E profile count ${Date.now()}`);

    try {
      // Before sharing, B sees own profile without the count, and A's profile count is 0-based
      const ownProfile = await (await apiContextB.get(`/users/${userB.username}`)).json();
      expect(ownProfile.sharedWithYouCount).toBeUndefined(); // own profile: no count

      await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } });

      const aProfile = await (await apiContextB.get(`/users/${user.username}`)).json();
      expect(aProfile.sharedWithYouCount).toBeGreaterThanOrEqual(1);
    } finally {
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
