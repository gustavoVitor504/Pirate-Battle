import { test as base, expect, type Page } from '@playwright/test';
import type { PirateTestApi } from '../../src/testing/testHooks';

export { expect };

export type GameState = NonNullable<ReturnType<PirateTestApi['state']>>;

/** One simulation step (60 Hz), in ms. */
export const STEP_MS = 1000 / 60;

/** Arena layout (world units), mirrored from `src/game/simulation/arena.ts` for readable tests. */
export const ARENA = {
  width: 1280,
  height: 768,
  grassIsland: { x: 774, y: 390, width: 244, height: 244 },
  playerStart: { x: 640, y: 672 },
} as const;

/** Headings (radians): 0 = right, PI/2 = down. */
export const HEADING = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 } as const;

interface OpenOptions {
  /** Mock network scenario (see src/mocks/scenarios.ts). */
  scenario?: string;
  /** Mock latency for scenarios without their own timing. */
  latency?: number;
  seed?: number;
  /** Game time only moves through `advance()`. */
  manualClock?: boolean;
  /** Player options to store before the app loads. */
  options?: { sessionDurationSec: number; enemySpawnIntervalSec: number };
  /** Extra localStorage entries to seed before the app loads. */
  storage?: Record<string, unknown>;
  /** sessionStorage entries to seed before the app loads. */
  session?: Record<string, unknown>;
}

const TEST_PLAYER = { playerId: 'test-player', playerName: 'Captain Test' };

/** Page-object style helper around the app and its test instrumentation. */
export class App {
  private allowedConsoleErrors: RegExp[] = [];
  readonly consoleErrors: string[] = [];

