import { Container, Sprite, TilingSprite } from 'pixi.js';
import { SHIP_WEAR_STAGES, type GameTextures } from '../assets';
import { lerp, lerpAngle } from '../math';
import type { GameEvent, Projectile, Ship } from '../simulation/entities';
import type { Simulation } from '../simulation/Simulation';
import { EffectLayer } from './Effects';
import { HealthBar, type HealthBarStyle } from './HealthBar';

/** Ship sprites are drawn with the bow pointing down (+y); headings use +x as zero. */
const SHIP_SPRITE_ROTATION_OFFSET = -Math.PI / 2;
/** Health bars float this far above the ship center, in world units. */
const HEALTH_BAR_OFFSET_Y = -66;
/** How long a hit tints the hull. */
const HIT_FLASH_SEC = 0.12;

interface ShipView {
  /** Rotated group holding the hull art and its fires. */
  body: Container;
  hull: Sprite;
  fires: Sprite[];
  bar: HealthBar;
  stage: number;
  flash: number;
}

/**
 * Turns simulation state into PixiJS display objects. Read-only with respect
 * to the simulation: it never changes game state.
 */
export class GameRenderer {
  /** Root container in world units; the engine scales and positions it to fit the screen. */
  readonly world = new Container();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly barLayer = new Container();
  private readonly wreckEffects = new EffectLayer();
  private readonly effects = new EffectLayer();
  private readonly shipViews = new Map<number, ShipView>();
  private readonly projectileViews = new Map<number, Sprite>();
  private readonly projectilePool: Sprite[] = [];
  private readonly playerBarStyle: HealthBarStyle;
  private readonly enemyBarStyle: HealthBarStyle;
  private time = 0;

  constructor(
    private readonly simulation: Simulation,
    private readonly textures: GameTextures,
  ) {
    const { arena } = simulation;
    const tileSize = simulation.config.arena.tileSize;

    const water = new TilingSprite({ texture: textures.water, width: arena.width, height: arena.height });

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
    // The arena does not change during a match, so it is rendered as its own group.
    islands.isRenderGroup = true;

    this.world.addChild(
      water,
      islands,
      this.wreckEffects.container,
      this.shipLayer,
      this.projectileLayer,
      this.effects.container,
      this.barLayer,
    );

    // Fill areas come from `ui_sheet.json` (`ui.layout.fill_rect`).
    this.playerBarStyle = {
      frame: textures.healthFrame,
      fills: [
        { above: 0.6, texture: textures.healthFillGreen },
        { above: 0.3, texture: textures.healthFillAmber },
        { above: 0, texture: textures.healthFillRed },
      ],
      fillRect: { x: 30, w: 196 },
      scale: 0.38,
    };
    this.enemyBarStyle = {
      frame: textures.enemyHealthFrame,
      fills: [
        { above: 0.4, texture: textures.enemyHealthFillGreen },
        { above: 0, texture: textures.enemyHealthFillRed },
      ],
      fillRect: { x: 24, w: 112 },
      scale: 0.42,
    };
  }

