import { describe, expect, it, vi } from 'vitest';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab.js';
import { messageBus } from '../bus.js';
import { makeUpdateRunning } from './runner.js';

function makeFakeManagers(tabs: Tab[]) {
  const persisted: Tab[] = [];
  const fakeTab = {
    tabs,
    persist: (state: Tab) => { persisted.push(state); },
    buildAgentState: (tab: Tab) => tab,
  };
  const managers = { tab: fakeTab } as unknown as Managers;
  return { managers, persisted };
}

describe('makeUpdateRunning', () => {
  it('does nothing when the labeled tab is not found', () => {
    const { managers, persisted } = makeFakeManagers([]);
    const update = makeUpdateRunning('missing', managers);
    expect(() => update('output', true)).not.toThrow();
    expect(persisted).toEqual([]);
  });

  it('updates the last running log entry in place while still running', () => {
    const tab = makeTab('janus', 'blue');
    tab.log = [{ input: 'hi', output: '', running: true }];
    const { managers, persisted } = makeFakeManagers([tab]);
    const update = makeUpdateRunning('janus', managers);

    update('partial output', true);

    expect(tab.log[0]).toEqual({ input: 'hi', output: 'partial output', running: true });
    expect(persisted).toEqual([]);
  });

  it('persists agent state and emits a transcript entry when the run finishes', () => {
    const tab = makeTab('janus', 'blue');
    tab.log = [{ input: 'hi', output: '', running: true }];
    const { managers, persisted } = makeFakeManagers([tab]);
    const update = makeUpdateRunning('janus', managers);
    const transcriptListener = vi.fn();
    const stateListener = vi.fn();
    const transcriptSub = messageBus.on('transcript', 'entry:appended', transcriptListener);
    const stateSub = messageBus.on('state', 'dirty', stateListener);

    update('final output', false);

    expect(tab.log[0]).toEqual({ input: 'hi', output: 'final output', running: false });
    expect(persisted).toEqual([tab]);
    expect(transcriptListener).toHaveBeenCalledWith({
      type: 'entry:appended',
      tabLabel: 'janus',
      entry: { input: '', output: 'final output' },
      tab,
    });
    expect(stateListener).toHaveBeenCalledWith({ type: 'dirty' });

    transcriptSub.unsubscribe();
    stateSub.unsubscribe();
  });

  it('does not emit a transcript entry when finishing with no output', () => {
    const tab = makeTab('janus', 'blue');
    tab.log = [{ input: 'hi', output: '', running: true }];
    const { managers } = makeFakeManagers([tab]);
    const update = makeUpdateRunning('janus', managers);
    const transcriptListener = vi.fn();
    const transcriptSub = messageBus.on('transcript', 'entry:appended', transcriptListener);

    update('', false);

    expect(transcriptListener).not.toHaveBeenCalled();
    transcriptSub.unsubscribe();
  });
});
