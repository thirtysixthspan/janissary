import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Managers } from '../managers.js';
import type { AgentState } from '../agent/types.js';
import { command } from './state.js';

const loadAgentState = vi.fn<(name: string) => AgentState | undefined>();

vi.mock('../agent/state.js', () => ({
  loadAgentState: (name: string) => loadAgentState(name),
}));

// One open tab of the given view, and the snapshot the tab manager would build for it.
function managersWith(view: string | undefined) {
  const append = vi.fn();
  const buildAgentState = vi.fn((tab: { label: string }) => ({ name: tab.label, cwd: '/repo/src' }));
  const managers = {
    tab: {
      append,
      buildAgentState,
      byLabel: (label: string) => (label === 'shell1' ? { label, view } : undefined),
    },
  } as unknown as Managers;
  return { managers, append, buildAgentState };
}

function runState(managers: Managers) {
  void command.run('state', { label: 'shell1', index: 1 }, managers);
}

describe('state command', () => {
  beforeEach(() => {
    loadAgentState.mockReset();
    loadAgentState.mockReturnValue(undefined);
  });

  it('has the correct name', () => {
    expect(command.name).toBe('state');
  });

  it('matches "state" case-insensitively', () => {
    expect(command.match('state')).toBe(true);
    expect(command.match('STATE')).toBe(true);
    expect(command.match('State')).toBe(true);
  });

  it('does not match non-state input', () => {
    expect(command.match('stated')).toBe(false);
    expect(command.match('stat')).toBe(false);
    expect(command.match('next')).toBe(false);
  });

  it('shows a never-saved plugin tab the fields built from the open tab, as markdown', () => {
    const { managers, append } = managersWith('plugin');

    runState(managers);

    expect(append).toHaveBeenCalledWith('shell1', {
      input: 'state', output: '**name**: `shell1`\n\n**cwd**: `/repo/src`', markdown: true,
    });
  });

  it('still reports no state file for an agent tab that has none', () => {
    const { managers, append, buildAgentState } = managersWith('agent');

    runState(managers);

    expect(buildAgentState).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith('shell1', {
      input: 'state', output: 'No state file found for "shell1".', markdown: true,
    });
  });

  it('prefers a saved state file to the open tab', () => {
    loadAgentState.mockReturnValue({ name: 'shell1', cwd: '/saved' } as AgentState);
    const { managers, append, buildAgentState } = managersWith('plugin');

    runState(managers);

    expect(buildAgentState).not.toHaveBeenCalled();
    expect(append.mock.calls[0][1]).toMatchObject({ output: '**name**: `shell1`\n\n**cwd**: `/saved`' });
  });
});