  /** Spawns effects for what happened in the simulation since the last frame. */
  handleEvents(events: readonly GameEvent[]): void {
    const t = this.textures;
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          this.effects.spawnSprite(t.explosionSmall, {
            x: event.x,
            y: event.y,
            rotation: event.rotation,
            duration: 0.16,
            fromScale: event.slot === 'front' ? 0.3 : 0.4,
            toScale: event.slot === 'front' ? 0.5 : 0.7,
          });
          break;
        case 'impact':
          this.effects.spawnSprite(t.explosionSmall, {
            x: event.x,
            y: event.y,
            duration: 0.28,
            fromScale: 0.35,
            toScale: event.target === 'ship' ? 0.9 : 0.6,
            ...(event.target === 'island' ? { tint: 0xd8c39a } : {}),
          });
          break;
        case 'splash':
          this.effects.spawnSplash(event.x, event.y);
          break;
        case 'ship-damaged': {
          const view = this.shipViews.get(event.shipId);
          if (view) view.flash = HIT_FLASH_SEC;
          break;
        }
        case 'ship-destroyed':
          this.spawnShipDestruction(event);
          break;
        case 'match-ended':
          break;
      }
    }
  }

  /**
   * @param alpha How far (0–1) the current frame is between the last two simulation steps.
   * @param dtSec Real time since the last frame, for cosmetic animations.
   */
  render(alpha: number, dtSec: number): void {
    this.time += dtSec;
    const sim = this.simulation;

    const live = new Set<number>();
    for (const ship of [sim.player, ...sim.enemies]) {
      if (!ship.alive) continue;
      live.add(ship.id);
      this.syncShip(ship, alpha, dtSec);
    }
    for (const [id, view] of this.shipViews) {
      if (!live.has(id)) this.removeShipView(id, view);
    }

    const liveProjectiles = new Set<number>();
    for (const projectile of sim.projectiles) {
      liveProjectiles.add(projectile.id);
      this.syncProjectile(projectile, alpha);
    }
    for (const [id, sprite] of this.projectileViews) {
      if (liveProjectiles.has(id)) continue;
      sprite.visible = false;
      this.projectilePool.push(sprite);
      this.projectileViews.delete(id);
    }

    this.wreckEffects.update(dtSec);
    this.effects.update(dtSec);
  }

  /** Number of display objects driven by the simulation, for profiling. */
  get entityCount(): number {
    return this.shipViews.size + this.projectileViews.size + this.effects.count + this.wreckEffects.count;
  }

  destroy(): void {
    for (const [id, view] of this.shipViews) this.removeShipView(id, view);
    this.wreckEffects.destroy();
    this.effects.destroy();
    // Textures are shared through the asset cache and outlive a match.
    this.world.destroy({ children: true, texture: false, textureSource: false });
  }

  private syncShip(ship: Ship, alpha: number, dtSec: number): void {
    let view = this.shipViews.get(ship.id);
    if (!view) view = this.createShipView(ship);

    const x = lerp(ship.previousPosition.x, ship.position.x, alpha);
    const y = lerp(ship.previousPosition.y, ship.position.y, alpha);
    view.body.position.set(x, y);
    view.body.rotation = lerpAngle(ship.previousRotation, ship.rotation, alpha) + SHIP_SPRITE_ROTATION_OFFSET;
    view.bar.position.set(x, y + HEALTH_BAR_OFFSET_Y);

    const ratio = ship.health / ship.stats.maxHealth;
    view.bar.setRatio(ratio);

    // Wear stages 0..2 while afloat; stage 3 is the wreck, shown when it sinks.
    const stage = ratio > 2 / 3 ? 0 : ratio > 1 / 3 ? 1 : 2;
    if (stage !== view.stage) {
      view.stage = stage;
      view.hull.texture = this.textures.ships[ship.kind][stage]!;
      view.fires.forEach((fire, index) => (fire.visible = index < stage));
    }
    view.fires.forEach((fire, index) => {
      fire.scale.set(0.9 + Math.sin(this.time * 14 + index * 2.1) * 0.12);
    });

    view.flash = Math.max(0, view.flash - dtSec);
    view.hull.tint = view.flash > 0 ? 0xff7a6b : 0xffffff;
  }

  private createShipView(ship: Ship): ShipView {
    const body = new Container();
    const hull = new Sprite(this.textures.ships[ship.kind][0]);
    hull.anchor.set(0.5);
    body.addChild(hull);

    // Fires share the hull's rotated group; positions are in sprite space (bow is +y).
    const fires = [
      { texture: this.textures.fireSmall, x: 10, y: -18 },
      { texture: this.textures.fireLarge, x: -12, y: 14 },
    ].map(({ texture, x, y }) => {
      const fire = new Sprite(texture);
      fire.anchor.set(0.5, 0.9);
      fire.position.set(x, y);
      fire.visible = false;
      body.addChild(fire);
      return fire;
    });

    const bar = new HealthBar(ship.kind === 'player' ? this.playerBarStyle : this.enemyBarStyle);
    this.shipLayer.addChild(body);
    this.barLayer.addChild(bar);

    const view: ShipView = { body, hull, fires, bar, stage: 0, flash: 0 };
    this.shipViews.set(ship.id, view);
    return view;
  }

  private removeShipView(id: number, view: ShipView): void {
    view.body.destroy({ children: true });
    view.bar.destroy();
    this.shipViews.delete(id);
  }

  private syncProjectile(projectile: Projectile, alpha: number): void {
    let sprite = this.projectileViews.get(projectile.id);
    if (!sprite) {
      sprite = this.projectilePool.pop() ?? this.createProjectileSprite();
      sprite.visible = true;
      this.projectileViews.set(projectile.id, sprite);
    }
    sprite.position.set(
      lerp(projectile.previousPosition.x, projectile.position.x, alpha),
      lerp(projectile.previousPosition.y, projectile.position.y, alpha),
    );
  }

  private createProjectileSprite(): Sprite {
    const sprite = new Sprite(this.textures.cannonBall);
    sprite.anchor.set(0.5);
    this.projectileLayer.addChild(sprite);
    return sprite;
  }

  private spawnShipDestruction(event: Extract<GameEvent, { type: 'ship-destroyed' }>): void {
    const t = this.textures;
    const rotation = event.rotation + SHIP_SPRITE_ROTATION_OFFSET;
    this.wreckEffects.spawnSprite(t.ships[event.kind][SHIP_WEAR_STAGES - 1]!, {
      x: event.x,
      y: event.y,
      rotation,
      duration: 1.6,
      fromScale: 1,
      toScale: 0.7,
    });
    this.effects.spawnSprite(t.explosionLarge, { x: event.x, y: event.y, duration: 0.45, fromScale: 0.3, toScale: 1.3 });
    this.effects.spawnSprite(t.explosionMedium, {
      x: event.x + Math.cos(event.rotation) * 22,
      y: event.y + Math.sin(event.rotation) * 22,
      duration: 0.4,
      delay: 0.12,
      fromScale: 0.3,
      toScale: 1,
    });
    this.effects.spawnSprite(t.explosionSmall, {
      x: event.x - Math.cos(event.rotation) * 24,
      y: event.y - Math.sin(event.rotation) * 24,
      duration: 0.35,
      delay: 0.24,
      fromScale: 0.3,
      toScale: 1,
    });
  }
}
