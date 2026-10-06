import { delay, http, HttpResponse } from 'msw';
import {
  compareRanking,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  sameSettings,
  type ApiErrorBody,
  type MatchHistoryPage,
  type MatchRecord,
  type MatchSettings,
  type Page,
  type RankingPage,
  type RegisterMatchResponse,
} from '../api/contracts';
import { isRecord } from '../lib/storage';
import { Random } from '../game/simulation/random';
import { mockDb } from './db';
import { createManyPagesHistory, createManyPagesRanking } from './fixtures';
import { getMockSettings, subscribeMockSettings, type MockSettings } from './scenarios';

type Endpoint = 'ranking' | 'history' | 'register';

/** Counts requests, for scenarios whose timing depends on request order; resets with the scenario. */
let requestCount = 0;
let latencyRandom = new Random(getMockSettings().seed);
/** Matches whose first submission is being swallowed by the "register-timeout" scenario. */
const swallowedOnce = new Set<string>();

subscribeMockSettings(() => {
  requestCount = 0;
  latencyRandom = new Random(getMockSettings().seed);
});

function latencyFor(settings: MockSettings, requestIndex: number): number {
  switch (settings.scenario) {
    case 'slow':
      return 2500;
    case 'variable-latency':
      return Math.round(latencyRandom.range(100, 2500));
    case 'out-of-order':
      return requestIndex % 2 === 1 ? 2000 : 200;
    default:
      return settings.latencyMs;
  }
}

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

/**
 * Shared front part of every handler: latency and scenario-driven failures.
 * Returns a response to send instead of the real one, or null to continue.
 */
async function applyScenario(endpoint: Endpoint): Promise<Response | null> {
  const settings = getMockSettings();
  requestCount += 1;
  await delay(latencyFor(settings, requestCount));

  switch (settings.scenario) {
    case 'timeout':
      await delay('infinite');
      return null;
    case 'network-error':
      return HttpResponse.error();
    case 'server-error':
      return errorResponse(500, 'internal_error', 'The server failed to process the request.');
    case 'client-error':
      return endpoint === 'register'
        ? errorResponse(422, 'invalid_match', 'The match record was rejected.')
        : errorResponse(400, 'bad_request', 'The request parameters were rejected.');
    case 'ranking-error':
      return endpoint === 'ranking' ? errorResponse(500, 'internal_error', 'The ranking is unavailable.') : null;
    case 'history-error':
      return endpoint === 'history' ? errorResponse(500, 'internal_error', 'The match history is unavailable.') : null;
    case 'register-unavailable':
      return endpoint === 'register'
        ? errorResponse(503, 'unavailable', 'Match registration is temporarily unavailable.')
        : null;
    default:
      return null;
  }
}

function readPaging(url: URL): { page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return null;
  }
  return { page, pageSize };
}

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalItems: items.length,
    totalPages,
    revision: mockDb.revision,
  };
}

function parseMatchRecord(value: unknown): MatchRecord | null {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const { matchId, playerId, playerName, endedAt, score, durationSec, endReason, settings } = value;
  const valid =
    typeof matchId === 'string' &&
    matchId.length > 0 &&
    typeof playerId === 'string' &&
    typeof playerName === 'string' &&
    typeof endedAt === 'string' &&
    !Number.isNaN(Date.parse(endedAt)) &&
    Number.isInteger(score) &&
    (score as number) >= 0 &&
    typeof durationSec === 'number' &&
    durationSec >= 0 &&
    (endReason === 'time-up' || endReason === 'player-destroyed') &&
    typeof settings.sessionDurationSec === 'number' &&
    typeof settings.enemySpawnIntervalSec === 'number';
  if (!valid) return null;
  return {
    matchId,
    playerId,
    playerName,
    endedAt,
    score: score as number,
    durationSec,
    endReason,
    settings: {
      sessionDurationSec: settings.sessionDurationSec as number,
      enemySpawnIntervalSec: settings.enemySpawnIntervalSec as number,
    },
  };
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const failure = await applyScenario('ranking');
    if (failure) return failure;

    const url = new URL(request.url);
    const paging = readPaging(url);
    const settings: MatchSettings = {
      sessionDurationSec: Number(url.searchParams.get('sessionDurationSec')),
      enemySpawnIntervalSec: Number(url.searchParams.get('enemySpawnIntervalSec')),
    };
    if (!paging || !(settings.sessionDurationSec > 0) || !(settings.enemySpawnIntervalSec > 0)) {
      return errorResponse(400, 'bad_request', 'page, pageSize and match settings are required.');
    }

    const { scenario } = getMockSettings();
    const pool = scenario === 'empty' ? [] : mockDb.all();
    if (scenario === 'many-pages') pool.push(...createManyPagesRanking());
    const ranked = pool
      .filter((record) => sameSettings(record.settings, settings))
      .sort(compareRanking)
      .map((record, index) => ({
        rank: index + 1,
        matchId: record.matchId,
        playerId: record.playerId,
        playerName: record.playerName,
        score: record.score,
        durationSec: record.durationSec,
        endedAt: record.endedAt,
      }));

    return HttpResponse.json<RankingPage>({ ...paginate(ranked, paging.page, paging.pageSize), settings });
  }),

  http.get('/api/players/:playerId/matches', async ({ request, params }) => {
    const failure = await applyScenario('history');
    if (failure) return failure;

    const paging = readPaging(new URL(request.url));
    if (!paging) return errorResponse(400, 'bad_request', 'Invalid page or pageSize.');
    const playerId = String(params.playerId);

    const { scenario } = getMockSettings();
    const own = scenario === 'empty' ? [] : mockDb.all().filter((record) => record.playerId === playerId);
    if (scenario === 'many-pages') {
      own.push(...createManyPagesHistory({ playerId, playerName: own[0]?.playerName ?? 'You' }));
    }
    own.sort((a, b) => b.endedAt.localeCompare(a.endedAt) || a.matchId.localeCompare(b.matchId));

    return HttpResponse.json<MatchHistoryPage>(paginate(own, paging.page, paging.pageSize));
  }),

  http.post('/api/matches', async ({ request }) => {
    const failure = await applyScenario('register');
    if (failure) return failure;

    const record = parseMatchRecord(await request.json().catch(() => null));
    if (!record) return errorResponse(422, 'invalid_match', 'The match record is malformed.');

    // Idempotent on matchId: a re-sent match returns what is already stored.
    const existing = mockDb.find(record.matchId);
    if (existing) {
      return HttpResponse.json<RegisterMatchResponse>(
        { record: existing, created: false, revision: mockDb.revision },
        { status: 200 },
      );
    }

    mockDb.insert(record);
    if (getMockSettings().scenario === 'register-timeout' && !swallowedOnce.has(record.matchId)) {
      // Stored, but the client never hears back; its retry must get this record, not a duplicate.
      swallowedOnce.add(record.matchId);
      await delay('infinite');
    }
    return HttpResponse.json<RegisterMatchResponse>(
      { record, created: true, revision: mockDb.revision },
      { status: 201 },
    );
  }),
];
