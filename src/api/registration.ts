import { MutationObserver, useMutationState, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { MatchRecord, RegisterMatchResponse } from './contracts';
import { describeApiError } from './errors';
import { pendingMatches } from './pendingMatches';
import { REGISTER_MATCH_KEY } from './queryClient';

const keyFor = (matchId: string) => [...REGISTER_MATCH_KEY, matchId] as const;

/** Sends a pending match unless a submission for it is already in flight (double clicks, Strict Mode). */
function submit(queryClient: QueryClient, record: MatchRecord): void {
  const mutationKey = keyFor(record.matchId);
  if (queryClient.isMutating({ mutationKey, exact: true }) > 0) return;
  const observer = new MutationObserver<RegisterMatchResponse, Error, MatchRecord>(queryClient, { mutationKey });
  // Failures stay visible through the mutation state; the record stays queued for a retry.
  observer.mutate(record).catch(() => undefined);
}

/** Queues a completed match (persisted first, so nothing is lost) and submits it. */
export function registerCompletedMatch(queryClient: QueryClient, record: MatchRecord): void {
  pendingMatches.add(record);
  submit(queryClient, record);
}

/** Re-submits every queued match. Safe to call repeatedly. */
export function retryPendingMatches(queryClient: QueryClient): void {
  for (const record of pendingMatches.getSnapshot()) submit(queryClient, record);
}

export function usePendingMatches(): readonly MatchRecord[] {
  return useSyncExternalStore(pendingMatches.subscribe, pendingMatches.getSnapshot);
}

export type RegistrationStatus =
  | { kind: 'recorded' }
  | { kind: 'submitting'; attempt: number }
  | { kind: 'failed'; message: string }
  | { kind: 'queued' };

/** Where a match's submission stands, combining the persisted queue with the live mutation state. */
export function useRegistrationStatus(matchId: string): RegistrationStatus {
  const pending = usePendingMatches().some((record) => record.matchId === matchId);
  const states = useMutationState({
    filters: { mutationKey: keyFor(matchId), exact: true },
    select: (mutation) => mutation.state,
  });
  const latest = states.at(-1);

  if (!pending) return { kind: 'recorded' };
  if (latest?.status === 'pending') return { kind: 'submitting', attempt: latest.failureCount + 1 };
  if (latest?.status === 'error') return { kind: 'failed', message: describeApiError(latest.error).message };
  return { kind: 'queued' };
}
