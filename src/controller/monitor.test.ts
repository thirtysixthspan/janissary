import { describe, expect, it, vi } from 'vitest';
import {
  runSuggestion,
  rateSuggestion,
  resetMonitorContext,
  monitorContextSnapshot,
} from './monitor.js';
import type { Managers } from '../managers.js';
import type { MonitorSuggestion } from '../tab/types.js';

// The controller's monitor RPCs are one-line delegations, so the fake only has to carry what the
// delegate reads: a monitor reporting tab holding the suggestion, the command dispatcher, and the
// three monitor-registry methods.
function makeManagers(suggestions: MonitorSuggestion[] = []) {
  const rate = vi.fn();
  const resetContext = vi.fn();
  const snapshotContext = vi.fn();
  const dispatchTo = vi.fn();
  const managers = {
    tab: { tabs: [{ view: 'monitor', monitor: { suggestions, name: 'security', persona: 'security' } }] },
    command: { dispatchTo },
    monitor: { rate, resetContext, snapshotContext },
  } as unknown as Managers;
  return { managers, rate, resetContext, snapshotContext, dispatchTo };
}

function suggestion(overrides: Partial<MonitorSuggestion> = {}): MonitorSuggestion {
  return {
    id: 's1',
    text: 'Run the linter',
    command: 'npm run lint',
    timestamp: 0,
    persona: 'security',
    about: 'agent',
    ...overrides,
  };
}

describe('controller-monitor', () => {
  it('runSuggestion dispatches the suggestion\'s command to the tab it was about', () => {
    const { managers, dispatchTo } = makeManagers([suggestion()]);
    runSuggestion(managers, 's1');
    expect(dispatchTo).toHaveBeenCalledWith('agent', 'npm run lint');
  });

  // A monitor may suggest something with no runnable command behind it; "Run" must then be inert
  // rather than dispatching an empty line into the tab the suggestion was about.
  it('runSuggestion dispatches nothing for a suggestion that carries no command', () => {
    const { managers, dispatchTo } = makeManagers([suggestion({ command: undefined })]);
    runSuggestion(managers, 's1');
    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('runSuggestion dispatches nothing for an id no reporting feed carries', () => {
    const { managers, dispatchTo } = makeManagers([suggestion()]);
    runSuggestion(managers, 'nobody');
    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('rateSuggestion hands the id and the rating direction to the monitor registry', () => {
    const { managers, rate } = makeManagers();
    rateSuggestion(managers, 's1', true);
    rateSuggestion(managers, 's2', false);
    expect(rate).toHaveBeenNthCalledWith(1, 's1', true);
    expect(rate).toHaveBeenNthCalledWith(2, 's2', false);
  });

  it('resetMonitorContext and monitorContextSnapshot hand the monitor name to the registry', () => {
    const { managers, resetContext, snapshotContext } = makeManagers();
    resetMonitorContext(managers, 'security');
    monitorContextSnapshot(managers, 'quality');
    expect(resetContext).toHaveBeenCalledWith('security');
    expect(snapshotContext).toHaveBeenCalledWith('quality');
  });
});
