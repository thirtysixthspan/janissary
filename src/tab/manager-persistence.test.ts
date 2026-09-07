import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { persistAgentState } from './manager-persistence.js';
import { AgentStatePersistence } from './persistence.js';
import { makeTab } from './index.js';
import { initAgentStateDirectory } from '../agent/state.js';
import type { AgentState } from '../agent/types.js';
import type { Tab } from './types.js';

function stateFor(name: string): AgentState {
  return { name, dotColor: 'red', active: false };
}

const open = (label: string): Tab[] => [makeTab(label, 'red')];

// `persistAgentState` owns one decision — whether the label counts as open again — and hands the
// rest to the store, so these cases watch the two calls it makes rather than the filesystem.
describe('persistAgentState', () => {
  function spies() {
    const persistence = new AgentStatePersistence();
    return {
      persistence,
      reopen: vi.spyOn(persistence, 'reopen').mockImplementation(() => {}),
      save: vi.spyOn(persistence, 'save').mockImplementation(() => {}),
    };
  }

  it('lifts the refusal and persists when a tab is open under the label', () => {
    const { persistence, reopen, save } = spies();

    persistAgentState(persistence, open('main'), stateFor('main'));

    expect(reopen).toHaveBeenCalledWith('main');
    expect(save).toHaveBeenCalledWith(stateFor('main'));
  });

  // The store decides whether a marked label is written; this function must not lift the mark for a
  // label whose tab is gone, which is the whole point of the guard.
  it('does not lift the refusal for a label with no open tab', () => {
    const { persistence, reopen, save } = spies();

    persistAgentState(persistence, open('other'), stateFor('gone'));

    expect(reopen).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(stateFor('gone'));
  });

  // Rehydration notifies once per restored state before the manager has assigned its tab list, so
  // the write still has to reach the store — it is the store's unmarked label that lets it through.
  it('still hands a state through when the tab list is empty', () => {
    const { persistence, save } = spies();

    persistAgentState(persistence, [], stateFor('restored'));

    expect(save).toHaveBeenCalledWith(stateFor('restored'));
  });
});

describe('AgentStatePersistence — closed labels', () => {
  let projectDir: string;
  const statePath = (label: string) => path.join(projectDir, '.janissary', 'state', `${label}.json`);

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'janus-persistence-'));
    initAgentStateDirectory(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('writes a state file for a label that was never closed', () => {
    new AgentStatePersistence().save(stateFor('main'));

    expect(existsSync(statePath('main'))).toBe(true);
  });

  // The race the delete has to survive: `ShellManager.run`'s update closure persists the tab object
  // it captured at dispatch, so a command completing after its tab closed would rewrite the file
  // teardown just removed and make the resurrection certain.
  it('writes nothing for a label that has been closed', () => {
    const persistence = new AgentStatePersistence();

    persistence.forget('main');
    persistence.save(stateFor('main'));

    expect(existsSync(statePath('main'))).toBe(false);
  });

  // A closed tab's name goes back into the 52-name pool, so the refusal cannot be permanent.
  it('writes again once the label is reopened', () => {
    const persistence = new AgentStatePersistence();

    persistence.forget('main');
    persistence.reopen('main');
    persistence.save(stateFor('main'));

    expect(existsSync(statePath('main'))).toBe(true);
  });

  it('refuses only the closed label, not its neighbours', () => {
    const persistence = new AgentStatePersistence();

    persistence.forget('gone');
    persistence.save(stateFor('gone'));
    persistence.save(stateFor('other'));

    expect(existsSync(statePath('gone'))).toBe(false);
    expect(existsSync(statePath('other'))).toBe(true);
  });
});
