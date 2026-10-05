/**
 * Device-independent player intent for one simulation step.
 * Keyboard and touch adapters both produce this shape; the simulation never
 * sees raw events.
 */
export interface ControlState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export type ControlAction = keyof ControlState;

export const IDLE_CONTROLS: Readonly<ControlState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

export interface InputSource {
  read(): ControlState;
  /** Releases everything currently held, e.g. on pause or focus loss. */
  reset(): void;
  dispose(): void;
}
