import { Assets, Texture } from 'pixi.js';
import type { IslandKind } from './simulation/arena';
import type { ShipKind } from './simulation/entities';

const BASE = `${import.meta.env.BASE_URL}assets/png/default`;

const tile = (index: number): string => `${BASE}/tiles/tile_${index}.png`;
const ship = (index: number): string => `${BASE}/ships/ship_${index}.png`;

/** Tile indices (row-major, 16 per row, 1-based) of each island block in the tilesheet. */
const ISLAND_TILES: Readonly<Record<IslandKind, readonly (readonly number[])[]>> = {
  sand: [
    [1, 2, 3],
    [17, 18, 19],
    [33, 34, 35],
  ],
  grass: [
    [6, 7, 8, 9],
    [22, 23, 24, 25],
    [38, 39, 40, 41],
    [54, 55, 56, 57],
  ],
};

/**
 * The ship art comes in 6 colors x 4 wear stages: `ship_{c}` is intact,
 * `ship_{c+6}` and `ship_{c+12}` progressively damaged, `ship_{c+18}` a wreck.
 */
const SHIP_COLOR: Readonly<Record<ShipKind, number>> = {
  player: 5, // blue
  chaser: 3, // red
  shooter: 2, // black
};
export const SHIP_WEAR_STAGES = 4;
const shipStageUrls = (color: number): string[] =>
  Array.from({ length: SHIP_WEAR_STAGES }, (_, stage) => ship(color + stage * 6));

const MANIFEST = {
  water: tile(73),
  cannonBall: `${BASE}/ship_parts/cannon_ball.png`,
  explosionLarge: `${BASE}/effects/explosion_1.png`,
  explosionMedium: `${BASE}/effects/explosion_2.png`,
  explosionSmall: `${BASE}/effects/explosion_3.png`,
  fireLarge: `${BASE}/effects/fire_1.png`,
  fireSmall: `${BASE}/effects/fire_2.png`,
  healthFrame: `${BASE}/ui/hud/health_frame.png`,
  healthFillGreen: `${BASE}/ui/hud/health_fill_green.png`,
  healthFillAmber: `${BASE}/ui/hud/health_fill_amber.png`,
  healthFillRed: `${BASE}/ui/hud/health_fill_red.png`,
  enemyHealthFrame: `${BASE}/ui/hud/enemy_health_frame.png`,
  enemyHealthFillGreen: `${BASE}/ui/hud/enemy_health_fill_green.png`,
  enemyHealthFillRed: `${BASE}/ui/hud/enemy_health_fill_red.png`,
} as const;

export type TextureKey = keyof typeof MANIFEST;

export interface GameTextures extends Record<TextureKey, Texture> {
  /** Ship textures per kind, ordered from intact to wreck. */
  ships: Record<ShipKind, Texture[]>;
  /** Island tile textures, indexed [row][col]. */
  islands: Record<IslandKind, Texture[][]>;
}

export class AssetLoadError extends Error {
  constructor(readonly failedUrls: readonly string[]) {
    super(`Failed to load ${failedUrls.length} game asset(s).`);
    this.name = 'AssetLoadError';
  }
}

/**
 * Loads every texture a match needs. Textures stay in the PixiJS cache and are
 * reused by later matches; a second call resolves immediately.
 */
export async function loadGameTextures(onProgress?: (progress: number) => void): Promise<GameTextures> {
  const shipKinds = Object.keys(SHIP_COLOR) as ShipKind[];
  const islandKinds = Object.keys(ISLAND_TILES) as IslandKind[];
  const urls = [
    ...Object.values(MANIFEST),
    ...shipKinds.flatMap((kind) => shipStageUrls(SHIP_COLOR[kind])),
    ...islandKinds.flatMap((kind) => ISLAND_TILES[kind].flat().map(tile)),
  ];

  const loaded = await Assets.load<Texture>(urls, onProgress).catch(() => ({}) as Record<string, Texture>);
  const failed = urls.filter((url) => !(loaded[url] instanceof Texture));
  if (failed.length > 0) throw new AssetLoadError(failed);

  const get = (url: string): Texture => loaded[url] as Texture;
  const named = Object.fromEntries(
    Object.entries(MANIFEST).map(([key, url]) => [key, get(url)]),
  ) as Record<TextureKey, Texture>;

  return {
    ...named,
    ships: Object.fromEntries(
      shipKinds.map((kind) => [kind, shipStageUrls(SHIP_COLOR[kind]).map(get)]),
    ) as Record<ShipKind, Texture[]>,
    islands: Object.fromEntries(
      islandKinds.map((kind) => [kind, ISLAND_TILES[kind].map((row) => row.map((index) => get(tile(index))))]),
    ) as Record<IslandKind, Texture[][]>,
  };
}
