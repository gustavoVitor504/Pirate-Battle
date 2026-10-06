import type { MatchResult } from '../game/MatchStore';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

/** Persists the last completed match so the result survives a refresh. */
export function saveLastResult(result: MatchResult): void {
  writeJson(STORAGE_KEYS.lastResult, result);
}

export function loadLastResult(): MatchResult | null {
  return readJson(STORAGE_KEYS.lastResult, parseResult);
}

function parseResult(value: unknown): MatchResult | null {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const { matchId, endedAt, score, durationSec, reason, settings } = value;
  if (
    typeof matchId !== 'string' ||
    typeof endedAt !== 'string' ||
    typeof score !== 'number' ||
    typeof durationSec !== 'number' ||
    (reason !== 'time-up' && reason !== 'player-destroyed') ||
    typeof settings.sessionDurationSec !== 'number' ||
    typeof settings.enemySpawnIntervalSec !== 'number'
  ) {
    return null;
  }
  return {
    matchId,
    endedAt,
    score,
    durationSec,
    reason,
    settings: {
      sessionDurationSec: settings.sessionDurationSec,
      enemySpawnIntervalSec: settings.enemySpawnIntervalSec,
    },
  };
}
