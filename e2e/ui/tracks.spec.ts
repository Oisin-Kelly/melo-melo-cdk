import { test, expect } from '../fixtures/page';

// The manage tables — Your tracks (/tracks), albums (/albums), playlists (/playlists).
// Read-only here — it sorts, filters, selects and opens the dialogs, then backs out, so the
// persistent tracks stay put.
test.describe('your tracks', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('the table: sort by name, select rows, bulk bar, confirm then cancel', async ({ authenticatedPage: page, apiContext }) => {
    const mine = (await (await apiContext.get('/tracks?limit=100')).json()).items as { name: string }[];
    test.skip(mine.length < 2, 'user A needs two tracks');

    await page.getByRole('link', { name: 'Manage' }).click();
    await expect(page).toHaveURL(/\/tracks$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your tracks');
    const table = page.getByRole('table');
    // Newest first, as the API lists them
    await expect(table.getByRole('row').nth(1)).toContainText(mine[0].name);

    await table.getByRole('button', { name: /Track/ }).click();
    await expect(page).toHaveURL(/sort=name/);

    const boxes = table.getByRole('checkbox', { name: /^Select (?!all)/ });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    const bar = page.getByRole('toolbar', { name: 'Selected tracks' });
    await expect(bar).toContainText('2 selected');
    for (const name of ['Add to playlist', 'New album from selected', 'Share', 'Delete'])
      await expect(bar.getByRole('button', { name })).toBeEnabled();

    await bar.getByRole('button', { name: 'Delete' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete 2 tracks?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();

    await bar.getByRole('button', { name: 'Unselect all' }).click();
    // The bar stays put; its buttons go off again
    await expect(bar.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('tabs lead to Your albums and Your playlists', async ({ authenticatedPage: page }) => {
    await page.goto('/tracks');
    await page.getByRole('link', { name: 'Albums', exact: true }).click();
    await expect(page).toHaveURL(/\/albums$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your albums');
    await expect(page.getByRole('button', { name: 'New album' }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Playlists', exact: true }).click();
    await expect(page).toHaveURL(/\/playlists$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your playlists');
    await expect(page.getByRole('button', { name: 'New playlist' }).first()).toBeVisible();
  });

  test('the pencil opens Edit track in place', async ({ authenticatedPage: page, apiContext }) => {
    const track = (await (await apiContext.get('/tracks?limit=1')).json()).items[0];
    test.skip(!track, 'user A has no tracks');

    await page.goto('/tracks');
    await page.getByRole('button', { name: `Edit ${track.name}`, exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Edit track' });
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(track.name);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/tracks$/);
  });
});
