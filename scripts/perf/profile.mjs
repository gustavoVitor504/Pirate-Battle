/**
 * Performance profile of the optimized build.
 *
 *   npm run perf                 # build, then profile (3-minute match + 5 memory cycles)
 *   node scripts/perf/profile.mjs --duration=60 --cycles=3 --headless
 *   node scripts/perf/profile.mjs --memory-only --cycles=10   # only the memory cycles (merged into results.json)
 *   node scripts/perf/profile.mjs --render-only               # rewrite README.md from results.json
 *
 * 1. Plays a full match (default 180 s) with a scripted pilot that sails, turns
 *    and fires through the real keyboard input; records every animation frame
 *    and samples entity counts once a second.
 * 2. Runs N cycles of start → play → quit to the menu, forcing garbage
 *    collection after each, and records JS heap, DOM nodes, listeners and
 *    canvases to detect leaks.
 *
 * Results go to docs/performance/results.json and docs/performance/README.md.
 *
 * By default a visible Chrome window is used: headless Chrome does not pace
 * frames to the display, so its frame times are not representative. Keep the
 * window visible while it runs (an occluded window is throttled).
 * Uses the installed Google Chrome (real GPU) when available, otherwise
 * Playwright's Chromium with GPU flags.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const DURATION_SEC = Number(args.duration ?? 180);
const CYCLES = Number(args.cycles ?? 5);
const CYCLE_SEC = Number(args['cycle-seconds'] ?? 20);
const WIDTH = Number(args.width ?? 1600);
const HEIGHT = Number(args.height ?? 900);
const PORT = Number(args.port ?? 4174);
const HEADED = args.headless !== 'true';
const OUT_DIR = args.out ?? 'docs/performance';
const MEMORY_ONLY = args['memory-only'] === 'true';
const RENDER_ONLY = args['render-only'] === 'true';
const BASE = `http://localhost:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return child;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error('vite preview did not start');
}

function stopPreview(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

async function launchBrowser() {
  const gpuArgs = ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])];
  try {
    return await chromium.launch({ channel: 'chrome', headless: !HEADED, args: gpuArgs });
  } catch {
    return chromium.launch({ headless: !HEADED, args: gpuArgs });
  }
}

/** Scripted pilot: always sailing and firing, weaving left and right, broadsides now and then. */
async function pilot(page, seconds, onSecond) {
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  for (let second = 0; second < seconds; second++) {
    const turnKey = Math.floor(second / 2) % 2 === 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(turnKey);
    await sleep(500);
    await page.keyboard.up(turnKey);
    await page.keyboard.press(second % 3 === 0 ? 'KeyQ' : 'KeyE');
    await sleep(450);
    await onSecond?.(second);
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
}

async function readState(page) {
  return page.evaluate(() => {
    const state = window.__pirateTest?.state();
    return state
      ? {
          elapsed: state.elapsed,
          enemies: state.enemies.length,
          projectiles: state.projectiles.length,
          renderedObjects: state.renderedObjects,
          score: state.score,
          status: state.status,
        }
      : null;
  });
}

async function profileMatch(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => window.__pirateTest?.isReady() === true, null, { timeout: 60_000 });
  // Keep the pilot afloat for the whole match so combat never stops.
  await page.evaluate(() => window.__pirateTest.setPlayerHealth(1e9));

  await page.evaluate(() => {
    const frames = [];
    let longTasks = 0;
    window.__perf = { frames, longTasks: () => longTasks, running: true };
    new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: false });
    const loop = (time) => {
      if (!window.__perf.running) return;
      frames.push(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  const samples = [];
  await pilot(page, DURATION_SEC, async (second) => {
    const state = await readState(page);
    if (state) samples.push({ second: second + 1, ...state });
    if (second % 10 === 9) process.stdout.write(`  match ${second + 1}/${DURATION_SEC}s\n`);
  });

  const { frames, longTasks } = await page.evaluate(() => {
    window.__perf.running = false;
    return { frames: window.__perf.frames, longTasks: window.__perf.longTasks() };
  });
  const finalState = await readState(page);

  const deltas = frames.slice(1).map((time, i) => time - frames[i]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const totalMs = frames.at(-1) - frames[0];
  const perTenSeconds = [];
  // Full 10-second windows only (a trailing partial window would read as a drop).
  for (let start = frames[0], i = 0; start + 10_000 <= frames.at(-1); start += 10_000) {
    const count = frames.filter((time) => time >= start && time < start + 10_000).length;
    perTenSeconds.push({ fromSec: i * 10, fps: Math.round((count / 10) * 10) / 10 });
    i++;
  }
  const maxOf = (key) => Math.max(...samples.map((sample) => sample[key]));
  const avgOf = (key) => Math.round((samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length) * 10) / 10;

  return {
    frames: frames.length,
    durationSec: Math.round(totalMs / 100) / 10,
    averageFps: Math.round((deltas.length / (totalMs / 1000)) * 10) / 10,
    frameTimeMs: {
      p50: Math.round(percentile(sorted, 50) * 100) / 100,
      p95: Math.round(percentile(sorted, 95) * 100) / 100,
      p99: Math.round(percentile(sorted, 99) * 100) / 100,
      max: Math.round(sorted.at(-1) * 100) / 100,
    },
    framesOver20ms: deltas.filter((delta) => delta > 20).length,
    framesOver33ms: deltas.filter((delta) => delta > 33.4).length,
    longTasks,
    entities: {
      enemies: { max: maxOf('enemies'), average: avgOf('enemies') },
      projectiles: { max: maxOf('projectiles'), average: avgOf('projectiles') },
      renderedObjects: { max: maxOf('renderedObjects'), average: avgOf('renderedObjects') },
    },
    // The match may already be over (result screen); fall back to the last sample.
    simulatedSec: Math.round((finalState ?? samples.at(-1))?.elapsed ?? 0),
    score: (finalState ?? samples.at(-1))?.score ?? null,
    profiledSec: DURATION_SEC,
    fpsPerTenSeconds: perTenSeconds,
    samples,
  };
}

async function memorySnapshot(cdp, page, label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const metric = (name) => metrics.find((m) => m.name === name)?.value ?? null;
  return {
    label,
    jsHeapUsedMB: Math.round((metric('JSHeapUsedSize') / 1024 / 1024) * 100) / 100,
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
    canvases: await page.locator('canvas').count(),
  };
}

async function memoryCycles(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const snapshots = [await memorySnapshot(cdp, page, 'menu, before cycle 1')];
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.__pirateTest?.isReady() === true, null, { timeout: 60_000 });
    await page.evaluate(() => window.__pirateTest.setPlayerHealth(1e9));
    await pilot(page, CYCLE_SEC);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
    snapshots.push(await memorySnapshot(cdp, page, `menu, after cycle ${cycle}`));
    process.stdout.write(`  cycle ${cycle}/${CYCLES} done\n`);
  }
  return snapshots;
}

/** From a running match (pause → Main Menu) or a finished one (result → Main Menu) back to the menu. */
async function leaveToMenu(page) {
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await page.keyboard.press('Escape');
  if (await paused.isVisible().catch(() => false)) {
    await paused.getByRole('button', { name: 'Main Menu' }).click();
  } else {
    await page.getByRole('button', { name: 'Main Menu' }).click({ timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ timeout: 30_000 });
}

function renderMarkdown(results) {
  const { environment: env, match, memory } = results;
  const first = memory[1];
  const last = memory.at(-1);
  const lines = [
    '# Performance profile',
    '',
    `Generated by \`npm run perf\` (scripts/perf/profile.mjs) on ${env.date}. Raw data: [results.json](results.json).`,
    '',
    '## Reference environment',
    '',
    '| | |',
    '| --- | --- |',
    `| CPU | ${env.cpu} (${env.cpuCores} logical cores) |`,
    `| Memory | ${env.memoryGB} GB |`,
    `| GPU (WebGL renderer) | ${env.gpu} |`,
    `| Browser | ${env.browser} (${env.headless ? 'headless' : 'headed'}) |`,
    `| OS | ${env.os} |`,
    `| Viewport | ${env.viewport} at device pixel ratio 1 |`,
    `| Build | production (\`vite build\`, minified), served by \`vite preview\` |`,
    `| Match configuration | ${env.matchConfig} |`,
    '',
    `## ${results.match.profiledSec}-second match`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Average FPS | **${match.averageFps}** (target 60) |`,
    `| Frame time p50 / p95 / p99 | ${match.frameTimeMs.p50} / **${match.frameTimeMs.p95}** / ${match.frameTimeMs.p99} ms |`,
    `| Worst frame | ${match.frameTimeMs.max} ms |`,
    `| Frames over 20 ms / 33 ms | ${match.framesOver20ms} / ${match.framesOver33ms} of ${match.frames} |`,
    `| Long tasks (> 50 ms) | ${match.longTasks} |`,
    `| Enemies alive (max / avg) | ${match.entities.enemies.max} / ${match.entities.enemies.average} |`,
    `| Projectiles (max / avg) | ${match.entities.projectiles.max} / ${match.entities.projectiles.average} |`,
    `| Simulation-driven display objects (max / avg) | ${match.entities.renderedObjects.max} / ${match.entities.renderedObjects.average} |`,
    `| Simulated time / score | ${match.simulatedSec} s / ${match.score} |`,
    '',
    'FPS per 10-second window:',
    '',
    `| ${match.fpsPerTenSeconds.map((w) => `${w.fromSec}s`).join(' | ')} |`,
    `| ${match.fpsPerTenSeconds.map(() => '---').join(' | ')} |`,
    `| ${match.fpsPerTenSeconds.map((w) => w.fps).join(' | ')} |`,
    '',
    `## Memory over ${memory.length - 1} cycles (start → play ${results.memoryCycleSec} s → quit)`,
    '',
    'Measured on the main menu after forcing garbage collection twice.',
    '',
    '| Snapshot | JS heap (MB) | DOM nodes | JS listeners | Canvases |',
    '| --- | --- | --- | --- | --- |',
    ...memory.map((m) => `| ${m.label} | ${m.jsHeapUsedMB} | ${m.domNodes} | ${m.jsEventListeners} | ${m.canvases} |`),
    '',
    `Change from after cycle 1 to after cycle ${memory.length - 1}: JS heap ${(last.jsHeapUsedMB - first.jsHeapUsedMB).toFixed(2)} MB, ` +
      `DOM nodes ${last.domNodes - first.domNodes}, listeners ${last.jsEventListeners - first.jsEventListeners}.`,
    '',
    // Written by hand after reviewing a run (kept in results.json).
    ...(results.notes ?? []),
    '',
  ];
  return lines.join('\n');
}

if (RENDER_ONLY) {
  const results = JSON.parse(readFileSync(`${OUT_DIR}/results.json`, 'utf8'));
  writeFileSync(`${OUT_DIR}/README.md`, renderMarkdown(results));
  console.log(`Rewrote ${OUT_DIR}/README.md`);
  process.exit(0);
}

const preview = await startPreview();
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const httpErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && httpErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`));

  // Default gameplay settings, but a 180 s session (the longest allowed) for the profile.
  await page.goto(`${BASE}/mockServiceWorker.js`);
  await page.evaluate((duration) => {
    localStorage.clear();
    localStorage.setItem('pirate-battle:options', JSON.stringify({ version: 1, sessionDurationSec: duration, enemySpawnIntervalSec: 4 }));
    localStorage.setItem('pirate-battle:muted', '1');
  }, Math.min(180, Math.max(60, DURATION_SEC)));
  await page.goto(`${BASE}/?testHooks=1&seed=7&scenario=success`);

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
  });

  let results;
  if (MEMORY_ONLY) {
    results = JSON.parse(readFileSync(`${OUT_DIR}/results.json`, 'utf8'));
  } else {
    console.log(`Profiling a ${DURATION_SEC}s match on ${gpu}…`);
    const match = await profileMatch(page);
    await leaveToMenu(page);
    results = {
      environment: {
        date: new Date().toISOString().slice(0, 10),
        cpu: os.cpus()[0]?.model.trim(),
        cpuCores: os.cpus().length,
        memoryGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
        os: `${os.type()} ${os.release()}`,
        gpu,
        browser: `${browser.browserType().name()} ${browser.version()}`,
        headless: !HEADED,
        viewport: `${WIDTH}×${HEIGHT}`,
        matchConfig: `default gameplay config, ${DURATION_SEC} s session, enemy spawn every 4 s (max 14 alive), seed 7, player invulnerable so combat lasts the whole run, sound muted`,
      },
      match,
    };
  }

  console.log(`Memory: ${CYCLES} cycles of ${CYCLE_SEC}s…`);
  results.memory = await memoryCycles(page);
  results.memoryCycleSec = CYCLE_SEC;
  results.consoleErrors = consoleErrors;
  results.httpErrors = httpErrors;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT_DIR}/README.md`, renderMarkdown(results));
  console.log(`HTTP errors: ${httpErrors.length ? httpErrors.join(' | ') : 'none'}`);
  if (results.match) console.log(`Average FPS ${results.match.averageFps}, p95 ${results.match.frameTimeMs.p95} ms; written to ${OUT_DIR}/`);
} finally {
  await browser.close();
  stopPreview(preview);
}
