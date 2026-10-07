import { expect, test } from './support';

// Flow 2 — asset loading, failure and retry.

test.describe('Asset loading', () => {
  test('shows progress while the arena assets load @mobile', async ({ app, page }) => {
    await app.open();
    // Slow the textures down so the loading state is observable (context routes also see Service Worker traffic).
    await page.context().route('**/assets/png/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    const loading = page.getByRole('status').filter({ hasText: 'Loading assets' });
    await expect(loading).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Asset loading progress' })).toBeVisible();
    await expect(loading).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('hud-time')).toBeVisible();
  });

  test('reports a failure and recovers with Try again', async ({ app, page }) => {
    await app.open();
    // The game logs the failed requests; they are the point of this test.
    app.allowConsoleErrors(/Failed to load resource/, /net::ERR_FAILED/);

    await page.context().route('**/assets/png/default/tiles/tile_73.png', (route) => route.fulfill({ status: 404 }));
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('The game assets could not be loaded.');
    expect(await page.evaluate(() => window.__pirateTest!.isReady())).toBe(false);

    await page.context().unroute('**/assets/png/default/tiles/tile_73.png');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => window.__pirateTest?.isReady() === true);
    await expect(page.getByTestId('hud-time')).toBeVisible();
  });

  test('lets the player leave after a failure', async ({ app, page }) => {
    await app.open();
    app.allowConsoleErrors(/Failed to load resource/, /net::ERR_FAILED/);
    await page.context().route('**/assets/png/default/ships/**', (route) => route.fulfill({ status: 503 }));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be loaded');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });
});
