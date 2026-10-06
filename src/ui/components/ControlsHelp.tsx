const CONTROLS = [
  { action: 'Sail forward', keys: ['W', '↑'] },
  { action: 'Turn left / right', keys: ['A', 'D', '←', '→'] },
  { action: 'Front cannon', keys: ['Space'] },
  { action: 'Left / right broadside', keys: ['Q', 'E'] },
  { action: 'Pause', keys: ['Esc', 'P'] },
] as const;

/** Control reference shown in the main menu. */
export function ControlsHelp() {
  return (
    <section className="controls-help" aria-labelledby="controls-help-title">
      <h2 id="controls-help-title" className="section-title">
        Controls
      </h2>
      <dl className="controls-help__list">
        {CONTROLS.map(({ action, keys }) => (
          <div key={action} className="controls-help__row">
            <dt>{action}</dt>
            <dd>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="controls-help__touch">On touch screens, use the on-screen buttons in landscape.</p>
    </section>
  );
}
