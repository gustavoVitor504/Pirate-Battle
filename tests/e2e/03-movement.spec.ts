import { ARENA, expect, HEADING, test } from './support';

// Flow 3 — starting a match, movement, rotation, arena bounds and island collision.

const HULL_REACH = 30 + 20; // bow circle offset + its radius (config.ts → SHIP_HULL)

test.describe('Movement', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.startMatch();
  });

  test('starts a match with full health, zero score and the configured time @mobile', async ({ app, page }) => {
    const state = await app.state();
    expect(state.status).toBe('running');
    expect(state.player.health).toBe(100);
    expect(state.score).toBe(0);
    expect(state.player).toMatchObject({ x: ARENA.playerStart.x, y: ARENA.playerStart.y });
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
    await expect(page.getByTestId('hud-score')).toHaveText('0');
    await expect(page.getByTestId('hud-time')).toHaveText('02:00');
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('sails forward along its heading', async ({ app }) => {
    await app.stage({ x: 640, y: 600, rotation: HEADING.up });
    await app.hold('KeyW', 1000);
    const { player } = await app.state();
    expect(player.y).toBeLessThan(600 - 60);
    expect(player.x).toBeCloseTo(640, 3);
    expect(player.speed).toBeGreaterThan(0);

    // Without thrust it coasts to a stop.
    await app.advance(2000);
    expect((await app.state()).player.speed).toBe(0);
  });

  test('rotates both ways at the configured turn rate', async ({ app }) => {
    await app.stage({ x: 640, y: 400, rotation: 0 });
    const turnPerSecond = Math.PI * 0.75;

    await app.hold('KeyD', 500);
    expect((await app.state()).player.rotation).toBeCloseTo(turnPerSecond * 0.5, 1);

    await app.hold('ArrowLeft', 1000);
    expect((await app.state()).player.rotation).toBeCloseTo(-turnPerSecond * 0.5, 1);

    // Turning alone does not move the ship.
    expect((await app.state()).player).toMatchObject({ x: 640, y: 400 });
  });

  test('moves and turns at the same time', async ({ app }) => {
    await app.stage({ x: 640, y: 600, rotation: HEADING.up });
    await app.page.keyboard.down('KeyW');
    await app.page.keyboard.down('KeyD');
    await app.advance(1000);
    await app.page.keyboard.up('KeyD');
    await app.page.keyboard.up('KeyW');
    const { player } = await app.state();
    expect(player.rotation).toBeGreaterThan(HEADING.up + 1);
    expect(player.x).toBeGreaterThan(640);
  });

  test('cannot leave the arena', async ({ app }) => {
    await app.stage({ x: 120, y: 400, rotation: HEADING.left });
    await app.hold('KeyW', 3000);
    const { player } = await app.state();
    // The stern-to-bow hull stays fully inside: bow circle edge at x >= 0.
    expect(player.x - HULL_REACH).toBeGreaterThanOrEqual(-0.01);
    expect(player.x).toBeLessThan(HULL_REACH + 2);
    expect(player.y).toBeCloseTo(400, 3);
  });

  test('cannot sail through an island', async ({ app }) => {
    const island = ARENA.grassIsland;
    const y = island.y + island.height / 2;
    await app.stage({ x: 600, y, rotation: HEADING.right });
    await app.hold('KeyW', 4000);
    const { player } = await app.state();
    // Stopped at the coast: the bow reaches the island's edge but not beyond.
    expect(player.x + HULL_REACH).toBeLessThanOrEqual(island.x + 1);
    expect(player.x + HULL_REACH).toBeGreaterThan(island.x - 5);
  });
});
