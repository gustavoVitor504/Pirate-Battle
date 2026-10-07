import { expect, HEADING, STEP_MS, test } from './support';

// Flow 4 — front and broadside fire, damage, cooldowns and scoring without duplicates.

test.describe('Combat', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.startMatch();
    await app.stage({ x: 640, y: 600, rotation: HEADING.up });
  });

  test('front cannon fires one projectile that damages an enemy once', async ({ app }) => {
    const enemy = await app.spawnEnemy('chaser', 640, 300, HEADING.down);
    await app.tap('Space');

    const fired = await app.state();
    const shots = fired.projectiles.filter((p) => p.faction === 'player');
    expect(shots).toHaveLength(1);
    expect(shots[0]!.x).toBeCloseTo(640, 3);
    expect(shots[0]!.y).toBeLessThan(600);

    const hit = await app.advanceUntil((s) => s.projectiles.length === 0, 1500, 50);
    // Chaser: 40 HP, front cannon: 25 damage. The projectile is gone after the hit.
    expect(hit.enemies.find((e) => e.id === enemy)?.health).toBe(15);
    expect(hit.score).toBe(0);
  });

  test('broadsides fire three parallel projectiles to each side', async ({ app }) => {
    await app.tap('KeyQ');
    let state = await app.state();
    expect(state.projectiles).toHaveLength(3);
    expect(state.projectiles.every((p) => p.x < 640)).toBe(true);
    const ys = state.projectiles.map((p) => Math.round(p.y)).sort((a, b) => a - b);
    expect(new Set(ys).size).toBe(3);

    await app.tap('KeyE');
    state = await app.state();
    expect(state.projectiles).toHaveLength(6);
    expect(state.projectiles.filter((p) => p.x > 640)).toHaveLength(3);
  });

  test('each weapon respects its own cooldown', async ({ app }) => {
    // Front cannon: 0.45 s cooldown → shots at 0, 0.45 and 0.9 s while held for 1 s.
    await app.hold('Space', 1000);
    expect((await app.state()).projectiles).toHaveLength(3);
    expect((await app.state()).player.cooldowns.front).toBeGreaterThan(0);

    // Broadside: 1.4 s cooldown; a second press right away does nothing.
    await app.tap('KeyQ');
    const afterFirst = (await app.state()).projectiles.length;
    await app.advance(200);
    await app.tap('KeyQ');
    expect((await app.state()).projectiles.length).toBeLessThanOrEqual(afterFirst);
    expect((await app.state()).player.cooldowns.left).toBeGreaterThan(1);

    // The other side has its own battery and is ready.
    await app.tap('KeyE');
    expect((await app.state()).player.cooldowns.right).toBeGreaterThan(1.3);
  });

  test('destroying an enemy scores exactly one point even when several shots hit it', async ({ app, page }) => {
    // A vertical chaser just left of the player: all three broadside balls reach it together.
    const enemy = await app.spawnEnemy('chaser', 500, 600, HEADING.up);
    await app.setEnemyHealth(enemy, 5);
    await app.tap('KeyQ');

    const after = await app.advanceUntil((s) => s.enemies.length === 0, 1000, STEP_MS * 2);
    expect(after.score).toBe(1);
    await app.advance(1500);
    expect((await app.state()).score).toBe(1);
    await expect(page.getByTestId('hud-score')).toHaveText('1');
  });

  test('destroyed enemies stop colliding and causing damage', async ({ app }) => {
    const enemy = await app.spawnEnemy('chaser', 640, 380, HEADING.down);
    await app.setEnemyHealth(enemy, 1);
    await app.tap('Space');
    await app.advanceUntil((s) => s.enemies.length === 0, 1500, 50);
    await app.advance(3000);
    expect((await app.state()).player.health).toBe(100);
  });
});
