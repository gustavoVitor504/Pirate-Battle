import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { audio } from '../../game/audio/AudioManager';
import type { GameConfig } from '../../game/config';
import { GameEngine, type EngineStatus } from '../../game/GameEngine';
import { MatchStore, type MatchResult } from '../../game/MatchStore';
import { attachEngine, readTestConfig } from '../../testing/testHooks';
import { Hud } from '../components/Hud';
import { Modal } from '../components/Modal';
import { TouchControls } from '../components/TouchControls';
import { END_REASON_LABEL } from '../format';
import './GameScreen.css';

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);
/** Touch devices are played in landscape; portrait pauses the match. */
const PORTRAIT_TOUCH_QUERY = '(orientation: portrait) and (pointer: coarse)';
const ICONS = `${import.meta.env.BASE_URL}assets/png/default/ui/controls`;
/** Time the arena stays visible after the match ends, so the final explosion plays out. */
const RESULT_DELAY_MS = 1500;

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

interface GameScreenProps {
  /** Configuration for this match; captured when the match starts. */
  config: GameConfig;
  /** Called once, as soon as the match ends (before the result screen shows). */
  onMatchEnd: (result: MatchResult) => void;
  /** Called after a short delay to move on to the result screen. */
  onShowResult: (result: MatchResult) => void;
  /** Leaves the match without recording it. */
  onQuit: () => void;
}

export function GameScreen({ config, onMatchEnd, onShowResult, onQuit }: GameScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: 'loading', progress: 0 });
  // A new store means a new engine (used to retry after an asset failure).
  const [store, setStore] = useState(() => createMatchStore(config));
  const [muted, setMuted] = useState(() => audio.muted);
  const { result, pauseReason } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const running = status.kind === 'running';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const testing = readTestConfig();
    const engine = new GameEngine({
      host,
      config,
      store,
      onStatus: setStatus,
      manualClock: testing.manualClock,
      ...(testing.seed !== undefined ? { seed: testing.seed } : {}),
    });
    engineRef.current = engine;
    const detachTestHooks = testing.enabled ? attachEngine(engine) : undefined;
    void engine.start();
    return () => {
      detachTestHooks?.();
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [config, store]);

  const handleMatchEnd = useEffectEvent((ended: MatchResult) => onMatchEnd(ended));
  const showResult = useEffectEvent((ended: MatchResult) => onShowResult(ended));
  useEffect(() => {
    if (!result) return;
    handleMatchEnd(result);
    const timer = window.setTimeout(() => showResult(result), RESULT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

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

  const retry = () => setStore(createMatchStore(config));
  const resume = () => engineRef.current?.resume();
  const toggleMute = () => {
    audio.setMuted(!muted);
    setMuted(!muted);
  };

  return (
    <main className="game-screen">
      <h1 className="visually-hidden">Pirate Battle — match in progress</h1>
      <div ref={hostRef} className="game-screen__canvas" />

      {running && (
        <>
          <Hud store={store} />
          {!result && (
            <>
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
        </>
      )}

      {result && (
        <p className="game-screen__banner" role="status">
          {END_REASON_LABEL[result.reason]}!
        </p>
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
          <div className="modal__actions">
            <button type="button" className="menu-button" onClick={retry}>
              Try again
            </button>
            <button type="button" className="menu-button" onClick={onQuit}>
              Main Menu
            </button>
          </div>
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
          <button type="button" className="menu-button" onClick={resume} autoFocus>
            Resume
          </button>
          <button type="button" className="menu-button" onClick={onQuit}>
            Main Menu
          </button>
        </div>
        <p className="modal__note">Leaving now abandons the match; it will not be recorded.</p>
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
