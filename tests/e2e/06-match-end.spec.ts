import { expect, HEADING, test } from './support';

// Flow 6 — ending by time and by death, the simulation stopping, and a clean restart.

test.describe('Match end', () => {
  test('ends when the time runs out and freezes the simulation @mobile', async ({ app, page }) => {
    await app.open({ options: { sessionDurationSec: 60, enemySpawnIntervalSec: 2 } });
    await app.startMatch();
    await app.setPlayerHealth(1e9);

    await app.advance(59_000);
    expect((await app.state()).status).toBe('running');
    await expect(page.getByTestId('hud-time')).toHaveText('00:01');

    await app.advance(1_100);
    const ended = await app.state();
    expect(ended).toMatchObject({ status: 'ended', endReason: 'time-up', remaining: 0 });
    expect(ended.elapsed).toBe(60);

    // Nothing moves, fires, spawns or scores after the end.
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await app.advance(3_000);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
    const frozen = await app.state();
    expect(frozen.elapsed).toBe(ended.elapsed);
    expect(frozen.score).toBe(ended.score);
    expect(frozen.spawnCount).toBe(ended.spawnCount);
    expect(frozen.player).toEqual(ended.player);
    expect(frozen.enemies.map(({ x, y }) => ({ x, y }))).toEqual(ended.enemies.map(({ x, y }) => ({ x, y })));
    expect(frozen.projectiles.filter((p) => p.faction === 'player').length).toBeLessThanOrEqual(
      ended.projectiles.filter((p) => p.faction === 'player').length,
    );

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Time up');
    await expect(page.getByTestId('result-time')).toHaveText('01:00');
  });

  test('ends when the player is sunk', async ({ app, page }) => {
    await app.open();
    await app.startMatch();
    await app.stage({ x: 640, y: 650, rotation: HEADING.up });
    await app.setPlayerHealth(10);
    await app.spawnEnemy('chaser', 640, 350, HEADING.down);

    const ended = await app.advanceUntil((s) => s.status === 'ended', 8000);
    expect(ended).toMatchObject({ endReason: 'player-destroyed', score: 0 });
    expect(ended.player.health).toBe(0);
    expect(ended.elapsed).toBeLessThan(120);

    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship sunk');
  });

  test('Play Again starts a fresh match with everything restored', async ({ app, page }) => {
    await app.open({ options: { sessionDurationSec: 60, enemySpawnIntervalSec: 1 } });
    await app.startMatch();
    await app.hold('Space', 500);
    await app.finishByTime();
    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForFunction(() => window.__pirateTest?.isReady() === true);

    const fresh = await app.state();
    expect(fresh).toMatchObject({ status: 'running', elapsed: 0, score: 0, spawnCount: 0, enemies: [], projectiles: [] });
    expect(fresh.player).toMatchObject({ x: 640, y: 672, health: 100, speed: 0 });
    await expect(page.getByTestId('hud-time')).toHaveText('01:00');
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
