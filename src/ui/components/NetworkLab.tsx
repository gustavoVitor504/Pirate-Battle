import { useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import {
  getMockSettings,
  SCENARIOS,
  scenarioLabel,
  setMockSettings,
  subscribeMockSettings,
  type ScenarioId,
} from '../../mocks/scenarios';
import { resetNetworkState } from '../../mocks/reset';
import { Modal } from './Modal';

/**
 * Picks the mock API's network scenario (slow, failing, out of order…) and
 * resets the mock data. Available in every build so the deployed demo can
 * reproduce each failure mode.
 */
export function NetworkLab() {
  const queryClient = useQueryClient();
  const settings = useSyncExternalStore(subscribeMockSettings, getMockSettings);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const choose = (scenario: ScenarioId) => {
    setMockSettings({ scenario });
    setMessage('');
    // Refetch with the new behaviour (in-flight requests are cancelled).
    void queryClient.invalidateQueries();
  };

  const reset = () => {
    resetNetworkState(queryClient);
    setMessage('Mock data, scenario and queued submissions were reset.');
  };

  return (
    <>
      <button type="button" className="text-button network-lab__open" onClick={() => setOpen(true)}>
        Network: {scenarioLabel(settings.scenario)}
      </button>
      <Modal open={open} labelledBy="network-lab-title" onCancel={() => setOpen(false)} className="network-lab">
        <h2 id="network-lab-title">Network scenarios</h2>
        <p>Controls the mock ranking and history API. The choice is kept after a refresh.</p>
        <fieldset className="network-lab__options">
          <legend className="visually-hidden">Scenario</legend>
          {SCENARIOS.map((scenario) => (
            <label key={scenario.id} className="network-lab__option">
              <input
                type="radio"
                name="scenario"
                value={scenario.id}
                checked={settings.scenario === scenario.id}
                onChange={() => choose(scenario.id)}
              />
              <span>
                <strong>{scenario.label}</strong>
                <span className="network-lab__description">{scenario.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p role="status" className="network-lab__message">
          {message}
        </p>
        <div className="modal__actions">
          <button type="button" className="menu-button" onClick={reset}>
            Reset
          </button>
          <button type="button" className="menu-button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
