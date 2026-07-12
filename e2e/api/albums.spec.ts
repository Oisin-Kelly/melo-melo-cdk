import { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { putToDropbox, readImageFixture } from '../fixtures/dropbox';

async function uploadUnsharedTrack(
  apiContext: APIRequestContext,
  runId: number
): Promise<string | null> {
  const fixture = findAudioFixture();
  if (!fixture) return null;

  const trackTitle = `E2E album track ${runId}`;
  const audioKey = `e2e/albums/${runId}${fixture.extension}`;

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

test.describe('Album CRUD', () => {
  test('create → list → get → update → delete', async ({ apiContext }) => {
    const name = `E2E album ${Date.now()}`;

    const create = await apiContext.post('/albums', { data: { name, description: 'e2e album' } });
    expect(create.status()).toBe(201);
    const album = await create.json();
    expect(album.name).toBe(name);
    expect(album.id).toBeTruthy();

    const list = await apiContext.get('/albums');
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect('nextCursor' in listBody).toBe(true);
    expect(listBody.items.map((a: { id: string }) => a.id)).toContain(album.id);

    const detail = await apiContext.get(`/albums/${album.id}`);
    expect(detail.status()).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.album.id).toBe(album.id);
    expect(Array.isArray(detailBody.tracks.items)).toBe(true);

    const update = await apiContext.put(`/albums/${album.id}`, { data: { name: `${name} v2` } });
    expect(update.status()).toBe(200);
    expect((await update.json()).name).toBe(`${name} v2`);

    const del = await apiContext.delete(`/albums/${album.id}`);
    expect(del.status()).toBe(200);

    const after = await apiContext.get(`/albums/${album.id}`);
    expect(after.status()).toBe(404);
  });

  test('returns 400 when name is missing', async ({ apiContext }) => {
    const res = await apiContext.post('/albums', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when adding a track you do not own', async ({ apiContext }) => {
    const res = await apiContext.post('/albums', {
      data: { name: `E2E not-owned ${Date.now()}`, trackIds: ['not-my-track-xyz'] },
    });
    expect(res.status()).toBe(400);
  });

  test('recipient cannot modify a shared album', async ({ apiContext, apiContextB, userB }) => {
    const create = await apiContext.post('/albums', { data: { name: `E2E authz ${Date.now()}` } });
    const album = await create.json();

    await apiContext.post(`/albums/${album.id}/share`, { data: { add: [userB.username] } });

    // B can see it but cannot rename, delete, or share it
    expect((await apiContextB.get(`/albums/${album.id}`)).status()).toBe(200);
    expect((await apiContextB.put(`/albums/${album.id}`, { data: { name: 'x' } })).status()).toBe(404);
    expect((await apiContextB.delete(`/albums/${album.id}`)).status()).toBe(404);
    expect(
      (await apiContextB.post(`/albums/${album.id}/share`, { data: { add: ['someone'] } })).status()
    ).toBe(404);

    await apiContext.delete(`/albums/${album.id}`);
  });
});

test.describe('Album sharing grants track access', () => {
  test('share → derived access → unshare → delete revokes', async ({
    apiContext,
    apiContextB,
    apiContextC,
    userB,
    userC,
  }) => {
    test.skip(!findAudioFixture(), 'No audio fixture — add e2e/fixtures/assets/sample.mp3');
    test.setTimeout(300_000);

    const runId = Date.now();

    // A uploads a track NOT shared with anyone
    const trackId = await uploadUnsharedTrack(apiContext, runId);
    expect(trackId, 'unshared track should be processed').not.toBeNull();

    // Sanity: neither B nor C can access it
    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(404);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(404);

    // A creates an album containing it and shares the album with B and C
    const create = await apiContext.post('/albums', {
      data: { name: `E2E shared album ${runId}`, trackIds: [trackId] },
    });
    expect(create.status()).toBe(201);
    const album = await create.json();

    const share = await apiContext.post(`/albums/${album.id}/share`, {
      data: { add: [userB.username, userC.username] },
    });
    expect(share.status()).toBe(200);
    const sharedWith = (await share.json()).sharedWith;
    expect(sharedWith).toContain(userB.username);
    expect(sharedWith).toContain(userC.username);

    // Both see the album in their shared feed, with the track, and can access the track
    for (const ctx of [apiContextB, apiContextC]) {
      const sharedAlbums = await ctx.get('/albums/shared');
      expect(sharedAlbums.status()).toBe(200);
      const sharedAlbumsBody = await sharedAlbums.json();
      expect(sharedAlbumsBody.items.map((s: { album: { id: string } }) => s.album.id)).toContain(album.id);

      const albumDetail = await ctx.get(`/albums/${album.id}`);
      expect(albumDetail.status()).toBe(200);
      expect((await albumDetail.json()).tracks.items.map((t: { id: string }) => t.id)).toContain(trackId);

      expect((await ctx.get(`/tracks/${trackId}`)).status()).toBe(200);
    }

    // Unshare from B only — B's derived access revoked, C's grant records untouched
    const unshare = await apiContext.post(`/albums/${album.id}/share`, {
      data: { remove: [userB.username] },
    });
    expect(unshare.status()).toBe(200);

    expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(404);
    expect((await apiContextB.get(`/albums/${album.id}`)).status()).toBe(404);
    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(200);
    expect((await apiContextC.get(`/albums/${album.id}`)).status()).toBe(200);

    // Delete the album — C's derived access is revoked too
    const del = await apiContext.delete(`/albums/${album.id}`);
    expect(del.status()).toBe(200);

    expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(404);
    expect((await apiContextC.get(`/albums/${album.id}`)).status()).toBe(404);

    // The owner still has the track — only derived access was revoked
    expect((await apiContext.get(`/tracks/${trackId}`)).status()).toBe(200);
  });
});

test.describe('Album cover images', () => {
  test('create with imageKey → cover on album and detail → clearedImage removes it', async ({
    apiContext,
  }) => {
    const runId = Date.now();
    const imageKey = `e2e/albums/${runId}-cover.jpg`;
    await putToDropbox(apiContext, imageKey, readImageFixture(), 'image/jpeg');

    const create = await apiContext.post('/albums', {
      data: { name: `E2E album cover ${runId}`, imageKey },
    });
    expect(create.status()).toBe(201);
    const album = await create.json();
    expect(album.imageUrl).toBeTruthy();
    expect(album.imageBgColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const detail = await apiContext.get(`/albums/${album.id}`);
    expect((await detail.json()).album.imageUrl).toBe(album.imageUrl);

    const clear = await apiContext.put(`/albums/${album.id}`, { data: { clearedImage: true } });
    expect(clear.status()).toBe(200);
    expect((await clear.json()).imageUrl ?? null).toBeNull();

    await apiContext.delete(`/albums/${album.id}`);
  });

  test('returns 400 when the staged object is not an image', async ({ apiContext }) => {
    const runId = Date.now();
    // Image bytes uploaded under an audio content type — ImageService rejects on content type
    const imageKey = `e2e/albums/${runId}-not-image.wav`;
    await putToDropbox(apiContext, imageKey, readImageFixture(), 'audio/wav');

    const create = await apiContext.post('/albums', {
      data: { name: `E2E album bad cover ${runId}`, imageKey },
    });
    expect(create.status()).toBe(400);
  });
});
