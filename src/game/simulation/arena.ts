import type { ArenaConfig } from '../config';

/** Which tile block an island is drawn with. */
export type IslandKind = 'sand' | 'grass';

export interface IslandLayout {
  kind: IslandKind;
  /** Top-left corner, in tiles. */
  col: number;
  row: number;
}

/** Tile footprint of each island kind (matches the art blocks in the tilesheet). */
export const ISLAND_SIZE_IN_TILES: Readonly<Record<IslandKind, number>> = {
  sand: 3,
  grass: 4,
};

/**
 * Inset from the tile block edge to the visible coastline, and the corner
 * rounding of that coastline, in world units. Tuned by eye against the art.
 */
const ISLAND_SHAPE: Readonly<Record<IslandKind, { inset: number; cornerRadius: number }>> = {
  sand: { inset: 8, cornerRadius: 40 },
  grass: { inset: 6, cornerRadius: 48 },
};

export const DEFAULT_ISLANDS: readonly IslandLayout[] = [
  { kind: 'sand', col: 3, row: 2 },
  { kind: 'grass', col: 12, row: 6 },
  { kind: 'sand', col: 15, row: 1 },
];

/** Solid obstacle: an axis-aligned rectangle with rounded corners, in world units. */
export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

export interface Arena {
  width: number;
  height: number;
  islands: readonly IslandLayout[];
  obstacles: readonly Obstacle[];
}

export function createArena(config: ArenaConfig, islands: readonly IslandLayout[] = DEFAULT_ISLANDS): Arena {
  const obstacles = islands.map((island): Obstacle => {
    const size = ISLAND_SIZE_IN_TILES[island.kind] * config.tileSize;
    const { inset, cornerRadius } = ISLAND_SHAPE[island.kind];
    return {
      x: island.col * config.tileSize + inset,
      y: island.row * config.tileSize + inset,
      width: size - inset * 2,
      height: size - inset * 2,
      cornerRadius,
    };
  });

  return {
    width: config.cols * config.tileSize,
    height: config.rows * config.tileSize,
    islands,
    obstacles,
  };
}
