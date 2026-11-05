import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// GET /tracks/{trackId}/original — the track owner downloads the file exactly as uploaded
// (format included), via a short-lived presigned URL that S3 serves as an attachment.
test.describe('GET /tracks/{trackId}/original', () => {
  test('returns 404 for a nonexistent track', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks/nonexistent-track-id/original');
    expect(res.status()).toBe(404);
  });

  test('the owner downloads the exact uploaded file; someone it is shared with cannot', async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    const fixture = findAudioFixture();
    test.skip(!fixture, 'no audio fixture in e2e/fixtures/assets (sample.<ext>)');
    test.setTimeout(150_000);

    const title = `E2E original ${Date.now()}`;
    const trackId = await uploadTrack(apiContext, title, [userB.username]);
    try {
      const res = await apiContext.get(`/tracks/${trackId}/original`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      const extension = fixture!.extension.replace('.', '');
      expect(body.fileName).toBe(`${title}.${extension}`);
      expect(body.contentType).toBe(fixture!.contentType);
      expect(body.expiresAt).toBeGreaterThan(Date.now());

      // The URL serves the original bytes, untouched, as a named attachment
      const file = await fetch(body.url);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe(fixture!.contentType);
      const disposition = file.headers.get('content-disposition') ?? '';
      expect(disposition).toMatch(/^attachment;/);
      expect(disposition).toContain(`filename="${title}.${extension}"`);
      expect(Buffer.from(await file.arrayBuffer()).equals(fixture!.buffer)).toBe(true);

      // Shared with B, who can stream it — but the original is the owner's alone
      expect((await apiContextB.get(`/tracks/${trackId}/stream`)).status()).toBe(200);
      expect((await apiContextB.get(`/tracks/${trackId}/original`)).status()).toBe(404);
    } finally {
      await apiContext.delete(`/tracks/${trackId}`);
    }
  });

  test('after the track is deleted the original is gone too', async ({ apiContext }) => {
    const fixture = findAudioFixture();
    test.skip(!fixture, 'no audio fixture in e2e/fixtures/assets (sample.<ext>)');
    test.setTimeout(150_000);

    const trackId = await uploadTrack(apiContext, `E2E original deleted ${Date.now()}`);
    expect((await apiContext.get(`/tracks/${trackId}/original`)).status()).toBe(200);

    expect((await apiContext.delete(`/tracks/${trackId}`)).status()).toBe(200);

    expect((await apiContext.get(`/tracks/${trackId}/original`)).status()).toBe(404);
  });
});
