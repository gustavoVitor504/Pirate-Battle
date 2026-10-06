import type { MatchRecord, MatchSettings } from '../api/contracts';
import { DEFAULT_GAME_CONFIG } from '../game/config';
import { Random } from '../game/simulation/random';

/**
 * Deterministic fixture data for the mock API: the same seed always produces
 * the same records, so development, tests and the demo all see identical data.
 */

export const DEFAULT_SETTINGS: MatchSettings = {
  sessionDurationSec: DEFAULT_GAME_CONFIG.sessionDurationSec,
  enemySpawnIntervalSec: DEFAULT_GAME_CONFIG.enemySpawnIntervalSec,
};

/** Other settings some fixture matches use, to show that the ranking filters by settings. */
const OTHER_SETTINGS: readonly MatchSettings[] = [
  { sessionDurationSec: 60, enemySpawnIntervalSec: 2 },
  { sessionDurationSec: 180, enemySpawnIntervalSec: 6 },
];

const FIXTURE_PLAYERS = [
  'Anne Bonny',
  'Blackbeard',
  'Calico Jack',
  'Grace O’Malley',
  'Henry Morgan',
  'Mary Read',
  'Ching Shih',
  'Bartholomew Roberts',
  'Stede Bonnet',
  'Charles Vane',
  'Edward England',
  'Samuel Bellamy',
  'William Kidd',
  'Jean Lafitte',
] as const;

const BASE_TIME = Date.UTC(2026, 8, 1, 12, 0, 0);
const HOUR = 3_600_000;

function makeMatch(
  random: Random,
  index: number,
  player: { playerId: string; playerName: string },
  settings: MatchSettings,
  idPrefix: string,
): MatchRecord {
  const sunk = random.next() < 0.35;
  const durationSec = sunk
    ? Math.round(random.range(settings.sessionDurationSec * 0.2, settings.sessionDurationSec * 0.95) * 10) / 10
    : settings.sessionDurationSec;
  const killRate = random.range(0.05, 0.25);
  return {
    matchId: `${idPrefix}-${String(index).padStart(4, '0')}`,
    playerId: player.playerId,
    playerName: player.playerName,
    endedAt: new Date(BASE_TIME + index * 7 * HOUR + Math.floor(random.next() * HOUR)).toISOString(),
    score: Math.round(durationSec * killRate),
    durationSec,
    endReason: sunk ? 'player-destroyed' : 'time-up',
    settings,
  };
}

/** Matches of other players: three per player with the default settings, one with other settings. */
export function createFixtureMatches(seed = 2026): MatchRecord[] {
  const random = new Random(seed);
  const records: MatchRecord[] = [];
  FIXTURE_PLAYERS.forEach((playerName, playerIndex) => {
    const player = { playerId: `fixture-player-${playerIndex + 1}`, playerName };
    for (let i = 0; i < 4; i++) {
      const settings = i < 3 ? DEFAULT_SETTINGS : OTHER_SETTINGS[playerIndex % OTHER_SETTINGS.length]!;
      records.push(makeMatch(random, records.length, player, settings, 'fixture'));
    }
  });
  return records;
}

/** "Many pages" scenario: 30 past matches for the requesting player. */
export function createManyPagesHistory(player: { playerId: string; playerName: string }): MatchRecord[] {
  const random = new Random(7);
  return Array.from({ length: 30 }, (_, i) => makeMatch(random, i, player, DEFAULT_SETTINGS, `bulk-${player.playerId}`));
}

/** "Many pages" scenario: 60 extra ranking entries from 20 more players. */
export function createManyPagesRanking(): MatchRecord[] {
  const random = new Random(8);
  return Array.from({ length: 60 }, (_, i) =>
    makeMatch(random, 100 + i, { playerId: `bulk-player-${i % 20}`, playerName: `Buccaneer ${(i % 20) + 1}` }, DEFAULT_SETTINGS, 'bulk-other'),
  );
}
