import type { QueryClient } from '@tanstack/react-query';
import { pendingMatches } from '../api/pendingMatches';
import { mockDb } from './db';
import { resetMockSettings } from './scenarios';

/** Restores the initial state: mock data, scenario, queued submissions and (optionally) cached queries. */
export function resetNetworkState(queryClient?: QueryClient): void {
  mockDb.reset();
  resetMockSettings();
  pendingMatches.clear();
  queryClient?.clear();
}
