import { useState, type FormEvent } from 'react';
import {
  DEFAULT_OPTIONS,
  OPTION_BUTTON_STEP,
  OPTION_RULES,
  parseOptions,
  saveOptions,
  validateOption,
  type OptionKey,
  type PlayerOptions,
} from '../../settings/options';
import { ScreenHeading } from '../components/ScreenHeading';
import './menus.css';

const FIELDS: readonly { key: OptionKey; label: string; hint: string }[] = [
  {
    key: 'sessionDurationSec',
    label: 'Game session time',
    hint: `${OPTION_RULES.sessionDurationSec.min}–${OPTION_RULES.sessionDurationSec.max} seconds`,
  },
  {
    key: 'enemySpawnIntervalSec',
    label: 'Enemy spawn time',
    hint: `${OPTION_RULES.enemySpawnIntervalSec.min}–${OPTION_RULES.enemySpawnIntervalSec.max} seconds, steps of 0.5`,
  },
];

const ICONS = '/assets/png/default/ui/controls';

type Draft = Record<OptionKey, string>;
type SaveState = 'idle' | 'saved' | 'not-persisted';

const toDraft = (options: PlayerOptions): Draft => ({
  sessionDurationSec: String(options.sessionDurationSec),
  enemySpawnIntervalSec: String(options.enemySpawnIntervalSec),
});

interface OptionsScreenProps {
  options: PlayerOptions;
  onSaved: (options: PlayerOptions) => void;
  onBack: () => void;
}

/** Edits and persists the two player options. Changes apply to the next match. */
export function OptionsScreen({ options, onSaved, onBack }: OptionsScreenProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(options));
  // Errors appear once a field was edited or a save was attempted, not while the screen opens.
  const [touched, setTouched] = useState<Partial<Record<OptionKey, boolean>>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const errors = Object.fromEntries(
    FIELDS.map(({ key }) => [key, touched[key] ? validateOption(key, draft[key]) : null]),
  ) as Record<OptionKey, string | null>;

  const update = (key: OptionKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched((current) => ({ ...current, [key]: true }));
    setSaveState('idle');
  };

  const nudge = (key: OptionKey, direction: 1 | -1) => {
    const { min, max } = OPTION_RULES[key];
    const current = Number(draft[key]);
    const base = Number.isFinite(current) ? current : DEFAULT_OPTIONS[key];
    const next = Math.min(max, Math.max(min, base + direction * OPTION_BUTTON_STEP[key]));
    update(key, String(Math.round(next * 2) / 2));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched({ sessionDurationSec: true, enemySpawnIntervalSec: true });
    const parsed = parseOptions(draft);
    if (!parsed.ok) {
      setSaveState('idle');
      const firstInvalid = FIELDS.find(({ key }) => parsed.errors[key]);
      if (firstInvalid) document.getElementById(`option-${firstInvalid.key}`)?.focus();
      return;
    }
    setSaveState(saveOptions(parsed.value) ? 'saved' : 'not-persisted');
    onSaved(parsed.value);
  };

  const restoreDefaults = () => {
    setDraft(toDraft(DEFAULT_OPTIONS));
    setTouched({});
    setSaveState('idle');
  };

  return (
    <main className="scene">
      <form className="panel options" onSubmit={submit} noValidate>
        <ScreenHeading>Options</ScreenHeading>

        {FIELDS.map(({ key, label, hint }) => {
          const { min, max, step } = OPTION_RULES[key];
          const value = Number(draft[key]);
          const error = errors[key];
          return (
            <div key={key} className="option-field">
              <label htmlFor={`option-${key}`} className="option-field__label">
                {label}
              </label>
              <div className="option-field__control">
                <button
                  type="button"
                  className="round-button"
                  aria-label={`Decrease ${label.toLowerCase()}`}
                  onClick={() => nudge(key, -1)}
                  disabled={Number.isFinite(value) && value <= min}
                >
                  <img src={`${ICONS}/icon_minus.png`} alt="" />
                </button>
                <span className="option-field__input">
                  <input
                    id={`option-${key}`}
                    name={key}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={max}
                    step={step}
                    value={draft[key]}
                    onChange={(event) => update(key, event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`option-${key}-hint${error ? ` option-${key}-error` : ''}`}
                  />
                  <span aria-hidden="true">s</span>
                </span>
                <button
                  type="button"
                  className="round-button"
                  aria-label={`Increase ${label.toLowerCase()}`}
                  onClick={() => nudge(key, 1)}
                  disabled={Number.isFinite(value) && value >= max}
                >
                  <img src={`${ICONS}/icon_plus.png`} alt="" />
                </button>
              </div>
              <p id={`option-${key}-hint`} className="option-field__hint">
                {hint}
              </p>
              {error && (
                <p id={`option-${key}-error`} className="option-field__error" role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}

        <p className="options__status" role="status" data-testid="options-status">
          {saveState === 'saved' && 'Options saved. They apply to your next match.'}
          {saveState === 'not-persisted' &&
            'Options applied, but this browser could not store them; they will reset after a refresh.'}
        </p>

        <div className="stack">
          <button type="submit" className="menu-button">
            Save
          </button>
          <button type="button" className="menu-button" onClick={onBack}>
            Main Menu
          </button>
          <button type="button" className="text-button" onClick={restoreDefaults}>
            Restore defaults
          </button>
        </div>
      </form>
    </main>
  );
}
