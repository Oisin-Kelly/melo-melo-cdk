import { APIRequestContext, expect } from '@playwright/test';
import { findAudioFixture } from './audio';
import { putToDropbox } from './dropbox';

// Uploads a track through the full pipeline (presign → PUT → upload → poll)
// and resolves with the trackId once processing is COMPLETE. Callers should
// skip their test when findAudioFixture() returns null.
export async function uploadTrack(
  apiContext: APIRequestContext,
  trackTitle: string,
  sharedWith: string[] = []
): Promise<string> {
  const fixture = findAudioFixture();
  if (!fixture) throw new Error('no audio fixture — gate the test on findAudioFixture()');

  const audioKey = `e2e/uploads/${Date.now()}-${Math.random().toString(36).slice(2)}${fixture.extension}`;
  await putToDropbox(apiContext, audioKey, fixture.buffer, fixture.contentType);

  const upload = await apiContext.post('/tracks/upload', { data: { name: trackTitle, audioKey, sharedWith } });
  expect(upload.status()).toBe(202);
  const { trackId } = await upload.json();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const res = await apiContext.get(`/tracks/uploads/${trackId}`);
    const { status } = await res.json();
    if (status === 'COMPLETE') return trackId;
    if (status === 'FAILED') throw new Error(`upload ${trackId} failed`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`upload ${trackId} timed out`);
}
