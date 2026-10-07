import { expect, test } from './support';

// Visual regression of the menu, a stable arena and the result screen (baselines in __screenshots__).

const LAST_RESULT = {
  matchId: 'visual-match',
  endedAt: '2026-09-20T12:00:00.000Z',
  score: 24,
  durationSec: 120,
  reason: 'time-up',
  settings: { sessionDurationSec: 120, enemySpawnIntervalSec: 4 },
};

test.describe('Visual regression', () => {
  test.skip(({ isMobile }) => isMobile, 'baselines are kept for the desktop project');

  test('main menu', async ({ app, page }) => {
    await app.open({ storage: { 'pirate-battle:last-result': LAST_RESULT } });
    await expect(page.getByTestId('ranking-table').locator('tbody tr')).toHaveCount(5);
    await expect(page).toHaveScreenshot('main-menu.png');
  });

  test('arena in a stable state', async ({ app, page }) => {
    await app.open({ seed: 42 });
    await app.startMatch();
    await app.stage({ x: 640, y: 600, rotation: -Math.PI / 2 });
    await app.spawnEnemy('chaser', 300, 520, 0);
    const shooter = await app.spawnEnemy('shooter', 1100, 300, Math.PI);
    await app.setEnemyHealth(shooter, 20);
    await app.setPlayerHealth(55);
    // One frame so the scene is drawn; no time passes for the ships.
    await app.advance(0.001);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ app, page }) => {
    await app.open({ storage: { 'pirate-battle:last-result': LAST_RESULT }, session: { 'pirate-battle:screen': 'result' } });
    await expect(page.getByTestId('result-record')).toHaveAttribute('data-status', 'recorded');
    await expect(page).toHaveScreenshot('result.png');
  });
});
