import axios, { isAxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import {
  MOCK_RESPONSE_HEADER,
  type MatchHistoryPage,
  type MatchRecord,
  type MatchSettings,
  type RankingPage,
  type RegisterMatchResponse,
} from './contracts';

const DEFAULT_TIMEOUT_MS = 6000;

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

/**
 * Mock self-healing. A Service Worker can be restarted by the browser (for
 * example after a tab sat in the background) and forget that this page uses
 * the mock; requests then bypass it and reach the static host. When a mocked
 * deployment sees an API response without the mock's marker header, it
 * re-activates the mock and repeats the request once.
 */
type MockRecovery = () => Promise<void>;
let recoverMock: MockRecovery | null = null;
let recovering: Promise<void> | null = null;

export function onMockBypassed(recovery: MockRecovery): void {
  recoverMock = recovery;
}

function bypassedMock(response: AxiosResponse | undefined): boolean {
  return recoverMock !== null && response !== undefined && response.headers[MOCK_RESPONSE_HEADER] !== '1';
}

async function retryThroughMock(config: InternalAxiosRequestConfig & { mockRetried?: boolean }) {
  config.mockRetried = true;
  recovering ??= recoverMock!().finally(() => {
    recovering = null;
  });
  await recovering;
  return httpClient.request(config);
}

httpClient.interceptors.response.use(
  (response) => {
    const config = response.config as InternalAxiosRequestConfig & { mockRetried?: boolean };
    return bypassedMock(response) && !config.mockRetried ? retryThroughMock(config) : response;
  },
  (error: unknown) => {
    if (isAxiosError(error) && error.config && bypassedMock(error.response)) {
      const config = error.config as InternalAxiosRequestConfig & { mockRetried?: boolean };
      if (!config.mockRetried) return retryThroughMock(config);
    }
    return Promise.reject(error);
  },
);

/** Typed calls to the ranking and match-history API. `signal` lets TanStack Query cancel superseded requests. */
export const api = {
  async getRanking(settings: MatchSettings, page: number, pageSize: number, signal?: AbortSignal): Promise<RankingPage> {
    const response = await httpClient.get<RankingPage>('/ranking', {
      params: { ...settings, page, pageSize },
      ...(signal ? { signal } : {}),
    });
    return response.data;
  },

  async getMatchHistory(playerId: string, page: number, pageSize: number, signal?: AbortSignal): Promise<MatchHistoryPage> {
    const response = await httpClient.get<MatchHistoryPage>(`/players/${encodeURIComponent(playerId)}/matches`, {
      params: { page, pageSize },
      ...(signal ? { signal } : {}),
    });
    return response.data;
  },

  /** Idempotent on `record.matchId`, so it is safe to retry. */
  async registerMatch(record: MatchRecord): Promise<RegisterMatchResponse> {
    const response = await httpClient.post<RegisterMatchResponse>('/matches', record);
    return response.data;
  },
};
