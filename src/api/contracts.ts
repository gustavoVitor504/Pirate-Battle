/**
 * Typed contracts of the ranking and match-history REST API. Shared by the
 * Axios client and the MSW handlers, so the mock can never drift from what
 * the app expects.
 *
 *   GET  /api/ranking?sessionDurationSec&enemySpawnIntervalSec&page&pageSize  → RankingPage
 *   GET  /api/players/:playerId/matches?page&pageSize                         → MatchHistoryPage
 *   POST /api/matches   (body: MatchRecord)                                   → RegisterMatchResponse
 *
 * Registration is idempotent on `matchId`: re-sending a match returns the
 * stored record (200) instead of creating a second one (201).
 */

export type MatchEndReason = 'time-up' | 'player-destroyed';

/** The settings a match was played with; the ranking only compares matches with equal settings. */
export interface MatchSettings {
  sessionDurationSec: number;
  enemySpawnIntervalSec: number;
}

export interface MatchRecord {
  /** Client-generated UUID; the idempotency key. */
  matchId: string;
  playerId: string;
  playerName: string;
  /** ISO 8601. */
  endedAt: string;
  score: number;
  /** Effective (active) play time in seconds. */
  durationSec: number;
  endReason: MatchEndReason;
  settings: MatchSettings;
}

export interface RankingEntry {
  /** 1-based position within the ranking for these settings. */
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationSec: number;
  endedAt: string;
}

export interface Page<T> {
  items: T[];
  /** 1-based. */
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /**
   * Monotonic data version on the server. A response with a lower revision
   * than what the client already shows is stale and is discarded.
   */
  revision: number;
}

export interface RankingPage extends Page<RankingEntry> {
  settings: MatchSettings;
}

export type MatchHistoryPage = Page<MatchRecord>;

export interface RegisterMatchResponse {
  record: MatchRecord;
  /** False when the match was already registered and the existing record was returned. */
  created: boolean;
  revision: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Deterministic ranking order: higher score, then longer survival, then earlier finish, then id. */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  return (
    b.score - a.score ||
    b.durationSec - a.durationSec ||
    a.endedAt.localeCompare(b.endedAt) ||
    a.matchId.localeCompare(b.matchId)
  );
}

export function sameSettings(a: MatchSettings, b: MatchSettings): boolean {
  return a.sessionDurationSec === b.sessionDurationSec && a.enemySpawnIntervalSec === b.enemySpawnIntervalSec;
}

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;
