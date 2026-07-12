import { test, expect } from '../fixtures/auth';
import { putToDropbox, readImageFixture } from '../fixtures/dropbox';

test.describe('GET /playlists', () => {
  test('always includes the built-in likes playlist', async ({ apiContext }) => {
    const res = await apiContext.get('/playlists');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);

    // Likes carries a max GSI3 sort key, so it's always first on page 1
    const likes = body.items.find((p: { type: string }) => p.type === 'LIKES');
    expect(likes).toBeTruthy();
    expect(likes.id).toBe('likes');
    expect(likes.name).toBe('Likes');
    expect(body.items[0].type).toBe('LIKES');
  });
});

test.describe('Playlist CRUD lifecycle', () => {
  test('create → get → update → delete', async ({ apiContext }) => {
    const name = `E2E playlist ${Date.now()}`;

    // Create
    const create = await apiContext.post('/playlists', {
      data: { name, description: 'made by e2e' },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.name).toBe(name);
    expect(created.type).toBe('CUSTOM');
    expect(created.id).toBeTruthy();

    // Appears in list (created just now, so it's on the newest-first front page)
    const list = await apiContext.get('/playlists');
    const listBody = await list.json();
    expect(listBody.items.map((p: { id: string }) => p.id)).toContain(created.id);

    // Get detail (playlist + paginated tracks shape)
    const detail = await apiContext.get(`/playlists/${created.id}`);
    expect(detail.status()).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.playlist.id).toBe(created.id);
    expect(Array.isArray(detailBody.tracks.items)).toBe(true);
    expect('nextCursor' in detailBody.tracks).toBe(true);

    // Update
    const update = await apiContext.put(`/playlists/${created.id}`, {
      data: { name: `${name} renamed` },
    });
    expect(update.status()).toBe(200);
    expect((await update.json()).name).toBe(`${name} renamed`);

    // Delete
    const del = await apiContext.delete(`/playlists/${created.id}`);
    expect(del.status()).toBe(200);

    // Gone
    const after = await apiContext.get(`/playlists/${created.id}`);
    expect(after.status()).toBe(404);
  });

  test('returns 400 when name is missing', async ({ apiContext }) => {
    const res = await apiContext.post('/playlists', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('returns 404 for a nonexistent playlist', async ({ apiContext }) => {
    const res = await apiContext.get('/playlists/does-not-exist-xyz');
    expect(res.status()).toBe(404);
  });
});

test.describe('Likes playlist immutability', () => {
  test('cannot be renamed', async ({ apiContext }) => {
    const res = await apiContext.put('/playlists/likes', { data: { name: 'Hacked' } });
    expect(res.status()).toBe(400);
  });

  test('cannot be deleted', async ({ apiContext }) => {
    const res = await apiContext.delete('/playlists/likes');
    expect(res.status()).toBe(400);
  });

  test('cannot have tracks added via the playlist endpoint', async ({ apiContext }) => {
    const res = await apiContext.post('/playlists/likes/tracks', {
      data: { add: ['some-track-id'] },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('POST /playlists/{playlistId}/tracks', () => {
  test('returns 400 when adding a nonexistent track', async ({ apiContext }) => {
    const create = await apiContext.post('/playlists', {
      data: { name: `E2E membership 400 ${Date.now()}` },
    });
    const playlist = await create.json();

    const res = await apiContext.post(`/playlists/${playlist.id}/tracks`, {
      data: { add: ['track-that-does-not-exist'] },
    });
    expect(res.status()).toBe(400);

    await apiContext.delete(`/playlists/${playlist.id}`);
  });

  test('returns 400 when both add and remove are empty', async ({ apiContext }) => {
    const create = await apiContext.post('/playlists', {
      data: { name: `E2E membership empty ${Date.now()}` },
    });
    const playlist = await create.json();

    const res = await apiContext.post(`/playlists/${playlist.id}/tracks`, { data: {} });
    expect(res.status()).toBe(400);

    await apiContext.delete(`/playlists/${playlist.id}`);
  });

  test('adds and removes an owned track', async ({ apiContext }) => {
    // Uses an existing uploaded track if one exists; skips otherwise
    const tracksRes = await apiContext.get('/tracks');
    const tracks = (await tracksRes.json()).items;
    test.skip(tracks.length === 0, 'no uploaded tracks available to add');

    const trackId = tracks[0].id;
    const create = await apiContext.post('/playlists', {
      data: { name: `E2E membership ${Date.now()}` },
    });
    const playlist = await create.json();

    // Add
    const add = await apiContext.post(`/playlists/${playlist.id}/tracks`, {
      data: { add: [trackId] },
    });
    expect(add.status()).toBe(200);
    expect((await add.json()).added).toBe(1);

    // Visible in detail
    const detail = await apiContext.get(`/playlists/${playlist.id}`);
    const detailBody = await detail.json();
    expect(detailBody.tracks.items.map((t: { id: string }) => t.id)).toContain(trackId);

    // Remove
    const remove = await apiContext.post(`/playlists/${playlist.id}/tracks`, {
      data: { remove: [trackId] },
    });
    expect(remove.status()).toBe(200);

    const afterRemove = await apiContext.get(`/playlists/${playlist.id}`);
    const afterBody = await afterRemove.json();
    expect(afterBody.tracks.items.map((t: { id: string }) => t.id)).not.toContain(trackId);

    await apiContext.delete(`/playlists/${playlist.id}`);
  });
});

test.describe('Playlist cover images', () => {
  test('create with imageKey sets the cover', async ({ apiContext }) => {
    const runId = Date.now();
    const imageKey = `e2e/playlists/${runId}-create-cover.jpg`;
    await putToDropbox(apiContext, imageKey, readImageFixture(), 'image/jpeg');

    const create = await apiContext.post('/playlists', {
      data: { name: `E2E playlist created cover ${runId}`, imageKey },
    });
    expect(create.status()).toBe(201);
    const playlist = await create.json();
    expect(playlist.imageUrl).toBeTruthy();
    expect(playlist.imageBgColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    await apiContext.delete(`/playlists/${playlist.id}`);
  });

  test('update with imageKey sets the cover → clearedImage removes it', async ({ apiContext }) => {
    const runId = Date.now();
    const create = await apiContext.post('/playlists', {
      data: { name: `E2E playlist cover ${runId}` },
    });
    expect(create.status()).toBe(201);
    const playlist = await create.json();

    const imageKey = `e2e/playlists/${runId}-cover.jpg`;
    await putToDropbox(apiContext, imageKey, readImageFixture(), 'image/jpeg');

    const update = await apiContext.put(`/playlists/${playlist.id}`, { data: { imageKey } });
    expect(update.status()).toBe(200);
    const updated = await update.json();
    expect(updated.imageUrl).toBeTruthy();
    expect(updated.imageBgColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const detail = await apiContext.get(`/playlists/${playlist.id}`);
    expect((await detail.json()).playlist.imageUrl).toBe(updated.imageUrl);

    const clear = await apiContext.put(`/playlists/${playlist.id}`, {
      data: { clearedImage: true },
    });
    expect(clear.status()).toBe(200);
    expect((await clear.json()).imageUrl ?? null).toBeNull();

    await apiContext.delete(`/playlists/${playlist.id}`);
  });
});
