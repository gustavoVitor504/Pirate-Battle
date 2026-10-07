import { Application, type Ticker } from 'pixi.js';
import { loadGameTextures } from './assets';
import { audio } from './audio/AudioManager';
import { MatchAudio } from './audio/MatchAudio';
import { snapshotConfig, type GameConfig } from './config';
import { KeyboardInput } from './input/KeyboardInput';
import { mergeControls, TouchInput } from './input/TouchInput';
import type { MatchResult, MatchSnapshot, MatchStore, PauseReason } from './MatchStore';
import { GameRenderer } from './render/GameRenderer';
import { Simulation } from './simulation/Simulation';

export type EngineStatus =
  | { kind: 'loading'; progress: number }
  | { kind: 'error'; error: unknown }
  | { kind: 'running' };

export interface GameEngineOptions {
  host: HTMLElement;
  config: GameConfig;
  /** Receives HUD updates; created by the caller so the UI can subscribe before the engine exists. */
  store: MatchStore;
  /** Seed for spawn positions and enemy mix; random when omitted. */
  seed?: number;
  /**
   * Test instrumentation: game time only moves through `advance()`, so tests
   * are independent of frame rate and machine speed. Rendering, input,
   * collisions and rules still run exactly as in normal play.
   */
  manualClock?: boolean;
  onStatus: (status: EngineStatus) => void;
  onMatchEnd?: (result: MatchResult) => void;
}

/**
 * Owns one match: the PixiJS application, the simulation, input, audio and
 * the render loop. Everything it creates is released by `destroy()`, which is
 * safe to call at any point, including while `start()` is still awaiting.
 */
export class GameEngine {
  readonly store: MatchStore;
  /** On-screen buttons feed this; React calls `press`/`release`. */
  readonly touch = new TouchInput();
  private readonly host: HTMLElement;
  /** Read by the test instrumentation only; the UI goes through `store`. */
  readonly simulation: Simulation;
  private readonly keyboard = new KeyboardInput();
  private app: Application | null = null;
  private renderer: GameRenderer | null = null;
  private matchAudio: MatchAudio | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private accumulatorMs = 0;
  private result: MatchResult | null = null;
  private pauseReason: PauseReason | null = null;
  private running = false;
  private destroyed = false;

  constructor(private readonly options: GameEngineOptions) {
    this.host = options.host;
    const seed = options.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.simulation = new Simulation(snapshotConfig(options.config), seed);
    this.store = options.store;
    this.store.update(this.readSnapshot());
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.pauseReason !== null;
  }

  /** Manual-clock mode only: advances game time by `ms`, exactly as that much real time would. */
  advance(ms: number): void {
    if (!this.options.manualClock) throw new Error('advance() requires manualClock mode');
    if (!this.running) return;
    const { maxFrameMs } = this.simulation.config.simulation;
    for (let left = ms; left > 0; left -= maxFrameMs) this.update(Math.min(left, maxFrameMs));
    // The ticker is stopped in this mode: draw exactly one frame per advance.
    this.app?.render();
  }

