import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// GET /activity — recipient-perspective feed: likes on your tracks and shares to
// you. POST /me/activity-seen bumps the unread marker.

type Activity = {
  type: string;
  actor: { username: string };
  targetType: string;
  targetId: string;
  targetName?: string;
};

test.describe('Activity feed', () => {
  test('records likes and shares from the recipient perspective', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    // A track shared to B at upload (TRACK_SHARED → B), plus tracks for the album
    const [sharedTrack, albumTrack1, albumTrack2] = await Promise.all([
      uploadTrack(apiContext, `E2E activity shared ${runId}`, [userB.username]),
      uploadTrack(apiContext, `E2E activity album1 ${runId}`),
      uploadTrack(apiContext, `E2E activity album2 ${runId}`),
    ]);

    const album = await (
      await apiContext.post('/albums', { data: { name: `E2E activity album ${runId}`, trackIds: [albumTrack1] } })
    ).json();

    const activityA = async () => (await (await apiContext.get('/activity')).json()).items as Activity[];
    const activityB = async () => (await (await apiContextB.get('/activity')).json()).items as Activity[];

    try {
      // TRACK_SHARED reached B (from the upload sharedWith)
      const shared = (await activityB()).find(
        (a) => a.type === 'TRACK_SHARED' && a.targetId === sharedTrack
      );
      expect(shared).toBeTruthy();
      expect(shared!.actor.username).toBe(user.username);
      expect(shared!.targetName).toBeTruthy();

      // A shares an already-uploaded track via POST → TRACK_SHARED reaches B
      // (exercises ShareTrackAsync's activity write, distinct from the upload path)
      await apiContext.post(`/tracks/${albumTrack1}/share`, { data: { add: [userB.username] } });
      expect((await activityB()).some((a) => a.type === 'TRACK_SHARED' && a.targetId === albumTrack1)).toBe(true);

      // B likes A's track → TRACK_LIKED reaches A (the owner)
      await apiContextB.post(`/tracks/${sharedTrack}/like`, { data: { newValue: true } });
      const liked = (await activityA()).find((a) => a.type === 'TRACK_LIKED' && a.targetId === sharedTrack);
      expect(liked).toBeTruthy();
      expect(liked!.actor.username).toBe(userB.username);

      // A likes their OWN track → no self-echo
      await apiContext.post(`/tracks/${albumTrack1}/like`, { data: { newValue: true } });
      expect((await activityA()).some((a) => a.type === 'TRACK_LIKED' && a.targetId === albumTrack1)).toBe(false);

      // A shares the album with B → ALBUM_SHARED reaches B
      await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } });
      expect((await activityB()).some((a) => a.type === 'ALBUM_SHARED' && a.targetId === album.id)).toBe(true);

      // A adds a track to the shared album → B gains access but gets no activity row
      await apiContext.put(`/albums/${album.id}/tracks`, {
        data: { trackIds: [albumTrack1, albumTrack2] },
      });
      expect((await activityB()).some((a) => a.type === 'ALBUM_TRACKS_ADDED')).toBe(false);

      // B likes A's album → ALBUM_LIKED reaches A (the owner), with the album name
      await apiContextB.post(`/albums/${album.id}/like`, { data: { newValue: true } });
      const albumLiked = (await activityA()).find(
        (a) => a.type === 'ALBUM_LIKED' && a.targetId === album.id
      );
      expect(albumLiked).toBeTruthy();
      expect(albumLiked!.actor.username).toBe(userB.username);
      expect(albumLiked!.targetName).toBeTruthy();

      // activity-seen marker is private and bumped
      await apiContextB.post('/me/activity-seen', { data: {} });
      const bProfile = await (await apiContextB.get(`/users/${userB.username}`)).json();
      expect(typeof bProfile.activitySeenAt).toBe('number');
      const bFromA = await (await apiContext.get(`/users/${userB.username}`)).json();
      expect(bFromA.activitySeenAt).toBeUndefined();
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${sharedTrack}`);
      await apiContext.delete(`/tracks/${albumTrack1}`);
      await apiContext.delete(`/tracks/${albumTrack2}`);
    }
  });

  // The feed is a live snapshot: a row survives only while the relationship that produced it
  // still exists. Undoing the share (remove-from-library) or the like must drop the row.
  test('is a live snapshot — undoing the share or like removes the row', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const activityA = async () => (await (await apiContext.get('/activity')).json()).items as Activity[];
    const activityB = async () => (await (await apiContextB.get('/activity')).json()).items as Activity[];
    const hasShare = async (id: string) =>
      (await activityB()).some((a) => a.type === 'TRACK_SHARED' && a.targetId === id);
    const hasLike = async (id: string) =>
      (await activityA()).some((a) => a.type === 'TRACK_LIKED' && a.targetId === id);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E activity-live ${runId}`);

    try {
      // Share → B's feed shows TRACK_SHARED.
      await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } });
      await expect.poll(() => hasShare(trackId), { timeout: 15_000 }).toBe(true);

      // B removes it from their library → the share row disappears (relationship gone).
      expect((await apiContextB.delete(`/tracks/shared/${trackId}`)).status()).toBe(200);
      await expect.poll(() => hasShare(trackId), { timeout: 15_000 }).toBe(false);

      // Re-share so B can access + like it → A's feed shows TRACK_LIKED.
      await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } });
      await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: true } });
      await expect.poll(() => hasLike(trackId), { timeout: 15_000 }).toBe(true);

      // B unlikes → the like row disappears (relationship gone), even though the track still exists.
      await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: false } });
      await expect.poll(() => hasLike(trackId), { timeout: 15_000 }).toBe(false);
    } finally {
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
