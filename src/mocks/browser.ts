/**
 * Starts the mock API in the browser. MSW intercepts requests at the network
 * level (Service Worker), so Axios and TanStack Query run unmodified exactly
 * as they would against a real server. Used in development, in the published
 * demo and by the Playwright tests.
 */
export async function startMockApi(): Promise<void> {
  const [{ setupWorker }, { handlers }] = await Promise.all([import('msw/browser'), import('./handlers')]);
  const worker = setupWorker(...handlers);
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    // Game assets and everything else go straight to the network.
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
}