  async start(): Promise<void> {
    this.options.onStatus({ kind: 'loading', progress: 0 });
    // Sounds download in the background; they never hold up the match.
    audio.preload();
    // Pixi rejects as soon as one file fails but keeps reporting progress for
    // the rest; late progress must not turn the error screen back into "Loading".
    let loadSettled = false;
    try {
      const textures = await loadGameTextures((progress) => {
        if (!this.destroyed && !loadSettled) this.options.onStatus({ kind: 'loading', progress });
      }).finally(() => {
        loadSettled = true;
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

      this.matchAudio = new MatchAudio(audio);
      this.matchAudio.start();
      window.addEventListener('blur', this.onFocusLost);
      document.addEventListener('visibilitychange', this.onVisibilityChange);

      this.running = true;
      this.setInputEnabled(true);
      app.ticker.add(this.tick);
      // Manual clock: no automatic frames, so a test's page stays responsive; advance() renders.
      if (this.options.manualClock) {
        app.ticker.stop();
        app.render();
      }
      this.options.onStatus({ kind: 'running' });
      // The tab may already have been hidden while assets were loading.
      if (document.hidden) this.pause('focus-lost');
    } catch (error) {
      if (this.destroyed) return;
      this.releaseApp();
      this.options.onStatus({ kind: 'error', error });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    window.removeEventListener('blur', this.onFocusLost);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.keyboard.dispose();
    this.touch.dispose();
    this.matchAudio?.dispose();
    this.matchAudio = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.releaseApp();
  }

  /**
   * Freezes the match: no simulation steps, so the clock, cooldowns, spawns and
   * movement all stop. Held input is dropped so nothing carries over on resume.
   */
  pause(reason: PauseReason = 'manual'): void {
    if (!this.running || this.pauseReason || this.simulation.status !== 'running') return;
    this.pauseReason = reason;
    this.setInputEnabled(false);
    this.matchAudio?.setPaused(true);
    this.store.update(this.readSnapshot());
  }

  /** Resumes after an explicit player action. */
  resume(): void {
    if (!this.pauseReason) return;
    this.pauseReason = null;
    this.setInputEnabled(true);
    this.matchAudio?.setPaused(false);
    this.store.update(this.readSnapshot());
  }

  private readonly onFocusLost = (): void => this.pause('focus-lost');

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause('focus-lost');
  };

  private setInputEnabled(enabled: boolean): void {
    this.keyboard.enabled = enabled;
    this.touch.enabled = enabled;
    this.keyboard.reset();
    this.touch.reset();
  }

  private readonly tick = (ticker: Ticker): void => {
    // In manual-clock mode frames only redraw; time is fed by advance().
    const frameMs = this.options.manualClock ? 0 : Math.min(ticker.deltaMS, this.simulation.config.simulation.maxFrameMs);
    this.update(frameMs);
  };

  private update(frameMs: number): void {
    const sim = this.simulation;
    const { stepMs } = sim.config.simulation;
    // While paused, elapsed real time is discarded rather than accumulated.
    const active = sim.status === 'running' && !this.pauseReason;

    if (active) {
      this.accumulatorMs += frameMs;
      while (this.accumulatorMs >= stepMs && sim.status === 'running') {
        sim.step(stepMs / 1000, mergeControls([this.keyboard.read(), this.touch.read()]));
        this.accumulatorMs -= stepMs;
      }
    }
    const alpha = sim.status === 'running' ? this.accumulatorMs / stepMs : 1;

    if (sim.status === 'ended' && !this.result) {
      this.setInputEnabled(false);
      this.result = {
        matchId: crypto.randomUUID(),
        endedAt: new Date().toISOString(),
        score: sim.score,
        durationSec: Math.round(sim.elapsed * 1000) / 1000,
        reason: sim.endReason ?? 'time-up',
        settings: {
          sessionDurationSec: sim.config.sessionDurationSec,
          enemySpawnIntervalSec: sim.config.enemySpawnIntervalSec,
        },
      };
      this.options.onMatchEnd?.(this.result);
    }

    const events = sim.drainEvents();
    this.renderer?.handleEvents(events);
    this.matchAudio?.handleEvents(events);
    // Effects freeze while paused, and keep playing after the match ends so the final explosion completes.
    this.renderer?.render(alpha, this.pauseReason ? 0 : frameMs / 1000);
    this.matchAudio?.update({
      playerSpeedRatio: active ? sim.player.speed / sim.player.stats.moveSpeed : 0,
      healthRatio: sim.player.health / sim.player.stats.maxHealth,
      remainingSec: sim.remainingTime,
    });
    this.store.update(this.readSnapshot());
  }

  private readSnapshot(): MatchSnapshot {
    const sim = this.simulation;
    return {
      score: sim.score,
      remainingSec: Math.ceil(sim.remainingTime - 1e-9),
      health: Math.ceil(sim.player.health),
      maxHealth: sim.player.stats.maxHealth,
      pauseReason: this.pauseReason,
      result: this.result,
    };
  }

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
    if (this.options.manualClock) this.app.render();
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
