import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

/** Fill area inside the bar art, in source pixels (from `ui_sheet.json` → `ui.layout.fill_rect`). */
interface FillRect {
  x: number;
  w: number;
}

export interface HealthBarStyle {
  frame: Texture;
  /** Fill textures ordered by threshold: the first whose `above` the ratio exceeds is used. */
  fills: readonly { above: number; texture: Texture }[];
  fillRect: FillRect;
  scale: number;
}

/**
 * Health bar drawn from the HUD art. The fill is clipped horizontally by
 * giving it a narrower texture frame, rebuilt only when the value changes.
 */
export class HealthBar extends Container {
  private readonly fill = new Sprite();
  private clippedTexture: Texture | null = null;
  private ratio = -1;

  constructor(private readonly style: HealthBarStyle) {
    super();
    const frame = new Sprite(style.frame);
    frame.anchor.set(0.5);
    this.fill.anchor.set(0, 0.5);
    this.fill.x = -style.frame.width / 2;
    this.addChild(frame, this.fill);
    this.scale.set(style.scale);
  }

  setRatio(value: number): void {
    const ratio = Math.max(0, Math.min(1, value));
    if (ratio === this.ratio) return;
    this.ratio = ratio;

    const source = (this.style.fills.find((fill) => ratio > fill.above) ?? this.style.fills.at(-1))!.texture;
    const { x, w } = this.style.fillRect;
    const width = ratio > 0 ? x + w * ratio : 0;
    const previous = this.clippedTexture;
    this.clippedTexture = new Texture({
      source: source.source,
      frame: new Rectangle(source.frame.x, source.frame.y, Math.max(1, width), source.frame.height),
    });
    this.fill.texture = this.clippedTexture;
    this.fill.visible = width > 0;
    previous?.destroy(false);
  }

  override destroy(): void {
    this.clippedTexture?.destroy(false);
    this.clippedTexture = null;
    super.destroy({ children: true });
  }
}
