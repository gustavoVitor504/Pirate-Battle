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
