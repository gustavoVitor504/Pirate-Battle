# Architecture

This document explains how Pirate Battle is put together and why: the React/PixiJS integration, the simulation loop, collisions and AI, resource management, local persistence, the ranking/history integration and the test instrumentation. It ends with balancing decisions and known limitations.

## 1. Layers

```
 keyboard / touch            rules (pure TS)           PixiJS                 React
┌──────────────┐  intent  ┌──────────────┐  state  ┌──────────────┐      ┌──────────────┐
│ input/        │ ───────▶ │ simulation/   │ ──────▶ │ render/       │      │ ui/           │
│ ControlState  │          │ Simulation    │ events  │ GameRenderer  │      │ screens, HUD  │
└──────────────┘          └──────────────┘ ──┬───▶ └──────────────┘      └──────▲───────┘
                                              │      audio/MatchAudio             │
                                              └──────────── MatchStore ───────────┘
                                                      (coarse values only)
```

| Layer | Knows about | Never touches |
| --- | --- | --- |
| `game/input` | DOM events | ships, Pixi, React |
| `game/simulation` | ships, projectiles, islands, rules | DOM, Pixi, React, time sources |
| `game/render` | Pixi, simulation state (read-only) | input, React |
| `game/audio` | Web Audio, simulation events | rules, Pixi |
| `game/GameEngine` | all of the above; owns one match | React |
| `ui` | React, `MatchStore`, engine methods (pause/resume/touch) | Pixi objects, simulation internals |
| `api`, `mocks` | HTTP contracts, TanStack Query, MSW | the game |

The simulation consumes an intent (`ControlState`: forward, turnLeft, turnRight, fireFront, fireLeft, fireRight), not devices. Keyboard and touch are two adapters producing that intent, and the engine merges them.

## 2. React ↔ PixiJS integration

- **Mounting.** `GameScreen` renders an empty `<div>`. A `useEffect` creates a `GameEngine` for it and returns `engine.destroy()`. The engine creates its own `PIXI.Application`, appends the canvas to the div and owns everything inside it.
- **React Strict Mode.** The double mount/unmount in development is harmless:
  - `destroy()` is idempotent and safe while `start()` is still awaiting assets or `app.init()`;
  - the engine keeps a `destroyed` flag and checks it after every `await`;
  - if `init()` is still pending, it keeps the app reference and destroys the app as soon as `init()` resolves.

  Tests assert there is exactly one canvas after mounting and none after leaving.
- **No React renders per frame.** The engine writes a `MatchSnapshot` to a `MatchStore` every frame, but the store only notifies subscribers when a displayed value changes:
  - score;
  - whole seconds left;
  - health rounded up;
  - pause reason;
  - result.

  React reads it with `useSyncExternalStore`, so the HUD re-renders about once per second. Continuous state (positions, rotations, projectiles) stays in the simulation and goes straight to Pixi.
- **Commands from React.** React calls engine methods through a ref: `pause()`, `resume()` and `touch.press/release(action)`. A new match is a new `MatchStore` instance, which changes the effect's dependencies and rebuilds the engine. That is how *Play Again* and *Try again* start clean.
- **Semantic HUD.** Score, time and health are DOM text (`<meter>`, `<time>`), so assistive technology can read them without per-frame announcements. The canvas is `aria-hidden`. Health bars above ships are drawn in Pixi.

## 3. Simulation loop

- **Fixed timestep.** The simulation advances in steps of exactly 1/60 s (`config.simulation.stepMs`):

  ```
  each animation frame:
    accumulator += min(frameDelta, 250 ms)      // catch-up cap avoids a spiral after a stall
    while accumulator ≥ step: simulation.step(step, controls); accumulator −= step
    renderer.render(alpha = accumulator / step)  // interpolate between the last two steps
  ```

  Movement, cooldowns, damage over time, the clock and spawns all use the step `dt`. Results are therefore independent of the display's frame rate: 60 Hz, 120 Hz or a slow phone behave the same.
