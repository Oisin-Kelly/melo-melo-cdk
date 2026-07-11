import { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';

async function uploadUnsharedTrack(
  apiContext: APIRequestContext,
  runId: number
): Promise<string | null> {
  const fixture = findAudioFixture();
  if (!fixture) return null;

  const trackTitle = `E2E update track ${runId}`;
  const audioKey = `e2e/update-track/${runId}${fixture.extension}`;

  const presign = await apiContext.get(`/buckets/dropbox?key=${encodeURIComponent(audioKey)}`);
  const { url } = await presign.json();

  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': fixture.contentType },
    body: new Uint8Array(fixture.buffer),
  });

  const upload = await apiContext.post('/tracks/upload', {
    data: { trackTitle, audioKey }, // no sharedWith — deliberately unshared
  });
  if (upload.status() !== 202) return null;
  const { trackId } = await upload.json();

  // Poll the upload status until the processing pipeline settles
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

test.describe('PUT /tracks/{trackId}', () => {
  test('owner updates name, genre and description', async ({ apiContext }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    const trackId = tracks[0].id;
    const newName = `E2E renamed ${Date.now()}`;

    const update = await apiContext.put(`/tracks/${trackId}`, {
      data: { name: newName, genre: 'Ambient', description: 'updated by e2e' },
    });
    expect(update.status()).toBe(200);

    const body = await update.json();
    expect(body.trackName).toBe(newName);
    expect(body.genre).toBe('Ambient');
    expect(body.description).toBe('updated by e2e');

    const fetched = await apiContext.get(`/tracks/${trackId}`);
    expect((await fetched.json()).trackName).toBe(newName);
  });

  test('returns 400 when name is missing', async ({ apiContext }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    const res = await apiContext.put(`/tracks/${tracks[0].id}`, {
      data: { genre: 'no name provided' },
    });
    expect(res.status()).toBe(400);
  });

  test('non-owner cannot update a track', async ({ apiContext, apiContextB }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    const res = await apiContextB.put(`/tracks/${tracks[0].id}`, {
      data: { name: 'hijacked' },
    });
    expect(res.status()).toBe(404);
  });

  test('returns 404 for a nonexistent track', async ({ apiContext }) => {
    const res = await apiContext.put('/tracks/nonexistent-track-xyz', {
      data: { name: 'ghost' },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('POST /tracks/{trackId}/share', () => {
  test('share grants access, unshare revokes it per recipient', async ({
    apiContext,
    apiContextB,
    apiContextC,
    userB,
    userC,
  }) => {
    test.setTimeout(180_000); // upload pipeline can exceed the default 30s under parallel load

    const runId = Date.now();
    const trackId = await uploadUnsharedTrack(apiContext, runId);
    expect(trackId, 'unshared track should be processed').not.toBeNull();

    // Sanity: neither B nor C can access it yet (metadata or audio segments)
    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(404);
    expect((await apiContextB.get(`/tracks/${trackId}/segments`)).status()).toBe(404);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(404);

    // Share with B and C in one call
    const share = await apiContext.post(`/tracks/${trackId}/share`, {
      data: { add: [userB.username, userC.username], caption: 'shared later by e2e' },
    });
    expect(share.status()).toBe(200);
    const sharedWith = (await share.json()).sharedWith;
    expect(sharedWith).toContain(userB.username);
    expect(sharedWith).toContain(userC.username);

    // Both now have access (metadata and audio segments)
    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);
    expect((await apiContextB.get(`/tracks/${trackId}/segments`)).status()).toBe(200);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(200);

    // Re-adding is idempotent
    const reshare = await apiContext.post(`/tracks/${trackId}/share`, {
      data: { add: [userB.username] },
    });
    expect(reshare.status()).toBe(200);
    const resharedWith = (await reshare.json()).sharedWith;
    expect(resharedWith.filter((u: string) => u === userB.username)).toHaveLength(1);

    // Unsharing B revokes only B — C's access must survive
    const unshare = await apiContext.post(`/tracks/${trackId}/share`, {
      data: { remove: [userB.username] },
    });
    expect(unshare.status()).toBe(200);
    const afterRemove = (await unshare.json()).sharedWith;
    expect(afterRemove).not.toContain(userB.username);
    expect(afterRemove).toContain(userC.username);
    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(404);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(200);

    // Removing C revokes the last direct share
    await apiContext.post(`/tracks/${trackId}/share`, { data: { remove: [userC.username] } });
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(404);
  });

  test('returns 400 when add and remove are both empty', async ({ apiContext }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    const res = await apiContext.post(`/tracks/${tracks[0].id}/share`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('non-owner cannot share a track', async ({ apiContext, apiContextB, user }) => {
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available — run the upload spec first');

    const res = await apiContextB.post(`/tracks/${tracks[0].id}/share`, {
      data: { add: [user.username] },
    });
    expect(res.status()).toBe(404);
  });
});
