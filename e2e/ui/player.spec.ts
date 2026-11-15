import { test, expect } from '../fixtures/page';

// Playback, in WebKit: Playwright's own Chromium has no AAC decoder, so it can't play the
// app's .m4a files at all. Uses user A's own tracks; nothing is changed except the
// resume point (PUT /me/progress), which only the progress API spec reads, and that
// runs before the UI project.
test.use({ browserName: 'webkit' });

test.describe('player', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('Play on a track page plays it in the bar, and the bar pauses it', async ({ authenticatedPage: page, apiContext }) => {
    // Not the newest: track.spec renames that one while this runs alongside it
    const track = (await (await apiContext.get('/tracks?limit=2')).json()).items[1];
    test.skip(!track, 'user A needs two tracks');

    await page.goto(`/tracks/${track.id}`);
    // The header has a "Play" pill on wide screens (its round twin is hidden); the page's,
    // not the bar's, which can already hold the resume point from signing in
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Play', exact: true }).first().click();

    const bar = page.getByRole('region', { name: 'Now playing' });
    await expect(bar).toContainText(track.name);
    // The playhead moves: it's really playing, not just showing. (It may not start at 0:00:
    // when this track is the resume point from signing in, Play carries on from there.)
    const playhead = bar.locator('.mm-player-time:not([data-end])');
    await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible();
    const startedAt = await playhead.textContent();
    await expect.poll(() => playhead.textContent(), { timeout: 15_000 }).not.toBe(startedAt);

    await bar.getByRole('button', { name: 'Pause' }).click();
    await expect(bar.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
  });

  test('tapping a row in a list plays from that row, and Next moves on', async ({ authenticatedPage: page }) => {
    await page.getByRole('link', { name: 'Profile' }).click();
    const rows = page.locator('.mm-row-play');
    await expect(rows.nth(1)).toBeVisible();
    const name = async (i: number) => ((await rows.nth(i).getAttribute('aria-label')) ?? '').replace(/^Play /, '');
    const [first, second] = [await name(0), await name(1)];

    // On the cover (the middle of the row is the title, which opens the track)
    await rows.first().click({ position: { x: 20, y: 20 } });
    const bar = page.getByRole('region', { name: 'Now playing' });
    await expect(bar).toContainText(first);
    await expect(bar).toContainText('Your tracks');
    await bar.getByRole('button', { name: 'Next' }).click();
    await expect(bar).toContainText(second);
  });
});