- **Interpolation.** Each ship and projectile keeps its pose from the previous step. The renderer draws at `lerp(previous, current, alpha)` (shortest-arc for angles), so motion is smooth at any refresh rate, at the cost of at most one step (16 ms) of visual latency.
- **Order inside a step:**
  1. player movement and weapons;
  2. each enemy's AI, movement and weapons, plus Chaser rams;
  3. ship-to-ship separation;
  4. projectiles (move, hit ships or islands, expire, leave the arena);
  5. dead ships removed;
  6. end checks: death first, then time;
  7. timed spawns, only while the match is still running.

  Once the match ends, `step()` is a no-op: nothing moves, fires, takes damage, spawns or scores.
- **Pause.** Pausing stops feeding time into the accumulator: real time that passes while paused is discarded, never replayed. Input is disabled and held keys or touches are dropped on pause and on resume, so nothing accumulates. Visual effects freeze too.

  Triggers:
  - `Esc` / `P` / the button;
  - `blur`;
  - `visibilitychange` (hidden);
  - portrait orientation on touch devices.

  Resuming requires a click or key press in the pause dialog.
- **Events.** The simulation pushes events into a queue: shot, impact, splash, ship damaged or destroyed, match ended. The engine drains the queue once per frame and fans it out to the renderer (effects) and the audio. The rules never call into presentation code.
- **Randomness** comes from a seeded PRNG (mulberry32) that the match owns. A seed fixes the spawn positions and the enemy mix.

## 4. Collisions and combat

- **Islands** are rounded rectangles fitted to the tile art (`createArena`). Circle-vs-rounded-rectangle works as a point-to-inner-rectangle distance test, which is exact and cheap.
- **Hulls** are three circles along the ship's axis (radius 20, at −30/0/+30), which follows the long, narrow sprite far better than a single circle. Static resolution pushes every circle out of every island and back inside the arena. It runs up to three passes, so a push from one island cannot leave the hull inside another.
- **Ship vs ship.** Overlapping hulls are separated by the average push over their overlapping circle pairs. The player only takes 25 % of the push, so enemies cannot shove it around. A Chaser's ram is detected before separation: it damages the player and destroys the Chaser, without scoring.
- **Projectiles** are circles moving with constant velocity and a remaining range (lifetime = range / speed). Each step a projectile is removed when:
  - it hits a ship of the other faction: damage is applied once and the projectile is gone, so it cannot hit twice;
  - it hits an island;
  - it leaves the arena;
  - its range runs out.
- **Fast shots.** Speeds of 340–480 units/s move at most 8 units per step, well under the 25-unit hit radius, so shots cannot tunnel through a ship.
- **Destruction.** `damage()` only acts on living ships, and `destroy()` sets `alive = false` before anything else. Three broadside balls hitting a 5 HP enemy in the same step therefore score exactly one point. Dead ships stop colliding, firing and taking damage immediately, and are removed at the end of the step.
- **Weapons.** Each weapon (front, left, right) has its own cooldown, counted in simulation time, so pauses and frame rate do not affect it.

## 5. Enemy AI and navigation

Enemies use the same movement model as the player. The AI only decides `thrust` and `turn`.

- **Steering.** The ship turns towards its course, scaled so it never overshoots within one step (no jitter).
- **Navigation (`simulation/navigation.ts`).** This is a **visibility graph**:
  - Every island contributes four waypoints just off its corners, inflated by hull radius + clearance.
  - With a clear line of sight to the player (segment vs inflated boxes, Liang–Barsky), the enemy goes straight.
  - Otherwise it runs Dijkstra from its position through mutually visible waypoints to the player and follows the first waypoint. Links between waypoints are precomputed once; a query only checks the start and goal links.
  - Routes are replanned every 0.25 s. The enemy skips a waypoint as soon as the next one is in view.
  - Committing to a route is what stops the earlier dithering in front of islands when the player hid directly behind one.
- **Chaser.** Thrusts while its course is within ~108° ahead, so it turns tightly instead of orbiting.
- **Shooter.** Keeps sailing while it has no line of sight or is farther than its hold distance. It fires only with line of sight, within the attack range and when aimed within ~11°.
- **Spawns.** Spawns happen on the timer:
  - the first after 1.5 s, then every configured interval;
  - the first two are one Chaser and one Shooter, the rest are weighted random.

  A spawn point must be at least 380 units from the player, clear of islands and the arena edge with extra clearance, and not crowded by other enemies. The game tries up to 40 random points before skipping that spawn.

