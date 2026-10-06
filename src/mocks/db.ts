import type { MatchRecord } from '../api/contracts';
import { isRecord, readJson, removeItem, STORAGE_KEYS, writeJson } from '../lib/storage';
import { createFixtureMatches } from './fixtures';

interface StoredDb {
  version: 1;
  /** Records confirmed by the mock server (fixtures are regenerated, not stored). */
  records: MatchRecord[];
  revision: number;
}

/**
 * The mock server's data. Fixtures are rebuilt deterministically on load;
 * records the player submits are kept in localStorage so confirmed matches
 * survive a refresh, exactly like a real backend would keep them.
 */
class MockDatabase {
  private readonly fixtures = createFixtureMatches();
  private stored: StoredDb = this.load();

  /** Increases on every insert; lets the client discard stale responses. */
  get revision(): number {
    return this.fixtures.length + this.stored.revision;
  }

  all(): MatchRecord[] {
    return [...this.fixtures, ...this.stored.records];
  }

  find(matchId: string): MatchRecord | undefined {
    return this.stored.records.find((record) => record.matchId === matchId);
  }

  insert(record: MatchRecord): void {
    // Re-read first: another tab may have written since this one loaded.
    this.stored = this.load();
    this.stored.records.push(record);
    this.stored.revision += 1;
    writeJson(STORAGE_KEYS.mockDb, this.stored);
  }

  reset(): void {
    removeItem(STORAGE_KEYS.mockDb);
    this.stored = { version: 1, records: [], revision: 0 };
  }

  private load(): StoredDb {
    return (
      readJson(STORAGE_KEYS.mockDb, (value) =>
        isRecord(value) && value.version === 1 && Array.isArray(value.records) && typeof value.revision === 'number'
          ? (value as unknown as StoredDb)
          : null,
      ) ?? { version: 1, records: [], revision: 0 }
    );
  }
}

export const mockDb = new MockDatabase();
