import { Container, Graphics, Sprite, type Texture } from 'pixi.js';

interface Effect {
  display: Container;
  /** Seconds before the effect starts (it stays hidden meanwhile). */
  delay: number;
  age: number;
  duration: number;
  update: (display: Container, t: number) => void;
}

export interface SpriteEffectOptions {
  x: number;
  y: number;
  rotation?: number;
  duration: number;
  delay?: number;
  fromScale: number;
  toScale: number;
  fromAlpha?: number;
  tint?: number;
}

/** Short-lived cosmetic animations (muzzle flashes, impacts, explosions, sinking wrecks). */
export class EffectLayer {
  readonly container = new Container();
  private effects: Effect[] = [];

  spawnSprite(texture: Texture, options: SpriteEffectOptions): void {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(options.x, options.y);
    sprite.rotation = options.rotation ?? 0;
    if (options.tint !== undefined) sprite.tint = options.tint;
    const fromAlpha = options.fromAlpha ?? 1;
    this.add(sprite, options.duration, options.delay ?? 0, (display, t) => {
      display.scale.set(options.fromScale + (options.toScale - options.fromScale) * easeOut(t));
      display.alpha = fromAlpha * (1 - t * t);
    });
  }

  /** Expanding ring on the water where a projectile ran out of range. */
  spawnSplash(x: number, y: number): void {
    const ring = new Graphics().circle(0, 0, 10).stroke({ width: 2, color: 0xffffff });
    ring.position.set(x, y);
    this.add(ring, 0.35, 0, (display, t) => {
      display.scale.set(0.4 + easeOut(t) * 0.9);
      display.alpha = 0.8 * (1 - t);
    });
  }

  update(dtSec: number): void {
    this.effects = this.effects.filter((effect) => {
      if (effect.delay > 0) {
        effect.delay -= dtSec;
        return true;
      }
      effect.display.visible = true;
      effect.age += dtSec;
      const t = Math.min(1, effect.age / effect.duration);
      effect.update(effect.display, t);
      if (t >= 1) {
        effect.display.destroy();
        return false;
      }
      return true;
    });
  }

  get count(): number {
    return this.effects.length;
  }

  destroy(): void {
    this.effects = [];
    this.container.destroy({ children: true });
  }

  private add(display: Container, duration: number, delay: number, update: Effect['update']): void {
    display.visible = delay <= 0;
    update(display, 0);
    this.container.addChild(display);
    this.effects.push({ display, delay, age: 0, duration, update });
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
