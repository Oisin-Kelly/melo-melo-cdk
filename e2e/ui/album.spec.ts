import { test, expect } from '../fixtures/page';
import { PERSISTENT_TRACK_PREFIX } from '../fixtures/upload';

// An album's lifecycle through the UI: made from tracks already uploaded, its tracks
// reordered, then deleted. Uses a fresh name and deletes what it creates; it only reads
// the persistent upload tracks (albums never change a track), so it can't disturb other specs.
test.describe('album editor', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('create an album from uploaded tracks, reorder them, delete it', async ({ authenticatedPage: page }) => {
    const name = `e2e album ${Date.now()}`;

    await page.goto('/library');
    await page.getByRole('button', { name: 'New album' }).click();
    const create = page.getByRole('dialog', { name: 'New album' });
    await create.getByLabel('Name').fill(name);
    await create.getByRole('button', { name: 'Add tracks', exact: true }).click();
    await create.getByLabel('Search your tracks').fill(PERSISTENT_TRACK_PREFIX.trim());
    await expect(create.getByText(/of 50 picked/)).toBeVisible();
    const boxes = create.getByRole('checkbox');
    test.skip((await boxes.count()) < 2, 'needs two persistent upload tracks (run upload.spec first)');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await create.getByRole('button', { name: 'Done' }).click();
    const [first, second] = await create.locator('.mm-edit-name').allTextContents();

    await create.getByRole('button', { name: 'Create album' }).click();
    await page.waitForURL(/\/albums\//);
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    const rows = page.locator('.mm-row-link');
    await expect(rows).toHaveText([first, second]);

    await page.getByRole('button', { name: 'More album options' }).click();
    await page.getByRole('menuitem', { name: 'Edit tracks' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit tracks' });
    await edit.getByRole('button', { name: /^Move / }).first().focus();
    await page.keyboard.press('ArrowDown');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();
    await expect(rows).toHaveText([second, first]);
    await page.reload();
    await expect(rows).toHaveText([second, first]);

    await page.getByRole('button', { name: 'More album options' }).click();
    await page.getByRole('menuitem', { name: 'Delete album' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.includes('/albums/'));
  });
});
