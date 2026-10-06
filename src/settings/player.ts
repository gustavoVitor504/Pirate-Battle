import type { MatchRecord } from '../api/contracts';
import type { MatchResult } from '../game/MatchStore';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

export interface PlayerIdentity {
  playerId: string;
  playerName: string;
}

let cached: PlayerIdentity | null = null;

/**
 * The local player's identity: created on first use and kept in localStorage,
 * so the match history follows the same browser across sessions.
 */
export function getPlayer(): PlayerIdentity {
  if (cached) return cached;
  const stored = readJson(STORAGE_KEYS.player, (value) =>
    isRecord(value) && typeof value.playerId === 'string' && typeof value.playerName === 'string'
      ? { playerId: value.playerId, playerName: value.playerName }
      : null,
  );
  if (stored) return (cached = stored);

  const playerId = crypto.randomUUID();
  const created = { playerId, playerName: `Captain ${parseInt(playerId.slice(0, 4), 16) % 9000 + 1000}` };
  writeJson(STORAGE_KEYS.player, created);
  return (cached = created);
}

export function toMatchRecord(result: MatchResult, player: PlayerIdentity = getPlayer()): MatchRecord {
  return {
    matchId: result.matchId,
    playerId: player.playerId,
    playerName: player.playerName,
    endedAt: result.endedAt,
    score: result.score,
    durationSec: result.durationSec,
    endReason: result.reason,
    settings: { ...result.settings },
  };
}
