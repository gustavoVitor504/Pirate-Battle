import { useEffect, useRef, useState } from 'react';
import { DEFAULT_GAME_CONFIG } from '../game/config';
import { GameEngine, type EngineStatus } from '../game/GameEngine';
import './GameScreen.css';

export function GameScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new GameEngine({ host, config: DEFAULT_GAME_CONFIG, onStatus: setStatus });
    void engine.start();
    return () => engine.destroy();
  }, [attempt]);

  return (
    <main className="game-screen">
      <div ref={hostRef} className="game-screen__canvas" />

      {status.kind === 'loading' && (
        <div className="game-screen__overlay" role="status">
          <p>Loading assets… {Math.round(status.progress * 100)}%</p>
          <progress max={1} value={status.progress} aria-label="Asset loading progress" />
        </div>
      )}

      {status.kind === 'error' && (
        <div className="game-screen__overlay" role="alert">
          <p>The game assets could not be loaded.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      <p className="game-screen__hint">W / ↑ forward · A D / ← → turn</p>
    </main>
  );
}
