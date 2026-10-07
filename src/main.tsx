import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queryClient';
import { App } from './App';
import { audio } from './game/audio/AudioManager';
import { resetNetworkState } from './mocks/reset';
import { applyMockSettingsFromUrl } from './mocks/scenarios';
import { installTestHooks, readTestConfig } from './testing/testHooks';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Sounds download in the background from the start, so menus and the first match have them.
audio.preload();

const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS !== 'false';

async function bootstrap(container: HTMLElement): Promise<void> {
  if (readTestConfig().enabled) installTestHooks();
  if (MOCKS_ENABLED) {
    if (applyMockSettingsFromUrl()) {
      // ?scenario=reset: back to the initial state.
      resetNetworkState();
    }
    try {
      const { startMockApi } = await import('./mocks/browser');
      await startMockApi();
    } catch {
      // Without the mock the ranking and history show their error states; the game itself still works.
    }
  }

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <App mocksEnabled={MOCKS_ENABLED} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap(root);
