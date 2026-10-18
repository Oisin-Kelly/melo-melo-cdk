import { test, expect } from '../fixtures/users';
import { findAudioFixture } from '../fixtures/audio';
import { uploadTrack } from '../fixtures/upload';

// Assertions on a fixed test user's aggregate state (a likes-playlist total, a followers
// list), which parallel specs would race. Runs in the `api-mutating` project — strictly
// after the parallel `api` project — and only touches state that the other mutating spec
// (sharing-permissions: userC's incomingShares + the C→A follow) leaves alone.

type LikesPlaylist = { playlist: { trackCount?: number | null; totalDurationSeconds?: number | null } };

test.describe('Track delete reconciles likers', () => {
  test("deleting a liked track decrements the liker's likes-playlist totals", async ({
    apiContext,
    apiContextB,
    userB,
  }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets');
    test.setTimeout(180_000);

    const trackId = await uploadTrack(apiContext, `E2E delete liked ${Date.now()}`, [userB.username]);
    const duration: number = (await (await apiContext.get(`/tracks/${trackId}`)).json()).duration;

    const likesTotals = async () => {
      const { playlist } = (await (await apiContextB.get('/playlists/likes')).json()) as LikesPlaylist;
      return { count: playlist.trackCount ?? 0, seconds: playlist.totalDurationSeconds ?? 0 };
    };

    const like = await apiContextB.post(`/tracks/${trackId}/like`, { data: { newValue: true } });
    expect(like.status()).toBe(200);
    const liked = await likesTotals();

    // The owner deletes the track → B's likes playlist gives back exactly this track's share
    expect((await apiContext.delete(`/tracks/${trackId}`)).status()).toBe(200);
    expect(await likesTotals()).toEqual({ count: liked.count - 1, seconds: liked.seconds - duration });
  });
});

test.describe('Followers order', () => {
  // userC's followers: A→C is only exercised by follows.spec (api project, finished by now)
  // and B→C by nothing else, so this list is stable here.
  test('followers come back newest-first', async ({ apiContext, apiContextB, apiContextC, user, userB, userC }) => {
    const setFollow = (ctx: typeof apiContext, newValue: boolean) =>
      ctx.post(`/users/${userC.username}/follow-user`, { data: { newValue } });

    // Clean slate, then A follows C before B does
    await setFollow(apiContext, false);
    await setFollow(apiContextB, false);

    try {
      expect((await setFollow(apiContext, true)).status()).toBe(200);
      expect((await setFollow(apiContextB, true)).status()).toBe(200);

      // A double-follow is a no-op — no duplicate row to break or reorder the page
      expect((await setFollow(apiContextB, true)).status()).toBe(200);

      const followers = await apiContextC.get(`/users/${userC.username}/followers`);
      expect(followers.status()).toBe(200);
      const usernames: string[] = (await followers.json()).items.map((u: { username: string }) => u.username);
      const ours = usernames.filter((u) => u === user.username || u === userB.username);
      expect(ours).toEqual([userB.username, user.username]);
    } finally {
      await setFollow(apiContext, false);
      await setFollow(apiContextB, false);
    }
  });
});
