import { test, expect } from '../fixtures/page';

// The signed-in shell: header, side nav, Home, and the account/theme controls.
test.describe('app shell', () => {
  // UI specs need the web app; skip (rather than fail) when no URL is configured
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  test('signed-out visitors see the landing page, and app URLs go to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();

    await page.goto('/library');
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);
  });

  test('a wrong password shows a friendly error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('melotesta');
    await page.getByLabel('Password').fill('not-the-Password-1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Incorrect username or password.')).toBeVisible();
  });

  test('signing in shows Home inside the shell', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    const nav = page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Library' }) });
    for (const item of ['Home', 'Library', 'Liked', 'Profile']) {
      await expect(nav.getByRole('link', { name: item })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /^Activity/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload track' })).toBeVisible();
  });

  test('the appearance menu switches to dark mode and remembers it', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    expect(await page.evaluate(() => localStorage.getItem('melomelo.theme-mode'))).toBe('dark');

    await page.reload();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('menuitem', { name: 'Automatic' }).click();
    expect(await page.evaluate(() => localStorage.getItem('melomelo.theme-mode'))).toBeNull();
  });

  test('signing out returns to the landing page', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: /account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    // Behind a "Sign out?" confirm
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('uses bottom tabs instead of the side nav and avatar menu', async ({ authenticatedPage: page }) => {
      const tabs = page.getByRole('navigation', { name: 'Main' });
      for (const item of ['Home', 'Search', 'Library', 'Settings']) {
        await expect(tabs.getByRole('link', { name: item })).toBeVisible();
      }
      await expect(tabs.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: /account menu/ })).toHaveCount(0);
      // The bell is a link to the Activity screen on phones (a popover on wider screens)
      await expect(page.getByRole('link', { name: /^Activity/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /your profile/ })).toBeVisible();

      await tabs.getByRole('link', { name: 'Library' }).click();
      await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: /Liked/ })).toBeVisible();
    });

    test('the bell opens the Activity screen, and back returns', async ({ authenticatedPage: page }) => {
      await page.getByRole('link', { name: /^Activity/ }).click();
      await expect(page).toHaveURL(/\/activity$/);
      await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page).toHaveURL(/\/$/);
    });

    // Opens without saving: saving changes user A's profile, which the parallel API
    // profile tests also write (that round trip is checked by hand)
    test('Settings opens the edit-profile page; Save waits for a change, leaving warns', async ({ authenticatedPage: page }) => {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
      await page.getByRole('link', { name: /Edit profile/ }).click();
      await expect(page).toHaveURL(/\/settings\/profile$/);
      await expect(page.getByLabel('Display name')).toBeVisible();
      const save = page.getByRole('button', { name: 'Save changes' });
      await expect(save).toBeDisabled();
      await page.getByLabel('City').fill(`${await page.getByLabel('City').inputValue()} x`);
      await expect(save).toBeEnabled();

      // Leaving with unsaved changes asks first: "Keep editing" stays put…
      const confirm = page.getByRole('alertdialog', { name: 'Discard changes?' });
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Keep editing' }).click();
      await expect(page).toHaveURL(/\/settings\/profile$/);
      await expect(save).toBeEnabled();

      // …and Discard leaves without saving
      await page.getByRole('button', { name: 'Cancel' }).click();
      await confirm.getByRole('button', { name: 'Discard' }).click();
      await expect(page).toHaveURL(/\/settings$/);
    });

    test('signs out from the Settings tab', async ({ authenticatedPage: page }) => {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
      await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    });
  });
});
