import { Container, Sprite, TilingSprite } from 'pixi.js';
import type { GameTextures } from '../assets';
import { lerp, lerpAngle } from '../math';
import type { Simulation, ShipState } from '../simulation/Simulation';

/** Ship sprites are drawn with the bow pointing down (+y); headings use +x as zero. */
const SHIP_SPRITE_ROTATION_OFFSET = -Math.PI / 2;

/**
 * Turns simulation state into PixiJS display objects. Read-only with respect
 * to the simulation: it never changes game state.
 */
export class GameRenderer {
  /** Root container in world units; the engine scales and positions it to fit the screen. */
  readonly world = new Container();
  private readonly playerSprite: Sprite;

  constructor(
    private readonly simulation: Simulation,
    textures: GameTextures,
  ) {
    const { arena } = simulation;
    const tileSize = simulation.config.arena.tileSize;

    const water = new TilingSprite({ texture: textures.water, width: arena.width, height: arena.height });
    this.world.addChild(water);

    const islands = new Container();
    for (const island of arena.islands) {
      textures.islands[island.kind].forEach((row, rowIndex) => {
        row.forEach((texture, colIndex) => {
          const sprite = new Sprite(texture);
          sprite.position.set((island.col + colIndex) * tileSize, (island.row + rowIndex) * tileSize);
          islands.addChild(sprite);
        });
      });
    }
    this.world.addChild(islands);

    this.playerSprite = new Sprite(textures.playerShip);
    this.playerSprite.anchor.set(0.5);
    this.world.addChild(this.playerSprite);

    // The arena does not change during a match, so its children can skip per-frame transform work.
    islands.isRenderGroup = true;
  }

  /** @param alpha How far (0–1) the current frame is between the last two simulation steps. */
  render(alpha: number): void {
    syncShip(this.playerSprite, this.simulation.player, alpha);
  }

  destroy(): void {
    // Textures are shared through the asset cache and outlive a match.
    this.world.destroy({ children: true, texture: false, textureSource: false });
  }
}

function syncShip(sprite: Sprite, ship: ShipState, alpha: number): void {
  sprite.position.set(
    lerp(ship.previousPosition.x, ship.position.x, alpha),
    lerp(ship.previousPosition.y, ship.position.y, alpha),
  );
  sprite.rotation = lerpAngle(ship.previousRotation, ship.rotation, alpha) + SHIP_SPRITE_ROTATION_OFFSET;
}
