import axios from 'axios';
import type { MatchHistoryPage, MatchRecord, MatchSettings, RankingPage, RegisterMatchResponse } from './contracts';

const DEFAULT_TIMEOUT_MS = 6000;

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

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
