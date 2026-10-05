/**
 * Central, typed gameplay configuration.
 *
 * Every balancing number lives here so that tuning never requires touching
 * system logic. A match takes a deep-frozen snapshot of this object when it
 * starts; later edits only affect new matches.
 */

export interface ArenaConfig {
  /** Arena size in tiles. The logical world is `cols * tileSize` by `rows * tileSize`. */
  cols: number;
  rows: number;
  /** Logical tile size in world units (matches the 1x tile PNGs). */
  tileSize: number;
}

export interface ShipMovementConfig {
  maxHealth: number;
  /** Collision radius in world units. */
  radius: number;
  /** Top forward speed in world units per second. */
  moveSpeed: number;
  /** Forward acceleration in world units per second squared. */
  acceleration: number;
  /** Deceleration applied when not thrusting, in world units per second squared. */
  deceleration: number;
  /** Turn rate in radians per second. */
  turnSpeed: number;
}

export interface SimulationConfig {
  /** Fixed simulation step in milliseconds. */
  stepMs: number;
  /** Longest frame gap the simulation will catch up on, to avoid a spiral of death after a stall. */
  maxFrameMs: number;
}

export interface GameConfig {
  /** Active play time per match, in seconds (60–180). */
  sessionDurationSec: number;
  /** Seconds between enemy spawns. */
  enemySpawnIntervalSec: number;
  arena: ArenaConfig;
  simulation: SimulationConfig;
  player: ShipMovementConfig;
}

export const SESSION_DURATION_LIMITS = { min: 60, max: 180 } as const;
export const ENEMY_SPAWN_INTERVAL_LIMITS = { min: 1, max: 30 } as const;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  sessionDurationSec: 120,
  enemySpawnIntervalSec: 4,
  arena: {
    cols: 20,
    rows: 12,
    tileSize: 64,
  },
  simulation: {
    stepMs: 1000 / 60,
    maxFrameMs: 250,
  },
  player: {
    maxHealth: 100,
    radius: 26,
    moveSpeed: 150,
    acceleration: 220,
    deceleration: 160,
    turnSpeed: Math.PI * 0.75,
  },
};

type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };
export type GameConfigSnapshot = DeepReadonly<GameConfig>;

/** Creates the immutable per-match copy of the configuration. */
export function snapshotConfig(config: GameConfig): GameConfigSnapshot {
  return deepFreeze(structuredClone(config));
}

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child as object);
  }
  return Object.freeze(value);
}
