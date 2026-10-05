import { Assets, Texture } from 'pixi.js';
import type { IslandKind } from './simulation/arena';

const BASE = `${import.meta.env.BASE_URL}assets/png/default`;

const tile = (index: number): string => `${BASE}/tiles/tile_${index}.png`;

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

const MANIFEST = {
  water: tile(73),
  playerShip: `${BASE}/ships/ship_2.png`,
} as const;

export interface GameTextures {
  water: Texture;
  playerShip: Texture;
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
  const islandUrls = Object.values(ISLAND_TILES).flat(2).map(tile);
  const urls = [...Object.values(MANIFEST), ...islandUrls];

  const loaded = await Assets.load<Texture>(urls, onProgress).catch(() => ({}) as Record<string, Texture>);
  const failed = urls.filter((url) => !(loaded[url] instanceof Texture));
  if (failed.length > 0) throw new AssetLoadError(failed);

  const get = (url: string): Texture => loaded[url] as Texture;
  const islandTextures = (kind: IslandKind): Texture[][] =>
    ISLAND_TILES[kind].map((row) => row.map((index) => get(tile(index))));

  return {
    water: get(MANIFEST.water),
    playerShip: get(MANIFEST.playerShip),
    islands: { sand: islandTextures('sand'), grass: islandTextures('grass') },
  };
}
