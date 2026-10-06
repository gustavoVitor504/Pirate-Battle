/**
 * Central, typed gameplay configuration.
 *
 * Every balancing number lives here so that tuning never requires touching
 * system logic. A match takes a deep-frozen snapshot of this object when it
 * starts; later edits only affect new matches.
 *
 * Units: distances in world units (1 tile = 64), times in seconds, angles in
 * radians, speeds per second.
 */

export interface ArenaConfig {
  /** Arena size in tiles. The logical world is `cols * tileSize` by `rows * tileSize`. */
  cols: number;
  rows: number;
  /** Logical tile size in world units (matches the 1x tile PNGs). */
  tileSize: number;
}

/**
 * Ship collision shape: a row of equal circles along the heading axis, which
 * follows the long, narrow hull far better than a single circle.
 */
export interface HullConfig {
  radius: number;
  /** Circle centers along the heading axis, from stern (negative) to bow (positive). */
  offsets: readonly number[];
}

export interface ShipConfig {
  maxHealth: number;
  hull: HullConfig;
  /** Top forward speed. */
  moveSpeed: number;
  acceleration: number;
  /** Speed lost per second while not thrusting. */
  deceleration: number;
  turnSpeed: number;
}

export interface ProjectileConfig {
  damage: number;
  speed: number;
  /** Distance travelled before the projectile expires; lifetime is `range / speed`. */
  range: number;
  radius: number;
}

export interface WeaponConfig {
  projectile: ProjectileConfig;
  /** Minimum time between two shots of this weapon. */
  cooldownSec: number;
  /** Distance from the ship center to where projectiles appear. */
  muzzleOffset: number;
}

export interface BroadsideConfig extends WeaponConfig {
  /** Parallel projectiles per volley. */
  count: number;
  /** Distance between neighbouring projectiles along the hull. */
  spacing: number;
}

export interface PlayerConfig {
  ship: ShipConfig;
  frontCannon: WeaponConfig;
  /** Used by both the port and the starboard battery, which cool down independently. */
  broadside: BroadsideConfig;
}

export interface ChaserConfig {
  ship: ShipConfig;
  /** Damage dealt to the player when the Chaser rams it (and explodes). */
  ramDamage: number;
}

export interface ShooterConfig {
  ship: ShipConfig;
  cannon: WeaponConfig;
  /** Fires when the player is within this distance and roughly ahead. */
  attackRange: number;
  /** Stops approaching once this close, so it holds position and shoots. */
  holdDistance: number;
  /** Maximum angle between heading and the player for a shot. */
  aimTolerance: number;
}

export type EnemyKind = 'chaser' | 'shooter';

export interface SpawnConfig {
  /** Relative chance of each kind after the first volley, which contains one of each. */
  weights: Readonly<Record<EnemyKind, number>>;
  /** Spawns closer than this to the player are rejected. */
  minDistanceFromPlayer: number;
  /** Extra clearance from islands and other ships at the spawn point. */
  clearance: number;
  /** Random positions tried before a spawn is skipped. */
  maxAttempts: number;
  /** Upper bound on live enemies; a spawn due while at the cap is skipped. */
  maxAlive: number;
}

export interface SimulationConfig {
  /** Fixed simulation step in milliseconds. */
  stepMs: number;
  /** Longest frame gap the simulation will catch up on, to avoid a spiral of death after a stall. */
  maxFrameMs: number;
}

export interface GameConfig {
  /** Active play time per match, in seconds. Editable in Options. */
  sessionDurationSec: number;
  /** Seconds between enemy spawns. Editable in Options. */
  enemySpawnIntervalSec: number;
  arena: ArenaConfig;
  simulation: SimulationConfig;
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  spawn: SpawnConfig;
}

export const SESSION_DURATION_LIMITS = { min: 60, max: 180 } as const;
export const ENEMY_SPAWN_INTERVAL_LIMITS = { min: 1, max: 30 } as const;

const SHIP_HULL: HullConfig = { radius: 20, offsets: [-30, 0, 30] };

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
    ship: {
      maxHealth: 100,
      hull: SHIP_HULL,
      moveSpeed: 150,
      acceleration: 220,
      deceleration: 160,
      turnSpeed: Math.PI * 0.75,
    },
    frontCannon: {
      projectile: { damage: 25, speed: 480, range: 520, radius: 5 },
      cooldownSec: 0.45,
      muzzleOffset: 58,
    },
    broadside: {
      projectile: { damage: 20, speed: 420, range: 360, radius: 5 },
      cooldownSec: 1.4,
      muzzleOffset: 28,
      count: 3,
      spacing: 26,
    },
  },
  chaser: {
    ship: {
      maxHealth: 40,
      hull: SHIP_HULL,
      moveSpeed: 115,
      acceleration: 160,
      deceleration: 120,
      turnSpeed: Math.PI * 0.6,
    },
    ramDamage: 25,
  },
  shooter: {
    ship: {
      maxHealth: 60,
      hull: SHIP_HULL,
      moveSpeed: 85,
      acceleration: 120,
      deceleration: 120,
      turnSpeed: Math.PI * 0.5,
    },
    cannon: {
      projectile: { damage: 10, speed: 340, range: 420, radius: 5 },
      cooldownSec: 1.8,
      muzzleOffset: 58,
    },
    attackRange: 380,
    holdDistance: 260,
    aimTolerance: 0.2,
  },
  spawn: {
    weights: { chaser: 0.55, shooter: 0.45 },
    minDistanceFromPlayer: 380,
    clearance: 24,
    maxAttempts: 40,
    maxAlive: 14,
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
