import { describe, expect, it, vi } from 'vitest';
import { CommandManager } from './manager.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';

describe('agent dispatch without a command queue', () => {
  it('dispatches typed and targeted commands immediately while busy', () => {
    const managers = {} as Managers;
    managers.tab = new TabManager(managers);
    managers.tab.tabs.push(makeTab('worker', '#fff'));
    managers.shell = { run: vi.fn() } as unknown as Managers['shell'];
    const command = new CommandManager(managers);
    managers.tab.addBusy('worker');

    command.dispatch('shell echo typed');
    command.dispatchTo('worker', 'shell echo sent');

    expect(managers.shell.run).toHaveBeenCalledWith('worker', 'echo typed');
    expect(managers.shell.run).toHaveBeenCalledWith('worker', 'echo sent');
    expect(managers.tab.queueFor('worker')).toEqual([]);
  });
});
