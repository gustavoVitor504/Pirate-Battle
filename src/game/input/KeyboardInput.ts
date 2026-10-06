import { IDLE_CONTROLS, type ControlAction, type ControlState, type InputSource } from './controls';

export const KEY_BINDINGS: Readonly<Record<ControlAction, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  fireFront: ['Space'],
  fireLeft: ['KeyQ'],
  fireRight: ['KeyE'],
};

const ACTION_BY_CODE = new Map<string, ControlAction>(
  Object.entries(KEY_BINDINGS).flatMap(([action, codes]) =>
    codes.map((code) => [code, action as ControlAction] as const),
  ),
);

/**
 * Tracks held game keys. Keys are only captured while `enabled` is true, so
 * menus and forms keep normal keyboard behavior.
 *
 * A key pressed and released between two reads still counts once, so quick
 * taps are not lost when frames are slow.
 */
export class KeyboardInput implements InputSource {
  enabled = false;
  private readonly held = new Set<string>();
  private readonly tapped = new Set<string>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  read(): ControlState {
    if (!this.enabled) return { ...IDLE_CONTROLS };
    const state = { ...IDLE_CONTROLS };
    for (const code of [...this.held, ...this.tapped]) {
      const action = ACTION_BY_CODE.get(code);
      if (action) state[action] = true;
    }
    this.tapped.clear();
    return state;
  }

  reset(): void {
    this.held.clear();
    this.tapped.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.reset();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !ACTION_BY_CODE.has(event.code)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    this.held.add(event.code);
    this.tapped.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
