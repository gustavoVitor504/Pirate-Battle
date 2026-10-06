import { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { MatchRecord, RegisterMatchResponse } from './contracts';
import { retryDelay, shouldRetry } from './errors';
import { pendingMatches } from './pendingMatches';
import { queryKeys } from './queryKeys';

export const REGISTER_MATCH_KEY = ['register-match'] as const;

export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Network trouble, timeouts and 5xx are retried twice with backoff; 4xx are not.
        retry: (failureCount, error) => shouldRetry(failureCount, error, 2),
        retryDelay,
        staleTime: 15_000,
        refetchOnWindowFocus: true,
      },
    },
  });

  // Defaults live on the client, not on a component, so a submission keeps
  // going (and cleans up) even if the screen that started it unmounts.
  queryClient.setMutationDefaults(REGISTER_MATCH_KEY, {
    mutationFn: (record: MatchRecord) => api.registerMatch(record),
    // Safe to retry: the server deduplicates on matchId.
    retry: (failureCount, error) => shouldRetry(failureCount, error, 3),
    retryDelay,
    onSuccess: (response: RegisterMatchResponse) => {
      pendingMatches.remove(response.record.matchId);
      // Both tabs show the new match; invalidation also cancels in-flight (older) fetches.
      void queryClient.invalidateQueries({ queryKey: queryKeys.ranking.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
  });

  return queryClient;
}
