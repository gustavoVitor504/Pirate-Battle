import { Application, type Ticker } from 'pixi.js';
import { loadGameTextures } from './assets';
import { snapshotConfig, type GameConfig } from './config';
import { KeyboardInput } from './input/KeyboardInput';
import { GameRenderer } from './render/GameRenderer';
import { Simulation } from './simulation/Simulation';

export type EngineStatus =
  | { kind: 'loading'; progress: number }
  | { kind: 'error'; error: unknown }
  | { kind: 'running' };

export interface GameEngineOptions {
  host: HTMLElement;
  config: GameConfig;
  onStatus: (status: EngineStatus) => void;
}

/**
 * Owns one match: the PixiJS application, the simulation, input and the
 * render loop. Everything it creates is released by `destroy()`, which is safe
 * to call at any point, including while `start()` is still awaiting.
 */
export class GameEngine {
  private readonly host: HTMLElement;
  private readonly simulation: Simulation;
  private readonly input = new KeyboardInput();
  private app: Application | null = null;
  private renderer: GameRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private accumulatorMs = 0;
  private destroyed = false;

  constructor(private readonly options: GameEngineOptions) {
    this.host = options.host;
    this.simulation = new Simulation(snapshotConfig(options.config));
  }

  async start(): Promise<void> {
    this.options.onStatus({ kind: 'loading', progress: 0 });
    try {
      const textures = await loadGameTextures((progress) => {
        if (!this.destroyed) this.options.onStatus({ kind: 'loading', progress });
      });
      if (this.destroyed) return;

      const app = new Application();
      this.app = app;
      await app.init({
        background: '#0b4f6c',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: Math.max(1, this.host.clientWidth),
        height: Math.max(1, this.host.clientHeight),
      });
      if (this.destroyed) {
        this.releaseApp();
        return;
      }

      app.canvas.setAttribute('aria-hidden', 'true');
      this.host.appendChild(app.canvas);

      this.renderer = new GameRenderer(this.simulation, textures);
      app.stage.addChild(this.renderer.world);

      this.resizeObserver = new ResizeObserver(() => this.fitToHost());
      this.resizeObserver.observe(this.host);
      this.fitToHost();

      this.input.enabled = true;
      app.ticker.add(this.tick);
      this.options.onStatus({ kind: 'running' });
    } catch (error) {
      if (this.destroyed) return;
      this.releaseApp();
      this.options.onStatus({ kind: 'error', error });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input.dispose();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.releaseApp();
  }

  private readonly tick = (ticker: Ticker): void => {
    const { stepMs, maxFrameMs } = this.simulation.config.simulation;
    this.accumulatorMs += Math.min(ticker.deltaMS, maxFrameMs);

    while (this.accumulatorMs >= stepMs) {
      this.simulation.step(stepMs / 1000, this.input.read());
      this.accumulatorMs -= stepMs;
    }
    this.renderer?.render(this.accumulatorMs / stepMs);
  };

  /** Scales the logical arena to fit the host, preserving aspect ratio (letterboxed). */
  private fitToHost(): void {
    if (!this.app || !this.renderer) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height);

    const { arena } = this.simulation;
    const scale = Math.min(width / arena.width, height / arena.height);
    const world = this.renderer.world;
    world.scale.set(scale);
    world.position.set((width - arena.width * scale) / 2, (height - arena.height * scale) / 2);
  }

  /**
   * Destroys the PixiJS app once it has finished initializing; shared textures
   * stay cached. While `init()` is still pending the reference is kept, and
   * `start()` calls this again as soon as it resolves.
   */
  private releaseApp(): void {
    const app = this.app;
    // `renderer` only exists once `init()` has resolved.
    if (!app?.renderer) return;
    this.app = null;
    app.ticker.remove(this.tick);
    this.renderer?.destroy();
    this.renderer = null;
    app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
