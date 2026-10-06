import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { audio } from '../game/audio/AudioManager';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../game/config';
import { GameEngine, type EngineStatus } from '../game/GameEngine';
import { MatchStore } from '../game/MatchStore';
import { formatClock } from './format';
import { Hud } from './Hud';
import { Modal } from './Modal';
import { TouchControls } from './TouchControls';
import './GameScreen.css';

const END_REASON_LABEL = {
  'time-up': 'Time is up',
  'player-destroyed': 'Your ship was sunk',
} as const;

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
/** Touch devices are played in landscape; portrait pauses the match. */
const PORTRAIT_TOUCH_QUERY = '(orientation: portrait) and (pointer: coarse)';
const ICONS = `${import.meta.env.BASE_URL}assets/png/default/ui/controls`;

function createMatchStore(config: GameConfig): MatchStore {
  return new MatchStore({
    score: 0,
    remainingSec: config.sessionDurationSec,
    health: config.player.ship.maxHealth,
    maxHealth: config.player.ship.maxHealth,
    pauseReason: null,
    result: null,
  });
}

export function GameScreen() {
  const config = DEFAULT_GAME_CONFIG;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: 'loading', progress: 0 });
  // A new store means a new match: the effect below rebuilds the engine for it.
  const [store, setStore] = useState(() => createMatchStore(config));
  const [muted, setMuted] = useState(() => audio.muted);
  const { result, pauseReason } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const running = status.kind === 'running';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new GameEngine({ host, config, store, onStatus: setStatus });
    engineRef.current = engine;
    void engine.start();
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [config, store]);

  // Pause shortcut; only active while a match is on screen and playing.
  // Once paused, Escape belongs to the dialog (it resumes), so it is left alone.
  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!PAUSE_KEYS.has(event.code) || event.repeat) return;
      const { pauseReason: paused, result: ended } = store.getSnapshot();
      if (paused || ended) return;
      event.preventDefault();
      engineRef.current?.pause('manual');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running, store]);

  // Rotating a phone to portrait pauses; the pause dialog then asks to rotate back.
  useEffect(() => {
    if (!running) return;
    const query = window.matchMedia(PORTRAIT_TOUCH_QUERY);
    const check = () => {
      if (query.matches) engineRef.current?.pause('manual');
    };
    check();
    query.addEventListener('change', check);
    return () => query.removeEventListener('change', check);
  }, [running]);

  const restart = () => setStore(createMatchStore(config));
  const resume = () => engineRef.current?.resume();
  const toggleMute = () => {
    audio.setMuted(!muted);
    setMuted(!muted);
  };

  return (
    <main className="game-screen">
      <div ref={hostRef} className="game-screen__canvas" />

      {running && (
        <>
          <Hud store={store} />
          <div className="game-screen__actions">
            <button
              type="button"
              className="round-button"
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              aria-pressed={muted}
              onClick={toggleMute}
            >
              <SpeakerIcon muted={muted} />
            </button>
            <button
              type="button"
              className="round-button"
              aria-label="Pause game"
              onClick={() => engineRef.current?.pause('manual')}
            >
              <img src={`${ICONS}/icon_pause.png`} alt="" />
            </button>
          </div>
          <TouchControls
            onPress={(action) => engineRef.current?.touch.press(action)}
            onRelease={(action) => engineRef.current?.touch.release(action)}
          />
          <p className="game-screen__hint">
            W / ↑ forward · A D / ← → turn · Space front cannon · Q / E broadside · Esc / P pause
          </p>
        </>
      )}

      {status.kind === 'loading' && (
        <div className="game-screen__overlay" role="status">
          <p>Loading assets… {Math.round(status.progress * 100)}%</p>
          <progress max={1} value={status.progress} aria-label="Asset loading progress" />
        </div>
      )}

      {status.kind === 'error' && (
        <div className="game-screen__overlay" role="alert">
          <p>The game assets could not be loaded.</p>
          <button type="button" className="primary-button" onClick={restart}>
            Try again
          </button>
        </div>
      )}

      <Modal open={pauseReason !== null && !result} labelledBy="pause-title" onCancel={resume}>
        <h2 id="pause-title">Paused</h2>
        <p>{pauseReason === 'focus-lost' ? 'The game paused because it lost focus.' : 'Take a breath, captain.'}</p>
        <p className="modal__rotate-hint">Rotate your device to landscape to keep playing.</p>
        <div
          className="modal__actions"
          onKeyDown={(event) => {
            if (event.code === 'KeyP') resume();
          }}
        >
          <button type="button" className="primary-button" onClick={resume} autoFocus>
            Resume
          </button>
        </div>
      </Modal>

      <Modal open={result !== null} labelledBy="result-title">
        {result && (
          <>
            <h2 id="result-title">{END_REASON_LABEL[result.reason]}</h2>
            <p>
              Score: <strong data-testid="result-score">{result.score}</strong> · Time played:{' '}
              {formatClock(result.durationSec)}
            </p>
            <div className="modal__actions">
              <button type="button" className="primary-button" onClick={restart} autoFocus>
                Play Again
              </button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}
