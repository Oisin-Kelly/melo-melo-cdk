import { test, expect } from '../fixtures/page';

// A custom playlist's lifecycle through the UI: create from the sidebar, rename, delete.
// Uses a fresh name and deletes what it creates, so it can't disturb other specs.
test.describe('playlist page', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('create, rename and delete a playlist', async ({ authenticatedPage: page }) => {
    const name = `e2e playlist ${Date.now()}`;

    await page.getByRole('button', { name: 'New playlist' }).click();
    await page.getByRole('dialog', { name: 'New playlist' }).getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(/\/playlists\//);
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expect(page.getByText('Nothing in this playlist yet')).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit playlist' });
    await edit.getByLabel('Name').fill(`${name} renamed`);
    await edit.getByLabel('Description').fill('Made by the UI suite.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: `${name} renamed`, level: 1 })).toBeVisible();
    await expect(page.getByText('Made by the UI suite.')).toBeVisible();

    await page.getByRole('button', { name: 'More playlist options' }).click();
    await page.getByRole('menuitem', { name: 'Delete playlist' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.getByRole('link', { name: `${name} renamed` })).toHaveCount(0);
  });

  test('the likes playlist is the Liked screen, and unknown ids say so', async ({ authenticatedPage: page }) => {
    await page.goto('/playlists/likes');
    await expect(page).toHaveURL(/\/liked$/);

    await page.goto('/playlists/no-such-playlist');
    await expect(page.getByText("This playlist doesn't exist")).toBeVisible();

    await page.goto('/albums/no-such-album');
    await expect(page.getByText("This album isn't available")).toBeVisible();
  });
});
