import { useState } from 'react';
import type { MatchSettings } from '../../api/contracts';
import type { MatchResult } from '../../game/MatchStore';
import type { PlayerIdentity } from '../../settings/player';
import { ControlsHelp } from '../components/ControlsHelp';
import { MatchHistoryList, RankingList } from '../components/Leaderboards';
import { NetworkLab } from '../components/NetworkLab';
import { PendingMatchesNotice } from '../components/Registration';
import { ScreenHeading } from '../components/ScreenHeading';
import { Tabs } from '../components/Tabs';
import { END_REASON_LABEL, formatClock } from '../format';
import './menus.css';

type MenuTab = 'ranking' | 'history';

interface MainMenuProps {
  player: PlayerIdentity;
  /** The ranking compares matches played with these settings (the player's current options). */
  rankingSettings: MatchSettings;
  lastResult: MatchResult | null;
  mocksEnabled: boolean;
  onPlay: () => void;
  onOptions: () => void;
}

export function MainMenu({ player, rankingSettings, lastResult, mocksEnabled, onPlay, onOptions }: MainMenuProps) {
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

          <p className="player-name">
            Sailing as <strong data-testid="player-name">{player.playerName}</strong>
          </p>
          {lastResult && (
            <p className="last-match" data-testid="last-match">
              Last match: <strong>{lastResult.score} pts</strong> · {formatClock(lastResult.durationSec)} ·{' '}
              {END_REASON_LABEL[lastResult.reason]}
            </p>
          )}
          <PendingMatchesNotice />
          {mocksEnabled && <NetworkLab />}
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
                content: <RankingList settings={rankingSettings} playerId={player.playerId} />,
              },
              { id: 'history', label: 'Match History', content: <MatchHistoryList playerId={player.playerId} /> },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
