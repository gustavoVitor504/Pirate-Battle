import { isRecord, readJson, removeItem, STORAGE_KEYS, writeJson } from '../lib/storage';

/**
 * Reproducible network conditions for the mock API. The active scenario is
 * stored in localStorage, so it survives refreshes, and can be chosen in the
 * Network Lab dialog or with URL parameters:
 *
 *   ?scenario=slow          pick a scenario
 *   &mockLatency=0          fixed latency in ms for scenarios without their own timing
 *   &mockSeed=42            seed for scenarios with random latency
 *   ?scenario=reset         restore the initial state (mock data, scenario, pending submissions)
 */
export const SCENARIOS = [
  { id: 'success', label: 'Success', description: 'Normal responses after a short delay.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history come back empty.' },
  {
    id: 'many-pages',
    label: 'Many pages',
    description: 'Adds 30 past matches to your history and 60 entries to the ranking.',
  },
  { id: 'slow', label: 'Slow network', description: 'Every response takes 2.5 s.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded random latency between 0.1 and 2.5 s.' },
  {
    id: 'out-of-order',
    label: 'Out-of-order responses',
    description: 'Odd requests take 2 s and even ones 0.2 s, so later responses overtake earlier ones.',
  },
  { id: 'timeout', label: 'Timeout', description: 'The server never answers; the client gives up.' },
  { id: 'network-error', label: 'Connection failure', description: 'Every request fails at the network level.' },
  { id: 'server-error', label: 'Server error (5xx)', description: 'Every request returns HTTP 500.' },
  { id: 'client-error', label: 'Client error (4xx)', description: 'Queries return HTTP 400; submissions HTTP 422.' },
  { id: 'ranking-error', label: 'Ranking fails', description: 'Only the ranking returns HTTP 500.' },
  { id: 'history-error', label: 'History fails', description: 'Only the match history returns HTTP 500.' },
  {
    id: 'register-timeout',
    label: 'Timeout after saving',
    description: 'The first submission of a match is stored but never answered; the retry gets the stored record.',
  },
  {
    id: 'register-unavailable',
    label: 'Submissions unavailable',
    description: 'Submitting a match returns HTTP 503; queries keep working. Switch back to recover.',
  },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export interface MockSettings {
  scenario: ScenarioId;
  /** Latency for scenarios without their own timing. */
  latencyMs: number;
  /** Seed for scenarios with random latency. */
  seed: number;
}

export const DEFAULT_MOCK_SETTINGS: MockSettings = { scenario: 'success', latencyMs: 300, seed: 1 };

const SCENARIO_IDS = new Set<string>(SCENARIOS.map((scenario) => scenario.id));
const listeners = new Set<() => void>();
let current: MockSettings = loadSettings();

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && SCENARIO_IDS.has(value);
}

export function getMockSettings(): MockSettings {
  return current;
}

export function setMockSettings(next: Partial<MockSettings>): void {
  current = { ...current, ...next };
  writeJson(STORAGE_KEYS.mockScenario, current);
  for (const listener of listeners) listener();
}

export function subscribeMockSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetMockSettings(): void {
  removeItem(STORAGE_KEYS.mockScenario);
  current = { ...DEFAULT_MOCK_SETTINGS };
  for (const listener of listeners) listener();
}

/**
 * Applies `?scenario=`, `?mockLatency=` and `?mockSeed=` from the URL.
 * Returns true when `?scenario=reset` asked for a full reset.
 */
export function applyMockSettingsFromUrl(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario');
  if (scenario === 'reset') return true;

  const next: Partial<MockSettings> = {};
  if (isScenarioId(scenario)) next.scenario = scenario;
  const latency = Number(params.get('mockLatency'));
  if (params.has('mockLatency') && Number.isFinite(latency) && latency >= 0) next.latencyMs = latency;
  const seed = Number(params.get('mockSeed'));
  if (params.has('mockSeed') && Number.isInteger(seed)) next.seed = seed;
  if (Object.keys(next).length > 0) setMockSettings(next);
  return false;
}

export function scenarioLabel(id: ScenarioId): string {
  return SCENARIOS.find((scenario) => scenario.id === id)?.label ?? id;
}

function loadSettings(): MockSettings {
  const stored = readJson(STORAGE_KEYS.mockScenario, (value) => {
    if (!isRecord(value) || !isScenarioId(value.scenario)) return null;
    return {
      scenario: value.scenario,
      latencyMs: typeof value.latencyMs === 'number' ? value.latencyMs : DEFAULT_MOCK_SETTINGS.latencyMs,
      seed: typeof value.seed === 'number' ? value.seed : DEFAULT_MOCK_SETTINGS.seed,
    };
  });
  return stored ?? { ...DEFAULT_MOCK_SETTINGS };
}
