import { useSyncExternalStore } from 'react';
import type { MatchStore } from '../../game/MatchStore';
import { formatClock } from '../format';

/**
 * Score, time and health as real DOM text, so it is readable by assistive
 * technology. Only coarse values reach React (see `MatchStore`).
 */
export function Hud({ store }: { store: MatchStore }) {
  const { score, remainingSec, health, maxHealth } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const healthRatio = maxHealth > 0 ? health / maxHealth : 0;

  return (
    <section className="hud" aria-label="Match status">
      <div className="hud__panel hud__health">
        <span className="hud__label">Health</span>
        <meter min={0} max={maxHealth} low={maxHealth * 0.3} high={maxHealth * 0.6} optimum={maxHealth} value={health}>
          {health} / {maxHealth}
        </meter>
        <span className="hud__value" data-testid="hud-health">
          {health} / {maxHealth}
        </span>
        <span className="visually-hidden">{healthRatio <= 0.3 ? 'Health low' : ''}</span>
      </div>
      <div className="hud__panel">
        <span className="hud__label">Score</span>
        <span className="hud__value" data-testid="hud-score">
          {score}
        </span>
      </div>
      <div className="hud__panel">
        <span className="hud__label">Time</span>
        <time className="hud__value" data-testid="hud-time" dateTime={`PT${remainingSec}S`}>
          {formatClock(remainingSec)}
        </time>
      </div>
    </section>
  );
}
