# Pirate Battle

A top-down naval shooter for the browser, built with **React**, **TypeScript (strict)** and **PixiJS**. Sail between islands, sink enemy ships and climb the ranking before the clock runs out.

**Live demo:** https://pirate-battle-six-drab.vercel.app

The ranking and match history use a REST API mocked with **MSW**, consumed through **Axios** and **TanStack Query**; the mock runs in development, in the deployed build and in the **Playwright** tests. The challenge brief is in [docs/CHALLENGE.md](docs/CHALLENGE.md); design decisions are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Contents

- [Quick start](#quick-start)
- [Commands](#commands)
- [Environment variables](#environment-variables)
- [How to play](#how-to-play)
- [Gameplay configuration](#gameplay-configuration)
- [Network scenarios (mock API)](#network-scenarios-mock-api)
- [Reproducing failures](#reproducing-failures)
- [Tests](#tests)
- [Performance](#performance)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Assets and licenses](#assets-and-licenses)

## Quick start

Requirements: **Node.js 22** (Vite 8 needs ≥ 20.19 or ≥ 22.12) and npm.

```bash
npm install
npm run dev            # http://localhost:5173
```

Everything runs locally; no backend or private service is needed. The mock API starts with the app.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-checks and builds the optimized bundle into `dist/` |
| `npm run preview` | Serves the production build (port 4173) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc -b`) for the app, configs and tests |
| `npm run test:e2e` | Playwright suite (builds and serves the production bundle itself) |
| `npm run test:e2e:update` | Same, regenerating the visual baselines |
| `npm run test:e2e:report` | Opens the last HTML report (with traces of failed tests) |
| `npm run perf` | Builds and runs the performance profile (see [Performance](#performance)) |

Before the first test run, install the browser once: `npx playwright install chromium`.

## Environment variables

All optional; copy [.env.example](.env.example) to `.env` to change them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base URL of the ranking / history API |
| `VITE_API_TIMEOUT_MS` | `6000` | Axios request timeout |
| `VITE_ENABLE_MOCKS` | `true` | Set to `false` to disable the MSW mock (only useful with a real backend) |

## How to play

Destroy enemy ships with your cannons: each enemy you sink is worth **1 point**. The match ends when the time runs out or your ship sinks.

| Action | Keyboard | Touch (landscape) |
| --- | --- | --- |
| Sail forward | `W` / `↑` | ⬆ button (left pad) |
| Turn left / right | `A` `D` / `←` `→` | ↶ ↷ buttons (left pad) |
| Front cannon (1 shot) | `Space` | centre button (right pad) |
| Left / right broadside (3 shots) | `Q` / `E` | side buttons (right pad) |
| Pause / resume | `Esc` or `P`, or the ⏸ button | ⏸ button |

Movement and firing work at the same time, including multi-touch. The game pauses automatically when the window loses focus or the tab is hidden, and on phones when the device is rotated to portrait (landscape is the supported orientation). Game keys are only captured during a match.

**Enemies**

- **Chaser** (red sails): hunts you down, rams you for 25 damage and explodes. Rams do not score.
- **Shooter** (black sails): closes in to firing range, holds its distance and fires its bow cannon when you are in line of sight.

Both route around islands. Health is shown above every ship; ships show fire and wear as they lose health.

## Gameplay configuration

Every balancing value lives in a typed config, [src/game/config.ts](src/game/config.ts); systems read it and never hard-code numbers. Each match takes a frozen snapshot when it starts, so changes made in Options apply to the next match.

| Group | Main values (defaults) |
| --- | --- |
| Session | `sessionDurationSec` 120 · `enemySpawnIntervalSec` 4 |
| Player ship | 100 HP · speed 150 · turn 135°/s · hull of three 20-unit circles |
| Front cannon | 25 damage · speed 480 · range 520 · cooldown 0.45 s |
| Broadside | 3 × 20 damage · speed 420 · range 360 · cooldown 1.4 s per side |
| Chaser | 40 HP · speed 115 · ram damage 25 |
| Shooter | 60 HP · speed 85 · 10 damage shots · attack range 380 · hold distance 260 · cooldown 1.8 s |
| Spawns | first after 1.5 s, then every interval · first two are one of each kind, then 55 % / 45 % · ≥ 380 from the player · max 14 alive |
| Navigation | 22 units of clearance around islands · route replanned every 0.25 s |
| Simulation | fixed 60 Hz step · catch-up capped at 250 ms per frame |

**Options screen limits** (validated, persisted in `localStorage`):

- **Game session time:** whole seconds from **60 to 180**.
- **Enemy spawn time:** **1 to 30** seconds, in steps of **0.5**. The lower bound keeps the arena readable; the upper bound still guarantees both enemy kinds appear in a 60-second match.

## Network scenarios (mock API)

The mock API supports 14 reproducible scenarios. Pick one in either of two ways:

- **In the app:** the **“Network: …”** link in the main menu opens the Network scenarios dialog. It also has **Reset**, which restores the initial state: mock data, scenario, queued submissions and query cache.
- **In the URL:** `?scenario=<id>`, with optional `&mockLatency=<ms>` (fixed latency) and `&mockSeed=<n>` (seed for random latency). `?scenario=reset` restores the initial state.

The choice is stored in `localStorage`, so it survives refreshes.

| Id | Behaviour |
| --- | --- |
| `success` | Normal responses after ~300 ms (default) |
| `empty` | Empty ranking and history |
| `many-pages` | +30 matches in your history, +60 ranking entries |
| `slow` | Every response takes 2.5 s |
| `variable-latency` | Seeded random latency 0.1–2.5 s |
| `out-of-order` | Odd requests take 2 s, even ones 0.2 s, so later responses overtake earlier ones |
| `timeout` | No response; the client gives up after 3 attempts of 6 s |
| `network-error` | Connection failure on every request |
| `server-error` | HTTP 500 on every request |
| `client-error` | HTTP 400 on queries, 422 on submissions |
| `ranking-error` / `history-error` | Only that endpoint fails with HTTP 500 |
| `register-timeout` | The first submission of a match is stored but never answered; the retry gets the stored record |
| `register-unavailable` | Submissions fail with HTTP 503; queries keep working |

Confirmed matches and pending submissions are persisted in `localStorage`, so both survive a refresh. Other players come from deterministic fixtures: 14 pirates with 56 matches.

## Reproducing failures

| What to see | How |
| --- | --- |
| Loading / empty / error states | Open `/?scenario=slow`, `/?scenario=empty`, `/?scenario=ranking-error` and look at the Ranking and Match History tabs |
| Error while showing cached data | Load the menu normally, then switch to *Server error (5xx)* in the Network dialog: the table stays, with a warning |
| Late responses not overwriting newer data | `/?scenario=out-of-order`, then click **Next** quickly a few times |
| Match recorded once despite a lost response | Choose *Timeout after saving*, finish a match: the result screen shows “Sending…”, then “Recorded” after the retry; the history has one entry |
| Pending submission surviving refresh | Choose *Submissions unavailable*, finish a match (“Not recorded yet”), reload, switch back to *Success*, press **Retry** on the menu notice (or reload: pending matches are sent on start-up) |
| Asset loading failure | DevTools → Network → block `tile_73.png`, press Play: the error screen offers **Try again** |

To finish a match quickly, set the session time to 60 s in Options.

In failure scenarios the browser itself logs lines such as *“Failed to load resource: the server responded with a status of 503”*. Those come from the HTTP status of the intentionally failing responses and are all handled by the app; the normal flows keep the console clean.

## Tests

`npm run test:e2e` builds the app, serves the production bundle and runs **64 Playwright tests** on Chromium:

- **`chromium-desktop`** runs everything.
- **`chromium-mobile`** (touch, 915×412 landscape phone) runs the main flows, the ones tagged `@mobile`.

| # | Spec | Flow |
| --- | --- | --- |
| 1 | `01-options` | Navigation, validation, persistence of options |
| 2 | `02-assets` | Asset loading progress, failure and retry |
| 3 | `03-movement` | Match start, movement, rotation, arena bounds, island collision |
| 4 | `04-combat` | Front and broadside fire, damage, cooldowns, scoring without duplicates |
| 5 | `05-enemies` | Chaser and Shooter behaviour, routing around islands, spawn interval |
| 6 | `06-match-end` | End by time and by death, frozen simulation, clean restart |
| 7 | `07-pause` | Manual pause, focus loss, hidden tab, resume without clock drift |
| 8 | `08-result` | Result screen and its persistence after refresh |
| 9 | `09-navigation` | Abandoning, refresh mid-match, repeated navigation, touch controls |
| 10 | `10-leaderboards` | Ranking / history queries, pagination, loading, empty and error states |
| 11 | `11-registration` | Registration, both tabs updated, pending recovery after refresh |
| 12 | `12-resilience` | Re-sending after timeout without duplicates, late responses |
| — | `visual` | Visual regression of the menu, a stable arena and the result screen |

**How the tests stay reproducible:**

- **Isolation:** each test gets a fresh browser context and seeds its own storage.
- **Fixed environment:** locale `en-US` and time zone UTC.
- **Instrumentation:** the game exposes test hooks only with `?testHooks=1`:
  - `&seed=` fixes the spawn sequence;
  - `&manualClock=1` makes game time advance only when the test calls `advance(ms)`;
  - hooks read the state and stage scenes (place ships, stop timed spawns).

  Tests still press real keys and touch buttons, and the game's rules, collisions and rendering run unchanged.
- **Network control:** network latency and randomness come from the mock scenario parameters.
- **Console:** any unexpected console error fails the test.
- **Reports:** the HTML report is written to `playwright-report/`, with traces of failed tests (`trace: 'retain-on-failure'`). A copy of the last run is committed in [reports/playwright/](reports/playwright/).

**Visual baselines** are stored per platform in `tests/e2e/__screenshots__/`. The committed ones were generated on Windows; on another OS run `npm run test:e2e:update` once to create that platform's baselines.

## Performance

`npm run perf` profiles the optimized build in Chrome with the real GPU. It runs two measurements:
- a full **3-minute** match with a scripted pilot that sails and fires the whole time;
- **10 cycles** of start → play → quit (the brief asks for five), checking memory after forced garbage collection.

Results, hardware and limitations are in [docs/performance/README.md](docs/performance/README.md) (raw data in `results.json`).

## Deployment

The app is deployed on **Vercel** from the `main` branch with the default Vite preset: build `npm run build`, output `dist`. The MSW worker script (`public/mockServiceWorker.js`) ships with the build, so the deployed app runs the mock ranking and history. No environment variables are required.

## Project structure

```
src/
  game/              Game engine (framework-agnostic)
    config.ts          Typed gameplay configuration
    GameEngine.ts      Pixi app, fixed-step loop, pause, lifecycle
    MatchStore.ts      Coarse match state for React (no per-frame renders)
    simulation/        Rules: ships, projectiles, collisions, AI, navigation, spawns
    render/            PixiJS views: ships, health bars, effects
    input/             Keyboard and touch → ControlState
    audio/             Web Audio sound effects and ambience
  api/               Contracts, Axios client, TanStack Query hooks, registration queue
  mocks/             MSW handlers, fixtures, scenarios, mock database
  settings/          Options, player identity, last result (localStorage)
  testing/           Test hooks (only with ?testHooks=1)
  ui/                React screens and components
tests/e2e/           Playwright specs, support fixture, visual baselines
scripts/perf/        Performance profiling script
docs/                Challenge brief, performance report
```

## Assets and licenses

- **Art and sound:** all art and sound are the assets provided with the challenge in [public/assets/](public/assets/): ships, tiles, effects, UI atlas and WAV sounds. The ship, tile and effect art appears to come from Kenney's *Pirate Pack* (CC0). No other third-party art, sound or fonts were added; the UI uses system fonts.
- **Retina assets:** menus use the provided retina PNGs through `image-set()`.
- **Code dependencies:** the libraries are open source under their own licenses (MIT for React, PixiJS, TanStack Query, Axios, MSW, Vite and Playwright is Apache-2.0); see `package-lock.json`.
