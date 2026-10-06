/**
 * Thin, failure-tolerant wrappers around Web Storage. Storage can be missing
 * or throw (private mode, quota, blocked cookies); callers then simply get
 * the fallback and the app keeps working without persistence.
 */

export const STORAGE_KEYS = {
  options: 'pirate-battle:options',
  lastResult: 'pirate-battle:last-result',
  /** Session-only: which screen to restore after a refresh (only the result screen is restored). */
  screen: 'pirate-battle:screen',
} as const;

type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads and validates a JSON value; returns null when absent, unreadable or invalid. */
export function readJson<T>(key: string, parse: (value: unknown) => T | null, kind: StorageArea = 'local'): T | null {
  try {
    const raw = area(kind)?.getItem(key);
    return raw == null ? null : parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, kind: StorageArea = 'local'): boolean {
  try {
    area(kind)?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string, kind: StorageArea = 'local'): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
