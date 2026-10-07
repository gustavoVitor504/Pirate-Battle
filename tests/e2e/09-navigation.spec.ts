import { expect, test } from './support';

// Flow 9 — abandoning a match, repeated navigation between screens, and touch controls.

test.describe('Navigation', () => {
  test('abandoning a match records nothing @mobile', async ({ app, page }) => {
    await app.open();
    await app.startMatch();
    await app.advance(5000);

    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByTestId('last-match')).toHaveCount(0);
    await expect(page.getByTestId('pending-notice')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(app.tabPanel).toContainText('No recorded matches yet');
    expect(await app.mockRecords()).toEqual([]);
  });

  test('a refresh during a match abandons it and returns to the menu', async ({ app, page }) => {
    await app.open();
    await app.startMatch();
    await app.advance(3000);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByTestId('last-match')).toHaveCount(0);
    expect(await app.mockRecords()).toEqual([]);
  });

  test('repeated navigation leaves no stray canvases or errors', async ({ app, page }) => {
    await app.open();
    for (let round = 0; round < 4; round++) {
      await app.startMatch();
      await expect(page.locator('canvas')).toHaveCount(1);
      await app.advance(500);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);

      await page.getByRole('button', { name: 'Options' }).click();
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
    // Game keys are not captured outside gameplay: Space scrolls/acts normally in menus.
    await page.getByRole('button', { name: 'Options' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
  });

  test('touch controls move the ship and fire at the same time @mobile', async ({ app, page, isMobile }) => {
    test.skip(!isMobile, 'touch controls are shown on touch devices');
    await app.open();
    await app.startMatch();
    await app.stage({ x: 640, y: 600, rotation: -Math.PI / 2 });
    await expect(page.getByTestId('touch-controls')).toBeVisible();

    const center = async (name: string) => {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const forward = await center('Sail forward');
    const fire = await center('Fire front cannon');

    // Two fingers at once, through real touch events.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...forward, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...forward, id: 1 },
        { ...fire, id: 2 },
      ],
    });
    await app.advance(1000);
    const during = await app.state();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    expect(during.player.y).toBeLessThan(600 - 50);
    expect(during.projectiles.filter((p) => p.faction === 'player').length).toBeGreaterThanOrEqual(2);

    await app.advance(2000);
    expect((await app.state()).player.speed).toBe(0);
  });
});