## 6. Rendering and resources

- **Scene graph.** The layers are, in order: water (`TilingSprite`), islands (tiles, a render group), wrecks, ships, projectiles, effects and health bars. Each ship is a rotated `Container` holding the hull sprite and fire sprites. Its health bar lives in a separate unrotated layer so it always stays level.
- **Textures** are loaded once through `PIXI.Assets` and stay in its cache, so later matches reuse them and start instantly. Matches destroy display objects with `texture: false`. Ship art comes in four wear stages (intact → wreck); the stage follows the health ratio.
- **Health bars** use the HUD art. The fill is clipped by giving it a narrower texture frame, built only when the value changes, and the previous frame texture is destroyed (its source is shared and kept).
- **Pooling and effects.** Projectile sprites come from a pool. Short-lived effects (muzzle flash, impact, splash, explosion, sinking wreck) are created and destroyed per event; there are only a handful per second.
- **Loading and failures:**
  - `loadGameTextures` reports progress, which the UI shows with a progress bar.
  - Any failed or missing texture becomes an `AssetLoadError`, which the UI shows with **Try again** and **Main Menu**.
  - Three details make this robust:
    - textures decode on the main thread (`preferWorkers: false`), because errors inside Pixi's image worker never came back;
    - a 20 s timeout covers stalled requests;
    - progress events that Pixi emits *after* rejecting are ignored, because they used to flip the error screen back to "Loading".
  - Pixi drops failed URLs from its cache, so a retry really refetches.
- **Canvas sizing.** A `ResizeObserver` on the host resizes the renderer to the host's CSS size. The resolution is `min(devicePixelRatio, 2)` with `autoDensity`, so the canvas is sharp on high-DPI screens without unbounded cost. The logical arena (1280×768) is scaled uniformly and letterboxed, which keeps its proportions and limits on any screen and orientation. Input does not depend on canvas coordinates (keyboard and DOM touch buttons), so no coordinate mapping is needed.
- **Teardown (`destroy()`).** It releases everything the match created:
  - window `blur` and `visibilitychange` listeners;
  - keyboard listeners and touch state;
  - the `ResizeObserver`;
  - the ticker callback;
  - all display objects and per-match textures;
  - the Pixi application and its WebGL context (`removeView: true`);
  - the match's audio loops.

  The memory cycles in the performance report confirm the heap, DOM nodes and listeners return to the same level after each match.
