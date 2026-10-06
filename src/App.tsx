import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { registerCompletedMatch, retryPendingMatches } from './api/registration';
import { audio } from './game/audio/AudioManager';
import type { GameConfig } from './game/config';
import type { MatchResult } from './game/MatchStore';
import { readJson, removeItem, STORAGE_KEYS, writeJson } from './lib/storage';
import { loadLastResult, saveLastResult } from './settings/lastResult';
import { buildGameConfig, loadOptions, type PlayerOptions } from './settings/options';
import { getPlayer, toMatchRecord } from './settings/player';
import { GameScreen } from './ui/screens/GameScreen';
import { MainMenu } from './ui/screens/MainMenu';
import { OptionsScreen } from './ui/screens/OptionsScreen';
import { ResultScreen } from './ui/screens/ResultScreen';

type Screen =
  | { name: 'menu' }
  | { name: 'options' }
  /** `matchId` keys the screen so Play Again always mounts a fresh match. */
  | { name: 'game'; matchId: number; config: GameConfig }
  | { name: 'result'; result: MatchResult };

/**
 * After a refresh only the result screen is restored; a match in progress is
 * abandoned on purpose and the player lands on the main menu.
 */
function initialScreen(): Screen {
  const restore = readJson(STORAGE_KEYS.screen, (value) => (typeof value === 'string' ? value : null), 'session');
  const result = loadLastResult();
  return restore === 'result' && result ? { name: 'result', result } : { name: 'menu' };
}

let nextMatchId = 1;

export function App({ mocksEnabled }: { mocksEnabled: boolean }) {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const player = getPlayer();
  const [options, setOptions] = useState<PlayerOptions>(loadOptions);
  const [lastResult, setLastResult] = useState<MatchResult | null>(loadLastResult);

  // Matches left unconfirmed by an earlier session (failure, refresh, closed tab) are sent again.
  useEffect(() => retryPendingMatches(queryClient), [queryClient]);

  const go = (next: Screen, sound: 'uiClick' | 'uiBack' = 'uiClick') => {
    audio.play(sound, 0.5);
    if (next.name === 'result') writeJson(STORAGE_KEYS.screen, 'result', 'session');
    else removeItem(STORAGE_KEYS.screen, 'session');
    setScreen(next);
  };

  // Each match takes a snapshot of the options in force when it starts.
  const play = () => go({ name: 'game', matchId: nextMatchId++, config: buildGameConfig(options) });
  const mainMenu = () => go({ name: 'menu' }, 'uiBack');

  switch (screen.name) {
    case 'menu':
      return (
        <MainMenu
          player={player}
          rankingSettings={options}
          lastResult={lastResult}
          mocksEnabled={mocksEnabled}
          onPlay={play}
          onOptions={() => go({ name: 'options' })}
        />
      );
    case 'options':
      return <OptionsScreen options={options} onSaved={setOptions} onBack={mainMenu} />;
    case 'game':
      return (
        <GameScreen
          key={screen.matchId}
          config={screen.config}
          onMatchEnd={(result) => {
            saveLastResult(result);
            setLastResult(result);
            // Queued (persisted) before sending, so a failure or refresh cannot lose it.
            registerCompletedMatch(queryClient, toMatchRecord(result, player));
            // Mark the result screen as the one to restore even if the page reloads during the outro.
            writeJson(STORAGE_KEYS.screen, 'result', 'session');
          }}
          onShowResult={(result) => setScreen({ name: 'result', result })}
          onQuit={mainMenu}
        />
      );
    case 'result':
      return <ResultScreen result={screen.result} onPlayAgain={play} onMainMenu={mainMenu} />;
  }
}
