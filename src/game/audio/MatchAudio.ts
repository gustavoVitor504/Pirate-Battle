import type { GameEvent } from '../simulation/entities';
import type { AudioManager, LoopHandle } from './AudioManager';

const OCEAN_VOLUME = 0.35;
const SAILING_MAX_VOLUME = 0.35;
const LOW_HEALTH_RATIO = 0.3;
const TIME_WARNING_SEC = 10;

/** Per-frame inputs that drive continuous sounds and one-off warnings. */
export interface MatchAudioState {
  playerSpeedRatio: number;
  healthRatio: number;
  remainingSec: number;
}

/**
 * Turns one match's simulation events into sound, the audio counterpart of
 * the renderer. Owns the match's ambient loops and stops them on dispose.
 */
export class MatchAudio {
  private readonly ocean: LoopHandle;
  private readonly sailing: LoopHandle;
  private lowHealthWarned = false;
  private timeWarned = false;
  private paused = false;

  constructor(private readonly audio: AudioManager) {
    this.ocean = audio.loop('oceanLoop', OCEAN_VOLUME);
    this.sailing = audio.loop('sailingLoop', 0);
  }

  start(): void {
    this.audio.play('gameStart', 0.6);
  }

  handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.faction === 'enemy') this.audio.play('cannonFire', 0.3);
          else if (event.slot === 'front') this.audio.play('cannonFire', 0.55);
          else this.audio.play('broadside', 0.6);
          break;
        case 'impact':
          this.audio.play(event.target === 'ship' ? 'woodHit' : 'waterHit', 0.6);
          break;
        case 'splash':
          this.audio.play('waterHit', 0.3);
          break;
        case 'ship-damaged':
          break;
        case 'ship-destroyed':
          this.audio.play('explosion', 0.7);
          if (event.kind === 'player') this.audio.play('sinking', 0.7);
          else if (event.scored) this.audio.play('scorePoint', 0.5);
          // A Chaser that dies without scoring rammed the player.
          else if (event.kind === 'chaser') this.audio.play('collision', 0.7);
          break;
        case 'match-ended':
          this.sailing.setVolume(0);
          this.audio.play(event.reason === 'time-up' ? 'gameComplete' : 'gameOver', 0.7);
          break;
      }
    }
  }

  update(state: MatchAudioState): void {
    if (this.paused) return;
    this.sailing.setVolume(state.playerSpeedRatio * SAILING_MAX_VOLUME);

    const lowHealth = state.healthRatio > 0 && state.healthRatio <= LOW_HEALTH_RATIO;
    if (lowHealth && !this.lowHealthWarned) this.audio.play('healthLow', 0.6);
    this.lowHealthWarned = lowHealth;

    const warn = state.remainingSec > 0 && state.remainingSec <= TIME_WARNING_SEC;
    if (warn && !this.timeWarned) this.audio.play('timeWarning', 0.6);
    this.timeWarned = warn;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.audio.play(paused ? 'gamePause' : 'gameResume', 0.5);
    this.ocean.setVolume(paused ? 0 : OCEAN_VOLUME);
    if (paused) this.sailing.setVolume(0);
  }

  dispose(): void {
    this.ocean.stop();
    this.sailing.stop();
  }
}
