import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// A custom playlist keeps tracks that become unavailable as removable placeholders
// (reason DELETED when the track is gone, REVOKED when access was withdrawn) rather
// than silently dropping them.

type Entry = { trackId: string; unavailable: boolean; reason?: string; track?: { id: string }; name: string };

test.describe('Playlist dead-track placeholders', () => {
  test('a deleted own track becomes a DELETED placeholder, still removable', async ({ apiContext }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E placeholder track ${runId}`);
    const playlist = await (
      await apiContext.post('/playlists', { data: { name: `E2E placeholders ${runId}` } })
    ).json();

    const entries = async () =>
      (await (await apiContext.get(`/playlists/${playlist.id}`)).json()).tracks.items as Entry[];

    try {
      await apiContext.post(`/playlists/${playlist.id}/tracks/${trackId}`);
      expect((await entries()).find((e) => e.trackId === trackId)?.unavailable).toBe(false);

      // Delete the track → placeholder with reason DELETED, name still rendered
      expect((await apiContext.delete(`/tracks/${trackId}`)).status()).toBe(200);
      const placeholder = (await entries()).find((e) => e.trackId === trackId);
      expect(placeholder?.unavailable).toBe(true);
      expect(placeholder?.reason).toBe('DELETED');
      expect(placeholder?.track).toBeUndefined();
      expect(placeholder?.name).toBeTruthy();

      // trackCount still includes the placeholder
      const pl = (await (await apiContext.get(`/playlists/${playlist.id}`)).json()).playlist;
      expect(pl.trackCount).toBe(1);

      // Removable (delete has no access check — the track is gone)
      await apiContext.delete(`/playlists/${playlist.id}/tracks/${trackId}`);
      expect((await entries()).some((e) => e.trackId === trackId)).toBe(false);
    } finally {
      await apiContext.delete(`/playlists/${playlist.id}`);
    }
  });

  test('a track whose access is revoked becomes a REVOKED placeholder', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    // A shares a track with B; B puts it in their own playlist
    const trackId = await uploadTrack(apiContext, `E2E revoke track ${runId}`, [userB.username]);
    const playlist = await (
      await apiContextB.post('/playlists', { data: { name: `E2E revoke ${runId}` } })
    ).json();

    const bEntries = async () =>
      (await (await apiContextB.get(`/playlists/${playlist.id}`)).json()).tracks.items as Entry[];

    try {
      await apiContextB.post(`/playlists/${playlist.id}/tracks/${trackId}`);
      expect((await bEntries()).find((e) => e.trackId === trackId)?.unavailable).toBe(false);

      // A revokes B's access → B's playlist entry becomes REVOKED
      expect(
        (await apiContext.post(`/tracks/${trackId}/share`, { data: { remove: [userB.username] } })).status()
      ).toBe(200);

      const placeholder = (await bEntries()).find((e) => e.trackId === trackId);
      expect(placeholder?.unavailable).toBe(true);
      expect(placeholder?.reason).toBe('REVOKED');
      expect(placeholder?.track).toBeUndefined();
    } finally {
      await apiContextB.delete(`/playlists/${playlist.id}`);
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });
});
