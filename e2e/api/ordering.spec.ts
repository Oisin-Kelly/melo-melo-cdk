import { test, expect } from '../fixtures/auth';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Creation preserves request order; single playlist adds append at the end and
// re-adding an existing member is a no-op; the PUT tracklist saves are the
// explicit reorder mechanism (albums: adds/removes/reorder in one declarative
// save; playlists: reorder + remove only, addedAt preserved).

test.describe('Track ordering and declarative saves', () => {
  test('album PUT reorders, adds and removes in one save', async ({ apiContext }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    const [t1, t2, t3] = await Promise.all([
      uploadTrack(apiContext, `E2E order A ${runId}`),
      uploadTrack(apiContext, `E2E order B ${runId}`),
      uploadTrack(apiContext, `E2E order C ${runId}`),
    ]);

    const create = await apiContext.post('/albums', {
      data: { name: `E2E ordering ${runId}`, trackIds: [t1, t2] },
    });
    expect(create.status()).toBe(201);
    const album = await create.json();

    try {
      const albumIds = async () => {
        const detail = await apiContext.get(`/albums/${album.id}`);
        return (await detail.json()).tracks.items.map((t: { id: string }) => t.id);
      };
      expect(await albumIds()).toEqual([t1, t2]);

      // Reorder alone: same members, new order
      const reorder = await apiContext.put(`/albums/${album.id}/tracks`, {
        data: { trackIds: [t2, t1] },
      });
      expect(reorder.status()).toBe(200);
      expect(await reorder.json()).toMatchObject({ trackCount: 2, added: 0, removed: 0 });
      expect(await albumIds()).toEqual([t2, t1]);

      // One save: add t3, drop t2, reorder the rest
      const save = await apiContext.put(`/albums/${album.id}/tracks`, {
        data: { trackIds: [t3, t1] },
      });
      expect(save.status()).toBe(200);
      expect(await save.json()).toMatchObject({ trackCount: 2, added: 1, removed: 1 });
      expect(await albumIds()).toEqual([t3, t1]);

      // Someone else's / unknown track → 400
      const bad = await apiContext.put(`/albums/${album.id}/tracks`, {
        data: { trackIds: [t1, 'not-a-real-track'] },
      });
      expect(bad.status()).toBe(400);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${t1}`);
      await apiContext.delete(`/tracks/${t2}`);
      await apiContext.delete(`/tracks/${t3}`);
    }
  });

  test('playlist adds append, re-add is a no-op, PUT reorders and removes', async ({
    apiContext,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    const [t1, t2] = await Promise.all([
      uploadTrack(apiContext, `E2E order pl A ${runId}`),
      uploadTrack(apiContext, `E2E order pl B ${runId}`),
    ]);

    const pCreate = await apiContext.post('/playlists', {
      data: { name: `E2E ordering pl ${runId}` },
    });
    expect(pCreate.status()).toBe(201);
    const playlist = await pCreate.json();

    try {
      const entries = async () =>
        (await (await apiContext.get(`/playlists/${playlist.id}`)).json()).tracks.items as {
          trackId: string;
          addedAt: number;
        }[];
      const playlistIds = async () => (await entries()).map((e) => e.trackId);

      // Sequential single adds append in call order
      expect((await apiContext.post(`/playlists/${playlist.id}/tracks/${t1}`)).status()).toBe(200);
      expect((await apiContext.post(`/playlists/${playlist.id}/tracks/${t2}`)).status()).toBe(200);
      expect(await playlistIds()).toEqual([t1, t2]);
      const t1AddedAt = (await entries()).find((e) => e.trackId === t1)!.addedAt;

      // Re-adding an existing member is a no-op: position and addedAt kept
      const readd = await apiContext.post(`/playlists/${playlist.id}/tracks/${t1}`);
      expect(readd.status()).toBe(200);
      expect(await readd.json()).toMatchObject({ added: false });
      expect(await playlistIds()).toEqual([t1, t2]);

      // PUT reorders; addedAt survives the rank rewrite
      const reorder = await apiContext.put(`/playlists/${playlist.id}/tracks`, {
        data: { trackIds: [t2, t1] },
      });
      expect(reorder.status()).toBe(200);
      expect(await reorder.json()).toMatchObject({ trackCount: 2, removed: 0 });
      expect(await playlistIds()).toEqual([t2, t1]);
      expect((await entries()).find((e) => e.trackId === t1)!.addedAt).toBe(t1AddedAt);

      // Omitting a member removes it
      const shrink = await apiContext.put(`/playlists/${playlist.id}/tracks`, {
        data: { trackIds: [t1] },
      });
      expect(shrink.status()).toBe(200);
      expect(await shrink.json()).toMatchObject({ trackCount: 1, removed: 1 });
      expect(await playlistIds()).toEqual([t1]);

      // The PUT is reorder/remove only — a non-member id is a 400, not an add
      const bad = await apiContext.put(`/playlists/${playlist.id}/tracks`, {
        data: { trackIds: [t1, t2] },
      });
      expect(bad.status()).toBe(400);
    } finally {
      await apiContext.delete(`/playlists/${playlist.id}`);
      await apiContext.delete(`/tracks/${t1}`);
      await apiContext.delete(`/tracks/${t2}`);
    }
  });
});