  constructor(readonly page: Page) {
    page.on('console', (message) => {
      if (message.type() === 'error') this.consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => this.consoleErrors.push(`pageerror: ${error.message}`));
  }

  /** Error logs a test expects (e.g. the browser logging an HTTP 500 in a failure scenario). */
  allowConsoleErrors(...patterns: RegExp[]): void {
    this.allowedConsoleErrors.push(...patterns);
  }

  unexpectedConsoleErrors(): string[] {
    return this.consoleErrors.filter((text) => !this.allowedConsoleErrors.some((pattern) => pattern.test(text)));
  }

  /**
   * Opens the app in a known state: a fixed player identity, optional options
   * and storage, a mock scenario and test hooks. Each test runs in a fresh
   * browser context, so nothing leaks between tests.
   */
  async open(options: OpenOptions = {}): Promise<void> {
    const { scenario = 'success', latency = 0, seed = 1, manualClock = true } = options;
    // Any same-origin page works to seed storage before the app boots.
    await this.page.goto('/mockServiceWorker.js');
    await this.page.evaluate(
      ({ player, opts, storage, session }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('pirate-battle:player', JSON.stringify(player));
        if (opts) localStorage.setItem('pirate-battle:options', JSON.stringify({ version: 1, ...opts }));
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value));
        for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, JSON.stringify(value));
      },
      { player: TEST_PLAYER, opts: options.options ?? null, storage: options.storage ?? {}, session: options.session ?? {} },
    );
    const params = new URLSearchParams({
      testHooks: '1',
      seed: String(seed),
      scenario,
      mockLatency: String(latency),
      mockSeed: '1',
      ...(manualClock ? { manualClock: '1' } : {}),
    });
    await this.page.goto(`/?${params}`);
    await this.page.waitForFunction(() => window.__pirateTest !== undefined);
  }

  /** Clicks Play and waits until the arena is loaded and the match loop runs. */
  async startMatch(): Promise<void> {
    await this.page.getByRole('button', { name: 'Play', exact: true }).click();
    await this.page.waitForFunction(() => window.__pirateTest?.isReady() === true, null, { timeout: 30_000 });
  }

  async state(): Promise<GameState> {
    const state = await this.page.evaluate(() => window.__pirateTest!.state());
    if (!state) throw new Error('No match is running');
    return state;
  }

  async advance(ms: number): Promise<void> {
    await this.page.evaluate((duration) => window.__pirateTest!.advance(duration), ms);
  }

  /** Holds a key for `ms` of game time. */
  async hold(code: string, ms: number): Promise<void> {
    await this.page.keyboard.down(code);
    await this.advance(ms);
    await this.page.keyboard.up(code);
  }

  /** Presses and releases a key, then lets one step consume it. */
  async tap(code: string): Promise<void> {
    await this.page.keyboard.press(code);
    await this.advance(STEP_MS);
  }

  /** Stage helpers: freeze timed spawns and put the player at a known pose. */
  async stage(player: { x: number; y: number; rotation: number }): Promise<void> {
    await this.page.evaluate(({ x, y, rotation }) => {
      const hooks = window.__pirateTest!;
      hooks.disableSpawning();
      hooks.clearEnemies();
      hooks.placePlayer(x, y, rotation);
    }, player);
  }

  async spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, rotation: number): Promise<number> {
    return this.page.evaluate(
      ({ kind: k, x: px, y: py, rotation: r }) => window.__pirateTest!.spawnEnemy(k, px, py, r),
      { kind, x, y, rotation },
    );
  }

  async setPlayerHealth(health: number): Promise<void> {
    await this.page.evaluate((h) => window.__pirateTest!.setPlayerHealth(h), health);
  }

  async setEnemyHealth(id: number, health: number): Promise<void> {
    await this.page.evaluate(({ id: enemyId, health: h }) => window.__pirateTest!.setEnemyHealth(enemyId, h), {
      id,
      health,
    });
  }

  /**
   * Advances game time in slices until `predicate` holds; fails after `maxMs`
   * of game time. The loop runs inside the page in one call, so it is fast.
   * `predicate` is serialized: it may only use its `state` argument.
   */
  async advanceUntil(predicate: (state: GameState) => boolean, maxMs: number, sliceMs = 50): Promise<GameState> {
    const result = await this.page.evaluate(
      ({ source, max, slice }) => {
        const check = new Function(`return (${source});`)() as (state: unknown) => boolean;
        const hooks = window.__pirateTest!;
        for (let elapsed = 0; elapsed <= max; elapsed += slice) {
          const state = hooks.state();
          if (state && check(state)) return state;
          hooks.advance(slice);
        }
        return null;
      },
      { source: predicate.toString(), max: maxMs, slice: sliceMs },
    );
    if (!result) throw new Error(`Condition not met within ${maxMs} ms of game time: ${predicate.toString()}`);
    return result;
  }

  /** Ends the running match by letting the clock run out (the player is made sturdy so it survives). */
  async finishByTime(): Promise<void> {
    await this.setPlayerHealth(1e9);
    const { remaining } = await this.state();
    await this.advance(remaining * 1000 + 100);
  }

  /** Picks a scenario through the Network Lab dialog in the main menu. */
  async chooseScenario(label: RegExp): Promise<void> {
    await this.page.getByRole('button', { name: /^Network:/ }).click();
    await this.page.getByRole('radio', { name: label }).check();
    await this.page.getByRole('button', { name: 'Close' }).click();
  }

  async mockRecords(): Promise<string[]> {
    return this.page.evaluate(() => {
      const raw = localStorage.getItem('pirate-battle:mock-db');
      return raw ? (JSON.parse(raw) as { records: { matchId: string }[] }).records.map((r) => r.matchId) : [];
    });
  }

  /** The visible tab panel of the leaderboards. */
  get tabPanel() {
    return this.page.locator('.tabs__panel:not([hidden])');
  }
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const app = new App(page);
    await use(app);
    // Every flow must keep the console free of unhandled errors.
    expect(app.unexpectedConsoleErrors(), 'unexpected console errors').toEqual([]);
  },
});

/** Browser log lines for HTTP error responses, expected in failure scenarios. */
export const HTTP_ERROR_LOG = /Failed to load resource: the server responded with a status of \d{3}/;
