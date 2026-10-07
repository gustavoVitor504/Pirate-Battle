import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The MSW Service Worker re-issues every request the page makes. This lets
// `context.route()` see those requests too (Chromium), so tests can make
// game assets fail even though they pass through the worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

/**
 * E2E suite. Runs against the production build (`vite preview`), the same
 * bundle that is deployed, with the MSW mock API it ships with.
 *
 * - `chromium-desktop` runs every test.
 * - `chromium-mobile` (touch, landscape phone) runs the tests tagged `@mobile`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The arena renders WebGL in software in headless Chromium; too many parallel pages starve the CPU
  // and make the real-clock pause tests slow, so parallelism is capped.
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Baselines are versioned per platform; regenerate with `npm run test:e2e:update` on another OS.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Fixed locale and time zone so dates in tables (and screenshots) are stable.
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'chromium-mobile',
      grep: /@mobile/,
      use: {
        ...devices['Pixel 7'],
        // Landscape is the supported orientation on phones.
        viewport: { width: 915, height: 412 },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
