import { test, expect } from '../fixtures/page';
import { TEST_USER_A, TEST_USER_B } from '../fixtures/auth';

// Profiles (/:username — the old /u/:username redirects). The `ui` project runs after both API projects, and no other UI
// spec reads follow counts, so the follow → unfollow round trip here can't race them.
test.describe('profile', () => {
  test.skip(!process.env.WEB_BASE_URL, 'set WEB_BASE_URL to run the UI tests');

  const a = TEST_USER_A.username.toLowerCase();
  const b = TEST_USER_B.username.toLowerCase();

  test('your own profile has Edit profile and your uploads, no Follow', async ({ authenticatedPage: page }) => {
    await page.goto(`/${a}`);
    await expect(page.getByText('PROFILE', { exact: true })).toBeVisible();
    await expect(page.getByText(`@${a}`, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Follow/ })).toHaveCount(0);
    await expect(page.getByText('YOUR TRACKS', { exact: true })).toBeVisible();
  });

  test("someone else's profile: follow, survives a reload, unfollow restores it", async ({ authenticatedPage: page }) => {
    await page.goto(`/${b}`);
    await expect(page.getByText('TRACKS SHARED WITH YOU', { exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: /^(Follow|Following)$/ });
    const followers = page.getByRole('link', { name: /followers?$/ });
    // Follow is optimistic — the button flips before the request lands — so wait for the
    // server before reloading, or the reload cancels it
    const toggle = () =>
      Promise.all([page.waitForResponse((r) => r.url().includes('/follow-user') && r.ok()), button.click()]);
    // Seeded state is "not following"; a run that died mid-test may have left A following B
    await expect(button).toHaveText(/^(Follow|Following)$/);
    if ((await button.textContent()) === 'Following') {
      await toggle();
      await expect(button).toHaveText('Follow');
      await page.reload();
      await expect(button).toHaveText('Follow');
    }
    const before = Number((await followers.textContent())!.match(/\d+/)![0]);

    await toggle();
    await expect(button).toHaveText('Following');
    await expect(followers).toContainText(String(before + 1));
    await page.reload();
    await expect(button).toHaveText('Following');

    await toggle();
    await expect(button).toHaveText('Follow');
    await expect(followers).toContainText(String(before));
  });

  test('the followers count opens the list, and going back returns to the profile', async ({ authenticatedPage: page }) => {
    await page.goto(`/${b}`);
    await page.getByRole('link', { name: /followers?$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${b}/followers$`));
    await expect(page.getByRole('heading', { name: 'Followers', level: 1 })).toBeVisible();
    // No back button on wider screens (phones only): the browser's back does it
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${b}$`));
  });

  test('old /u/ links move to the root profile URL', async ({ authenticatedPage: page }) => {
    await page.goto(`/u/${b}/followers`);
    await expect(page).toHaveURL(new RegExp(`/${b}/followers$`));
    await expect(page.getByRole('heading', { name: 'Followers', level: 1 })).toBeVisible();
  });

  test('an unknown username says so', async ({ authenticatedPage: page }) => {
    await page.goto('/nobody.by.this.name.e2e');
    await expect(page.getByText('No one here')).toBeVisible();
  });
});
