import { test, expect } from '../fixtures/page';
import { findAudioFixture } from '../fixtures/audio';
import { newApiContext, TEST_USER_A, TEST_USER_B } from '../fixtures/auth';
import { signIn } from '../fixtures/cognito';
import { pickPersistentTrack, uploadTrack } from '../fixtures/upload';

// The track screen (/{owner}/{slug}; the old /tracks/:trackId moves there), as the owner (user A
// owns the persistent "E2E upload …" tracks). The Edit track round trip restores the name; nothing is deleted.
test.describe('track', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test("the owner's view: header, owner sections, share dialog", async ({ authenticatedPage: page, apiContext }) => {
    const track = (await (await apiContext.get('/tracks?limit=1')).json()).items[0];
    test.skip(!track, 'user A has no tracks');

    await page.goto(`/tracks/${track.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(track.name);
    await expect(page.getByText('TRACK', { exact: true })).toBeVisible();
    await expect(page.getByText('SHARED WITH', { exact: true })).toBeVisible();
    await expect(page.getByText(/^LIKED BY/)).toBeVisible();

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Share ${track.name}` });
    await expect(dialog.getByText('People with access')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Edit track renames it, and back again', async ({ authenticatedPage: page, apiContext }) => {
    const track = (await (await apiContext.get('/tracks?limit=1')).json()).items[0];
    test.skip(!track, 'user A has no tracks');
    const rename = async (name: string) => {
      await page.getByRole('link', { name: 'Edit', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit track' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
      await page.getByRole('button', { name: 'Save changes' }).click();
      // Back on the track's page
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    };

    await page.goto(`/tracks/${track.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(track.name);
    const before = page.url();
    try {
      await rename(`${track.name} (renamed)`);
      // Renaming never changes the URL
      expect(page.url()).toBe(before);
    } finally {
      await rename(track.name);
    }
  });

  test('an old id link moves to the readable URL', async ({ authenticatedPage: page, apiContext }) => {
    const track = (await (await apiContext.get('/tracks?limit=1')).json()).items[0];
    test.skip(!track?.slug, "user A's newest track has no slug (made before slugs, not backfilled)");
    const url = new RegExp(`/${track.owner.username}/${track.slug}$`);

    await page.goto(`/tracks/${track.id}`);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(track.name);
  });

  test("a track you can't see says it isn't available", async ({ authenticatedPage: page }) => {
    await page.goto('/tracks/00000000000000000000000000000000');
    await expect(page.getByText("This track isn't available")).toBeVisible();
    // A guessed readable URL gets the very same screen, whether or not it exists
    await page.goto('/nobody.by.this.name.e2e/no-such-track-e2e');
    await expect(page.getByText("This track isn't available")).toBeVisible();
  });

  test('the owner can download the original upload, named after the track', async ({ authenticatedPage: page, apiContext }) => {
    const items = (await (await apiContext.get('/tracks?limit=100')).json()).items as { id: string; name: string }[];
    const trackId = pickPersistentTrack(items);
    test.skip(!trackId, 'user A has no persistent "E2E upload" track');
    const original = await apiContext.get(`/tracks/${trackId}/original`);
    test.skip(original.status() === 404, 'that track was processed before originals were kept');
    const { fileName } = await original.json();
    const name = items.find((t) => t.id === trackId)!.name;

    await page.goto(`/tracks/${trackId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await page.getByRole('button', { name: `More options for ${name}` }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Download original' }).dispatchEvent('click'),
    ]);

    expect(download.suggestedFilename()).toBe(fileName);
    expect(fileName.startsWith(name)).toBe(true);
    // The download doesn't navigate the app away
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

    // The Edit track page has it too
    await page.goto(`/tracks/${trackId}/edit`);
    const [again] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download original' }).click(),
    ]);
    expect(again.suggestedFilename()).toBe(fileName);
  });

  test("someone it's shared with isn't offered the original", async ({ authenticatedPage: page, playwright }) => {
    test.skip(!findAudioFixture(), 'no audio fixture in e2e/fixtures/assets (sample.<ext>)');
    test.setTimeout(150_000);
    // User B uploads a track shared with A (the signed-in user), so A sees it as a recipient
    const userB = await signIn(TEST_USER_B);
    const apiContextB = await newApiContext(playwright, userB.idToken);
    const name = `E2E shared original ${Date.now()}`;
    const trackId = await uploadTrack(apiContextB, name, [TEST_USER_A.username.toLowerCase()]);
    try {
      await page.goto(`/tracks/${trackId}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      await page.getByRole('button', { name: `More options for ${name}` }).click();
      await expect(page.getByRole('menuitem', { name: 'Remove from my library' })).toBeVisible();

      await expect(page.getByRole('menuitem', { name: 'Download original' })).toHaveCount(0);
    } finally {
      await apiContextB.delete(`/tracks/${trackId}`);
      await apiContextB.dispose();
    }
  });
});
