import { keepPreviousData, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './client';
import type { MatchSettings, Page } from './contracts';
import { queryKeys } from './queryKeys';

/**
 * Never let an older response replace newer data for the same key. TanStack
 * Query already cancels a superseded fetch when the key is invalidated; the
 * server revision catches anything that still arrives late.
 */
function keepNewest<T extends Page<unknown>>(queryClient: QueryClient, key: QueryKey, incoming: T): T {
  const current = queryClient.getQueryData<T>(key);
  return current && current.revision > incoming.revision ? current : incoming;
}

const sharedOptions = {
  // Pages stay on screen while the next one loads, instead of flashing a spinner.
  placeholderData: keepPreviousData,
  // Showing a tab again always checks for fresh data (in the background).
  refetchOnMount: 'always',
} as const;

export function useRanking(settings: MatchSettings, page: number, pageSize: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.ranking.page(settings, page, pageSize);
  return useQuery({
    ...sharedOptions,
    queryKey: key,
    queryFn: async ({ signal }) => keepNewest(queryClient, key, await api.getRanking(settings, page, pageSize, signal)),
  });
}

export function useMatchHistory(playerId: string, page: number, pageSize: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.history.page(playerId, page, pageSize);
  return useQuery({
    ...sharedOptions,
    queryKey: key,
    queryFn: async ({ signal }) =>
      keepNewest(queryClient, key, await api.getMatchHistory(playerId, page, pageSize, signal)),
  });
}
