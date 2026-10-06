import type { PointerEvent } from 'react';
import type { ControlAction } from '../../game/input/controls';

const ICONS = `${import.meta.env.BASE_URL}assets/png/default/ui/controls`;

interface ControlButton {
  action: ControlAction;
  label: string;
  icon: string;
}

const MOVEMENT: readonly ControlButton[] = [
  { action: 'turnLeft', label: 'Turn left', icon: 'icon_turn_left' },
  { action: 'forward', label: 'Sail forward', icon: 'icon_forward' },
  { action: 'turnRight', label: 'Turn right', icon: 'icon_turn_right' },
];

const WEAPONS: readonly ControlButton[] = [
  { action: 'fireLeft', label: 'Fire left broadside', icon: 'icon_fire_left' },
  { action: 'fireFront', label: 'Fire front cannon', icon: 'icon_fire_front' },
  { action: 'fireRight', label: 'Fire right broadside', icon: 'icon_fire_right' },
];

interface TouchControlsProps {
  onPress: (action: ControlAction) => void;
  onRelease: (action: ControlAction) => void;
}

/**
 * On-screen buttons for touch devices. Each button captures its pointer, so
 * several can be held at once (e.g. sail forward while firing). The pressed
 * look is set directly on the element to avoid React re-renders.
 */
export function TouchControls({ onPress, onRelease }: TouchControlsProps) {
  const renderButton = ({ action, label, icon }: ControlButton) => {
    const release = (event: PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.dataset.pressed !== 'true') return;
      event.currentTarget.dataset.pressed = 'false';
      onRelease(action);
    };
    return (
      <button
        key={action}
        type="button"
        className={`touch-controls__button touch-controls__button--${action}`}
        aria-label={label}
        // Keyboard players use the game keys; these buttons should not steal focus.
        tabIndex={-1}
        data-pressed="false"
        onPointerDown={(event) => {
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // The pointer may already be gone (e.g. a very fast tap); the press still counts.
          }
          event.currentTarget.dataset.pressed = 'true';
          onPress(action);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={(event) => event.preventDefault()}
      >
        <img src={`${ICONS}/${icon}.png`} alt="" draggable={false} />
      </button>
    );
  };

  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="touch-controls__pad touch-controls__pad--movement">{MOVEMENT.map(renderButton)}</div>
      <div className="touch-controls__pad touch-controls__pad--weapons">{WEAPONS.map(renderButton)}</div>
    </div>
  );
}
