import type { MatchEndReason } from '../game/simulation/entities';

/** Formats seconds as mm:ss. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export const END_REASON_LABEL: Readonly<Record<MatchEndReason, string>> = {
  'time-up': 'Time up',
  'player-destroyed': 'Ship sunk',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** Formats an ISO timestamp for tables, e.g. "Sep 1, 2026, 2:30 PM". */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}
