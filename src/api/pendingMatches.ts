import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage';
import type { MatchRecord } from './contracts';

/**
 * Completed matches the API has not confirmed yet, persisted in localStorage.
 * A match enters the queue the moment it ends and leaves it only when the
 * server confirms it, so failures and refreshes never lose a result.
 * Shaped as an external store for `useSyncExternalStore`.
 */
class PendingMatches {
  private items: readonly MatchRecord[] = this.load();
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = (): readonly MatchRecord[] => this.items;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  has(matchId: string): boolean {
    return this.items.some((item) => item.matchId === matchId);
  }

  add(record: MatchRecord): void {
    if (this.has(record.matchId)) return;
    this.set([...this.items, record]);
  }

  remove(matchId: string): void {
    if (!this.has(matchId)) return;
    this.set(this.items.filter((item) => item.matchId !== matchId));
  }

  clear(): void {
    this.set([]);
  }

  private set(next: readonly MatchRecord[]): void {
    this.items = next;
    writeJson(STORAGE_KEYS.pendingMatches, next);
    for (const listener of this.listeners) listener();
  }

  private load(): MatchRecord[] {
    return (
      readJson(STORAGE_KEYS.pendingMatches, (value) =>
        Array.isArray(value) ? (value.filter((item) => typeof item?.matchId === 'string') as MatchRecord[]) : null,
      ) ?? []
    );
  }
}

export const pendingMatches = new PendingMatches();
