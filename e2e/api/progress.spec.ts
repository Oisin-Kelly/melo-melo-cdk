import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// PUT/GET /me/progress (the single resume slot behind "continue listening") and
// POST /me/seen (the new-since-last-visit marker on the private profile field
// lastSeenAt).

test.describe('Resume progress', () => {
  test('single resume slot: latest heartbeat wins, completed clears, deleted track hides', async ({
    apiContext,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(240_000);

    const runId = Date.now();
    const [t1, t2] = await Promise.all([
      uploadTrack(apiContext, `E2E progress A ${runId}`),
      uploadTrack(apiContext, `E2E progress B ${runId}`),
    ]);

    try {
      // Bad context type → 400
      expect(
        (await apiContext.put('/me/progress', { data: { contextType: 'SONG', contextId: t1, trackId: t1, positionSeconds: 5 } })).status()
      ).toBe(400);

      // Save t1, then t2 → GET returns t2 (one slot, latest heartbeat overwrites)
      expect(
        (await apiContext.put('/me/progress', { data: { contextType: 'TRACK', contextId: t1, trackId: t1, positionSeconds: 30 } })).status()
      ).toBe(200);
      expect(
        (await apiContext.put('/me/progress', { data: { contextType: 'TRACK', contextId: t2, trackId: t2, positionSeconds: 45 } })).status()
      ).toBe(200);

      const latest = await apiContext.get('/me/progress');
      expect(latest.status()).toBe(200);
      const body = await latest.json();
      expect(body.trackId).toBe(t2);
      expect(body.positionSeconds).toBe(45);
      expect(body.track.id).toBe(t2); // current track hydrated

      // Playback finished → completed clears the slot, nothing to resume
      expect(
        (await apiContext.put('/me/progress', { data: { completed: true } })).status()
      ).toBe(200);
      expect((await apiContext.get('/me/progress')).status()).toBe(204);

      // Save t1 again, then delete the track → dead resume state is hidden, not surfaced
      expect(
        (await apiContext.put('/me/progress', { data: { contextType: 'TRACK', contextId: t1, trackId: t1, positionSeconds: 10 } })).status()
      ).toBe(200);
      await apiContext.delete(`/tracks/${t1}`);
      expect((await apiContext.get('/me/progress')).status()).toBe(204);
    } finally {
      await apiContext.delete(`/tracks/${t1}`).catch(() => {});
      await apiContext.delete(`/tracks/${t2}`).catch(() => {});
    }
  });

  test('lastSeenAt is bumped by /me/seen and private to the owner', async ({
    apiContext,
    apiContextB,
    user,
    userB,
  }) => {
    await apiContext.post('/me/seen', { data: {} });

    const ownProfile = await (await apiContext.get(`/users/${user.username}`)).json();
    expect(typeof ownProfile.lastSeenAt).toBe('number');

    // B viewing A's profile must not see A's lastSeenAt
    const aFromB = await (await apiContextB.get(`/users/${user.username}`)).json();
    expect(aFromB.lastSeenAt).toBeUndefined();
    // and B's own is not exposed to A
    const bFromA = await (await apiContext.get(`/users/${userB.username}`)).json();
    expect(bFromA.lastSeenAt).toBeUndefined();
  });
});