- **Audio.** One `AudioManager` serves the whole app (one `AudioContext`). It is created on the first user gesture, as browsers require, and files are fetched in the background and decoded once. `MatchAudio` maps simulation events to sounds, with a per-sound replay throttle so volleys do not stack. It also owns the ocean and sailing loops (the sailing volume follows the ship's speed) and plays the low-health and 10-second warnings. Audio failures mean silence, never a blocked game. Mute is persisted.

## 7. UI, accessibility and screens

- **Screens.** `App` holds a small state machine: menu → options → game → result. A refresh during a match lands on the menu and the match is abandoned. On the result screen, a session flag restores the same result after a refresh.
- **Focus and keyboard:**
  - each screen focuses its `<h1>` on entry;
  - dialogs use the native `<dialog>` + `showModal()` (focus trap, inert background, focus restore, Escape);
  - the leaderboards are WAI-ARIA tabs (arrow keys, Home, End);
  - form errors are linked with `aria-describedby`/`aria-invalid` and announced with `role="alert"`;
  - status lines use `role="status"`;
  - focus outlines are always visible.
- **Responsive layout.** The main menu becomes two columns on wide screens, so it fits laptop viewports without scrolling. The scene is exactly one viewport tall and only it scrolls on very small screens. Phones are played in landscape: touch controls appear for coarse pointers, and portrait pauses the match with a "rotate your device" hint.

## 8. Local persistence

All storage goes through `lib/storage.ts`, which tolerates missing or throwing storage (private mode, quota): the app keeps working without persistence.

| Key | Area | Content |
| --- | --- | --- |
| `pirate-battle:options` | local | Validated player options (versioned) |
| `pirate-battle:last-result` | local | Last completed match (with `matchId`, date and settings) |
| `pirate-battle:player` | local | Player identity: UUID and generated name |
| `pirate-battle:pending-matches` | local | Completed matches not yet confirmed by the API |
| `pirate-battle:muted` | local | Sound preference |
| `pirate-battle:mock-db` | local | Records confirmed by the mock server |
| `pirate-battle:mock-scenario` | local | Active network scenario, latency and seed |
| `pirate-battle:screen` | session | Restore the result screen after a refresh |

An abandoned match writes nothing: no result and no submission.

## 9. Ranking and match history

**Contracts** (`api/contracts.ts`) are shared by the Axios client and the MSW handlers:

| Endpoint | Returns |
| --- | --- |
| `GET /api/ranking?sessionDurationSec&enemySpawnIntervalSec&page&pageSize` | `RankingPage` (entries with rank, player, score, duration, date) |
| `GET /api/players/:playerId/matches?page&pageSize` | `MatchHistoryPage` (newest first) |
| `POST /api/matches` with a `MatchRecord` | `201 { record, created: true }`, or `200 { record, created: false }` if the `matchId` exists |

- **Records.** A `MatchRecord` holds `matchId` (client UUID, the idempotency key), `playerId`, `playerName`, `endedAt`, `score`, `durationSec` (active time), `endReason` and the `settings` used.
- **Ranking scope.** The ranking only compares matches with **the same settings** (the player's current options).
- **Deterministic order:** score ↓, then survival time ↓, then earlier finish, then `matchId`.
- **Revision.** Every page carries the server's `revision`, a monotonic counter of stored records.

**Client.**

- **Axios** sets a base URL and a timeout (6 s, configurable).
- **TanStack Query:**
  - **Keys** live in one module (`queryKeys`): `['ranking', duration, interval, page, size]` and `['history', playerId, page, size]`.
  - **Retries:** network errors, timeouts, 5xx and 429 are retried twice with exponential backoff (0.5 s, 1 s, capped at 4 s); 4xx are not.
  - **Caching:** `keepPreviousData` keeps the current page visible while the next one loads, and the pager reflects the page actually shown. `staleTime` is 15 s, plus `refetchOnMount: 'always'`, so a tab refreshes in the background every time it is shown.
  - **States:** loading, empty, error with **Try again**, *updating…* during a background refresh, and *showing earlier data* when a refresh fails while data exists.
  - **Late responses never overwrite newer data.** Each page is its own cache key, so a slow page-2 response cannot replace page 3. Invalidation cancels in-flight fetches (`cancelRefetch`), and the `AbortSignal` is passed to Axios. As a last guard, a response whose `revision` is lower than the cached one is discarded.

**Registration and recovery** (`api/registration.ts`, `api/pendingMatches.ts`):

1. When a match ends, its record is first **persisted** to the pending queue, then submitted. A failure or a refresh can never lose it.
2. The submission is a TanStack mutation (`setMutationDefaults` on the client, so it completes even if the screen unmounts). It is keyed `['register-match', matchId]` and retried up to three times for retryable errors; retrying is safe because the server deduplicates on `matchId`.
3. Double clicks, Strict Mode and start-up retries cannot send twice concurrently: a submission is skipped while one for the same `matchId` is in flight (`isMutating`).
4. On success the record leaves the queue and both `['ranking']` and `['history']` are invalidated, so both tabs show the match.
5. On failure the record stays queued:
   - the result screen shows *Not recorded yet* with the reason and **Retry now**;
   - the menu shows a notice with **Retry**;
   - the app re-submits every queued match when it starts.

   The player can start new matches meanwhile.
6. **Timeout after saving** (the server stored the record but the response was lost) is recovered by the retry, which gets `200 created: false` with the stored record. The result is exactly one history entry and one ranking entry.

API failures never block the game: the menu, options and combat do not depend on any query.

## 10. Mock API (MSW)

- **One set of handlers** (`mocks/handlers.ts`) is shared by development, the deployed build and the Playwright tests. It runs in the browser behind the Service Worker, so Axios and TanStack Query behave exactly as against a real server. Non-API requests bypass the mock.
- **Data.** Fixtures (`mocks/fixtures.ts`) are deterministic: 14 named pirates with 4 matches each, mostly with the default settings, which gives 9 ranking pages. `MockDatabase` adds the confirmed records from `localStorage` and keeps the revision counter.
- **Self-healing.** The worker keeps the set of mocked pages in memory. If the browser restarts it (for example after the tab sat in the background and the keep-alive timers were throttled), it forgets the page and API requests bypass the mock and reach the static host. This was found while profiling: one ranking request returned HTTP 404 after a match.

  The fix: every mocked response carries an `x-pirate-mock` header. When an API response arrives without it, an Axios interceptor re-activates the mock (`worker.stop()` + `worker.start()`) and repeats the request once. An E2E test reproduces the forgotten page and checks that the tabs still load.
- **Scenarios** (`mocks/scenarios.ts`) are applied in one place before each handler: latency (fixed, seeded random, or alternating for out-of-order), timeouts (`delay('infinite')`), connection errors (`HttpResponse.error()`), HTTP errors with typed JSON bodies, per-endpoint failures, and the two registration scenarios. They are selectable in the UI or through URL parameters, and can be reset.

## 11. Test instrumentation

`testing/testHooks.ts` is only installed with `?testHooks=1`:

| Parameter | Effect |
| --- | --- |
| `&seed=` | Fixes the spawn sequence |
| `&manualClock=1` | Game time advances only through `advance(ms)`; the Pixi ticker is stopped and exactly one frame is rendered per advance, which keeps tests fast and independent of frame rate |

Hooks expose a read-only state snapshot and staging helpers: place the player, spawn an enemy, set health, stop timed spawns. Tests drive the game with real key presses and touch events and assert on the results; the hooks never stand in for rules, input, collisions or rendering.

## 12. Balancing decisions

- **Weapons.**
  - The front cannon (25 dmg, 0.45 s) is the precise, sustained weapon: two hits sink a Chaser, three a Shooter.
  - Broadsides (3 × 20 dmg, 1.4 s per side) reward positioning: a full broadside sinks a Chaser outright.
  - Range, speed and cooldown make each weapon distinct.
- **Enemies.**
  - Chasers are fast but fragile (40 HP, 115 speed versus the player's 150), so outrunning them in a straight line works while turning duels do not.
  - Shooters are slow and tougher (60 HP). They hold at 260 units and fire every 1.8 s for 10 damage, so they punish standing still.
  - A ram costs 25 HP, a quarter of the player's health.
- **Spawns.**
  - The first enemy arrives after 1.5 s so the arena is never empty for long.
  - Guaranteeing one of each kind first ensures both appear even with the longest interval (30 s) in the shortest match (60 s).
  - The 380-unit minimum distance gives at least ~2.5 s before a Chaser can reach the player.
  - The 14-enemy cap keeps the arena readable and bounds the cost.
- **Movement.** Acceleration and deceleration give ships some weight. A turn rate of 135°/s keeps the player more agile than any enemy, and scraping a coast bleeds 10 % speed per step, which discourages wall-hugging.

## 13. Known limitations

- **Shapes:** islands are axis-aligned rounded rectangles and hulls are three circles. Both approximate the art closely but not pixel-perfectly.
- **AI:**
  - Enemies plan around islands but not around each other; they rely on separation pushes in a crowd.
  - Enemies only shoot along their heading (no lead aiming).
  - Waypoints near the arena edge are dropped when there is no room for a hull, so routes avoid very tight gaps.
- **Spawn timer:** a spawn is skipped when no valid point is found in 40 attempts, or when 14 enemies are alive.
- **Ranking scope:**
  - The ranking compares exact settings only; there is no cross-settings or global ranking.
  - Player identity is local to the browser (UUID + generated name, no login).
- **Mock persistence:** the mock database lives in each browser's `localStorage`, so data is not shared between devices; that is inherent to a client-side mock.
- **Network failure logs:** in failure scenarios the browser logs HTTP error statuses ("Failed to load resource"). They are expected and handled.
- **Visual baselines:** they are per platform (generated on Windows here). E2E tests run on Chromium only, as required; other browsers are not covered by the automated suite.
- **Asset loading:** a stalled asset request shows the error screen only after 20 s.
- **Headless frame pacing:** headless Chrome does not pace frames to the display, so performance is profiled in a visible Chrome window; see the performance report.
