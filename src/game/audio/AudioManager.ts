const SOUND_BASE = `${import.meta.env.BASE_URL}assets/sounds`;

/** Each sound id maps to one or more variant files; one is picked at random per play. */
export const SOUND_FILES = {
  cannonFire: ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'],
  broadside: ['cannon_broadside'],
  waterHit: ['cannonball_water_hit_1', 'cannonball_water_hit_2'],
  woodHit: ['ship_wood_hit_1', 'ship_wood_hit_2'],
  explosion: ['ship_explosion_1', 'ship_explosion_2'],
  collision: ['ship_collision'],
  sinking: ['ship_sinking'],
  scorePoint: ['score_point'],
  healthLow: ['health_low'],
  timeWarning: ['time_warning'],
  gameStart: ['game_start'],
  gameOver: ['game_over'],
  gameComplete: ['game_complete'],
  gamePause: ['game_pause'],
  gameResume: ['game_resume'],
  oceanLoop: ['ocean_ambience_loop'],
  sailingLoop: ['ship_sailing_loop'],
} as const satisfies Record<string, readonly string[]>;

export type SoundId = keyof typeof SOUND_FILES;

/** The same sound is not restarted more often than this, so volleys do not stack into noise. */
const MIN_REPLAY_GAP_SEC = 0.04;
const MUTED_STORAGE_KEY = 'pirate-battle:muted';

export interface LoopHandle {
  setVolume(volume: number, rampSec?: number): void;
  stop(): void;
}

interface LoopState {
  id: SoundId;
  volume: number;
  gain: GainNode | null;
  source: AudioBufferSourceNode | null;
}

/**
 * Process-wide sound player on the Web Audio API.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created on the first pointer or key press. Files are fetched up front and
 * decoded once the context exists. Audio is optional: any failure just means
 * silence, never a blocked game.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly encoded = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly loops = new Set<LoopState>();
  private unlockInstalled = false;
  private mutedValue = readMuted();

  get muted(): boolean {
    return this.mutedValue;
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Storage may be unavailable (private mode); the setting just will not persist.
    }
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02);
  }

  /** Starts downloading every sound and arms the gesture listener that enables playback. */
  preload(): void {
    for (const files of Object.values(SOUND_FILES)) {
      for (const file of files) {
        if (this.encoded.has(file)) continue;
        this.encoded.set(
          file,
          fetch(`${SOUND_BASE}/${file}.wav`)
            .then((response) => (response.ok ? response.arrayBuffer() : null))
            .catch(() => null),
        );
      }
    }
    this.installUnlock();
  }

  play(id: SoundId, volume = 1): void {
    const context = this.context;
    if (!context || !this.master || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < MIN_REPLAY_GAP_SEC) return;

    const files = SOUND_FILES[id];
    const buffer = this.buffers.get(files[Math.floor(Math.random() * files.length)]!);
    if (!buffer) return;
    this.lastPlayed.set(id, now);

    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
  }

  /** Starts a looping sound. It begins as soon as audio is available, even if requested earlier. */
  loop(id: SoundId, volume: number): LoopHandle {
    const state: LoopState = { id, volume, gain: null, source: null };
    this.loops.add(state);
    this.startLoop(state);
    return {
      setVolume: (next, rampSec = 0.15) => {
        state.volume = next;
        if (state.gain && this.context) state.gain.gain.setTargetAtTime(next, this.context.currentTime, rampSec / 3);
      },
      stop: () => {
        this.loops.delete(state);
        state.source?.stop();
        state.source?.disconnect();
        state.gain?.disconnect();
        state.source = null;
        state.gain = null;
      },
    };
  }

  private startLoop(state: LoopState): void {
    const context = this.context;
    const buffer = this.buffers.get(SOUND_FILES[state.id][0]);
    if (!context || !this.master || !buffer || state.source) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = state.volume;
    source.connect(gain).connect(this.master);
    source.start();
    state.source = source;
    state.gain = gain;
  }

  private installUnlock(): void {
    if (this.unlockInstalled || typeof window === 'undefined') return;
    this.unlockInstalled = true;
    const unlock = (): void => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      void this.createContext();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  private async createContext(): Promise<void> {
    if (this.context || typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.mutedValue ? 0 : 1;
    this.master.connect(context.destination);
    await context.resume().catch(() => undefined);

    await Promise.all(
      [...this.encoded].map(async ([file, pending]) => {
        const data = await pending;
        if (!data) return;
        try {
          this.buffers.set(file, await context.decodeAudioData(data));
        } catch {
          // An undecodable file is skipped; the game stays playable without it.
        }
      }),
    );
    for (const state of this.loops) this.startLoop(state);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const audio = new AudioManager();
