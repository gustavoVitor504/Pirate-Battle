import type { MatchSettings } from './contracts';

/** Query keys in one place, so invalidation always matches what the hooks use. */
export const queryKeys = {
  ranking: {
    all: ['ranking'] as const,
    page: (settings: MatchSettings, page: number, pageSize: number) =>
      ['ranking', settings.sessionDurationSec, settings.enemySpawnIntervalSec, page, pageSize] as const,
  },
  history: {
    all: ['history'] as const,
    page: (playerId: string, page: number, pageSize: number) => ['history', playerId, page, pageSize] as const,
  },
};
