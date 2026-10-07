import { expect, HEADING, test } from './support';

// Flow 5 — Chaser and Shooter behaviour, and the spawn interval.

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('Enemies', () => {
  test('a Chaser pursues the player, rams for damage and explodes without scoring', async ({ app }) => {
    await app.open();
    await app.startMatch();
    await app.stage({ x: 640, y: 650, rotation: HEADING.up });
    await app.spawnEnemy('chaser', 640, 200, HEADING.right);

    const approaching = await app.advanceUntil((s) => Math.hypot(s.enemies[0]!.x - s.player.x, s.enemies[0]!.y - s.player.y) < 300, 6000);
    expect(approaching.enemies).toHaveLength(1);

    const rammed = await app.advanceUntil((s) => s.enemies.length === 0, 8000);
    expect(rammed.player.health).toBe(75);
    expect(rammed.score).toBe(0);
  });

  test('a Chaser goes around an island to reach the player', async ({ app }) => {
    await app.open();
    await app.startMatch();
    // Player left of the big island, Chaser straight behind it on the right.
    await app.stage({ x: 640, y: 512, rotation: HEADING.up });
    await app.spawnEnemy('chaser', 1150, 512, HEADING.left);
    const rammed = await app.advanceUntil((s) => s.enemies.length === 0, 12_000);
    expect(rammed.player.health).toBe(75);
  });

  test('a Shooter closes in and only fires within its attack range', async ({ app }) => {
    await app.open();
    await app.startMatch();
    await app.stage({ x: 300, y: 650, rotation: HEADING.up });
    await app.spawnEnemy('shooter', 1100, 650, HEADING.left);

    const firing = await app.advanceUntil((s) => s.projectiles.some((p) => p.faction === 'enemy'), 15_000, 50);
    const shooter = firing.enemies[0]!;
    // Attack range is 380; the shot appears at the muzzle, ahead of the ship.
    expect(distance(shooter, firing.player)).toBeLessThanOrEqual(380 + 10);

    const hit = await app.advanceUntil((s) => s.player.health < 100, 5000, 50);
    expect(hit.player.health).toBe(90);
  });

  test('enemies spawn at the configured interval, both kinds, away from the player', async ({ app }) => {
    await app.open({ options: { sessionDurationSec: 120, enemySpawnIntervalSec: 2 } });
    await app.startMatch();
    await app.setPlayerHealth(1e9);

    // First spawn after 1.5 s, then one every 2 s.
    await app.advance(1400);
    expect((await app.state()).spawnCount).toBe(0);

    const kinds: string[] = [];
    for (const [time, expected] of [
      [1600, 1],
      [3600, 2],
      [5600, 3],
    ] as const) {
      const before = await app.state();
      await app.advance(time - before.elapsed * 1000);
      const state = await app.state();
      expect(state.spawnCount).toBe(expected);
      const newest = state.enemies.at(-1)!;
      kinds.push(newest.kind);
      expect(distance(newest, state.player)).toBeGreaterThanOrEqual(370);
    }
    // The first two spawns are one of each kind, so a standard match always has both.
    expect(kinds.slice(0, 2).sort()).toEqual(['chaser', 'shooter']);
  });
});
