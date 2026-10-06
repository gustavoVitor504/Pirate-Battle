import { isAxiosError } from 'axios';
import { isRecord } from '../lib/storage';

export interface ApiFailure {
  /** Player-facing explanation. */
  message: string;
  /** Whether trying again may succeed (network trouble, timeouts, 5xx, 429). */
  retryable: boolean;
  status: number | null;
}

/** Turns any error thrown by the API client into something the UI can show and the retry policy can use. */
export function describeApiError(error: unknown): ApiFailure {
  if (!isAxiosError(error)) {
    return { message: 'Something unexpected went wrong.', retryable: false, status: null };
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return { message: 'The server took too long to answer.', retryable: true, status: null };
  }
  const response = error.response;
  if (!response) {
    return { message: 'Could not reach the server. Check your connection.', retryable: true, status: null };
  }
  const serverMessage =
    isRecord(response.data) && isRecord(response.data.error) && typeof response.data.error.message === 'string'
      ? response.data.error.message
      : null;
  const status = response.status;
  const retryable = status >= 500 || status === 429;
  const fallback = retryable ? 'The server had a problem.' : 'The request was rejected.';
  return { message: `${serverMessage ?? fallback} (HTTP ${status})`, retryable, status };
}

/** Retry policy shared by queries and the match submission. */
export function shouldRetry(failureCount: number, error: unknown, maxRetries: number): boolean {
  return failureCount < maxRetries && describeApiError(error).retryable;
}

export function retryDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 4000);
}
