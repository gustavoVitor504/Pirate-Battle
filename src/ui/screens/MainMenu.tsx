import { useState } from 'react';
import type { MatchResult } from '../../game/MatchStore';
import { ControlsHelp } from '../components/ControlsHelp';
import { ScreenHeading } from '../components/ScreenHeading';
import { Tabs } from '../components/Tabs';
import { END_REASON_LABEL, formatClock } from '../format';
import './menus.css';

type MenuTab = 'ranking' | 'history';

interface MainMenuProps {
  lastResult: MatchResult | null;
  onPlay: () => void;
  onOptions: () => void;
}

export function MainMenu({ lastResult, onPlay, onOptions }: MainMenuProps) {
  const [tab, setTab] = useState<MenuTab>('ranking');

  return (
    <main className="scene">
      <div className="panel panel--wide menu-layout">
        <div className="menu-layout__main">
          <ScreenHeading className="menu-title">
            <img
              src="/assets/png/default/ui/menu/title_pirate_battle.png"
              srcSet="/assets/png/default/ui/menu/title_pirate_battle.png 1x, /assets/png/retina/ui/menu/title_pirate_battle.png 2x"
              alt="Pirate Battle"
              width={384}
              height={128}
            />
          </ScreenHeading>
          <p className="panel__subtitle">Set sail. Take command.</p>

          <div className="stack">
            <button type="button" className="menu-button" onClick={onPlay}>
              Play
            </button>
            <button type="button" className="menu-button" onClick={onOptions}>
              Options
            </button>
          </div>

          {lastResult && (
            <p className="last-match" data-testid="last-match">
              Last match: <strong>{lastResult.score} pts</strong> · {formatClock(lastResult.durationSec)} ·{' '}
              {END_REASON_LABEL[lastResult.reason]}
            </p>
          )}
        </div>

        <div className="menu-layout__side">
          <ControlsHelp />

          <Tabs
            label="Leaderboards"
            selected={tab}
            onSelect={setTab}
            tabs={[
              {
                id: 'ranking',
                label: 'Ranking',
                content: <p className="tabs__empty">The ranking is not available yet.</p>,
              },
              {
                id: 'history',
                label: 'Match History',
                content: <p className="tabs__empty">Your match history is not available yet.</p>,
              },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
