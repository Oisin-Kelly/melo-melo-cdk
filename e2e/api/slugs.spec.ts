import { test, expect } from '../fixtures/users';

// Readable URLs: GET /users/{username}/slugs/{kind}/{slug} → { id, slug }. Every miss — no such
// slug, no access, someone else's playlist — is the same 404, so a guessed URL reveals nothing.
test.describe('GET /users/{username}/slugs/{kind}/{slug}', () => {
  const unique = () => `E2E Slug ${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  test('a new playlist gets a slug from its name; a second with the same name gets -2', async ({ apiContext, user }) => {
    const name = unique();
    const first = await (await apiContext.post('/playlists', { data: { name } })).json();
    const second = await (await apiContext.post('/playlists', { data: { name } })).json();
    try {
      expect(first.slug).toBe(slugOf(name));
      expect(second.slug).toBe(`${slugOf(name)}-2`);

      const res = await apiContext.get(`/users/${user.username}/slugs/playlists/${first.slug}`);
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ id: first.id, slug: first.slug });
    } finally {
      await apiContext.delete(`/playlists/${first.id}`);
      await apiContext.delete(`/playlists/${second.id}`);
    }
  });

  test('renaming keeps the URL; changing it keeps the old one as a redirect', async ({ apiContext, user }) => {
    const name = unique();
    const album = await (await apiContext.post('/albums', { data: { name } })).json();
    try {
      const renamed = await (await apiContext.put(`/albums/${album.id}`, { data: { name: `${name} renamed` } })).json();
      expect(renamed.slug).toBe(album.slug);

      const moved = await apiContext.put(`/albums/${album.id}`, { data: { name, slug: `${album.slug}-moved` } });
      expect(moved.status()).toBe(200);
      expect((await moved.json()).slug).toBe(`${album.slug}-moved`);

      const old = await apiContext.get(`/users/${user.username}/slugs/albums/${album.slug}`);
      expect(await old.json()).toEqual({ id: album.id, slug: `${album.slug}-moved` });
    } finally {
      await apiContext.delete(`/albums/${album.id}`);
    }
  });

  test('a URL another of your items uses, or a malformed one, is a 400', async ({ apiContext }) => {
    const a = await (await apiContext.post('/albums', { data: { name: unique() } })).json();
    const b = await (await apiContext.post('/albums', { data: { name: unique() } })).json();
    try {
      const taken = await apiContext.put(`/albums/${b.id}`, { data: { slug: a.slug } });
      expect(taken.status()).toBe(400);
      expect((await taken.json()).message).toContain('URL');

      const badShape = await apiContext.put(`/albums/${b.id}`, { data: { slug: 'Not A Slug!' } });
      expect(badShape.status()).toBe(400);
    } finally {
      await apiContext.delete(`/albums/${a.id}`);
      await apiContext.delete(`/albums/${b.id}`);
    }
  });

  test("someone else's playlist and an album not shared with you look exactly like nothing", async ({
    apiContext,
    apiContextB,
    user,
  }) => {
    const playlist = await (await apiContext.post('/playlists', { data: { name: unique() } })).json();
    const album = await (await apiContext.post('/albums', { data: { name: unique() } })).json();
    try {
      const responses = await Promise.all([
        apiContextB.get(`/users/${user.username}/slugs/playlists/${playlist.slug}`),
        apiContextB.get(`/users/${user.username}/slugs/albums/${album.slug}`),
        apiContextB.get(`/users/${user.username}/slugs/albums/no-such-album-e2e`),
        apiContextB.get(`/users/${user.username}/slugs/widgets/${album.slug}`),
      ]);
      for (const res of responses) {
        expect(res.status()).toBe(404);
        expect(await res.json()).toEqual({ statusCode: 404, message: "This isn't available", error: 'Not Found' });
      }
    } finally {
      await apiContext.delete(`/playlists/${playlist.id}`);
      await apiContext.delete(`/albums/${album.id}`);
    }
  });
});
