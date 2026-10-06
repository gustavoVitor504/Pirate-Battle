import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDefinition<Id extends string> {
  id: Id;
  label: string;
  content: ReactNode;
}

interface TabsProps<Id extends string> {
  label: string;
  tabs: readonly TabDefinition<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
}

/**
 * WAI-ARIA tabs: arrow keys, Home and End move between tabs (automatic
 * activation); only the selected tab is in the Tab order.
 */
export function Tabs<Id extends string>({ label, tabs, selected, onSelect }: TabsProps<Id>) {
  const baseId = useId();
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const tab = tabs[next]!;
    onSelect(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  };

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.id, element);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={tab.id === selected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={tab.id === selected ? 0 : -1}
            className="menu-button menu-button--secondary"
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          className="tabs__panel"
          tabIndex={0}
        >
          {tab.id === selected && tab.content}
        </div>
      ))}
    </div>
  );
}
