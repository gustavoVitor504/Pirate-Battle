import { DEFAULT_GAME_CONFIG, ENEMY_SPAWN_INTERVAL_LIMITS, SESSION_DURATION_LIMITS, type GameConfig } from '../game/config';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../lib/storage';

/** The two gameplay settings players can change in the Options screen. */
export interface PlayerOptions {
  /** Whole seconds, 60–180. */
  sessionDurationSec: number;
  /** Seconds between spawns, 1–30 in steps of 0.5. */
  enemySpawnIntervalSec: number;
}

export type OptionKey = keyof PlayerOptions;

export interface OptionRule {
  min: number;
  max: number;
  /** Increment of the +/- buttons and the granularity a value must respect. */
  step: number;
}

export const OPTION_RULES: Readonly<Record<OptionKey, OptionRule>> = {
  sessionDurationSec: { ...SESSION_DURATION_LIMITS, step: 1 },
  enemySpawnIntervalSec: { ...ENEMY_SPAWN_INTERVAL_LIMITS, step: 0.5 },
};

/** Step used by the +/- buttons, coarser than the allowed granularity for the session time. */
export const OPTION_BUTTON_STEP: Readonly<Record<OptionKey, number>> = {
  sessionDurationSec: 10,
  enemySpawnIntervalSec: 0.5,
};

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionDurationSec: DEFAULT_GAME_CONFIG.sessionDurationSec,
  enemySpawnIntervalSec: DEFAULT_GAME_CONFIG.enemySpawnIntervalSec,
};

const STORAGE_VERSION = 1;

/** Returns an error message for a raw field value, or null when it is valid. */
export function validateOption(key: OptionKey, raw: string): string | null {
  const { min, max, step } = OPTION_RULES[key];
  const text = raw.trim();
  const value = Number(text);
  const unit = key === 'sessionDurationSec' ? 'a whole number of seconds' : 'a number of seconds in steps of 0.5';
  if (text === '' || !Number.isFinite(value) || value < min || value > max || !isMultipleOf(value, step)) {
    return `Enter ${unit} between ${min} and ${max}.`;
  }
  return null;
}

/** Parses raw field values; returns the options or the per-field errors. */
export function parseOptions(
  raw: Record<OptionKey, string>,
): { ok: true; value: PlayerOptions } | { ok: false; errors: Partial<Record<OptionKey, string>> } {
  const errors: Partial<Record<OptionKey, string>> = {};
  for (const key of Object.keys(OPTION_RULES) as OptionKey[]) {
    const error = validateOption(key, raw[key]);
    if (error) errors[key] = error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sessionDurationSec: Number(raw.sessionDurationSec),
      enemySpawnIntervalSec: Number(raw.enemySpawnIntervalSec),
    },
  };
}

export function loadOptions(): PlayerOptions {
  return readJson(STORAGE_KEYS.options, parseStoredOptions) ?? { ...DEFAULT_OPTIONS };
}

export function saveOptions(options: PlayerOptions): boolean {
  return writeJson(STORAGE_KEYS.options, { version: STORAGE_VERSION, ...options });
}

/** The full gameplay config for a new match, with the player's options applied. */
export function buildGameConfig(options: PlayerOptions): GameConfig {
  return { ...DEFAULT_GAME_CONFIG, ...options };
}

function parseStoredOptions(value: unknown): PlayerOptions | null {
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return null;
  const raw = {
    sessionDurationSec: String(value.sessionDurationSec),
    enemySpawnIntervalSec: String(value.enemySpawnIntervalSec),
  };
  const parsed = parseOptions(raw);
  return parsed.ok ? parsed.value : null;
}

function isMultipleOf(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}
