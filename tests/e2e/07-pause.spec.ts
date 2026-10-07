import { expect, test } from './support';

// Flow 7 — pause, focus loss and resuming without the clock running on.
// These tests use the real clock: real time passes while paused and must not count.

const pausedDialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Paused' });

test.describe('Pause', () => {
  test.beforeEach(async ({ app }) => {
    await app.open({ manualClock: false });
    await app.startMatch();
    await app.page.waitForTimeout(300);
  });

  test('manual pause freezes the clock, cooldowns and movement @mobile', async ({ app, page }) => {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Pause game' }).click();
    await expect(pausedDialog(page)).toBeVisible();

    const paused = await app.state();
    expect(paused.paused).toBe(true);
    await page.waitForTimeout(1500);
    const later = await app.state();
    expect(later.elapsed).toBe(paused.elapsed);
    expect(later.player.cooldowns.front).toBe(paused.player.cooldowns.front);
    expect(later.projectiles).toEqual(paused.projectiles);
  });

  test('resuming needs a player action and does not replay input from the pause', async ({ app, page }) => {
    await page.keyboard.press('Escape');
    await expect(pausedDialog(page)).toBeVisible();
    const paused = await app.state();

    // Keys held during the pause are dropped, not accumulated.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');
    expect((await app.state()).player).toEqual(paused.player);

    const clickedAt = Date.now();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(pausedDialog(page)).toBeHidden();
    const resumed = await app.state();
    const realSecondsSinceResume = (Date.now() - clickedAt) / 1000;
    expect(resumed.paused).toBe(false);
    // Only time after the click counts: the 1.2 s spent paused is not added.
    expect(resumed.elapsed - paused.elapsed).toBeLessThanOrEqual(realSecondsSinceResume + 0.1);
    expect(resumed.player.speed).toBe(0);

    // And the clock runs again.
    await page.waitForTimeout(500);
    expect((await app.state()).elapsed).toBeGreaterThan(resumed.elapsed);
  });

  test('pauses automatically when the window loses focus', async ({ app, page }) => {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(pausedDialog(page)).toContainText('lost focus');
    const paused = await app.state();
    await page.waitForTimeout(1000);
    expect((await app.state()).elapsed).toBe(paused.elapsed);

    // Escape (or P) resumes as well.
    await page.keyboard.press('Escape');
    await expect(pausedDialog(page)).toBeHidden();
  });

  test('pauses automatically when the tab is hidden', async ({ app, page }) => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pausedDialog(page)).toBeVisible();
    const paused = await app.state();
    await page.waitForTimeout(1000);
    expect((await app.state()).elapsed).toBe(paused.elapsed);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    });
    await page.keyboard.press('KeyP');
    await expect(pausedDialog(page)).toBeHidden();
  });
});
