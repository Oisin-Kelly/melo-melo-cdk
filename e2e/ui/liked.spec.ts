import { test, expect } from '../fixtures/page';

// Liked tracks: the likes playlist's page (heart cover, newest like first). Liked albums
// moved to a shelf in Library, so old ?tab=albums links land there.
// Read-only (no liking/unliking), so it can't race the API specs over shared users.
test.describe('liked', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('opens Liked tracks as a playlist page', async ({ authenticatedPage: page }) => {
    await page.getByRole('link', { name: 'Liked tracks' }).first().click();
    await expect(page).toHaveURL(/\/liked$/);
    await expect(page.getByRole('heading', { name: 'Liked tracks', level: 1 })).toBeVisible();
    await expect(page.getByText('PLAYLIST', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('sends old Liked-albums links to Library', async ({ authenticatedPage: page }) => {
    await page.goto('/liked?tab=albums');
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  });
});
