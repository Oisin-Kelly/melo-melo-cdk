import { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';

async function uploadUnsharedTrack(
  apiContext: APIRequestContext,
  runId: number
): Promise<string | null> {
  const fixture = findAudioFixture();
  if (!fixture) return null;

  const trackTitle = `E2E delete track ${runId}`;
  const audioKey = `e2e/delete-track/${runId}${fixture.extension}`;

  const presign = await apiContext.get(`/buckets/dropbox?key=${encodeURIComponent(audioKey)}`);
  const { url } = await presign.json();

  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': fixture.contentType },
    body: new Uint8Array(fixture.buffer),
  });

  const upload = await apiContext.post('/tracks/upload', {
    data: { trackTitle, audioKey },
  });
  if (upload.status() !== 202) return null;
  const { trackId } = await upload.json();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await apiContext.get(`/tracks/uploads/${trackId}`);
    const { status } = await res.json();
    if (status === 'COMPLETE') return trackId;
    if (status === 'FAILED') return null;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

test.describe('DELETE /tracks/{trackId}', () => {
  test('removes the track and its entire footprint', async ({
    apiContext,
    apiContextB,
    apiContextC,
    userB,
    userC,
  }) => {
    test.skip(!findAudioFixture(), 'No audio fixture — add e2e/fixtures/assets/sample.mp3');
    test.setTimeout(300_000);

    const runId = Date.now();
    const trackId = await uploadUnsharedTrack(apiContext, runId);
    expect(trackId, 'track should be processed').not.toBeNull();

    // Build up the full footprint: direct share with B (who likes it), and album
    // shared with C (derived access)
    expect(
      (await apiContext.post(`/tracks/${trackId}/share`, { data: { add: [userB.username] } })).status()
    ).toBe(200);
    expect(
      (await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: true } })).status()
    ).toBe(200);

    const albumRes = await apiContext.post('/albums', {
      data: { name: `E2E delete album ${runId}`, trackIds: [trackId] },
    });
    expect(albumRes.status()).toBe(201);
    const album = await albumRes.json();
    expect(
      (await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userC.username] } })).status()
    ).toBe(200);

    // Sanity: everyone can currently reach the track
    expect((await apiContext.get(`/tracks/${trackId}`)).status()).toBe(200);
    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(200);

    // Delete
    const del = await apiContext.delete(`/tracks/${trackId}`);
    expect(del.status()).toBe(200);

    // Gone for everyone, via every route
    for (const ctx of [apiContext, apiContextB, apiContextC]) {
      expect((await ctx.get(`/tracks/${trackId}`)).status()).toBe(404);
    }
    expect((await apiContext.get(`/tracks/${trackId}/segments`)).status()).toBe(404);
    expect((await apiContext.get(`/tracks/${trackId}/likes`)).status()).toBe(404);
    expect((await apiContext.get(`/tracks/uploads/${trackId}`)).status()).toBe(404);

    // Gone from B's shared feed and from the owner's track list
    const sharedForB = await apiContextB.get('/tracks/shared');
    const sharedIds = (await sharedForB.json()).items.map(
      (s: { track: { id: string } }) => s.track.id
    );
    expect(sharedIds).not.toContain(trackId);

    const ownTracks = await apiContext.get('/tracks');
    expect((await ownTracks.json()).items.map((t: { id: string }) => t.id)).not.toContain(trackId);

    // The album survives, just without the track
    const albumAfter = await apiContext.get(`/albums/${album.id}`);
    expect(albumAfter.status()).toBe(200);
    expect((await albumAfter.json()).tracks.items.map((t: { id: string }) => t.id)).not.toContain(
      trackId
    );

    await apiContext.delete(`/albums/${album.id}`);
  });

  test('non-owner cannot delete a track', async ({ apiContext, apiContextB }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    expect((await apiContextB.delete(`/tracks/${tracks[0].id}`)).status()).toBe(404);
    // Still there for the owner
    expect((await apiContext.get(`/tracks/${tracks[0].id}`)).status()).toBe(200);
  });

  test('returns 404 for a nonexistent track', async ({ apiContext }) => {
    const res = await apiContext.delete('/tracks/nonexistent-track-xyz');
    expect(res.status()).toBe(404);
  });
});
