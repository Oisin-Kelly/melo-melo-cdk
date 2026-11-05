import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Share links: the owner creates a link, anyone with it sees the public invite preview (no
// account), a signed-in user accepts it and becomes an ordinary recipient, and revoking stops new
// people joining without taking access from those who already did. Each test owns a freshly
// uploaded track/album (unique runId), so nothing races other specs.
// Expiry can't be waited out here — it's covered by the unit and handler tests.

test.describe('Share links', () => {
  test('create → public preview → accept → revoke stops the next person', async ({
    apiContext,
    apiContextB,
    apiContextC,
    playwright,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E share link ${runId}`);
    const anonymous = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL });

    try {
      const create = await apiContext.post('/links', { data: { kind: 'TRACK', targetId: trackId, expiresIn: '24h' } });
      expect(create.status()).toBe(201);
      const link = await create.json();
      expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(link.allowPreview).toBe(true);

      // Someone else can't make a link to your track
      expect((await apiContextB.post('/links', { data: { kind: 'TRACK', targetId: trackId } })).status()).toBe(404);

      // The preview needs no account
      const preview = await anonymous.get(`/links/${link.token}`);
      expect(preview.status()).toBe(200);
      const body = await preview.json();
      expect(body.state).toBe('VALID');
      expect(body.name).toBe(`E2E share link ${runId}`);
      expect(body.tracks[0].preview?.url).toBeTruthy();

      // B: no access yet → accept → an ordinary recipient
      expect((await apiContextB.get(`/links/${link.token}/viewer`)).status()).toBe(200);
      expect((await (await apiContextB.get(`/links/${link.token}/viewer`)).json()).relation).toBe('NONE');
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(404);

      const accept = await apiContextB.post(`/links/${link.token}/accept`);
      expect(accept.status()).toBe(200);
      expect((await accept.json()).id).toBe(trackId);
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);
      expect((await (await apiContextB.get(`/links/${link.token}/viewer`)).json()).relation).toBe('ALREADY_HAVE');

      // The owner sees B among the recipients, and the link's count
      const recipients = (await (await apiContext.get(`/tracks/${trackId}/recipients`)).json()).items;
      expect(recipients.map((r: { user: { username: string } }) => r.user.username)).toContain(userB.username);
      const listed = (await (await apiContext.get(`/links?kind=TRACK&targetId=${trackId}`)).json()).items;
      expect(listed.find((l: { token: string }) => l.token === link.token)?.acceptedCount).toBe(1);

      // Revoke: the preview reads unavailable, C can't join, B keeps access
      expect((await apiContext.delete(`/links/${link.token}`)).status()).toBe(200);
      expect((await (await anonymous.get(`/links/${link.token}`)).json())).toEqual({ state: 'UNAVAILABLE' });
      expect((await apiContextC.post(`/links/${link.token}/accept`)).status()).toBe(404);
      expect((await apiContextC.get(`/tracks/${trackId}`)).status()).toBe(404);
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);

      // Restore (the dialog's Undo) reopens it
      expect((await apiContext.post(`/links/${link.token}/restore`)).status()).toBe(200);
      expect((await (await anonymous.get(`/links/${link.token}`)).json()).state).toBe('VALID');
    } finally {
      await anonymous.dispose();
      await apiContext.delete(`/tracks/${trackId}`);
    }

    // Deleting the track took its links with it
    const after = await apiContext.get(`/links?kind=TRACK&targetId=${trackId}`);
    expect(after.status()).toBe(404);
  });

  test('an album link grants every track, and your own link is OWN with stats', async ({
    apiContext,
    apiContextB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackId = await uploadTrack(apiContext, `E2E link album track ${runId}`);
    const album = await (
      await apiContext.post('/albums', { data: { name: `E2E link album ${runId}`, trackIds: [trackId] } })
    ).json();

    try {
      const link = await (
        await apiContext.post('/links', { data: { kind: 'ALBUM', targetId: album.id, allowPreview: false, caption: '  e2e   note  ' } })
      ).json();

      const own = await (await apiContext.get(`/links/${link.token}/viewer`)).json();
      expect(own.relation).toBe('OWN');
      expect(own.link.allowPreview).toBe(false);
      expect((await apiContext.post(`/links/${link.token}/accept`)).status()).toBe(400);

      // Preview off: the tracklist shows, but nothing to play
      const preview = await (await apiContextB.get(`/links/${link.token}`)).json();
      expect(preview.tracks).toHaveLength(1);
      expect(preview.tracks[0].preview).toBeNull();
      expect(preview.caption).toBe('e2e note'); // sanitised

      expect((await apiContextB.post(`/links/${link.token}/accept`)).status()).toBe(200);
      expect((await apiContextB.get(`/albums/${album.id}`)).status()).toBe(200);
      expect((await apiContextB.get(`/tracks/${trackId}`)).status()).toBe(200);
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });

  test('a malformed or unknown token reads unavailable, and accepting it is 404', async ({ apiContext, playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL });
    try {
      expect(await (await anonymous.get('/links/not-a-token')).json()).toEqual({ state: 'UNAVAILABLE' });
      expect(await (await anonymous.get('/links/AAAAAAAAAAAAAAAAAAAAAA')).json()).toEqual({ state: 'UNAVAILABLE' });
      expect((await apiContext.post('/links/AAAAAAAAAAAAAAAAAAAAAA/accept')).status()).toBe(404);
    } finally {
      await anonymous.dispose();
    }
  });
});
