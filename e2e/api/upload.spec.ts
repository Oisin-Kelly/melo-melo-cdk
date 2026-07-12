import * as fs from 'fs';
import * as path from 'path';
import { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { putToDropbox } from '../fixtures/dropbox';

test.describe('POST /tracks/upload — validation', () => {
  test('returns 400 when trackTitle is missing', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/upload', {
      data: { audioKey: 'test/some-key.mp3' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when audioKey is missing', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/upload', {
      data: { trackTitle: 'Missing audio key' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when trackTitle exceeds 100 characters', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/upload', {
      data: { trackTitle: 'x'.repeat(101), audioKey: 'test/some-key.mp3' },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when sharedWith exceeds 50 recipients', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/upload', {
      data: {
        trackTitle: 'Too many recipients',
        audioKey: 'test/some-key.mp3',
        sharedWith: Array.from({ length: 51 }, (_, i) => `user${i}`),
      },
    });
    expect(res.status()).toBe(400);
  });

  test('returns 400 when no file was uploaded at audioKey', async ({ apiContext }) => {
    const res = await apiContext.post('/tracks/upload', {
      data: { trackTitle: 'Ghost file', audioKey: `e2e/nothing-here-${Date.now()}.mp3` },
    });
    expect(res.status()).toBe(400);
    // ErrorResponse serializes PascalCase (no JsonPropertyName attributes)
    expect((await res.json()).Message).toContain('No uploaded audio found');
  });
});

interface UploadStatus {
  trackId: string;
  status: string;
  error?: string;
}

// Poll GET /tracks/uploads/{trackId} until the pipeline settles (COMPLETE or FAILED)
async function pollUploadStatus(
  apiContext: APIRequestContext,
  trackId: string,
  timeoutMs = 90_000
): Promise<UploadStatus> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await apiContext.get(`/tracks/uploads/${trackId}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as UploadStatus;
    if (body.status !== 'PROCESSING') return body;
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error(`upload ${trackId} still PROCESSING after ${timeoutMs}ms`);
}

test.describe('POST /tracks/upload — full pipeline', () => {
  test('uploads audio, processes it, and shares it with two other users', async ({
    apiContext,
    apiContextB,
    apiContextC,
    user,
    userB,
    userC,
  }) => {
    const fixture = findAudioFixture();
    test.skip(!fixture, 'No audio fixture found — add e2e/fixtures/assets/sample.mp3 (or .wav)');
    test.setTimeout(180_000);

    const runId = Date.now();
    const trackTitle = `E2E upload ${runId}`;
    const audioKey = `e2e/${user.username}/${runId}${fixture!.extension}`;

    await putToDropbox(apiContext, audioKey, fixture!.buffer, fixture!.contentType);

    // Kick off the upload pipeline, sharing with userB and userC
    const upload = await apiContext.post('/tracks/upload', {
      data: {
        trackTitle,
        audioKey,
        genre: 'e2e',
        description: 'Uploaded by the e2e suite',
        caption: 'e2e caption',
        sharedWith: [userB.username, userC.username],
      },
    });
    expect(upload.status()).toBe(202);
    const { trackId, status } = await upload.json();
    expect(status).toBe('PROCESSING');
    expect(trackId).toBeTruthy();

    // Poll the upload status until ProcessTrackLambda settles
    const settled = await pollUploadStatus(apiContext, trackId);
    expect(settled.status).toBe('COMPLETE');

    // The track is fetchable by the id returned at upload time
    const track = await apiContext.get(`/tracks/${trackId}`);
    expect(track.status()).toBe(200);
    const trackBody = await track.json();
    expect(trackBody.trackName).toBe(trackTitle);
    expect(trackBody.segments).toBeGreaterThanOrEqual(1);
    expect(trackBody.duration).toBeGreaterThan(0);

    // Track + SharedTrack are written in one transaction, so both recipients
    // should see it immediately once processing completes
    for (const ctx of [apiContextB, apiContextC]) {
      const shared = await ctx.get('/tracks/shared');
      expect(shared.status()).toBe(200);
      const sharedBody = await shared.json();
      const sharedNames = sharedBody.items.map(
        (s: { track: { trackName: string } }) => s.track.trackName
      );
      expect(sharedNames).toContain(trackTitle);
    }

    // Owner and recipients can fetch presigned segment URLs, and the audio is
    // actually downloadable from S3
    for (const ctx of [apiContext, apiContextB]) {
      const segments = await ctx.get(`/tracks/${trackId}/segments`);
      expect(segments.status()).toBe(200);
      const segmentsBody = await segments.json();
      expect(segmentsBody.urls.length).toBe(trackBody.segments);
      expect(segmentsBody.duration).toBe(trackBody.duration);
      expect(segmentsBody.expiresAt).toBeGreaterThan(Date.now());

      const audio = await fetch(segmentsBody.urls[0]);
      expect(audio.status).toBe(200);
      expect(audio.headers.get('content-type')).toBe('audio/mpeg');
    }
  });
});

test.describe('POST /tracks/upload — processing failures', () => {
  test('marks the upload FAILED when the file is an image', async ({ apiContext, user }) => {
    test.setTimeout(120_000);

    const runId = Date.now();
    const audioKey = `e2e/${user.username}/${runId}-image.jpg`;
    const image = fs.readFileSync(path.join(__dirname, '../fixtures/assets/image.jpg'));

    await putToDropbox(apiContext, audioKey, image, 'image/jpeg');

    const upload = await apiContext.post('/tracks/upload', {
      data: { trackTitle: `E2E image upload ${runId}`, audioKey },
    });
    expect(upload.status()).toBe(202);
    const { trackId } = await upload.json();

    const settled = await pollUploadStatus(apiContext, trackId);
    expect(settled.status).toBe('FAILED');
    expect(settled.error).toContain('not an audio file');

    // The failed upload never becomes a track
    expect((await apiContext.get(`/tracks/${trackId}`)).status()).toBe(404);
  });

  test('marks the upload FAILED when the audio file is corrupted', async ({
    apiContext,
    user,
  }) => {
    test.setTimeout(120_000);

    const runId = Date.now();
    const audioKey = `e2e/${user.username}/${runId}-corrupted.wav`;
    const corrupted = fs.readFileSync(path.join(__dirname, '../fixtures/assets/corrupted.wav'));

    // Content-Type audio/wav passes the header check; ffmpeg then fails on the bytes
    await putToDropbox(apiContext, audioKey, corrupted, 'audio/wav');

    const upload = await apiContext.post('/tracks/upload', {
      data: { trackTitle: `E2E corrupted upload ${runId}`, audioKey },
    });
    expect(upload.status()).toBe(202);
    const { trackId } = await upload.json();

    const settled = await pollUploadStatus(apiContext, trackId);
    expect(settled.status).toBe('FAILED');
    // Generic reason — ffmpeg internals must not leak to clients
    expect(settled.error).toBe('Audio processing failed.');

    expect((await apiContext.get(`/tracks/${trackId}`)).status()).toBe(404);
  });

  test('returns 404 for an unknown upload id', async ({ apiContext }) => {
    const res = await apiContext.get('/tracks/uploads/nonexistent-upload-xyz');
    expect(res.status()).toBe(404);
  });
});
