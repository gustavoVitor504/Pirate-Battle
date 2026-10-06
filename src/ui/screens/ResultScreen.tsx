import type { MatchResult } from '../../game/MatchStore';
import { RegistrationStatusLine } from '../components/Registration';
import { ScreenHeading } from '../components/ScreenHeading';
import { END_REASON_LABEL, formatClock } from '../format';
import './menus.css';

interface ResultScreenProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export function ResultScreen({ result, onPlayAgain, onMainMenu }: ResultScreenProps) {
  const title = result.reason === 'time-up' ? 'Battle complete' : 'Ship sunk';

  return (
    <main className="scene">
      <div className="panel result">
        <ScreenHeading>{title}</ScreenHeading>

        <p className="result__score">
          <span data-testid="result-score">{result.score}</span>
          <span className="result__score-label">points</span>
        </p>
        <dl className="result__details">
          <div>
            <dt>Time played</dt>
            <dd data-testid="result-time">{formatClock(result.durationSec)}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd data-testid="result-reason">{END_REASON_LABEL[result.reason]}</dd>
          </div>
        </dl>
        <RegistrationStatusLine matchId={result.matchId} />

        <div className="stack">
          <button type="button" className="menu-button" onClick={onPlayAgain}>
            Play Again
          </button>
          <button type="button" className="menu-button" onClick={onMainMenu}>
            Main Menu
          </button>
        </div>
      </div>
    </main>
  );
}
