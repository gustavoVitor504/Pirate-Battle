import type { MatchEndReason } from './simulation/entities';

export interface MatchResult {
  score: number;
  /** Active play time, in seconds. */
  durationSec: number;
  reason: MatchEndReason;
}

/** `focus-lost` covers both the window losing focus and the tab being hidden. */
export type PauseReason = 'manual' | 'focus-lost';

/** What the React UI shows about a running match. Values are coarse so it changes rarely. */
export interface MatchSnapshot {
  score: number;
  /** Whole seconds left, rounded up. */
  remainingSec: number;
  health: number;
  maxHealth: number;
  /** Null while playing. */
  pauseReason: PauseReason | null;
  result: MatchResult | null;
}

/**
 * Bridge from the simulation to React. The engine writes every frame, but
 * subscribers are only notified when a displayed value actually changes, so
 * React re-renders a few times per second at most, never per frame.
 * Shape matches `useSyncExternalStore`.
 */
export class MatchStore {
  private readonly listeners = new Set<() => void>();

  constructor(private snapshot: MatchSnapshot) {}

  readonly getSnapshot = (): MatchSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(next: MatchSnapshot): void {
    const prev = this.snapshot;
    if (
      prev.score === next.score &&
      prev.remainingSec === next.remainingSec &&
      prev.health === next.health &&
      prev.maxHealth === next.maxHealth &&
      prev.pauseReason === next.pauseReason &&
      prev.result === next.result
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
