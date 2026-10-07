import type { EnemyKind } from '../game/config';
import type { GameEngine } from '../game/GameEngine';
import type { Ship } from '../game/simulation/entities';

/**
 * Test instrumentation for the Playwright suite. Enabled only with
 * `?testHooks=1` in the URL, in any build:
 *
 *   ?testHooks=1      expose `window.__pirateTest`
 *   &seed=123         fixed seed for spawns (reproducible matches)
 *   &manualClock=1    game time advances only through `__pirateTest.advance(ms)`
 *
 * The hooks observe state, control the clock and stage scenes (place ships,
 * switch off timed spawns). They never replace the game's rules, input,
 * collisions or rendering: tests still press keys and buttons and assert on
 * the outcome.
 */

export interface TestConfig {
  enabled: boolean;
  seed?: number;
  manualClock: boolean;
}

export function readTestConfig(search: string = window.location.search): TestConfig {
  const params = new URLSearchParams(search);
  const enabled = params.get('testHooks') === '1';
  const seed = Number(params.get('seed'));
  return {
    enabled,
    ...(enabled && params.has('seed') && Number.isInteger(seed) ? { seed } : {}),
    manualClock: enabled && params.get('manualClock') === '1',
  };
}

const describeShip = (ship: Ship) => ({
  id: ship.id,
  kind: ship.kind,
  x: ship.position.x,
  y: ship.position.y,
  rotation: ship.rotation,
  speed: ship.speed,
  health: ship.health,
  maxHealth: ship.stats.maxHealth,
  cooldowns: { ...ship.cooldowns },
});

export type TestShip = ReturnType<typeof describeShip>;

let engine: GameEngine | null = null;

function requireEngine(): GameEngine {
  if (!engine?.isRunning) throw new Error('No match is running');
  return engine;
}

const api = {
  version: 1,
  /** True once a match is loaded and running (assets ready, loop started). */
  isReady: (): boolean => engine?.isRunning ?? false,

  state() {
    if (!engine?.isRunning) return null;
    const sim = engine.simulation;
    return {
      status: sim.status,
      endReason: sim.endReason,
      paused: engine.isPaused,
      elapsed: sim.elapsed,
      remaining: sim.remainingTime,
      score: sim.score,
      spawnCount: sim.spawnCount,
      player: describeShip(sim.player),
      enemies: sim.enemies.filter((ship) => ship.alive).map(describeShip),
      projectiles: sim.projectiles.map((p) => ({ id: p.id, faction: p.faction, x: p.position.x, y: p.position.y })),
      arena: { width: sim.arena.width, height: sim.arena.height },
      obstacles: sim.arena.obstacles.map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
    };
  },

  /** Advances game time (manual-clock mode). */
  advance(ms: number): void {
    requireEngine().advance(ms);
  },

  /** Stops timed spawns so a test can stage its own enemies. */
  disableSpawning(): void {
    requireEngine().simulation.spawningEnabled = false;
  },

  placePlayer(x: number, y: number, rotation: number): void {
    const player = requireEngine().simulation.player;
    player.position = { x, y };
    player.previousPosition = { x, y };
    player.rotation = rotation;
    player.previousRotation = rotation;
    player.speed = 0;
  },

  setPlayerHealth(health: number): void {
    requireEngine().simulation.player.health = health;
  },

  spawnEnemy(kind: EnemyKind, x: number, y: number, rotation: number): number {
    return requireEngine().simulation.spawnEnemy(kind, { x, y }, rotation).id;
  },

  setEnemyHealth(id: number, health: number): void {
    const enemy = requireEngine().simulation.enemies.find((ship) => ship.id === id);
    if (!enemy) throw new Error(`No enemy ${id}`);
    enemy.health = health;
  },

  clearEnemies(): void {
    const sim = requireEngine().simulation;
    sim.enemies = [];
    sim.projectiles = [];
  },
};

export type PirateTestApi = typeof api;

declare global {
  interface Window {
    __pirateTest?: PirateTestApi;
  }
}

export function installTestHooks(): void {
  window.__pirateTest = api;
}

/** Called by the game screen; returns the detach function for its cleanup. */
export function attachEngine(next: GameEngine): () => void {
  engine = next;
  return () => {
    if (engine === next) engine = null;
  };
}
