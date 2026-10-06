import { IDLE_CONTROLS, type ControlAction, type ControlState, type InputSource } from './controls';

/**
 * Input fed by on-screen buttons. Each button reports press/release for its
 * action; several can be held at once (multi-touch). Like the keyboard, a tap
 * shorter than a frame still counts once.
 */
export class TouchInput implements InputSource {
  enabled = false;
  private readonly held = new Map<ControlAction, number>();
  private readonly tapped = new Set<ControlAction>();

  press(action: ControlAction): void {
    if (!this.enabled) return;
    this.held.set(action, (this.held.get(action) ?? 0) + 1);
    this.tapped.add(action);
  }

  release(action: ControlAction): void {
    const count = (this.held.get(action) ?? 0) - 1;
    if (count > 0) this.held.set(action, count);
    else this.held.delete(action);
  }

  read(): ControlState {
    if (!this.enabled) return { ...IDLE_CONTROLS };
    const state = { ...IDLE_CONTROLS };
    for (const action of this.held.keys()) state[action] = true;
    for (const action of this.tapped) state[action] = true;
    this.tapped.clear();
    return state;
  }

  reset(): void {
    this.held.clear();
    this.tapped.clear();
  }

  dispose(): void {
    this.reset();
  }
}

/** Merges several sources: an action is active if any source has it active. */
export function mergeControls(states: readonly ControlState[]): ControlState {
  const merged = { ...IDLE_CONTROLS };
  for (const state of states) {
    for (const action of Object.keys(merged) as ControlAction[]) {
      if (state[action]) merged[action] = true;
    }
  }
  return merged;
}
